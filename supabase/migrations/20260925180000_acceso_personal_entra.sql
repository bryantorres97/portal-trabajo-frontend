-- =============================================================================
-- Fase 2B — Acceso del personal del GAD con Microsoft Entra ID (ADR-012).
-- - Las sesiones registran su origen (COGNITO para ciudadanos, ENTRA para el personal).
-- - Una cuenta del personal (con identidad ENTRA) no se mezcla con cuentas ciudadanas:
--   no se vincula ni se fusiona con identidades de Cognito.
-- - Los roles internos solo se asignan a cuentas del personal.
-- - Alta just-in-time del personal SIN roles y bootstrap del primer ADMIN_SISTEMA.
-- =============================================================================

alter table public.auth_sessions
  add column auth_source text not null default 'COGNITO',
  add constraint auth_sessions_auth_source_check check (auth_source in ('COGNITO', 'ENTRA'));

comment on column public.auth_sessions.auth_source is
  'Proveedor con el que se abrió la sesión. Los permisos internos solo se ejercen en sesiones ENTRA.';

create index user_identities_entra_idx on public.user_identities (user_id) where provider = 'ENTRA';

-- ¿La cuenta pertenece al personal del GAD? (tiene una identidad de Entra ID)
create or replace function private.is_staff_account(p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.user_identities where user_id = p_user_id and provider = 'ENTRA');
$$;

-- -----------------------------------------------------------------------------
-- Ingreso del personal: alta just-in-time sin roles, actualización de datos y
-- bootstrap del primer ADMIN_SISTEMA, todo en una transacción y con auditoría.
-- El bootstrap solo ocurre si NINGUNA cuenta del personal tiene ADMIN_SISTEMA vigente:
-- una vez que existe un administrador, la variable de bootstrap deja de tener efecto.
-- -----------------------------------------------------------------------------

create or replace function public.fn_staff_login(
  p_issuer text,
  p_sub text,
  p_email text default null,
  p_display_name text default null,
  p_bootstrap_admin boolean default false,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns table (user_id uuid, created boolean, bootstrapped boolean, status public.user_status)
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid;
  v_provider text;
  v_created boolean := false;
  v_bootstrapped boolean := false;
  v_status public.user_status;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_nombre text := left(nullif(btrim(coalesce(p_display_name, '')), ''), 120);
begin
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    v_email := null;
  end if;

  select i.user_id, i.provider into v_user, v_provider
  from public.user_identities i
  where i.issuer = p_issuer and i.sub = p_sub
  for update;

  if v_user is not null and v_provider <> 'ENTRA' then
    raise exception 'La identidad no pertenece al personal' using errcode = 'check_violation';
  end if;

  if v_user is null then
    insert into public.users (email, email_verified, display_name, last_login_at)
    values (v_email, false, v_nombre, now())
    returning id into v_user;

    insert into public.user_identities (user_id, issuer, sub, provider, email, email_verified, last_login_at)
    values (v_user, p_issuer, p_sub, 'ENTRA', v_email, false, now());

    insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
    values (v_user, '{}', 'STAFF_FIRST_LOGIN', 'user', v_user::text,
            p_ip, left(p_user_agent, 512), p_request_id, jsonb_build_object('provider', 'ENTRA'));
    v_created := true;
  else
    update public.user_identities
      set email = v_email, last_login_at = now()
      where issuer = p_issuer and sub = p_sub;
    -- Los datos del directorio institucional mandan: se actualizan en cada ingreso.
    update public.users
      set email = coalesce(v_email, email),
          display_name = coalesce(v_nombre, display_name),
          last_login_at = now()
      where id = v_user;
  end if;

  select u.status into v_status from public.users u where u.id = v_user;

  if p_bootstrap_admin and v_status = 'ACTIVO' and not exists (
    select 1
    from public.user_roles ur
    where ur.role_code = 'ADMIN_SISTEMA' and ur.revoked_at is null and private.is_staff_account(ur.user_id)
  ) then
    insert into public.user_roles (user_id, role_code) values (v_user, 'ADMIN_SISTEMA');
    insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
    values (null, '{}', 'ROLE_GRANTED', 'user', v_user::text,
            p_ip, left(p_user_agent, 512), p_request_id,
            jsonb_build_object('role', 'ADMIN_SISTEMA', 'bootstrap', true));
    v_bootstrapped := true;
  end if;

  return query select v_user, v_created, v_bootstrapped, v_status;
end;
$$;

-- -----------------------------------------------------------------------------
-- Roles internos: solo para cuentas del personal (en una cuenta ciudadana no tendrían efecto).
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
  if not private.is_staff_account(p_user_id) then
    raise exception 'Los roles internos solo se asignan a cuentas institucionales (Microsoft Entra ID)'
      using errcode = 'check_violation';
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

-- -----------------------------------------------------------------------------
-- Vinculación (ADR-008): las cuentas del personal quedan fuera. Una identidad de Entra
-- nunca se vincula por este camino, una cuenta del personal no recibe identidades de
-- Cognito y una identidad de Cognito no se "roba" de una cuenta del personal.
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
  if p_provider = 'ENTRA' or private.is_staff_account(p_user_id) then
    raise exception 'Las cuentas institucionales no se vinculan con cuentas ciudadanas'
      using errcode = 'check_violation';
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
    -- Solo se fusiona una cuenta ciudadana sin datos propios.
    if exists (select 1 from public.client_profiles where user_id = v_owner)
       or exists (select 1 from public.user_roles where user_id = v_owner and revoked_at is null and role_code <> 'CLIENTE')
       or exists (select 1 from public.users where id = v_owner and status <> 'ACTIVO')
       or private.is_staff_account(v_owner) then
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

-- -----------------------------------------------------------------------------
-- Privilegios: solo el servidor.
-- -----------------------------------------------------------------------------

revoke execute on function
  private.is_staff_account(uuid),
  public.fn_staff_login(text, text, text, text, boolean, inet, text, text)
  from public, anon, authenticated;

grant execute on function
  private.is_staff_account(uuid),
  public.fn_staff_login(text, text, text, text, boolean, inet, text, text)
  to service_role;
