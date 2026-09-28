-- Imágenes de los oficios administrables desde /admin/catalogo.
--
-- Las imágenes se guardan en el bucket PÚBLICO `catalog-images` (solo el servidor sube y borra,
-- con la secret key). `services.image_path` guarda la ruta dentro del bucket (`services/<uuid>.webp`)
-- o, para las fotos provisionales del repositorio, una ruta del sitio (`/images/oficios/…`).
-- La URL pública se arma en el servidor, así la base no depende del dominio del proyecto.

-- -----------------------------------------------------------------------------
-- Restricción: rutas del sitio o del bucket, nunca URL arbitrarias
-- -----------------------------------------------------------------------------

alter table public.services drop constraint services_image_path;
alter table public.services
  add constraint services_image_path check (
    image_path is null
    or image_path ~ '^/images/[a-z0-9/_.-]+$'
    or image_path ~ '^services/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  );

-- -----------------------------------------------------------------------------
-- Bucket público (lectura por URL; sin políticas: nadie lista ni sube salvo el servidor)
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-images', 'catalog-images', true, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Cambio de imagen con auditoría atómica. Devuelve la ruta anterior para borrar el objeto.
-- -----------------------------------------------------------------------------

create or replace function public.fn_admin_set_service_image(
  p_actor_id uuid,
  p_id uuid,
  p_image_path text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_anterior text;
  v_nombre text;
begin
  perform private.require_permission(p_actor_id, 'catalog.manage');
  select s.image_path, s.name into v_anterior, v_nombre from public.services s where s.id = p_id for update;
  if not found then
    raise exception 'Oficio no encontrado' using errcode = 'no_data_found';
  end if;
  update public.services set image_path = p_image_path, updated_at = now() where id = p_id;

  insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
  values (p_actor_id, private.user_active_roles(p_actor_id),
          case when p_image_path is null then 'SERVICE_IMAGE_REMOVED' else 'SERVICE_IMAGE_UPDATED' end,
          'service', p_id::text, p_ip, left(p_user_agent, 512), p_request_id,
          jsonb_build_object('name', v_nombre, 'image_path', p_image_path, 'previous', v_anterior));
  return v_anterior;
end;
$$;

revoke execute on function public.fn_admin_set_service_image(uuid, uuid, text, inet, text, text)
  from public, anon, authenticated;
grant execute on function public.fn_admin_set_service_image(uuid, uuid, text, inet, text, text) to service_role;
