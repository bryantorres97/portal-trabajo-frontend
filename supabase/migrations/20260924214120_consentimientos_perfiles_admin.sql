-- =============================================================================
-- Fase 2 — Consentimientos, perfil de cliente, administración de usuarios e identidades.
-- Detalle: docs/phases/fase-02-usuarios-perfiles.md · ADR-006, ADR-008.
--
-- Las funciones `public.fn_*` hacen el cambio y la auditoría en la MISMA transacción
-- (docs/analysis/05-seguridad-auditoria.md §19). Solo las ejecuta service_role (servidor);
-- además verifican el permiso del actor como defensa en profundidad.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Documentos legales y consentimientos (RN-18)
-- -----------------------------------------------------------------------------

create table public.legal_documents (
  code          text not null,
  version       integer not null,
  title         text not null,
  content_md    text not null,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  primary key (code, version),
  constraint legal_documents_code_format check (code ~ '^[A-Z][A-Z_]*$'),
  constraint legal_documents_version_positive check (version > 0),
  constraint legal_documents_title_len check (char_length(title) between 3 and 200)
);

comment on table public.legal_documents is
  'Términos, política de privacidad y otros documentos que el usuario acepta. Versión vigente = mayor versión publicada.';

create table public.consents (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references public.users (id) on delete cascade,
  document_code     text not null,
  document_version  integer not null,
  accepted_at       timestamptz not null default now(),
  ip                inet,
  user_agent        text,
  constraint consents_document_fk foreign key (document_code, document_version)
    references public.legal_documents (code, version),
  constraint consents_unique_acceptance unique (user_id, document_code, document_version),
  constraint consents_user_agent_len check (user_agent is null or char_length(user_agent) <= 512)
);

comment on table public.consents is 'Aceptaciones de documentos legales (append-only, evidencia LOPDP).';

create index consents_document_idx on public.consents (document_code, document_version);

create trigger consents_no_update
  before update or delete on public.consents
  for each row execute function private.prevent_mutation();

-- Versiones vigentes (publicadas) de cada documento.
create view public.current_legal_documents
with (security_invoker = true) as
  select distinct on (code) code, version, title, content_md, published_at
  from public.legal_documents
  where published_at is not null and published_at <= now()
  order by code, version desc;

-- -----------------------------------------------------------------------------
-- Perfil de cliente (datos que el pool del GAD no entrega)
-- -----------------------------------------------------------------------------

create table public.client_profiles (
  user_id     uuid primary key references public.users (id) on delete cascade,
  full_name   text not null,
  phone       text,
  sector      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint client_profiles_full_name_len check (char_length(btrim(full_name)) between 3 and 120),
  constraint client_profiles_phone_format check (phone is null or phone ~ '^09[0-9]{8}$'),
  constraint client_profiles_sector_len check (sector is null or char_length(sector) <= 80)
);

create trigger client_profiles_set_updated_at
  before update on public.client_profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function private.has_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    join public.user_roles ur on ur.user_id = u.id and ur.revoked_at is null
    join public.role_permissions rp on rp.role_code = ur.role_code
    where u.id = p_user_id
      and u.status = 'ACTIVO'
      and rp.permission_code = p_permission
  );
$$;

create or replace function private.require_permission(p_user_id uuid, p_permission text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.has_permission(p_user_id, p_permission) then
    raise exception 'Permiso requerido: %', p_permission using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function private.user_active_roles(p_user_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(role_code order by role_code), '{}')
  from public.user_roles
  where user_id = p_user_id and revoked_at is null;
$$;

-- -----------------------------------------------------------------------------
-- Consentimiento: acepta todas las versiones vigentes pendientes
-- -----------------------------------------------------------------------------

create or replace function public.fn_accept_current_consents(
  p_user_id uuid,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_docs jsonb;
begin
  with pendientes as (
    select d.code, d.version
    from public.current_legal_documents d
    where not exists (
      select 1 from public.consents c
      where c.user_id = p_user_id and c.document_code = d.code and c.document_version = d.version
    )
  ), insertados as (
    insert into public.consents (user_id, document_code, document_version, ip, user_agent)
    select p_user_id, code, version, p_ip, left(p_user_agent, 512) from pendientes
    returning document_code, document_version
  )
  select count(*), coalesce(jsonb_agg(jsonb_build_object('code', document_code, 'version', document_version)), '[]')
    into v_count, v_docs
  from insertados;

  if v_count > 0 then
    insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
    values (p_user_id, private.user_active_roles(p_user_id), 'CONSENT_ACCEPTED', 'user', p_user_id::text,
            p_ip, left(p_user_agent, 512), p_request_id, jsonb_build_object('documents', v_docs));
  end if;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Administración de roles internos (ADR-006)
-- -----------------------------------------------------------------------------

create or replace function public.fn_admin_grant_role(
  p_actor_id uuid,
  p_user_id uuid,
  p_role_code text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.require_permission(p_actor_id, 'role.manage');

  if not exists (select 1 from public.roles where code = p_role_code and is_internal) then
    raise exception 'Solo se pueden asignar roles internos del GAD' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.users where id = p_user_id and status = 'ACTIVO') then
    raise exception 'El usuario no existe o no está activo' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id and role_code = p_role_code and revoked_at is null) then
    raise exception 'El usuario ya tiene el rol %', p_role_code using errcode = 'unique_violation';
  end if;

  insert into public.user_roles (user_id, role_code, granted_by) values (p_user_id, p_role_code, p_actor_id);

  insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
  values (p_actor_id, private.user_active_roles(p_actor_id), 'ROLE_GRANTED', 'user', p_user_id::text,
          p_ip, left(p_user_agent, 512), p_request_id, jsonb_build_object('role', p_role_code));
end;
$$;

create or replace function public.fn_admin_revoke_role(
  p_actor_id uuid,
  p_user_id uuid,
  p_role_code text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.require_permission(p_actor_id, 'role.manage');

  if not exists (select 1 from public.roles where code = p_role_code and is_internal) then
    raise exception 'Solo se pueden revocar roles internos del GAD' using errcode = 'check_violation';
  end if;

  -- Evita dejar el sistema sin administradores.
  if p_role_code = 'ADMIN_SISTEMA' and (
    select count(*) from public.user_roles ur join public.users u on u.id = ur.user_id
    where ur.role_code = 'ADMIN_SISTEMA' and ur.revoked_at is null and u.status = 'ACTIVO'
  ) <= 1 then
    raise exception 'No se puede revocar el último ADMIN_SISTEMA activo' using errcode = 'check_violation';
  end if;

  update public.user_roles
    set revoked_at = now(), revoked_by = p_actor_id
    where user_id = p_user_id and role_code = p_role_code and revoked_at is null;
  if not found then
    raise exception 'El usuario no tiene el rol %', p_role_code using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
  values (p_actor_id, private.user_active_roles(p_actor_id), 'ROLE_REVOKED', 'user', p_user_id::text,
          p_ip, left(p_user_agent, 512), p_request_id, jsonb_build_object('role', p_role_code));
end;
$$;

-- -----------------------------------------------------------------------------
-- Bloqueo / desbloqueo. Devuelve los tokens cifrados de las sesiones revocadas
-- para que el servidor revoque también los refresh tokens en Cognito.
-- -----------------------------------------------------------------------------

create or replace function public.fn_admin_set_user_status(
  p_actor_id uuid,
  p_user_id uuid,
  p_status public.user_status,
  p_reason text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns setof text
language plpgsql
set search_path = ''
as $$
declare
  v_previo public.user_status;
begin
  perform private.require_permission(p_actor_id, 'user.block');

  if p_actor_id = p_user_id then
    raise exception 'No puedes cambiar el estado de tu propia cuenta' using errcode = 'check_violation';
  end if;
  if p_status not in ('ACTIVO', 'BLOQUEADO') then
    raise exception 'Estado no permitido: %', p_status using errcode = 'check_violation';
  end if;
  if p_status = 'BLOQUEADO' and char_length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'El motivo del bloqueo es obligatorio' using errcode = 'check_violation';
  end if;

  -- Bloquear a personal interno requiere además gestionar roles.
  if exists (
    select 1 from public.user_roles ur join public.roles r on r.code = ur.role_code
    where ur.user_id = p_user_id and ur.revoked_at is null and r.is_internal
  ) then
    perform private.require_permission(p_actor_id, 'role.manage');
  end if;

  select status into v_previo from public.users where id = p_user_id for update;
  if v_previo is null or v_previo = 'ELIMINADO' then
    raise exception 'El usuario no existe' using errcode = 'no_data_found';
  end if;
  if v_previo = p_status then
    raise exception 'El usuario ya está en estado %', p_status using errcode = 'check_violation';
  end if;

  update public.users
    set status = p_status,
        blocked_reason = case when p_status = 'BLOQUEADO' then btrim(p_reason) else null end
    where id = p_user_id;

  insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
  values (p_actor_id, private.user_active_roles(p_actor_id),
          case when p_status = 'BLOQUEADO' then 'USER_BLOCKED' else 'USER_UNBLOCKED' end,
          'user', p_user_id::text, p_ip, left(p_user_agent, 512), p_request_id,
          jsonb_build_object('reason', btrim(coalesce(p_reason, '')), 'previous', v_previo));

  if p_status = 'BLOQUEADO' then
    return query
      update public.auth_sessions set revoked_at = now()
      where user_id = p_user_id and revoked_at is null
      returning tokens_enc;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Vinculación de identidades entre proveedores (ADR-008)
-- Resultado: LINKED | ALREADY_LINKED | MERGED | CONFLICT
-- MERGED: la identidad pertenecía a otra cuenta "vacía" (sin perfil ni roles distintos
-- de CLIENTE); se trasladan sus identidades, se revocan sus sesiones y se marca ELIMINADO.
-- -----------------------------------------------------------------------------

create or replace function public.fn_link_identity(
  p_user_id uuid,
  p_issuer text,
  p_sub text,
  p_provider text,
  p_email text default null,
  p_email_verified boolean default false,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
  v_resultado text;
begin
  if not exists (select 1 from public.users where id = p_user_id and status = 'ACTIVO') then
    raise exception 'Usuario no activo' using errcode = 'insufficient_privilege';
  end if;

  select user_id into v_owner from public.user_identities where issuer = p_issuer and sub = p_sub for update;

  if v_owner = p_user_id then
    return 'ALREADY_LINKED';
  end if;

  if v_owner is null then
    insert into public.user_identities (user_id, issuer, sub, provider, email, email_verified, last_login_at)
    values (p_user_id, p_issuer, p_sub, p_provider, lower(p_email), coalesce(p_email_verified, false), now());
    v_resultado := 'LINKED';
  else
    -- Solo se fusiona una cuenta sin datos propios.
    if exists (select 1 from public.client_profiles where user_id = v_owner)
       or exists (select 1 from public.user_roles where user_id = v_owner and revoked_at is null and role_code <> 'CLIENTE')
       or exists (select 1 from public.users where id = v_owner and status <> 'ACTIVO') then
      return 'CONFLICT';
    end if;

    update public.user_identities set user_id = p_user_id where user_id = v_owner;
    update public.auth_sessions set revoked_at = now() where user_id = v_owner and revoked_at is null;
    update public.user_roles set revoked_at = now(), revoked_by = p_user_id where user_id = v_owner and revoked_at is null;
    update public.users
      set status = 'ELIMINADO', blocked_reason = 'Fusionada con la cuenta ' || p_user_id::text
      where id = v_owner;

    insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
    values (p_user_id, private.user_active_roles(p_user_id), 'USER_MERGED', 'user', v_owner::text,
            p_ip, left(p_user_agent, 512), p_request_id, jsonb_build_object('into', p_user_id));
    v_resultado := 'MERGED';
  end if;

  insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
  values (p_user_id, private.user_active_roles(p_user_id), 'IDENTITY_LINKED', 'user', p_user_id::text,
          p_ip, left(p_user_agent, 512), p_request_id,
          jsonb_build_object('provider', p_provider, 'result', v_resultado));
  return v_resultado;
end;
$$;

create or replace function public.fn_unlink_identity(
  p_user_id uuid,
  p_identity_id bigint,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_provider text;
begin
  if (select count(*) from public.user_identities where user_id = p_user_id) <= 1 then
    raise exception 'Debes conservar al menos una forma de ingreso' using errcode = 'check_violation';
  end if;

  delete from public.user_identities where id = p_identity_id and user_id = p_user_id returning provider into v_provider;
  if v_provider is null then
    raise exception 'Identidad no encontrada' using errcode = 'no_data_found';
  end if;

  insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
  values (p_user_id, private.user_active_roles(p_user_id), 'IDENTITY_UNLINKED', 'user', p_user_id::text,
          p_ip, left(p_user_agent, 512), p_request_id, jsonb_build_object('provider', v_provider));
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS y privilegios
-- -----------------------------------------------------------------------------

alter table public.legal_documents enable row level security;
alter table public.consents enable row level security;
alter table public.client_profiles enable row level security;

-- Documentos publicados: lectura pública (son textos legales abiertos).
create policy legal_documents_select_published on public.legal_documents
  for select to anon, authenticated
  using (published_at is not null and published_at <= now());

create policy consents_select_own on public.consents
  for select to authenticated
  using (user_id = (select private.current_user_id()));

create policy client_profiles_select_own on public.client_profiles
  for select to authenticated
  using (user_id = (select private.current_user_id()));

revoke all on public.legal_documents, public.consents, public.client_profiles, public.current_legal_documents
  from anon, authenticated;
grant select on public.legal_documents, public.current_legal_documents to anon, authenticated;
grant select on public.consents, public.client_profiles to authenticated;

grant select, insert, update on public.legal_documents to service_role;
grant select, insert on public.consents to service_role;
grant select, insert, update on public.client_profiles to service_role;
grant select on public.current_legal_documents to service_role;
-- user_identities: la desvinculación borra filas.
grant delete on public.user_identities to service_role;

-- Funciones: solo el servidor.
revoke execute on function
  public.fn_accept_current_consents(uuid, inet, text, text),
  public.fn_admin_grant_role(uuid, uuid, text, inet, text, text),
  public.fn_admin_revoke_role(uuid, uuid, text, inet, text, text),
  public.fn_admin_set_user_status(uuid, uuid, public.user_status, text, inet, text, text),
  public.fn_link_identity(uuid, text, text, text, text, boolean, inet, text, text),
  public.fn_unlink_identity(uuid, bigint, inet, text, text)
  from public, anon, authenticated;

grant execute on function
  public.fn_accept_current_consents(uuid, inet, text, text),
  public.fn_admin_grant_role(uuid, uuid, text, inet, text, text),
  public.fn_admin_revoke_role(uuid, uuid, text, inet, text, text),
  public.fn_admin_set_user_status(uuid, uuid, public.user_status, text, inet, text, text),
  public.fn_link_identity(uuid, text, text, text, text, boolean, inet, text, text),
  public.fn_unlink_identity(uuid, bigint, inet, text, text)
  to service_role;

revoke execute on function private.has_permission(uuid, text), private.require_permission(uuid, text),
  private.user_active_roles(uuid) from public, anon, authenticated;
grant execute on function private.has_permission(uuid, text), private.require_permission(uuid, text),
  private.user_active_roles(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Ajuste de la matriz de permisos (Fase 2): quien bloquea usuarios debe poder verlos;
-- el supervisor consulta usuarios en modo lectura. Idempotente.
-- -----------------------------------------------------------------------------
insert into public.role_permissions (role_code, permission_code)
select v.role_code, v.permission_code
from (values ('RESP_DENUNCIAS', 'user.read'), ('SUPERVISOR', 'user.read')) as v(role_code, permission_code)
where exists (select 1 from public.roles r where r.code = v.role_code)
  and exists (select 1 from public.permissions p where p.code = v.permission_code)
on conflict do nothing;
