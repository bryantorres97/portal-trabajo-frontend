-- =============================================================================
-- Fase 1 — Base: identidad, roles/permisos y auditoría inmutable.
-- Diseño: docs/analysis/04-modelo-datos.md · Decisiones: ADR-001, ADR-006, ADR-008.
--
-- Modelo de acceso:
--   * La app accede SOLO desde el servidor con la secret key (rol service_role).
--   * `auto_expose_new_tables = false`: nada es accesible por la Data API sin GRANT explícito.
--   * RLS activado en todas las tablas como defensa en profundidad; las únicas
--     políticas para `authenticated` permiten leer los propios datos (JWT de Cognito
--     vía third-party auth, ADR-004).
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Bloquea UPDATE/DELETE en tablas append-only (auditoría, historiales, consentimientos).
create or replace function private.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La tabla %.% es de solo inserción (append-only)', tg_table_schema, tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;

-- -----------------------------------------------------------------------------
-- Usuarios e identidades (ADR-008)
-- El `sub` de Cognito NO es estable por persona: cambia según el método de login
-- (nativo, Google, Facebook). Por eso un usuario del portal puede tener varias
-- identidades. El portal no almacena cédula (decisión del usuario, 2026-09-24).
-- -----------------------------------------------------------------------------

create type public.user_status as enum ('ACTIVO', 'BLOQUEADO', 'ELIMINADO');

create table public.users (
  id              uuid primary key default gen_random_uuid(),
  email           text,
  email_verified  boolean not null default false,
  display_name    text,
  status          public.user_status not null default 'ACTIVO',
  blocked_reason  text,
  master_user_id  text,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint users_master_user_id_key unique (master_user_id),
  constraint users_email_format check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint users_display_name_len check (display_name is null or char_length(display_name) <= 120)
);

comment on table public.users is 'Usuarios del portal. Credenciales y MFA viven en AWS Cognito.';
comment on column public.users.master_user_id is
  'userId maestro del Identity & Onboarding Service del GAD, si se adopta (P-01). Estable entre proveedores de login.';

create index users_email_idx on public.users (lower(email));

create trigger users_set_updated_at
  before update on public.users
  for each row execute function private.set_updated_at();

create table public.user_identities (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.users (id) on delete cascade,
  issuer          text not null,
  sub             text not null,
  provider        text not null default 'COGNITO',
  email           text,
  email_verified  boolean not null default false,
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz,
  constraint user_identities_issuer_sub_key unique (issuer, sub),
  constraint user_identities_provider_format check (provider ~ '^[A-Za-z0-9_-]{1,64}$')
);

comment on table public.user_identities is
  'Identidades de Cognito (issuer + sub) vinculadas a un usuario. Una persona puede entrar por varios proveedores.';
comment on column public.user_identities.issuer is 'Claim iss: identifica el User Pool (dev, staging, prod no se mezclan).';

create index user_identities_user_idx on public.user_identities (user_id);

-- -----------------------------------------------------------------------------
-- Roles y permisos (autorización de negocio, ADR-006)
-- -----------------------------------------------------------------------------

create table public.roles (
  code        text primary key,
  name        text not null,
  description text,
  is_internal boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint roles_code_format check (code ~ '^[A-Z][A-Z_]*$')
);

create table public.permissions (
  code        text primary key,
  description text not null,
  created_at  timestamptz not null default now(),
  constraint permissions_code_format check (code ~ '^[a-z]+(\.[a-z_]+)+$')
);

create table public.role_permissions (
  role_code       text not null references public.roles (code) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  primary key (role_code, permission_code)
);

create index role_permissions_permission_idx on public.role_permissions (permission_code);

create table public.user_roles (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users (id) on delete cascade,
  role_code   text not null references public.roles (code),
  granted_by  uuid references public.users (id),
  granted_at  timestamptz not null default now(),
  revoked_by  uuid references public.users (id),
  revoked_at  timestamptz
);

comment on table public.user_roles is 'Historial de asignación de roles. Rol vigente = revoked_at IS NULL.';

-- Un rol vigente por usuario y código.
create unique index user_roles_active_key on public.user_roles (user_id, role_code) where revoked_at is null;
create index user_roles_role_idx on public.user_roles (role_code);
create index user_roles_granted_by_idx on public.user_roles (granted_by);
create index user_roles_revoked_by_idx on public.user_roles (revoked_by);

-- -----------------------------------------------------------------------------
-- Auditoría (append-only)
-- -----------------------------------------------------------------------------

create type public.audit_result as enum ('SUCCESS', 'DENIED', 'ERROR');

create table public.audit_log (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid references public.users (id),
  actor_roles   text[] not null default '{}',
  action        text not null,
  resource_type text,
  resource_id   text,
  result        public.audit_result not null default 'SUCCESS',
  ip            inet,
  user_agent    text,
  request_id    text,
  metadata      jsonb not null default '{}'::jsonb,
  constraint audit_log_action_format check (action ~ '^[A-Z][A-Z_]*$'),
  constraint audit_log_user_agent_len check (user_agent is null or char_length(user_agent) <= 512)
);

comment on table public.audit_log is 'Registro de auditoría inmutable (docs/analysis/05-seguridad-auditoria.md §19).';

create index audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, occurred_at desc);
create index audit_log_resource_idx on public.audit_log (resource_type, resource_id);
create index audit_log_action_idx on public.audit_log (action, occurred_at desc);

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function private.prevent_mutation();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function private.prevent_mutation();

-- -----------------------------------------------------------------------------
-- Helpers de identidad para RLS (JWT de Cognito vía third-party auth)
-- -----------------------------------------------------------------------------

-- Devuelve users.id del usuario del JWT actual (NULL si no hay JWT o no existe).
create or replace function private.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.user_identities i
  join public.users u on u.id = i.user_id
  where i.issuer = (select auth.jwt() ->> 'iss')
    and i.sub = (select auth.jwt() ->> 'sub')
    and u.status = 'ACTIVO';
$$;

revoke execute on function private.current_user_id() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.current_user_id() to authenticated;

-- Permisos efectivos de un usuario (usado por el servidor y por políticas futuras).
create or replace function private.user_permissions(p_user_id uuid)
returns setof text
language sql
stable
set search_path = ''
as $$
  select distinct rp.permission_code
  from public.user_roles ur
  join public.role_permissions rp on rp.role_code = ur.role_code
  where ur.user_id = p_user_id
    and ur.revoked_at is null;
$$;

revoke execute on function private.user_permissions(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.user_identities enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_log enable row level security;

-- Un usuario autenticado solo ve su propio registro y sus roles.
create policy users_select_own on public.users
  for select to authenticated
  using (id = (select private.current_user_id()));

create policy user_identities_select_own on public.user_identities
  for select to authenticated
  using (user_id = (select private.current_user_id()));

create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = (select private.current_user_id()));

-- audit_log, roles, permissions, role_permissions: sin políticas para anon/authenticated.

-- -----------------------------------------------------------------------------
-- Privilegios (auto_expose_new_tables = false → todo explícito)
-- -----------------------------------------------------------------------------

revoke all on public.users, public.user_identities, public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.audit_log from anon, authenticated;

grant select on public.users, public.user_identities, public.user_roles to authenticated;

-- El servidor (service_role) opera el negocio; la auditoría solo admite INSERT/SELECT.
grant select, insert, update on public.users, public.user_identities to service_role;
grant select, insert, update, delete on public.roles, public.permissions, public.role_permissions to service_role;
grant select, insert, update on public.user_roles to service_role;
grant select, insert on public.audit_log to service_role;
revoke update, delete, truncate on public.audit_log from service_role;
grant usage on schema private to service_role;
grant execute on function private.user_permissions(uuid) to service_role;
grant execute on function private.current_user_id() to service_role;
