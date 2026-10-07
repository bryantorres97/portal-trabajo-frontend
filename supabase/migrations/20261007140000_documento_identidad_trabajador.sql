-- =============================================================================
-- Documento de identidad del trabajador (ADR-019, revisa ADR-008): cédula ecuatoriana o pasaporte,
-- obligatorio en el alta presencial y al editar la ficha. Dato privado: solo lo lee el servidor
-- (worker_profiles no tiene privilegios para anon ni authenticated) y se muestra con
-- worker.read.private. Un mismo documento no puede pertenecer a dos trabajadores.
-- Los trabajadores registrados antes quedan sin documento hasta que el personal edite su ficha.
-- Al eliminar la cuenta (ADR-018) el documento se borra junto con el resto de datos personales.
-- =============================================================================

-- Cédula ecuatoriana: 10 dígitos, provincia 01–24 o 30, tercer dígito < 6 y dígito verificador
-- (módulo 10, coeficientes 2-1-2-1-2-1-2-1-2).
create or replace function private.cedula_valida(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_suma int := 0;
  v_d int;
  v_provincia int;
begin
  if p is null or p !~ '^\d{10}$' then
    return false;
  end if;
  v_provincia := substr(p, 1, 2)::int;
  if not (v_provincia between 1 and 24 or v_provincia = 30) or substr(p, 3, 1)::int >= 6 then
    return false;
  end if;
  for i in 1..9 loop
    v_d := substr(p, i, 1)::int * case when i % 2 = 1 then 2 else 1 end;
    v_suma := v_suma + case when v_d > 9 then v_d - 9 else v_d end;
  end loop;
  return (10 - v_suma % 10) % 10 = substr(p, 10, 1)::int;
end;
$$;

alter table public.worker_profiles
  add column id_document_type text,
  add column id_document_number text,
  add constraint worker_profiles_id_document_check check (
    (id_document_type is null and id_document_number is null)
    or (id_document_type = 'CEDULA' and private.cedula_valida(id_document_number))
    or (id_document_type = 'PASAPORTE' and id_document_number ~ '^[A-Z0-9]{5,20}$')
  );

comment on column public.worker_profiles.id_document_type is
  'CEDULA o PASAPORTE (ADR-019). Dato privado: nunca se publica.';
comment on column public.worker_profiles.id_document_number is
  'Número del documento, sin espacios ni guiones y en mayúsculas. Único por tipo.';

create unique index worker_profiles_id_document_key
  on public.worker_profiles (id_document_type, id_document_number)
  where id_document_number is not null;

-- Al eliminar la cuenta, el documento se borra con el resto de datos personales (antes del guard
-- que congela la ficha, que solo actúa si la ficha ya estaba eliminada).
create or replace function private.worker_profiles_clear_id_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.id_document_type := null;
    new.id_document_number := null;
  end if;
  return new;
end;
$$;

create trigger worker_profiles_clear_id_document before update of deleted_at on public.worker_profiles
  for each row execute function private.worker_profiles_clear_id_document();

-- Exige el documento y que no pertenezca a otro trabajador. Devuelve el número normalizado.
create or replace function private.worker_check_id_document(p_data jsonb, p_exclude uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tipo text := nullif(btrim(coalesce(p_data ->> 'idDocumentType', '')), '');
  v_numero text := upper(regexp_replace(coalesce(p_data ->> 'idDocumentNumber', ''), '[\s-]', '', 'g'));
begin
  if v_tipo is null or v_numero = '' then
    raise exception 'Ingresa la cédula o el pasaporte del trabajador' using errcode = 'check_violation';
  end if;
  if v_tipo not in ('CEDULA', 'PASAPORTE') then
    raise exception 'Tipo de documento no válido' using errcode = 'check_violation';
  end if;
  if v_tipo = 'CEDULA' and not private.cedula_valida(v_numero) then
    raise exception 'La cédula no es válida' using errcode = 'check_violation';
  end if;
  if v_tipo = 'PASAPORTE' and v_numero !~ '^[A-Z0-9]{5,20}$' then
    raise exception 'El pasaporte no es válido' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.worker_profiles w
             where w.id_document_type = v_tipo and w.id_document_number = v_numero
               and (p_exclude is null or w.id <> p_exclude)) then
    raise exception 'Ya hay un trabajador registrado con ese documento de identidad' using errcode = 'unique_violation';
  end if;
  return v_numero;
end;
$$;

/*
 * p_data: firstNames, lastNames, idDocumentType, idDocumentNumber, phone, email, address, birthDate,
 * emergencyContactName, emergencyContactPhone, publicDisplayName, specialty, publicBio, yearsExperience,
 * parishCode, isAvailable.
 * La validación de formato la hace el servidor (Zod) y la repiten las restricciones de la tabla.
 */
create or replace function public.fn_admin_create_worker(
  p_actor_id uuid,
  p_data jsonb,
  p_services jsonb,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_documento text;
begin
  perform private.require_permission(p_actor_id, 'worker.create');
  perform private.check_birth_date((p_data ->> 'birthDate')::date);
  v_documento := private.worker_check_id_document(p_data, null);

  insert into public.worker_profiles (
    first_names, last_names, id_document_type, id_document_number, phone, email, address, birth_date,
    emergency_contact_name, emergency_contact_phone, public_display_name, specialty, public_bio, years_experience,
    parish_id, is_available, status, registered_by
  ) values (
    btrim(p_data ->> 'firstNames'), btrim(p_data ->> 'lastNames'),
    btrim(p_data ->> 'idDocumentType'), v_documento,
    nullif(p_data ->> 'phone', ''), lower(nullif(p_data ->> 'email', '')), nullif(btrim(p_data ->> 'address'), ''),
    (p_data ->> 'birthDate')::date,
    nullif(btrim(p_data ->> 'emergencyContactName'), ''), nullif(p_data ->> 'emergencyContactPhone', ''),
    btrim(p_data ->> 'publicDisplayName'), nullif(btrim(p_data ->> 'specialty'), ''),
    nullif(btrim(p_data ->> 'publicBio'), ''),
    coalesce((p_data ->> 'yearsExperience')::smallint, 0),
    private.parish_id_by_code(p_data ->> 'parishCode'),
    coalesce((p_data ->> 'isAvailable')::boolean, true),
    'REGISTRADO', p_actor_id
  )
  returning id into v_id;

  perform private.worker_set_services(v_id, p_services);

  insert into public.worker_status_history (worker_id, from_status, to_status, reason, actor_id)
  values (v_id, null, 'REGISTRADO', 'Alta presencial', p_actor_id);

  -- Sin datos personales en la auditoría: solo la referencia al trabajador.
  perform private.audit(p_actor_id, 'WORKER_CREATED', 'worker', v_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('services', jsonb_array_length(p_services),
                       'duplicatesConfirmed', coalesce((p_data ->> 'duplicatesConfirmed')::boolean, false)));
  return v_id;
end;
$$;

create or replace function public.fn_admin_update_worker(
  p_actor_id uuid,
  p_worker_id uuid,
  p_data jsonb,
  p_services jsonb,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_servicios_antes jsonb;
  v_cambios jsonb;
  v_documento text;
begin
  perform private.require_permission(p_actor_id, 'worker.update');
  perform private.check_birth_date((p_data ->> 'birthDate')::date);

  select to_jsonb(w) into v_antes from public.worker_profiles w where id = p_worker_id for update;
  if v_antes is null then
    raise exception 'Trabajador no encontrado' using errcode = 'no_data_found';
  end if;
  if v_antes ->> 'status' = 'RECHAZADO' then
    raise exception 'Un trabajador rechazado no se puede modificar' using errcode = 'check_violation';
  end if;
  v_documento := private.worker_check_id_document(p_data, p_worker_id);

  select coalesce(jsonb_agg(service_id order by service_id), '[]') into v_servicios_antes
  from public.worker_services where worker_id = p_worker_id;

  update public.worker_profiles set
    first_names = btrim(p_data ->> 'firstNames'),
    last_names = btrim(p_data ->> 'lastNames'),
    id_document_type = btrim(p_data ->> 'idDocumentType'),
    id_document_number = v_documento,
    phone = nullif(p_data ->> 'phone', ''),
    email = lower(nullif(p_data ->> 'email', '')),
    address = nullif(btrim(p_data ->> 'address'), ''),
    birth_date = (p_data ->> 'birthDate')::date,
    emergency_contact_name = nullif(btrim(p_data ->> 'emergencyContactName'), ''),
    emergency_contact_phone = nullif(p_data ->> 'emergencyContactPhone', ''),
    public_display_name = btrim(p_data ->> 'publicDisplayName'),
    specialty = nullif(btrim(p_data ->> 'specialty'), ''),
    public_bio = nullif(btrim(p_data ->> 'publicBio'), ''),
    years_experience = coalesce((p_data ->> 'yearsExperience')::smallint, 0),
    parish_id = private.parish_id_by_code(p_data ->> 'parishCode'),
    is_available = coalesce((p_data ->> 'isAvailable')::boolean, true)
  where id = p_worker_id;

  perform private.worker_set_services(p_worker_id, p_services);

  -- Solo los nombres de los campos cambiados: nunca los valores.
  select to_jsonb(w) into v_despues from public.worker_profiles w where id = p_worker_id;
  select coalesce(jsonb_agg(k order by k), '[]') into v_cambios
  from jsonb_object_keys(v_despues) k
  where v_despues -> k is distinct from v_antes -> k
    and k not in ('updated_at', 'search_text', 'search_vector');
  if v_servicios_antes is distinct from (select coalesce(jsonb_agg(service_id order by service_id), '[]')
                                         from public.worker_services where worker_id = p_worker_id) then
    v_cambios := v_cambios || '["services"]'::jsonb;
  end if;

  perform private.audit(p_actor_id, 'WORKER_UPDATED', 'worker', p_worker_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('fields', v_cambios));
end;
$$;

-- Posibles duplicados por documento, teléfono, email o nombres (sin tildes ni mayúsculas).
-- El documento repetido no se puede confirmar: el alta lo rechaza (worker_check_id_document).
drop function public.fn_admin_find_worker_duplicates(uuid, text, text, text, text, uuid);

create function public.fn_admin_find_worker_duplicates(
  p_actor_id uuid,
  p_phone text,
  p_email text,
  p_first_names text,
  p_last_names text,
  p_exclude uuid default null,
  p_id_document_type text default null,
  p_id_document_number text default null
)
returns table (id uuid, public_display_name text, status public.worker_status, reasons text[])
language plpgsql
stable
set search_path = ''
as $$
declare
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_nombre text := private.normalize_text(btrim(coalesce(p_first_names, '')) || ' ' || btrim(coalesce(p_last_names, '')));
  v_tipo text := nullif(btrim(coalesce(p_id_document_type, '')), '');
  v_numero text := nullif(upper(regexp_replace(coalesce(p_id_document_number, ''), '[\s-]', '', 'g')), '');
begin
  perform private.require_permission(p_actor_id, 'worker.read');
  return query
  select w.id, w.public_display_name, w.status,
         array_remove(array[
           case when v_numero is not null and w.id_document_type = v_tipo and w.id_document_number = v_numero
                then 'DOCUMENTO' end,
           case when v_phone is not null and w.phone = v_phone then 'TELEFONO' end,
           case when v_email is not null and lower(w.email) = v_email then 'EMAIL' end,
           case when private.normalize_text(w.first_names || ' ' || w.last_names) = v_nombre then 'NOMBRES' end
         ], null)
  from public.worker_profiles w
  where (p_exclude is null or w.id <> p_exclude)
    and ((v_numero is not null and w.id_document_type = v_tipo and w.id_document_number = v_numero)
      or (v_phone is not null and w.phone = v_phone)
      or (v_email is not null and lower(w.email) = v_email)
      or (btrim(v_nombre) <> '' and private.normalize_text(w.first_names || ' ' || w.last_names) = v_nombre))
  order by (v_numero is not null and w.id_document_type = v_tipo and w.id_document_number = v_numero) desc,
           w.created_at desc
  limit 10;
end;
$$;

revoke execute on function
  private.cedula_valida(text),
  private.worker_profiles_clear_id_document(),
  private.worker_check_id_document(jsonb, uuid),
  public.fn_admin_find_worker_duplicates(uuid, text, text, text, text, uuid, text, text)
  from public, anon, authenticated;

-- Las funciones fn_* son SECURITY INVOKER: el servidor (service_role) ejecuta sus auxiliares, y la
-- restricción de la tabla llama a cedula_valida.
grant execute on function
  private.cedula_valida(text),
  private.worker_check_id_document(jsonb, uuid),
  public.fn_admin_find_worker_duplicates(uuid, text, text, text, text, uuid, text, text)
  to service_role;
