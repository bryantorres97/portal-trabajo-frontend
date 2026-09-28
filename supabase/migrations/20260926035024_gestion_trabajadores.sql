-- =============================================================================
-- Fase 4 — Gestión de trabajadores: alta presencial, máquina de estados con historial,
-- documentos (Storage privado), capacitación, código de activación y perfil público moderado.
-- Detalle: docs/phases/fase-04-gestion-trabajadores.md · Estados: docs/analysis/01-negocio.md §6.1
--
-- Las transiciones válidas se definen en src/server/domain/workers/state-machine.ts y se
-- repiten aquí (private.worker_transition_*): la base las impone aunque el servidor falle.
-- Cada función `fn_*` hace el cambio y la auditoría en la MISMA transacción.
-- P-06 (documentos obligatorios) y P-13 (capacitación) siguen abiertas: se adoptan los
-- valores recomendados, configurables sin migración (document_types.required, trainings.required).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Utilidad: escritura de auditoría desde las funciones de negocio
-- -----------------------------------------------------------------------------

create or replace function private.audit(
  p_actor uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_ip inet,
  p_user_agent text,
  p_request_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
set search_path = ''
as $$
  insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
  values (p_actor, case when p_actor is null then '{}' else private.user_active_roles(p_actor) end,
          p_action, p_resource_type, p_resource_id, p_ip, left(p_user_agent, 512), p_request_id,
          coalesce(p_metadata, '{}'::jsonb));
$$;

-- -----------------------------------------------------------------------------
-- Trabajador: columnas nuevas (perfil público moderado) e índices de duplicados
-- -----------------------------------------------------------------------------

alter table public.worker_profiles
  add column photo_pending_path          text,
  add column photo_review_note           text,
  add column proposed_bio                text,
  add column proposed_availability_note  text,
  add column proposal_submitted_at       timestamptz,
  add column proposal_review_note        text,
  add constraint worker_profiles_photo_path_format check (
    (photo_path is null or photo_path ~ '^workers/[0-9a-f-]{36}/photos/[0-9a-f-]{36}\.(jpg|png|webp)$')
    and (photo_pending_path is null or photo_pending_path ~ '^workers/[0-9a-f-]{36}/photos/[0-9a-f-]{36}\.(jpg|png|webp)$')
  ),
  add constraint worker_profiles_photo_review_note_len check (photo_review_note is null or char_length(photo_review_note) <= 300),
  add constraint worker_profiles_proposed_bio_len check (proposed_bio is null or char_length(proposed_bio) <= 800),
  add constraint worker_profiles_proposed_note_len check (
    proposed_availability_note is null or char_length(proposed_availability_note) <= 160
  ),
  add constraint worker_profiles_proposal_review_note_len check (
    proposal_review_note is null or char_length(proposal_review_note) <= 300
  );

comment on column public.worker_profiles.photo_path is 'Foto pública APROBADA (bucket privado worker-files; se sirve por el servidor).';
comment on column public.worker_profiles.photo_pending_path is 'Foto propuesta por el trabajador, pendiente de aprobación.';
comment on column public.worker_profiles.proposed_bio is 'Biografía propuesta por el trabajador; se publica solo al aprobarla el GAD.';

-- Detección de posibles duplicados (teléfono, email, nombres normalizados).
create index worker_profiles_phone_idx on public.worker_profiles (phone) where phone is not null;
create index worker_profiles_email_idx on public.worker_profiles (lower(email)) where email is not null;
create index worker_profiles_legal_name_idx on public.worker_profiles (private.normalize_text(first_names || ' ' || last_names));
create index worker_profiles_status_idx on public.worker_profiles (status, status_changed_at desc);

-- -----------------------------------------------------------------------------
-- Historial de estados (append-only)
-- -----------------------------------------------------------------------------

create table public.worker_status_history (
  id           bigint generated always as identity primary key,
  worker_id    uuid not null references public.worker_profiles (id) on delete cascade,
  from_status  public.worker_status,
  to_status    public.worker_status not null,
  reason       text,
  actor_id     uuid references public.users (id),
  created_at   timestamptz not null default now(),
  constraint worker_status_history_reason_len check (reason is null or char_length(reason) <= 500)
);

create index worker_status_history_worker_idx on public.worker_status_history (worker_id, created_at desc);
create index worker_status_history_actor_idx on public.worker_status_history (actor_id);

create trigger worker_status_history_no_update
  before update or delete on public.worker_status_history
  for each row execute function private.prevent_mutation();

-- Los trabajadores existentes (seed de desarrollo, Fase 3) arrancan su historial.
insert into public.worker_status_history (worker_id, from_status, to_status, reason, created_at)
select id, null, status, 'Estado inicial (anterior a la Fase 4)', created_at from public.worker_profiles;

-- -----------------------------------------------------------------------------
-- Documentos (P-06: tipos configurables, ninguno obligatorio hasta que el GAD lo confirme)
-- -----------------------------------------------------------------------------

create type public.document_status as enum ('PENDIENTE', 'VALIDADO', 'RECHAZADO', 'VENCIDO', 'REEMPLAZADO');

create table public.document_types (
  code         text primary key,
  name         text not null,
  description  text,
  required     boolean not null default false,
  has_expiry   boolean not null default false,
  sort_order   smallint not null default 0,
  active       boolean not null default true,
  constraint document_types_code_format check (code ~ '^[A-Z][A-Z_]*$'),
  constraint document_types_name_len check (char_length(btrim(name)) between 2 and 80)
);

insert into public.document_types (code, name, description, required, has_expiry, sort_order) values
  ('ANTECEDENTES_PENALES', 'Certificado de antecedentes penales', 'Obligatoriedad y vigencia pendientes de confirmar (P-06).', false, true, 1),
  ('CERT_CAPACITACION', 'Certificado de capacitación', 'Evidencia de una capacitación aprobada (interna o externa).', false, false, 2),
  ('CERT_OFICIO', 'Certificado de oficio o experiencia', 'Certificados de competencias, cursos o cartas de trabajo.', false, false, 3),
  ('OTRO', 'Otro documento', 'Cualquier otro respaldo relevante.', false, false, 4)
on conflict (code) do nothing;

create table public.worker_documents (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null references public.worker_profiles (id) on delete cascade,
  type_code     text not null references public.document_types (code),
  storage_path  text not null,
  original_name text,
  mime_type     text not null,
  size_bytes    integer not null,
  sha256        text not null,
  status        public.document_status not null default 'PENDIENTE',
  issued_at     date,
  expires_at    date,
  review_note   text,
  reviewed_by   uuid references public.users (id),
  reviewed_at   timestamptz,
  uploaded_by   uuid not null references public.users (id),
  replaces_id   uuid references public.worker_documents (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint worker_documents_path_key unique (storage_path),
  constraint worker_documents_path_format check (
    storage_path ~ '^workers/[0-9a-f-]{36}/documents/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
  ),
  constraint worker_documents_mime check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  constraint worker_documents_size check (size_bytes between 1 and 4194304),
  constraint worker_documents_sha256 check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint worker_documents_name_len check (original_name is null or char_length(original_name) <= 200),
  constraint worker_documents_review_note_len check (review_note is null or char_length(review_note) <= 500),
  constraint worker_documents_dates check (issued_at is null or expires_at is null or issued_at <= expires_at)
);

comment on table public.worker_documents is
  'Documentos del trabajador. El binario vive en el bucket privado worker-files; se consulta con URL firmada de 5 min y cada acceso se audita. Nunca se borra (se reemplaza).';

create index worker_documents_worker_idx on public.worker_documents (worker_id, created_at desc);
create index worker_documents_type_idx on public.worker_documents (type_code);
create index worker_documents_uploaded_by_idx on public.worker_documents (uploaded_by);
create index worker_documents_reviewed_by_idx on public.worker_documents (reviewed_by);
create index worker_documents_replaces_idx on public.worker_documents (replaces_id);
-- Un mismo archivo no se carga dos veces para el mismo trabajador (salvo que se haya reemplazado).
create unique index worker_documents_same_file_key on public.worker_documents (worker_id, sha256)
  where status <> 'REEMPLAZADO';

create trigger worker_documents_set_updated_at before update on public.worker_documents
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Capacitación (P-13: por defecto un curso general, aprobado/reprobado, sin vencimiento)
-- -----------------------------------------------------------------------------

create type public.enrollment_status as enum ('INSCRITO', 'EN_PROCESO', 'APROBADO', 'REPROBADO', 'ABANDONADO');

create table public.trainings (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  name             text not null,
  description      text,
  provider         text not null default 'INTERNO',
  validity_months  smallint,
  required         boolean not null default false,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint trainings_code_key unique (code),
  constraint trainings_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]*$' and char_length(code) <= 40),
  constraint trainings_name_len check (char_length(btrim(name)) between 3 and 120),
  constraint trainings_description_len check (description is null or char_length(description) <= 500),
  constraint trainings_provider check (provider in ('INTERNO', 'EXTERNO')),
  constraint trainings_validity check (validity_months is null or validity_months between 1 and 120)
);

comment on column public.trainings.required is 'Si es true, habilitar exige una inscripción APROBADA y vigente en este curso.';

create trigger trainings_set_updated_at before update on public.trainings
  for each row execute function private.set_updated_at();

insert into public.trainings (code, name, description, provider, validity_months, required) values
  ('GENERAL', 'Capacitación general Acolita',
   'Uso de la plataforma, atención al cliente, seguridad en el trabajo y normas de convivencia. [PENDIENTE P-13]',
   'INTERNO', null, true)
on conflict (code) do nothing;

create table public.training_enrollments (
  id                    uuid primary key default gen_random_uuid(),
  worker_id             uuid not null references public.worker_profiles (id) on delete cascade,
  training_id           uuid not null references public.trainings (id),
  status                public.enrollment_status not null default 'INSCRITO',
  enrolled_at           timestamptz not null default now(),
  started_at            timestamptz,
  finished_at           timestamptz,
  score                 numeric(5, 2),
  result_note           text,
  valid_until           date,
  validated_by          uuid references public.users (id),
  evidence_document_id  uuid references public.worker_documents (id),
  created_by            uuid references public.users (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint training_enrollments_score check (score is null or score between 0 and 100),
  constraint training_enrollments_note_len check (result_note is null or char_length(result_note) <= 500)
);

create index training_enrollments_worker_idx on public.training_enrollments (worker_id, enrolled_at desc);
create index training_enrollments_training_idx on public.training_enrollments (training_id, status);
create index training_enrollments_validated_by_idx on public.training_enrollments (validated_by);
create index training_enrollments_created_by_idx on public.training_enrollments (created_by);
create index training_enrollments_evidence_idx on public.training_enrollments (evidence_document_id);
-- Una sola inscripción abierta por trabajador y curso.
create unique index training_enrollments_open_key on public.training_enrollments (worker_id, training_id)
  where status in ('INSCRITO', 'EN_PROCESO');

create trigger training_enrollments_set_updated_at before update on public.training_enrollments
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Códigos de activación (vinculan la cuenta Cognito del trabajador con su ficha)
-- Solo se guarda el HMAC-SHA256 del código (lo calcula el servidor con SESSION_SECRET).
-- -----------------------------------------------------------------------------

create table public.worker_activation_codes (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references public.worker_profiles (id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references public.users (id),
  revoked_at  timestamptz,
  created_by  uuid not null references public.users (id),
  created_at  timestamptz not null default now(),
  constraint worker_activation_codes_hash_key unique (code_hash),
  constraint worker_activation_codes_hash_format check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint worker_activation_codes_expiry check (expires_at > created_at)
);

create index worker_activation_codes_worker_idx on public.worker_activation_codes (worker_id, created_at desc);
create index worker_activation_codes_created_by_idx on public.worker_activation_codes (created_by);
create index worker_activation_codes_used_by_idx on public.worker_activation_codes (used_by);

-- -----------------------------------------------------------------------------
-- Máquina de estados (espejo de src/server/domain/workers/state-machine.ts)
-- -----------------------------------------------------------------------------

create or replace function private.worker_transition_allowed(p_from public.worker_status, p_to public.worker_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'REGISTRADO' then p_to in ('DOCUMENTACION_PENDIENTE', 'PENDIENTE_REVISION', 'RECHAZADO')
    when 'DOCUMENTACION_PENDIENTE' then p_to in ('PENDIENTE_REVISION', 'RECHAZADO')
    when 'PENDIENTE_REVISION' then p_to in ('DOCUMENTACION_PENDIENTE', 'CAPACITACION_PENDIENTE', 'RECHAZADO')
    when 'CAPACITACION_PENDIENTE' then p_to in ('CAPACITACION_EN_PROCESO', 'RECHAZADO')
    when 'CAPACITACION_EN_PROCESO' then p_to in ('CAPACITACION_PENDIENTE', 'CAPACITACION_APROBADA', 'RECHAZADO')
    when 'CAPACITACION_APROBADA' then p_to in ('HABILITADO', 'RECHAZADO')
    when 'HABILITADO' then p_to in ('SUSPENDIDO', 'INACTIVO')
    when 'SUSPENDIDO' then p_to in ('HABILITADO', 'INACTIVO')
    when 'INACTIVO' then p_to in ('HABILITADO')
    else false
  end;
$$;

create or replace function private.worker_transition_permission(p_from public.worker_status, p_to public.worker_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_to in ('DOCUMENTACION_PENDIENTE', 'PENDIENTE_REVISION') then 'worker.update'
    when p_to = 'CAPACITACION_PENDIENTE' and p_from = 'PENDIENTE_REVISION' then 'document.review'
    when p_to in ('CAPACITACION_PENDIENTE', 'CAPACITACION_EN_PROCESO') then 'training.record'
    when p_to = 'CAPACITACION_APROBADA' then 'training.approve'
    when p_to = 'HABILITADO' then 'worker.enable'
    else 'worker.suspend'
  end;
$$;

create or replace function private.worker_transition_requires_reason(p_from public.worker_status, p_to public.worker_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_to in ('RECHAZADO', 'SUSPENDIDO', 'INACTIVO', 'DOCUMENTACION_PENDIENTE')
      or (p_to = 'HABILITADO' and p_from in ('SUSPENDIDO', 'INACTIVO'));
$$;

create or replace function private.worker_status_action(p_from public.worker_status, p_to public.worker_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_to = 'HABILITADO' and p_from in ('SUSPENDIDO', 'INACTIVO') then 'WORKER_REACTIVATED'
    when p_to = 'HABILITADO' then 'WORKER_ENABLED'
    when p_to = 'SUSPENDIDO' then 'WORKER_SUSPENDED'
    when p_to = 'RECHAZADO' then 'WORKER_REJECTED'
    when p_to = 'INACTIVO' then 'WORKER_INACTIVATED'
    else 'WORKER_STATUS_CHANGED'
  end;
$$;

-- Documentos obligatorios (document_types.required) validados y vigentes.
create or replace function private.worker_required_documents_ok(p_worker uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1
    from public.document_types t
    where t.required and t.active
      and not exists (
        select 1 from public.worker_documents d
        where d.worker_id = p_worker and d.type_code = t.code and d.status = 'VALIDADO'
          and (d.expires_at is null or d.expires_at >= current_date)
      )
  );
$$;

-- Al menos una capacitación APROBADA y vigente, y todas las obligatorias aprobadas.
create or replace function private.worker_training_ok(p_worker uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
      select 1 from public.training_enrollments e
      where e.worker_id = p_worker and e.status = 'APROBADO'
        and (e.valid_until is null or e.valid_until >= current_date)
    )
    and not exists (
      select 1 from public.trainings t
      where t.active and t.required
        and not exists (
          select 1 from public.training_enrollments e
          where e.worker_id = p_worker and e.training_id = t.id and e.status = 'APROBADO'
            and (e.valid_until is null or e.valid_until >= current_date)
        )
    );
$$;

/*
 * Aplica una transición: valida la máquina de estados, el motivo y las condiciones de negocio,
 * actualiza el trabajador y escribe el historial. NO verifica permisos (lo hacen los llamadores).
 */
create or replace function private.apply_worker_status(
  p_worker uuid,
  p_to public.worker_status,
  p_reason text,
  p_actor uuid,
  p_suspended_until timestamptz default null
)
returns public.worker_status
language plpgsql
set search_path = ''
as $$
declare
  v_from public.worker_status;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select status into v_from from public.worker_profiles where id = p_worker for update;
  if not found then
    raise exception 'Trabajador no encontrado' using errcode = 'no_data_found';
  end if;
  if v_from = p_to then
    raise exception 'El trabajador ya está en ese estado' using errcode = 'check_violation';
  end if;
  if not private.worker_transition_allowed(v_from, p_to) then
    raise exception 'Transición no permitida: % → %', v_from, p_to using errcode = 'check_violation';
  end if;
  if private.worker_transition_requires_reason(v_from, p_to) and char_length(coalesce(v_reason, '')) < 5 then
    raise exception 'Indica el motivo del cambio (mínimo 5 caracteres)' using errcode = 'check_violation';
  end if;

  if p_to = 'CAPACITACION_PENDIENTE' and v_from = 'PENDIENTE_REVISION' then
    if exists (select 1 from public.worker_documents where worker_id = p_worker and status = 'PENDIENTE') then
      raise exception 'Hay documentos pendientes de revisión' using errcode = 'check_violation';
    end if;
    if not private.worker_required_documents_ok(p_worker) then
      raise exception 'Faltan documentos obligatorios validados' using errcode = 'check_violation';
    end if;
  elsif p_to = 'CAPACITACION_EN_PROCESO' then
    if not exists (select 1 from public.training_enrollments
                   where worker_id = p_worker and status in ('INSCRITO', 'EN_PROCESO')) then
      raise exception 'El trabajador no tiene una inscripción de capacitación abierta' using errcode = 'check_violation';
    end if;
  elsif p_to in ('CAPACITACION_APROBADA', 'HABILITADO') then
    if not private.worker_training_ok(p_worker) then
      raise exception 'El trabajador no tiene una capacitación aprobada y vigente' using errcode = 'check_violation';
    end if;
    if p_to = 'HABILITADO' then
      if not private.worker_required_documents_ok(p_worker) then
        raise exception 'Faltan documentos obligatorios validados y vigentes' using errcode = 'check_violation';
      end if;
      if not exists (select 1 from public.worker_services ws join public.services s on s.id = ws.service_id
                     where ws.worker_id = p_worker and s.active) then
        raise exception 'El trabajador no tiene oficios activos' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if p_to = 'SUSPENDIDO' and p_suspended_until is not null and p_suspended_until <= now() then
    raise exception 'La fecha de fin de la suspensión debe ser futura' using errcode = 'check_violation';
  end if;

  update public.worker_profiles
    set status = p_to,
        status_changed_at = now(),
        enabled_at = case when p_to = 'HABILITADO' then coalesce(enabled_at, now()) else enabled_at end,
        suspended_until = case when p_to = 'SUSPENDIDO' then p_suspended_until else null end
    where id = p_worker;

  insert into public.worker_status_history (worker_id, from_status, to_status, reason, actor_id)
  values (p_worker, v_from, p_to, left(v_reason, 500), p_actor);

  return v_from;
end;
$$;

create or replace function public.fn_admin_change_worker_status(
  p_actor_id uuid,
  p_worker_id uuid,
  p_to public.worker_status,
  p_reason text default null,
  p_suspended_until timestamptz default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_actual public.worker_status;
  v_from public.worker_status;
begin
  select status into v_actual from public.worker_profiles where id = p_worker_id;
  if not found then
    raise exception 'Trabajador no encontrado' using errcode = 'no_data_found';
  end if;
  perform private.require_permission(p_actor_id, private.worker_transition_permission(v_actual, p_to));

  v_from := private.apply_worker_status(p_worker_id, p_to, p_reason, p_actor_id, p_suspended_until);

  perform private.audit(p_actor_id, private.worker_status_action(v_from, p_to), 'worker', p_worker_id::text,
    p_ip, p_user_agent, p_request_id,
    jsonb_build_object('from', v_from, 'to', p_to, 'reason', left(nullif(btrim(p_reason), ''), 500),
                       'suspendedUntil', p_suspended_until));
end;
$$;

-- -----------------------------------------------------------------------------
-- Alta y edición (worker.create / worker.update)
-- -----------------------------------------------------------------------------

-- Reemplaza los oficios del trabajador. p_services: [{"serviceId": uuid, "isPrimary": bool}, …]
create or replace function private.worker_set_services(p_worker uuid, p_services jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_services is null or jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) = 0 then
    raise exception 'Selecciona al menos un oficio' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_services) > 10 then
    raise exception 'Se admiten hasta 10 oficios por trabajador' using errcode = 'check_violation';
  end if;

  delete from public.worker_services where worker_id = p_worker;
  insert into public.worker_services (worker_id, service_id, is_primary)
  select p_worker, (s ->> 'serviceId')::uuid, coalesce((s ->> 'isPrimary')::boolean, false)
  from jsonb_array_elements(p_services) s;

  if (select count(*) from public.worker_services where worker_id = p_worker and is_primary) <> 1 then
    raise exception 'Marca exactamente un oficio principal' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.worker_services ws join public.services s on s.id = ws.service_id
             where ws.worker_id = p_worker and not s.active) then
    raise exception 'Solo se pueden asignar oficios activos' using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function private.parish_id_by_code(p_code text)
returns smallint
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id smallint;
begin
  if nullif(btrim(coalesce(p_code, '')), '') is null then
    return null;
  end if;
  select id into v_id from public.parishes where code = p_code and active;
  if v_id is null then
    raise exception 'Parroquia no válida' using errcode = 'check_violation';
  end if;
  return v_id;
end;
$$;

create or replace function private.check_birth_date(p_birth date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_birth is not null and (p_birth > current_date - interval '18 years' or p_birth < date '1920-01-01') then
    raise exception 'El trabajador debe ser mayor de edad' using errcode = 'check_violation';
  end if;
end;
$$;

/*
 * p_data: firstNames, lastNames, phone, email, address, birthDate, emergencyContactName,
 * emergencyContactPhone, publicDisplayName, specialty, publicBio, yearsExperience, parishCode, isAvailable.
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
begin
  perform private.require_permission(p_actor_id, 'worker.create');
  perform private.check_birth_date((p_data ->> 'birthDate')::date);

  insert into public.worker_profiles (
    first_names, last_names, phone, email, address, birth_date, emergency_contact_name, emergency_contact_phone,
    public_display_name, specialty, public_bio, years_experience, parish_id, is_available, status, registered_by
  ) values (
    btrim(p_data ->> 'firstNames'), btrim(p_data ->> 'lastNames'),
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

  select coalesce(jsonb_agg(service_id order by service_id), '[]') into v_servicios_antes
  from public.worker_services where worker_id = p_worker_id;

  update public.worker_profiles set
    first_names = btrim(p_data ->> 'firstNames'),
    last_names = btrim(p_data ->> 'lastNames'),
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

-- Posibles duplicados por teléfono, email o nombres (sin tildes ni mayúsculas).
create or replace function public.fn_admin_find_worker_duplicates(
  p_actor_id uuid,
  p_phone text,
  p_email text,
  p_first_names text,
  p_last_names text,
  p_exclude uuid default null
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
begin
  perform private.require_permission(p_actor_id, 'worker.read');
  return query
  select w.id, w.public_display_name, w.status,
         array_remove(array[
           case when v_phone is not null and w.phone = v_phone then 'TELEFONO' end,
           case when v_email is not null and lower(w.email) = v_email then 'EMAIL' end,
           case when private.normalize_text(w.first_names || ' ' || w.last_names) = v_nombre then 'NOMBRES' end
         ], null)
  from public.worker_profiles w
  where (p_exclude is null or w.id <> p_exclude)
    and ((v_phone is not null and w.phone = v_phone)
      or (v_email is not null and lower(w.email) = v_email)
      or (btrim(v_nombre) <> '' and private.normalize_text(w.first_names || ' ' || w.last_names) = v_nombre))
  order by w.created_at desc
  limit 10;
end;
$$;

-- -----------------------------------------------------------------------------
-- Documentos: registro (tras subir el archivo al bucket) y revisión
-- -----------------------------------------------------------------------------

create or replace function public.fn_admin_register_document(
  p_actor_id uuid,
  p_worker_id uuid,
  p_type_code text,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes integer,
  p_sha256 text,
  p_issued_at date default null,
  p_expires_at date default null,
  p_replaces_id uuid default null,
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
  v_status public.worker_status;
begin
  perform private.require_permission(p_actor_id, 'document.upload');

  select status into v_status from public.worker_profiles where id = p_worker_id;
  if not found then
    raise exception 'Trabajador no encontrado' using errcode = 'no_data_found';
  end if;
  if v_status = 'RECHAZADO' then
    raise exception 'No se cargan documentos de un trabajador rechazado' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.document_types where code = p_type_code and active) then
    raise exception 'Tipo de documento no válido' using errcode = 'check_violation';
  end if;
  if p_storage_path not like 'workers/' || p_worker_id::text || '/documents/%' then
    raise exception 'Ruta de archivo no válida' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.worker_documents where worker_id = p_worker_id and sha256 = p_sha256
             and status <> 'REEMPLAZADO' and id is distinct from p_replaces_id) then
    raise exception 'Ese archivo ya fue cargado para este trabajador' using errcode = 'unique_violation';
  end if;

  if p_replaces_id is not null then
    update public.worker_documents set status = 'REEMPLAZADO'
      where id = p_replaces_id and worker_id = p_worker_id and status <> 'REEMPLAZADO';
    if not found then
      raise exception 'El documento a reemplazar no existe' using errcode = 'no_data_found';
    end if;
  end if;

  insert into public.worker_documents (worker_id, type_code, storage_path, original_name, mime_type, size_bytes,
                                       sha256, issued_at, expires_at, uploaded_by, replaces_id)
  values (p_worker_id, p_type_code, p_storage_path, left(nullif(btrim(p_original_name), ''), 200), p_mime_type,
          p_size_bytes, p_sha256, p_issued_at, p_expires_at, p_actor_id, p_replaces_id)
  returning id into v_id;

  perform private.audit(p_actor_id, 'DOCUMENT_UPLOADED', 'worker_document', v_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('workerId', p_worker_id, 'type', p_type_code, 'mime', p_mime_type, 'size', p_size_bytes,
                       'sha256', p_sha256, 'replaces', p_replaces_id));
  return v_id;
end;
$$;

create or replace function public.fn_admin_review_document(
  p_actor_id uuid,
  p_document_id uuid,
  p_status public.document_status,
  p_note text default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_doc public.worker_documents;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_permission(p_actor_id, 'document.review');
  if p_status not in ('VALIDADO', 'RECHAZADO') then
    raise exception 'Resultado de revisión no válido' using errcode = 'check_violation';
  end if;
  if p_status = 'RECHAZADO' and char_length(coalesce(v_note, '')) < 5 then
    raise exception 'Indica el motivo del rechazo (mínimo 5 caracteres)' using errcode = 'check_violation';
  end if;

  select * into v_doc from public.worker_documents where id = p_document_id for update;
  if not found then
    raise exception 'Documento no encontrado' using errcode = 'no_data_found';
  end if;
  if v_doc.status <> 'PENDIENTE' then
    raise exception 'Solo se revisan documentos pendientes' using errcode = 'check_violation';
  end if;
  if p_status = 'VALIDADO' and v_doc.expires_at is not null and v_doc.expires_at < current_date then
    raise exception 'El documento está vencido' using errcode = 'check_violation';
  end if;

  update public.worker_documents
    set status = p_status, review_note = left(v_note, 500), reviewed_by = p_actor_id, reviewed_at = now()
    where id = p_document_id;

  perform private.audit(p_actor_id, case when p_status = 'VALIDADO' then 'DOCUMENT_VALIDATED' else 'DOCUMENT_REJECTED' end,
    'worker_document', p_document_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('workerId', v_doc.worker_id, 'type', v_doc.type_code, 'note', left(v_note, 500)));
end;
$$;

-- -----------------------------------------------------------------------------
-- Capacitación: cursos (training.manage) e inscripciones (training.record / training.approve)
-- -----------------------------------------------------------------------------

create or replace function public.fn_admin_save_training(
  p_actor_id uuid,
  p_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_provider text,
  p_validity_months smallint,
  p_required boolean,
  p_active boolean,
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
begin
  perform private.require_permission(p_actor_id, 'training.manage');
  if p_id is null then
    insert into public.trainings (code, name, description, provider, validity_months, required, active)
    values (upper(btrim(p_code)), btrim(p_name), nullif(btrim(p_description), ''), p_provider, p_validity_months,
            p_required, p_active)
    returning id into v_id;
  else
    update public.trainings
      set code = upper(btrim(p_code)), name = btrim(p_name), description = nullif(btrim(p_description), ''),
          provider = p_provider, validity_months = p_validity_months, required = p_required, active = p_active
      where id = p_id
      returning id into v_id;
    if v_id is null then
      raise exception 'Curso no encontrado' using errcode = 'no_data_found';
    end if;
  end if;

  perform private.audit(p_actor_id, case when p_id is null then 'TRAINING_CREATED' else 'TRAINING_UPDATED' end,
    'training', v_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('code', upper(btrim(p_code)), 'required', p_required, 'active', p_active));
  return v_id;
end;
$$;

create or replace function public.fn_admin_enroll_worker(
  p_actor_id uuid,
  p_worker_id uuid,
  p_training_id uuid,
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
  v_status public.worker_status;
begin
  perform private.require_permission(p_actor_id, 'training.record');

  select status into v_status from public.worker_profiles where id = p_worker_id for update;
  if not found then
    raise exception 'Trabajador no encontrado' using errcode = 'no_data_found';
  end if;
  if v_status in ('RECHAZADO', 'INACTIVO') then
    raise exception 'No se inscribe a un trabajador rechazado o inactivo' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.trainings where id = p_training_id and active) then
    raise exception 'Curso no válido o inactivo' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.training_enrollments where worker_id = p_worker_id and training_id = p_training_id
             and status in ('INSCRITO', 'EN_PROCESO')) then
    raise exception 'El trabajador ya tiene una inscripción abierta en ese curso' using errcode = 'unique_violation';
  end if;

  insert into public.training_enrollments (worker_id, training_id, created_by)
  values (p_worker_id, p_training_id, p_actor_id)
  returning id into v_id;

  perform private.audit(p_actor_id, 'TRAINING_ENROLLED', 'training_enrollment', v_id::text, p_ip, p_user_agent,
    p_request_id, jsonb_build_object('workerId', p_worker_id, 'trainingId', p_training_id));

  if v_status = 'CAPACITACION_PENDIENTE' then
    perform private.apply_worker_status(p_worker_id, 'CAPACITACION_EN_PROCESO', 'Inscripción en capacitación', p_actor_id);
    perform private.audit(p_actor_id, 'WORKER_STATUS_CHANGED', 'worker', p_worker_id::text, p_ip, p_user_agent,
      p_request_id, jsonb_build_object('from', v_status, 'to', 'CAPACITACION_EN_PROCESO', 'automatic', true));
  end if;
  return v_id;
end;
$$;

/*
 * Avanza una inscripción: INSCRITO → EN_PROCESO | APROBADO | REPROBADO | ABANDONADO;
 * EN_PROCESO → APROBADO | REPROBADO | ABANDONADO. Los estados finales no cambian.
 * APROBADO exige training.approve; ajusta el estado del trabajador cuando corresponde.
 */
create or replace function public.fn_admin_update_enrollment(
  p_actor_id uuid,
  p_enrollment_id uuid,
  p_status public.enrollment_status,
  p_score numeric default null,
  p_note text default null,
  p_evidence_document_id uuid default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_e public.training_enrollments;
  v_validez smallint;
  v_worker_status public.worker_status;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_permission(p_actor_id,
    case when p_status = 'APROBADO' then 'training.approve' else 'training.record' end);

  select * into v_e from public.training_enrollments where id = p_enrollment_id for update;
  if not found then
    raise exception 'Inscripción no encontrada' using errcode = 'no_data_found';
  end if;
  if not (
    (v_e.status = 'INSCRITO' and p_status in ('EN_PROCESO', 'APROBADO', 'REPROBADO', 'ABANDONADO'))
    or (v_e.status = 'EN_PROCESO' and p_status in ('APROBADO', 'REPROBADO', 'ABANDONADO'))
  ) then
    raise exception 'Cambio de inscripción no permitido: % → %', v_e.status, p_status using errcode = 'check_violation';
  end if;
  if p_status in ('REPROBADO', 'ABANDONADO') and char_length(coalesce(v_note, '')) < 5 then
    raise exception 'Indica una observación (mínimo 5 caracteres)' using errcode = 'check_violation';
  end if;
  if p_evidence_document_id is not null and not exists (
    select 1 from public.worker_documents where id = p_evidence_document_id and worker_id = v_e.worker_id
      and status <> 'REEMPLAZADO') then
    raise exception 'La evidencia debe ser un documento vigente del mismo trabajador' using errcode = 'check_violation';
  end if;

  select validity_months into v_validez from public.trainings where id = v_e.training_id;

  update public.training_enrollments
    set status = p_status,
        started_at = coalesce(started_at, now()),
        finished_at = case when p_status in ('APROBADO', 'REPROBADO', 'ABANDONADO') then now() else null end,
        score = coalesce(p_score, score),
        result_note = coalesce(left(v_note, 500), result_note),
        evidence_document_id = coalesce(p_evidence_document_id, evidence_document_id),
        validated_by = case when p_status = 'APROBADO' then p_actor_id else validated_by end,
        valid_until = case when p_status = 'APROBADO' and v_validez is not null
                           then (current_date + make_interval(months => v_validez))::date else null end
    where id = p_enrollment_id;

  perform private.audit(p_actor_id, case when p_status = 'APROBADO' then 'TRAINING_APPROVED' else 'TRAINING_UPDATED' end,
    'training_enrollment', p_enrollment_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('workerId', v_e.worker_id, 'from', v_e.status, 'to', p_status, 'score', p_score));

  -- Estado del trabajador según el resultado.
  select status into v_worker_status from public.worker_profiles where id = v_e.worker_id;
  if p_status = 'APROBADO' and v_worker_status = 'CAPACITACION_EN_PROCESO' and private.worker_training_ok(v_e.worker_id) then
    perform private.apply_worker_status(v_e.worker_id, 'CAPACITACION_APROBADA', 'Capacitación aprobada', p_actor_id);
    perform private.audit(p_actor_id, 'WORKER_STATUS_CHANGED', 'worker', v_e.worker_id::text, p_ip, p_user_agent,
      p_request_id, jsonb_build_object('from', v_worker_status, 'to', 'CAPACITACION_APROBADA', 'automatic', true));
  elsif p_status in ('REPROBADO', 'ABANDONADO') and v_worker_status = 'CAPACITACION_EN_PROCESO'
        and not exists (select 1 from public.training_enrollments where worker_id = v_e.worker_id
                        and status in ('INSCRITO', 'EN_PROCESO')) then
    perform private.apply_worker_status(v_e.worker_id, 'CAPACITACION_PENDIENTE',
      'Capacitación ' || lower(p_status::text), p_actor_id);
    perform private.audit(p_actor_id, 'WORKER_STATUS_CHANGED', 'worker', v_e.worker_id::text, p_ip, p_user_agent,
      p_request_id, jsonb_build_object('from', v_worker_status, 'to', 'CAPACITACION_PENDIENTE', 'automatic', true));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Código de activación: emisión (worker.activation_code) y canje por el trabajador
-- -----------------------------------------------------------------------------

create or replace function public.fn_admin_issue_activation_code(
  p_actor_id uuid,
  p_worker_id uuid,
  p_code_hash text,
  p_expires_at timestamptz,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_w record;
begin
  perform private.require_permission(p_actor_id, 'worker.activation_code');

  select status, user_id into v_w from public.worker_profiles where id = p_worker_id for update;
  if not found then
    raise exception 'Trabajador no encontrado' using errcode = 'no_data_found';
  end if;
  if v_w.user_id is not null then
    raise exception 'El trabajador ya vinculó su cuenta' using errcode = 'check_violation';
  end if;
  if v_w.status in ('RECHAZADO', 'INACTIVO') then
    raise exception 'No se emiten códigos para trabajadores rechazados o inactivos' using errcode = 'check_violation';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'Vigencia del código no válida' using errcode = 'check_violation';
  end if;

  -- Un solo código vigente por trabajador: se revocan los anteriores.
  update public.worker_activation_codes set revoked_at = now()
    where worker_id = p_worker_id and used_at is null and revoked_at is null;

  insert into public.worker_activation_codes (worker_id, code_hash, expires_at, created_by)
  values (p_worker_id, p_code_hash, p_expires_at, p_actor_id);

  perform private.audit(p_actor_id, 'ACTIVATION_CODE_ISSUED', 'worker', p_worker_id::text, p_ip, p_user_agent,
    p_request_id, jsonb_build_object('expiresAt', p_expires_at));
end;
$$;

/*
 * Canje del código por el propio trabajador (sesión ciudadana). Devuelve un resultado en lugar
 * de lanzar excepciones para que los intentos fallidos QUEDEN auditados (sirven de límite:
 * 5 intentos fallidos en 15 minutos bloquean temporalmente el canje).
 */
create or replace function public.fn_redeem_activation_code(
  p_user_id uuid,
  p_code_hash text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns table (result text, worker_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_code public.worker_activation_codes;
  v_status public.worker_status;
begin
  if not exists (select 1 from public.users where id = p_user_id and status = 'ACTIVO') then
    raise exception 'Usuario no activo' using errcode = 'insufficient_privilege';
  end if;
  if private.is_staff_account(p_user_id) then
    raise exception 'Las cuentas institucionales no se vinculan con fichas de trabajador' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.worker_profiles where user_id = p_user_id) then
    return query select 'ALREADY_WORKER'::text, (select id from public.worker_profiles where user_id = p_user_id);
    return;
  end if;
  if (select count(*) from public.audit_log
      where actor_id = p_user_id and action = 'ACTIVATION_CODE_FAILED'
        and occurred_at > now() - interval '15 minutes') >= 5 then
    return query select 'RATE_LIMITED'::text, null::uuid;
    return;
  end if;

  select * into v_code from public.worker_activation_codes where code_hash = p_code_hash for update;
  if v_code.id is not null then
    select status into v_status from public.worker_profiles where id = v_code.worker_id for update;
  end if;

  if v_code.id is null then
    perform private.audit(p_user_id, 'ACTIVATION_CODE_FAILED', 'user', p_user_id::text, p_ip, p_user_agent,
      p_request_id, jsonb_build_object('reason', 'INVALID'));
    return query select 'INVALID'::text, null::uuid;
    return;
  end if;
  if v_code.used_at is not null or v_code.revoked_at is not null or v_code.expires_at <= now()
     or v_status in ('RECHAZADO', 'INACTIVO')
     or exists (select 1 from public.worker_profiles where id = v_code.worker_id and user_id is not null) then
    perform private.audit(p_user_id, 'ACTIVATION_CODE_FAILED', 'user', p_user_id::text, p_ip, p_user_agent,
      p_request_id, jsonb_build_object('reason', 'EXPIRED', 'workerId', v_code.worker_id));
    return query select 'EXPIRED'::text, null::uuid;
    return;
  end if;

  update public.worker_activation_codes set used_at = now(), used_by = p_user_id where id = v_code.id;
  update public.worker_profiles set user_id = p_user_id where id = v_code.worker_id;
  if not exists (select 1 from public.user_roles where user_id = p_user_id and role_code = 'TRABAJADOR' and revoked_at is null) then
    insert into public.user_roles (user_id, role_code) values (p_user_id, 'TRABAJADOR');
  end if;

  perform private.audit(p_user_id, 'WORKER_ACCOUNT_LINKED', 'worker', v_code.worker_id::text, p_ip, p_user_agent,
    p_request_id, jsonb_build_object('userId', p_user_id));
  return query select 'LINKED'::text, v_code.worker_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Perfil público: edición limitada del trabajador y moderación del GAD (worker.update)
-- -----------------------------------------------------------------------------

create or replace function private.worker_id_of_user(p_user_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select w.id into v_id
  from public.worker_profiles w
  join public.users u on u.id = w.user_id
  where w.user_id = p_user_id and u.status = 'ACTIVO' and w.status <> 'RECHAZADO';
  if v_id is null then
    raise exception 'No tienes una ficha de trabajador activa' using errcode = 'insufficient_privilege';
  end if;
  return v_id;
end;
$$;

create or replace function public.fn_worker_set_availability(
  p_user_id uuid,
  p_available boolean,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_worker uuid := private.worker_id_of_user(p_user_id);
begin
  update public.worker_profiles set is_available = p_available where id = v_worker;
  perform private.audit(p_user_id, 'WORKER_AVAILABILITY_CHANGED', 'worker', v_worker::text, p_ip, p_user_agent,
    p_request_id, jsonb_build_object('available', p_available));
end;
$$;

create or replace function public.fn_worker_propose_profile(
  p_user_id uuid,
  p_bio text,
  p_availability_note text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_worker uuid := private.worker_id_of_user(p_user_id);
begin
  update public.worker_profiles
    set proposed_bio = nullif(btrim(p_bio), ''),
        proposed_availability_note = nullif(btrim(p_availability_note), ''),
        proposal_submitted_at = now(),
        proposal_review_note = null
    where id = v_worker;
  perform private.audit(p_user_id, 'WORKER_PROFILE_PROPOSED', 'worker', v_worker::text, p_ip, p_user_agent,
    p_request_id, '{}'::jsonb);
end;
$$;

create or replace function public.fn_worker_propose_photo(
  p_user_id uuid,
  p_path text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_worker uuid := private.worker_id_of_user(p_user_id);
begin
  if p_path not like 'workers/' || v_worker::text || '/photos/%' then
    raise exception 'Ruta de archivo no válida' using errcode = 'check_violation';
  end if;
  update public.worker_profiles
    set photo_pending_path = p_path, photo_status = 'PENDIENTE', photo_review_note = null
    where id = v_worker;
  perform private.audit(p_user_id, 'WORKER_PHOTO_PROPOSED', 'worker', v_worker::text, p_ip, p_user_agent,
    p_request_id, '{}'::jsonb);
end;
$$;

-- Foto cargada por el personal en la atención presencial: queda aprobada.
create or replace function public.fn_admin_set_worker_photo(
  p_actor_id uuid,
  p_worker_id uuid,
  p_path text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.require_permission(p_actor_id, 'worker.update');
  if p_path not like 'workers/' || p_worker_id::text || '/photos/%' then
    raise exception 'Ruta de archivo no válida' using errcode = 'check_violation';
  end if;
  update public.worker_profiles
    set photo_path = p_path, photo_pending_path = null, photo_status = 'APROBADA', photo_review_note = null
    where id = p_worker_id and status <> 'RECHAZADO';
  if not found then
    raise exception 'Trabajador no encontrado o rechazado' using errcode = 'no_data_found';
  end if;
  perform private.audit(p_actor_id, 'WORKER_PHOTO_SET', 'worker', p_worker_id::text, p_ip, p_user_agent,
    p_request_id, '{}'::jsonb);
end;
$$;

create or replace function public.fn_admin_review_worker_photo(
  p_actor_id uuid,
  p_worker_id uuid,
  p_approve boolean,
  p_note text default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_permission(p_actor_id, 'worker.update');
  if not p_approve and char_length(coalesce(v_note, '')) < 5 then
    raise exception 'Indica el motivo del rechazo (mínimo 5 caracteres)' using errcode = 'check_violation';
  end if;
  update public.worker_profiles
    set photo_path = case when p_approve then photo_pending_path else photo_path end,
        photo_pending_path = null,
        photo_status = case when p_approve then 'APROBADA' else 'RECHAZADA' end,
        photo_review_note = case when p_approve then null else left(v_note, 300) end
    where id = p_worker_id and photo_status = 'PENDIENTE' and photo_pending_path is not null;
  if not found then
    raise exception 'No hay una foto pendiente de revisión' using errcode = 'check_violation';
  end if;
  perform private.audit(p_actor_id, case when p_approve then 'WORKER_PHOTO_APPROVED' else 'WORKER_PHOTO_REJECTED' end,
    'worker', p_worker_id::text, p_ip, p_user_agent, p_request_id, jsonb_build_object('note', left(v_note, 300)));
end;
$$;

create or replace function public.fn_admin_review_worker_profile(
  p_actor_id uuid,
  p_worker_id uuid,
  p_approve boolean,
  p_note text default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_permission(p_actor_id, 'worker.update');
  if not p_approve and char_length(coalesce(v_note, '')) < 5 then
    raise exception 'Indica el motivo del rechazo (mínimo 5 caracteres)' using errcode = 'check_violation';
  end if;
  update public.worker_profiles
    set public_bio = case when p_approve then proposed_bio else public_bio end,
        availability_note = case when p_approve then proposed_availability_note else availability_note end,
        proposed_bio = null,
        proposed_availability_note = null,
        proposal_submitted_at = null,
        proposal_review_note = case when p_approve then null else left(v_note, 300) end
    where id = p_worker_id and proposal_submitted_at is not null;
  if not found then
    raise exception 'No hay cambios de perfil pendientes de revisión' using errcode = 'check_violation';
  end if;
  perform private.audit(p_actor_id, case when p_approve then 'WORKER_PROFILE_APPROVED' else 'WORKER_PROFILE_REJECTED' end,
    'worker', p_worker_id::text, p_ip, p_user_agent, p_request_id, jsonb_build_object('note', left(v_note, 300)));
end;
$$;

-- -----------------------------------------------------------------------------
-- Lectura pública: se agrega `has_photo` (foto aprobada). Cambia el tipo de retorno.
-- -----------------------------------------------------------------------------

-- En Supabase (nube), fijar `pg_trgm.word_similarity_threshold` en una función exige que la
-- librería de pg_trgm ya esté cargada en la sesión (si no, el parámetro es un marcador sin registrar
-- y solo un superusuario puede fijarlo). Llamar a una función de la extensión la carga.
select extensions.similarity('a', 'a');

drop function public.fn_public_search_workers(text, text, text, text, boolean, integer, numeric, text, integer, integer);
drop function public.fn_public_worker(uuid);

create or replace function public.fn_public_search_workers(
  p_q text default null,
  p_category text default null,
  p_service text default null,
  p_parish text default null,
  p_available boolean default null,
  p_min_experience integer default null,
  p_min_rating numeric default null,
  p_sort text default null,
  p_limit integer default 12,
  p_offset integer default 0
)
returns table (
  id uuid,
  public_display_name text,
  specialty text,
  years_experience smallint,
  is_available boolean,
  parish_name text,
  rating_avg numeric,
  rating_count integer,
  contracts_completed integer,
  services jsonb,
  has_photo boolean,
  relevance real,
  total_count bigint
)
language plpgsql
stable
set search_path = ''
set pg_trgm.word_similarity_threshold = 0.45
as $$
declare
  v_q text := nullif(private.normalize_text(btrim(coalesce(p_q, ''))), '');
  v_tsq tsquery := case when v_q is null then null else websearch_to_tsquery('spanish', v_q) end;
  v_sort text := coalesce(p_sort, case when v_q is null then 'calificacion' else 'relevancia' end);
begin
  return query
  with candidatos as (
    select w.*,
           case when v_q is null then 0::real
                else ts_rank(w.search_vector, v_tsq) + extensions.word_similarity(v_q, w.search_text) end as rel
    from public.worker_profiles w
    where w.status = 'HABILITADO'
      and (v_q is null or w.search_vector @@ v_tsq or v_q operator(extensions.<%) w.search_text)
      and (p_available is null or w.is_available = p_available)
      and (p_min_experience is null or w.years_experience >= p_min_experience)
      and (p_min_rating is null or w.rating_avg >= p_min_rating)
      and (p_parish is null or w.parish_id = (select pa.id from public.parishes pa where pa.code = p_parish))
      and (p_service is null or exists (
            select 1 from public.worker_services ws join public.services s on s.id = ws.service_id
            where ws.worker_id = w.id and s.slug = p_service and s.active))
      and (p_category is null or exists (
            select 1 from public.worker_services ws
            join public.services s on s.id = ws.service_id
            join public.categories c on c.id = s.category_id
            where ws.worker_id = w.id and c.slug = p_category and c.active and s.active))
  )
  select c.id, c.public_display_name, c.specialty, c.years_experience, c.is_available,
         pa.name,
         c.rating_avg, c.rating_count, c.contracts_completed,
         coalesce((
           select jsonb_agg(jsonb_build_object('slug', s.slug, 'name', s.name) order by ws.is_primary desc, s.name)
           from public.worker_services ws join public.services s on s.id = ws.service_id
           where ws.worker_id = c.id and s.active
         ), '[]'::jsonb),
         c.photo_path is not null,
         c.rel,
         count(*) over ()
  from candidatos c
  left join public.parishes pa on pa.id = c.parish_id
  order by
    case when v_sort = 'relevancia' then c.rel end desc nulls last,
    case when v_sort = 'experiencia' then c.years_experience end desc nulls last,
    case when v_sort = 'nombre' then c.public_display_name end asc,
    c.rating_avg desc, c.rating_count desc, c.public_display_name asc, c.id
  limit least(greatest(coalesce(p_limit, 12), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.fn_public_worker(p_id uuid)
returns table (
  id uuid,
  public_display_name text,
  specialty text,
  public_bio text,
  years_experience smallint,
  is_available boolean,
  availability_note text,
  parish_name text,
  rating_avg numeric,
  rating_count integer,
  contracts_completed integer,
  enabled_at timestamptz,
  services jsonb,
  has_photo boolean
)
language sql
stable
set search_path = ''
as $$
  select w.id, w.public_display_name, w.specialty, w.public_bio, w.years_experience, w.is_available,
         w.availability_note, pa.name, w.rating_avg, w.rating_count, w.contracts_completed, w.enabled_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'slug', s.slug, 'name', s.name, 'category', c.name, 'categorySlug', c.slug,
                    'description', ws.description, 'yearsExperience', ws.years_experience,
                    'priceMin', ws.price_min, 'priceMax', ws.price_max,
                    'priceUnit', coalesce(ws.price_unit, s.price_unit), 'isPrimary', ws.is_primary)
                  order by ws.is_primary desc, s.name)
           from public.worker_services ws
           join public.services s on s.id = ws.service_id
           join public.categories c on c.id = s.category_id
           where ws.worker_id = w.id and s.active
         ), '[]'::jsonb),
         w.photo_path is not null
  from public.worker_profiles w
  left join public.parishes pa on pa.id = w.parish_id
  where w.id = p_id and w.status = 'HABILITADO';
$$;

-- Ruta de la foto pública (solo trabajadores HABILITADOS con foto aprobada).
create or replace function public.fn_public_worker_photo_path(p_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select photo_path from public.worker_profiles where id = p_id and status = 'HABILITADO';
$$;

-- -----------------------------------------------------------------------------
-- Storage: bucket PRIVADO. Sin políticas para anon/authenticated: solo el servidor
-- (secret key) sube y firma URLs. Límite de 4 MB (Vercel admite ~4,5 MB por request).
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worker-files', 'worker-files', false, 4194304,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- RLS y privilegios
-- -----------------------------------------------------------------------------

alter table public.worker_status_history enable row level security;
alter table public.document_types enable row level security;
alter table public.worker_documents enable row level security;
alter table public.trainings enable row level security;
alter table public.training_enrollments enable row level security;
alter table public.worker_activation_codes enable row level security;
-- Sin políticas para anon/authenticated: datos administrativos y sensibles, solo vía servidor.

revoke all on public.worker_status_history, public.document_types, public.worker_documents, public.trainings,
  public.training_enrollments, public.worker_activation_codes from anon, authenticated;

grant select, insert on public.worker_status_history to service_role;
revoke update, delete, truncate on public.worker_status_history from service_role;
grant select, insert, update on public.document_types, public.trainings to service_role;
grant select, insert, update on public.worker_documents, public.training_enrollments,
  public.worker_activation_codes to service_role;

revoke execute on function
  private.audit(uuid, text, text, text, inet, text, text, jsonb),
  private.worker_transition_allowed(public.worker_status, public.worker_status),
  private.worker_transition_permission(public.worker_status, public.worker_status),
  private.worker_transition_requires_reason(public.worker_status, public.worker_status),
  private.worker_status_action(public.worker_status, public.worker_status),
  private.worker_required_documents_ok(uuid),
  private.worker_training_ok(uuid),
  private.apply_worker_status(uuid, public.worker_status, text, uuid, timestamptz),
  private.worker_set_services(uuid, jsonb),
  private.parish_id_by_code(text),
  private.check_birth_date(date),
  private.worker_id_of_user(uuid),
  public.fn_admin_change_worker_status(uuid, uuid, public.worker_status, text, timestamptz, inet, text, text),
  public.fn_admin_create_worker(uuid, jsonb, jsonb, inet, text, text),
  public.fn_admin_update_worker(uuid, uuid, jsonb, jsonb, inet, text, text),
  public.fn_admin_find_worker_duplicates(uuid, text, text, text, text, uuid),
  public.fn_admin_register_document(uuid, uuid, text, text, text, text, integer, text, date, date, uuid, inet, text, text),
  public.fn_admin_review_document(uuid, uuid, public.document_status, text, inet, text, text),
  public.fn_admin_save_training(uuid, uuid, text, text, text, text, smallint, boolean, boolean, inet, text, text),
  public.fn_admin_enroll_worker(uuid, uuid, uuid, inet, text, text),
  public.fn_admin_update_enrollment(uuid, uuid, public.enrollment_status, numeric, text, uuid, inet, text, text),
  public.fn_admin_issue_activation_code(uuid, uuid, text, timestamptz, inet, text, text),
  public.fn_redeem_activation_code(uuid, text, inet, text, text),
  public.fn_worker_set_availability(uuid, boolean, inet, text, text),
  public.fn_worker_propose_profile(uuid, text, text, inet, text, text),
  public.fn_worker_propose_photo(uuid, text, inet, text, text),
  public.fn_admin_set_worker_photo(uuid, uuid, text, inet, text, text),
  public.fn_admin_review_worker_photo(uuid, uuid, boolean, text, inet, text, text),
  public.fn_admin_review_worker_profile(uuid, uuid, boolean, text, inet, text, text),
  public.fn_public_search_workers(text, text, text, text, boolean, integer, numeric, text, integer, integer),
  public.fn_public_worker(uuid),
  public.fn_public_worker_photo_path(uuid)
  from public, anon, authenticated;

-- Las funciones fn_* son SECURITY INVOKER: el servidor (service_role) necesita ejecutar sus auxiliares.
grant execute on function
  private.audit(uuid, text, text, text, inet, text, text, jsonb),
  private.worker_transition_allowed(public.worker_status, public.worker_status),
  private.worker_transition_permission(public.worker_status, public.worker_status),
  private.worker_transition_requires_reason(public.worker_status, public.worker_status),
  private.worker_status_action(public.worker_status, public.worker_status),
  private.worker_required_documents_ok(uuid),
  private.worker_training_ok(uuid),
  private.apply_worker_status(uuid, public.worker_status, text, uuid, timestamptz),
  private.worker_set_services(uuid, jsonb),
  private.parish_id_by_code(text),
  private.check_birth_date(date),
  private.worker_id_of_user(uuid),
  public.fn_admin_change_worker_status(uuid, uuid, public.worker_status, text, timestamptz, inet, text, text),
  public.fn_admin_create_worker(uuid, jsonb, jsonb, inet, text, text),
  public.fn_admin_update_worker(uuid, uuid, jsonb, jsonb, inet, text, text),
  public.fn_admin_find_worker_duplicates(uuid, text, text, text, text, uuid),
  public.fn_admin_register_document(uuid, uuid, text, text, text, text, integer, text, date, date, uuid, inet, text, text),
  public.fn_admin_review_document(uuid, uuid, public.document_status, text, inet, text, text),
  public.fn_admin_save_training(uuid, uuid, text, text, text, text, smallint, boolean, boolean, inet, text, text),
  public.fn_admin_enroll_worker(uuid, uuid, uuid, inet, text, text),
  public.fn_admin_update_enrollment(uuid, uuid, public.enrollment_status, numeric, text, uuid, inet, text, text),
  public.fn_admin_issue_activation_code(uuid, uuid, text, timestamptz, inet, text, text),
  public.fn_redeem_activation_code(uuid, text, inet, text, text),
  public.fn_worker_set_availability(uuid, boolean, inet, text, text),
  public.fn_worker_propose_profile(uuid, text, text, inet, text, text),
  public.fn_worker_propose_photo(uuid, text, inet, text, text),
  public.fn_admin_set_worker_photo(uuid, uuid, text, inet, text, text),
  public.fn_admin_review_worker_photo(uuid, uuid, boolean, text, inet, text, text),
  public.fn_admin_review_worker_profile(uuid, uuid, boolean, text, inet, text, text),
  public.fn_public_search_workers(text, text, text, text, boolean, integer, numeric, text, integer, integer),
  public.fn_public_worker(uuid),
  public.fn_public_worker_photo_path(uuid)
  to service_role;
