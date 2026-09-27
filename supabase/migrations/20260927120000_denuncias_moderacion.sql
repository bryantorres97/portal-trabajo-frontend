-- =============================================================================
-- Fase 8 — Denuncias y moderación: denuncia de todos los tipos con evidencia, seguimiento del
-- denunciante, bandeja del GAD (asignación, prioridad, plazos, estados, escalamiento), acceso a la
-- conversación SOLO con denuncia y justificación (sensitive_access_log, RN-09) y sanciones con vigencia.
-- Detalle: docs/phases/fase-08-denuncias-moderacion.md · Estados: src/server/domain/reports/state-machine.ts
--
-- P-14 (sanciones y plazos) sigue abierta: se adopta un catálogo configurable y plazos por prioridad
-- en app_settings (alta 24 h, media 72 h, baja 7 días).
-- =============================================================================

insert into public.app_settings (key, value, description) values
  ('reports.sla_hours_high', '24', 'Horas para atender una denuncia de prioridad alta (P-14)'),
  ('reports.sla_hours_medium', '72', 'Horas para atender una denuncia de prioridad media (P-14)'),
  ('reports.sla_hours_low', '168', 'Horas para atender una denuncia de prioridad baja (P-14)'),
  ('reports.daily_limit', '10', 'Denuncias que una persona puede crear por día (anti-abuso)'),
  ('reports.evidence_session_minutes', '30', 'Minutos que dura el acceso a la evidencia tras registrar la justificación')
on conflict (key) do nothing;

create or replace function private.setting_int(p_key text, p_default integer)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce((select case when jsonb_typeof(value) = 'number' then (value)::text::numeric::integer end
                   from public.app_settings where key = p_key), p_default);
$$;

-- -----------------------------------------------------------------------------
-- Denuncias: prioridad, asignación, plazo, resolución y relación con una denuncia previa
-- -----------------------------------------------------------------------------

alter table public.reports
  add column priority          smallint not null default 2,
  add column assigned_to       uuid references public.users (id),
  add column assigned_at       timestamptz,
  add column due_at            timestamptz,
  add column escalated_at      timestamptz,
  add column resolution        text,
  add column resolution_note   text,
  add column resolved_at       timestamptz,
  add column resolved_by       uuid references public.users (id),
  add column parent_report_id  uuid references public.reports (id),
  add column contract_id       uuid references public.contracts (id),
  add constraint reports_priority check (priority between 1 and 3),
  add constraint reports_resolution check (resolution is null or resolution in
    ('MEDIDAS_APLICADAS', 'SIN_INCUMPLIMIENTO', 'RESUELTO_ENTRE_PARTES', 'DUPLICADA', 'OTRO')),
  add constraint reports_resolution_note_len check (resolution_note is null or char_length(resolution_note) <= 1000);

comment on column public.reports.priority is '1 = alta, 2 = media, 3 = baja (por la gravedad del motivo; el GAD puede cambiarla).';

create index reports_queue_idx on public.reports (status, priority, created_at);
create index reports_assigned_idx on public.reports (assigned_to, status);
create index reports_resolved_by_idx on public.reports (resolved_by);
create index reports_parent_idx on public.reports (parent_report_id);
create index reports_contract_idx on public.reports (contract_id);

update public.reports r set contract_id = r.target_id::uuid where r.target_type = 'CONTRACT' and r.contract_id is null;

insert into public.report_reasons (code, target_type, label, severity, sort_order) values
  ('TRABAJADOR_FRAUDE', 'WORKER', 'Estafa, cobro indebido o engaño', 3, 1),
  ('TRABAJADOR_CONDUCTA', 'WORKER', 'Conducta inapropiada, acoso o amenazas', 3, 2),
  ('TRABAJADOR_PERFIL_FALSO', 'WORKER', 'El perfil tiene información falsa', 2, 3),
  ('TRABAJADOR_CONTACTO_EXTERNO', 'WORKER', 'Pide contacto o pagos fuera de la plataforma', 2, 4),
  ('TRABAJADOR_OTRO', 'WORKER', 'Otro motivo', 1, 5),
  ('CLIENTE_FRAUDE', 'CLIENT', 'No pagó lo acordado o intentó estafar', 3, 1),
  ('CLIENTE_CONDUCTA', 'CLIENT', 'Conducta inapropiada, acoso o amenazas', 3, 2),
  ('CLIENTE_OTRO', 'CLIENT', 'Otro motivo', 1, 3),
  ('CONVERSACION_ACOSO', 'CONVERSATION', 'Acoso o amenazas en la conversación', 3, 1),
  ('CONVERSACION_FRAUDE', 'CONVERSATION', 'Intento de estafa', 3, 2),
  ('CONVERSACION_SPAM', 'CONVERSATION', 'Spam o publicidad', 1, 3),
  ('CONVERSACION_OTRO', 'CONVERSATION', 'Otro motivo', 1, 4)
on conflict (code) do nothing;

-- Prioridad por gravedad, plazo de atención y límite diario (10/día) para TODAS las formas de denunciar.
create or replace function private.reports_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_severity smallint;
begin
  if (select count(*) from public.reports
      where reporter_id = new.reporter_id and created_at > now() - interval '1 day')
     >= private.setting_int('reports.daily_limit', 10) then
    raise exception 'Alcanzaste el máximo de denuncias por hoy. Si es urgente, comunícate con el GAD.'
      using errcode = 'program_limit_exceeded';
  end if;
  select severity into v_severity from public.report_reasons where code = new.reason_code;
  new.priority := case coalesce(v_severity, 2) when 3 then 1 when 1 then 3 else 2 end;
  new.due_at := now() + make_interval(hours => case new.priority
    when 1 then private.setting_int('reports.sla_hours_high', 24)
    when 2 then private.setting_int('reports.sla_hours_medium', 72)
    else private.setting_int('reports.sla_hours_low', 168) end);
  if new.target_type = 'CONTRACT' and new.contract_id is null then
    new.contract_id := new.target_id::uuid;
  end if;
  return new;
end;
$$;

create trigger reports_before_insert before insert on public.reports
  for each row execute function private.reports_before_insert();

-- Máquina de estados (espejo de src/server/domain/reports/state-machine.ts).
create or replace function private.report_transition_allowed(p_from public.report_status, p_to public.report_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from::text || '>' || p_to::text) = any (array[
    'ABIERTA>EN_REVISION',
    'ABIERTA>RESUELTA',
    'ABIERTA>DESCARTADA',
    'EN_REVISION>EN_ESPERA_DE_INFORMACION',
    'EN_REVISION>ESCALADA',
    'EN_REVISION>RESUELTA',
    'EN_REVISION>DESCARTADA',
    'EN_ESPERA_DE_INFORMACION>EN_REVISION',
    'EN_ESPERA_DE_INFORMACION>RESUELTA',
    'EN_ESPERA_DE_INFORMACION>DESCARTADA',
    'ESCALADA>EN_REVISION',
    'ESCALADA>RESUELTA',
    'ESCALADA>DESCARTADA'
  ]);
$$;

-- -----------------------------------------------------------------------------
-- Historial de la denuncia (append-only). visible_to_reporter: lo que ve quien denunció.
-- -----------------------------------------------------------------------------

create table public.report_events (
  id                   bigint generated always as identity primary key,
  report_id            uuid not null references public.reports (id),
  event                text not null,
  from_status          public.report_status,
  to_status            public.report_status,
  actor_id             uuid references public.users (id),
  note                 text,
  visible_to_reporter  boolean not null default false,
  created_at           timestamptz not null default now(),
  constraint report_events_event_format check (event ~ '^[A-Z][A-Z_]*$'),
  constraint report_events_note_len check (note is null or char_length(note) <= 1000)
);

create index report_events_report_idx on public.report_events (report_id, id);
create index report_events_actor_idx on public.report_events (actor_id);

create trigger report_events_append_only before update or delete on public.report_events
  for each row execute function private.prevent_mutation();

-- Actor de la transacción actual (lo fija cada función del GAD); NULL = sistema o el propio denunciante.
create or replace function private.current_actor()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  return nullif(current_setting('acolita.actor', true), '')::uuid;
exception when others then
  return null;
end;
$$;

create or replace function private.reports_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las denuncias no se eliminan' using errcode = 'insufficient_privilege';
  end if;
  if new.reporter_id is distinct from old.reporter_id or new.target_type is distinct from old.target_type
     or new.target_id is distinct from old.target_id or new.reason_code is distinct from old.reason_code
     or new.description is distinct from old.description or new.created_at is distinct from old.created_at then
    raise exception 'Los datos de la denuncia no se modifican' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status then
    if not private.report_transition_allowed(old.status, new.status) then
      raise exception 'Transición no permitida: % → %', old.status, new.status
        using errcode = 'object_not_in_prerequisite_state';
    end if;
    if new.status in ('RESUELTA', 'DESCARTADA') then
      new.resolved_at := coalesce(new.resolved_at, now());
      new.resolved_by := coalesce(new.resolved_by, private.current_actor());
    end if;
    if new.status = 'ESCALADA' then
      new.escalated_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger reports_guard before update or delete on public.reports
  for each row execute function private.reports_guard();

-- Texto que ve el denunciante (sin detalles internos ni sanciones concretas).
create or replace function private.report_public_message(p_status public.report_status, p_resolution text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'EN_REVISION' then 'El personal del GAD está revisando tu denuncia.'
    when 'EN_ESPERA_DE_INFORMACION' then 'El GAD necesita más información para continuar.'
    when 'ESCALADA' then 'Tu denuncia pasó a una revisión de mayor nivel.'
    when 'RESUELTA' then case p_resolution
      when 'MEDIDAS_APLICADAS' then 'Revisamos tu denuncia y aplicamos medidas.'
      when 'SIN_INCUMPLIMIENTO' then 'Revisamos tu denuncia y no encontramos un incumplimiento de las normas.'
      when 'RESUELTO_ENTRE_PARTES' then 'El caso se resolvió entre las partes.'
      when 'DUPLICADA' then 'El caso ya se atendió en otra denuncia.'
      else 'Tu denuncia fue resuelta.' end
    when 'DESCARTADA' then 'La denuncia se cerró sin acciones.'
    else 'Recibimos tu denuncia.' end;
$$;

-- Cada cambio de estado queda en el historial y se avisa al denunciante (una notificación no leída por denuncia).
create or replace function private.reports_after_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_msg text;
begin
  if tg_op = 'INSERT' then
    insert into public.report_events (report_id, event, to_status, actor_id, visible_to_reporter)
    values (new.id, 'CREADA', new.status, new.reporter_id, true);
    return null;
  end if;
  if new.status is distinct from old.status then
    v_msg := private.report_public_message(new.status, new.resolution);
    insert into public.report_events (report_id, event, from_status, to_status, actor_id, note, visible_to_reporter)
    values (new.id, 'ESTADO', old.status, new.status, private.current_actor(), v_msg, true);
    insert into public.notifications (user_id, type, title, body, link, dedupe_key)
    values (new.reporter_id, 'REPORT_UPDATE', 'Novedades de tu denuncia', left(v_msg, 300),
            '/denuncias/' || new.id, 'report:' || new.id)
    on conflict (user_id, dedupe_key) where read_at is null and dedupe_key is not null
    do update set title = excluded.title, body = excluded.body, created_at = now();
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.report_events (report_id, event, actor_id, note)
    values (new.id, 'ASIGNADA', private.current_actor(),
            case when new.assigned_to is null then 'Sin asignar'
                 else (select coalesce(display_name, email, 'Funcionario') from public.users where id = new.assigned_to) end);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.report_events (report_id, event, actor_id, note)
    values (new.id, 'PRIORIDAD', private.current_actor(),
            case new.priority when 1 then 'Alta' when 2 then 'Media' else 'Baja' end);
  end if;
  return null;
end;
$$;

create trigger reports_after_change after insert or update on public.reports
  for each row execute function private.reports_after_change();

-- Denuncias ya existentes (Fases 5–7) arrancan su historial.
insert into public.report_events (report_id, event, to_status, actor_id, visible_to_reporter, created_at)
select id, 'CREADA', status, reporter_id, true, created_at from public.reports;

-- -----------------------------------------------------------------------------
-- Evidencia (archivos y notas del denunciante) y registro de accesos sensibles
-- -----------------------------------------------------------------------------

create table public.report_evidence (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.reports (id),
  kind           text not null,
  storage_path   text,
  mime_type      text,
  size_bytes     integer,
  sha256         text,
  original_name  text,
  note           text,
  added_by       uuid not null references public.users (id),
  created_at     timestamptz not null default now(),
  constraint report_evidence_kind check (kind in ('FILE', 'NOTE')),
  constraint report_evidence_file check (kind <> 'FILE' or (
    storage_path ~ '^reports/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
    and mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
    and size_bytes between 1 and 4194304 and sha256 ~ '^[0-9a-f]{64}$')),
  constraint report_evidence_note check (kind <> 'NOTE' or char_length(btrim(note)) between 1 and 1000),
  constraint report_evidence_name_len check (original_name is null or char_length(original_name) <= 200)
);

create index report_evidence_report_idx on public.report_evidence (report_id, created_at);
create index report_evidence_added_by_idx on public.report_evidence (added_by);

create trigger report_evidence_append_only before update or delete on public.report_evidence
  for each row execute function private.prevent_mutation();

create table public.sensitive_access_log (
  id             bigint generated always as identity primary key,
  occurred_at    timestamptz not null default now(),
  actor_id       uuid not null references public.users (id),
  resource_type  text not null,
  resource_id    text not null,
  report_id      uuid not null references public.reports (id),
  justification  text not null,
  ip             inet,
  request_id     text,
  constraint sensitive_access_resource check (resource_type in ('REPORT_EVIDENCE', 'CONVERSATION', 'CONTRACT', 'EVIDENCE_FILE')),
  constraint sensitive_access_justification_len check (char_length(btrim(justification)) between 20 and 1000)
);

comment on table public.sensitive_access_log is
  'Accesos del personal a contenido confidencial (conversaciones, evidencia) con la justificación. Append-only (RN-09).';

create index sensitive_access_report_idx on public.sensitive_access_log (report_id, occurred_at desc);
create index sensitive_access_actor_idx on public.sensitive_access_log (actor_id, occurred_at desc);

create trigger sensitive_access_log_append_only before update or delete on public.sensitive_access_log
  for each row execute function private.prevent_mutation();
create trigger sensitive_access_log_no_truncate before truncate on public.sensitive_access_log
  for each statement execute function private.prevent_mutation();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-evidence', 'report-evidence', false, 4194304,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Sanciones y acciones de moderación (con vigencia)
-- -----------------------------------------------------------------------------

create table public.moderation_actions (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid references public.reports (id),
  action          text not null,
  target_user_id  uuid references public.users (id),
  worker_id       uuid references public.worker_profiles (id),
  message_id      bigint references public.messages (id),
  review_id       uuid references public.reviews (id),
  reason          text not null,
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz,
  lifted_at       timestamptz,
  lifted_by       uuid references public.users (id),
  lift_reason     text,
  actor_id        uuid not null references public.users (id),
  created_at      timestamptz not null default now(),
  constraint moderation_actions_action check (action in (
    'ADVERTENCIA', 'OCULTAR_MENSAJE', 'OCULTAR_RESENA', 'SUSPENDER_TRABAJADOR', 'DESHABILITAR_TRABAJADOR',
    'SUSPENDER_CUENTA', 'BLOQUEAR_CUENTA')),
  constraint moderation_actions_reason_len check (char_length(btrim(reason)) between 10 and 1000),
  constraint moderation_actions_lift_reason_len check (lift_reason is null or char_length(lift_reason) <= 500),
  constraint moderation_actions_temporal check (
    (action in ('SUSPENDER_TRABAJADOR', 'SUSPENDER_CUENTA')) = (ends_at is not null)),
  constraint moderation_actions_dates check (ends_at is null or ends_at > starts_at)
);

create index moderation_actions_report_idx on public.moderation_actions (report_id, created_at);
create index moderation_actions_target_user_idx on public.moderation_actions (target_user_id, created_at desc);
create index moderation_actions_worker_idx on public.moderation_actions (worker_id);
create index moderation_actions_message_idx on public.moderation_actions (message_id);
create index moderation_actions_review_idx on public.moderation_actions (review_id);
create index moderation_actions_actor_idx on public.moderation_actions (actor_id);
create index moderation_actions_lifted_by_idx on public.moderation_actions (lifted_by);
create index moderation_actions_due_idx on public.moderation_actions (ends_at) where lifted_at is null and ends_at is not null;

-- Solo se registran el levantamiento (una vez); el resto es inmutable. Sin DELETE.
create or replace function private.moderation_actions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las acciones de moderación no se eliminan' using errcode = 'insufficient_privilege';
  end if;
  if (to_jsonb(new) - array['lifted_at', 'lifted_by', 'lift_reason'])
     is distinct from (to_jsonb(old) - array['lifted_at', 'lifted_by', 'lift_reason'])
     or old.lifted_at is not null then
    raise exception 'Una acción de moderación no se modifica; se levanta una sola vez' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger moderation_actions_guard before update or delete on public.moderation_actions
  for each row execute function private.moderation_actions_guard();

-- Reincorpora al trabajador tras una suspensión (volvía a estar HABILITADO antes de la sanción).
create or replace function private.worker_lift_suspension(p_worker uuid, p_actor uuid, p_reason text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.worker_profiles
    set status = 'HABILITADO', status_changed_at = now(), suspended_until = null
    where id = p_worker and status = 'SUSPENDIDO';
  if not found then
    return false;
  end if;
  insert into public.worker_status_history (worker_id, from_status, to_status, reason, actor_id)
  values (p_worker, 'SUSPENDIDO', 'HABILITADO', left(p_reason, 500), p_actor);
  return true;
end;
$$;

-- Deshace el efecto de una acción (al vencer o al revocarla). Devuelve true si cambió algo.
create or replace function private.moderation_undo(p_action public.moderation_actions, p_actor uuid, p_reason text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  case p_action.action
    when 'SUSPENDER_TRABAJADOR' then
      return private.worker_lift_suspension(p_action.worker_id, p_actor, p_reason);
    when 'SUSPENDER_CUENTA', 'BLOQUEAR_CUENTA' then
      update public.users set status = 'ACTIVO', blocked_reason = null
        where id = p_action.target_user_id and status = 'BLOQUEADO';
      return found;
    when 'OCULTAR_MENSAJE' then
      update public.messages set hidden_at = null, hidden_by = null, hidden_reason = null
        where id = p_action.message_id and hidden_at is not null;
      return found;
    when 'OCULTAR_RESENA' then
      update public.reviews set status = 'PUBLICADA', hidden_at = null, hidden_by = null, hidden_reason = null
        where id = p_action.review_id and status = 'OCULTA';
      return found;
    else
      return false;
  end case;
end;
$$;

-- -----------------------------------------------------------------------------
-- Denunciante: crear, consultar, aportar información y evidencia
-- -----------------------------------------------------------------------------

/*
 * Denuncia de un perfil o de una conversación (los mensajes, reseñas y contrataciones tienen su propia
 * función, que también pasa por el límite diario y la prioridad):
 *   WORKER       — p_target_id = worker_profiles.id (habilitado o con quien conversó).
 *   CLIENT       — p_target_id = conversación en la que el denunciante es el trabajador.
 *   CONVERSATION — p_target_id = conversación en la que participa.
 */
create or replace function public.fn_report_create(
  p_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_reason_code text,
  p_description text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_target_id text;
  v_reported uuid;
  v_conversation uuid;
  v_worker public.worker_profiles;
  v_c public.conversations;
  v_role text;
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_id uuid;
begin
  perform private.require_chat_user(p_user_id);
  if p_target_type = 'WORKER' then
    select * into v_worker from public.worker_profiles where id = p_target_id;
    if not found or (v_worker.status <> 'HABILITADO' and not exists (
         select 1 from public.conversations where worker_id = p_target_id and client_user_id = p_user_id)) then
      raise exception 'Trabajador no encontrado' using errcode = 'no_data_found';
    end if;
    v_target_id := p_target_id::text;
    v_reported := v_worker.user_id;
    select id into v_conversation from public.conversations where worker_id = p_target_id and client_user_id = p_user_id;
  elsif p_target_type in ('CLIENT', 'CONVERSATION') then
    select * into v_c from public.conversations where id = p_target_id;
    v_role := case when found then private.conversation_role(p_target_id, p_user_id) end;
    if v_role is null or (p_target_type = 'CLIENT' and v_role <> 'TRABAJADOR') then
      raise exception 'Conversación no encontrada' using errcode = 'no_data_found';
    end if;
    v_conversation := p_target_id;
    v_reported := case when v_role = 'CLIENTE' then (select user_id from public.worker_profiles where id = v_c.worker_id)
                       else v_c.client_user_id end;
    v_target_id := case when p_target_type = 'CLIENT' then v_c.client_user_id::text else p_target_id::text end;
  else
    raise exception 'Tipo de denuncia no válido' using errcode = 'check_violation';
  end if;
  if v_reported = p_user_id then
    raise exception 'No puedes denunciarte a ti mismo' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.report_reasons where code = p_reason_code and target_type = p_target_type and active) then
    raise exception 'Motivo no válido' using errcode = 'check_violation';
  end if;
  if char_length(coalesce(v_description, '')) not between 10 and 1000 then
    raise exception 'Cuéntanos qué pasó (10 a 1000 caracteres)' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.reports where reporter_id = p_user_id and target_type = p_target_type and target_id = v_target_id
             and status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA')) then
    raise exception 'Ya tienes una denuncia abierta sobre esto; puedes seguirla en «Mis denuncias»' using errcode = 'unique_violation';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reported_user_id, conversation_id, reason_code, description)
  values (p_user_id, p_target_type, v_target_id, v_reported, v_conversation, p_reason_code, v_description)
  returning id into v_id;
  perform private.audit(p_user_id, 'REPORT_CREATED', 'report', v_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('targetType', p_target_type, 'targetId', v_target_id, 'reason', p_reason_code));
  return v_id;
end;
$$;

-- Etiqueta legible del objeto denunciado (sin contenido confidencial).
create or replace function private.report_target_label(r public.reports)
returns text
language sql
stable
set search_path = ''
as $$
  select case r.target_type
    when 'WORKER' then 'Perfil de ' || coalesce((select public_display_name from public.worker_profiles where id::text = r.target_id), 'trabajador')
    when 'CLIENT' then 'Cliente ' || coalesce((select private.short_name(coalesce(cp.full_name, u.display_name))
                        from public.users u left join public.client_profiles cp on cp.user_id = u.id where u.id::text = r.target_id), '')
    when 'MESSAGE' then 'Un mensaje de una conversación'
    when 'CONVERSATION' then 'Una conversación'
    when 'REVIEW' then 'Una reseña'
    when 'CONTRACT' then 'Una contratación'
    else r.target_type end;
$$;

create or replace function public.fn_my_reports(p_user_id uuid)
returns table (
  id uuid,
  target_type text,
  target_label text,
  reason_label text,
  status public.report_status,
  public_message text,
  needs_info boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select r.id, r.target_type, private.report_target_label(r), rr.label, r.status,
         private.report_public_message(r.status, r.resolution), r.status = 'EN_ESPERA_DE_INFORMACION',
         r.created_at, r.updated_at
  from public.reports r
  join public.report_reasons rr on rr.code = r.reason_code
  where r.reporter_id = p_user_id
  order by r.updated_at desc
  limit 200;
$$;

/* Seguimiento de una denuncia propia: estado, historial visible, evidencia aportada y notas del GAD. */
create or replace function public.fn_my_report(p_user_id uuid, p_report_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_r public.reports;
begin
  select * into v_r from public.reports where id = p_report_id and reporter_id = p_user_id;
  if not found then
    raise exception 'Denuncia no encontrada' using errcode = 'no_data_found';
  end if;
  update public.notifications set read_at = now()
    where user_id = p_user_id and dedupe_key = 'report:' || p_report_id and read_at is null;
  return jsonb_build_object(
    'id', v_r.id,
    'targetType', v_r.target_type,
    'targetLabel', private.report_target_label(v_r),
    'reasonLabel', (select label from public.report_reasons where code = v_r.reason_code),
    'description', v_r.description,
    'status', v_r.status,
    'publicMessage', private.report_public_message(v_r.status, v_r.resolution),
    'open', v_r.status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA'),
    'needsInfo', v_r.status = 'EN_ESPERA_DE_INFORMACION',
    'createdAt', v_r.created_at,
    'resolvedAt', v_r.resolved_at,
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'event', e.event, 'toStatus', e.to_status,
                          'note', e.note, 'byMe', e.actor_id = p_user_id, 'createdAt', e.created_at) order by e.id)
                        from public.report_events e where e.report_id = v_r.id and e.visible_to_reporter), '[]'::jsonb),
    'evidence', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'name', x.original_name,
                            'note', x.note, 'createdAt', x.created_at) order by x.created_at)
                          from public.report_evidence x where x.report_id = v_r.id and x.added_by = p_user_id), '[]'::jsonb));
end;
$$;

/* El denunciante aporta información (nota) o registra un archivo ya subido al bucket privado. */
create or replace function public.fn_report_add_evidence(
  p_user_id uuid,
  p_report_id uuid,
  p_note text default null,
  p_storage_path text default null,
  p_mime_type text default null,
  p_size_bytes integer default null,
  p_sha256 text default null,
  p_original_name text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_r public.reports;
  v_id uuid;
begin
  perform private.require_chat_user(p_user_id);
  select * into v_r from public.reports where id = p_report_id and reporter_id = p_user_id for update;
  if not found then
    raise exception 'Denuncia no encontrada' using errcode = 'no_data_found';
  end if;
  if v_r.status not in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA') then
    raise exception 'La denuncia ya está cerrada' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if p_storage_path is not null then
    if (select count(*) from public.report_evidence where report_id = p_report_id and kind = 'FILE') >= 5 then
      raise exception 'Puedes adjuntar hasta 5 archivos por denuncia' using errcode = 'program_limit_exceeded';
    end if;
    if p_storage_path not like 'reports/' || p_report_id || '/%' then
      raise exception 'Ruta de archivo no válida' using errcode = 'check_violation';
    end if;
    insert into public.report_evidence (report_id, kind, storage_path, mime_type, size_bytes, sha256, original_name, added_by)
    values (p_report_id, 'FILE', p_storage_path, p_mime_type, p_size_bytes, lower(p_sha256), left(p_original_name, 200), p_user_id)
    returning id into v_id;
  else
    if (select count(*) from public.report_evidence where report_id = p_report_id and kind = 'NOTE') >= 20 then
      raise exception 'Alcanzaste el máximo de notas para esta denuncia' using errcode = 'program_limit_exceeded';
    end if;
    insert into public.report_evidence (report_id, kind, note, added_by)
    values (p_report_id, 'NOTE', btrim(p_note), p_user_id)
    returning id into v_id;
  end if;

  insert into public.report_events (report_id, event, actor_id, visible_to_reporter, note)
  values (p_report_id, case when p_storage_path is null then 'INFO_APORTADA' else 'EVIDENCIA_ADJUNTA' end, p_user_id, true,
          case when p_storage_path is null then left(btrim(p_note), 1000) else left(p_original_name, 200) end);
  -- Si el GAD había pedido información, la denuncia vuelve a revisión.
  if v_r.status = 'EN_ESPERA_DE_INFORMACION' then
    update public.reports set status = 'EN_REVISION' where id = p_report_id;
  else
    update public.reports set updated_at = now() where id = p_report_id;
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Bandeja del GAD
-- -----------------------------------------------------------------------------

/*
 * p_view: POR_ATENDER (abiertas, en revisión o escaladas) · MIAS · SIN_ASIGNAR · ESPERA · ESCALADAS ·
 *         VENCIDAS · CERRADAS · TODAS. Orden: prioridad, vencimiento y antigüedad.
 */
create or replace function public.fn_admin_list_reports(
  p_actor_id uuid,
  p_view text default 'POR_ATENDER',
  p_target_type text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  target_type text,
  target_label text,
  reason_label text,
  status public.report_status,
  priority smallint,
  assigned_to uuid,
  assigned_name text,
  reporter_name text,
  reported_name text,
  created_at timestamptz,
  due_at timestamptz,
  overdue boolean,
  total bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_view text := upper(coalesce(p_view, 'POR_ATENDER'));
begin
  perform private.require_permission(p_actor_id, 'report.read');
  return query
  select r.id, r.target_type, private.report_target_label(r), rr.label, r.status, r.priority, r.assigned_to,
         (select coalesce(u.display_name, u.email) from public.users u where u.id = r.assigned_to),
         (select coalesce(cp.full_name, u.display_name, u.email) from public.users u
          left join public.client_profiles cp on cp.user_id = u.id where u.id = r.reporter_id),
         (select coalesce(cp.full_name, u.display_name, u.email) from public.users u
          left join public.client_profiles cp on cp.user_id = u.id where u.id = r.reported_user_id),
         r.created_at, r.due_at,
         r.status in ('ABIERTA', 'EN_REVISION', 'ESCALADA') and r.due_at < now(),
         count(*) over ()
  from public.reports r
  join public.report_reasons rr on rr.code = r.reason_code
  where (p_target_type is null or r.target_type = p_target_type)
    and case v_view
      when 'POR_ATENDER' then r.status in ('ABIERTA', 'EN_REVISION', 'ESCALADA')
      when 'MIAS' then r.assigned_to = p_actor_id and r.status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA')
      when 'SIN_ASIGNAR' then r.assigned_to is null and r.status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA')
      when 'ESPERA' then r.status = 'EN_ESPERA_DE_INFORMACION'
      when 'ESCALADAS' then r.status = 'ESCALADA'
      when 'VENCIDAS' then r.status in ('ABIERTA', 'EN_REVISION', 'ESCALADA') and r.due_at < now()
      when 'CERRADAS' then r.status in ('RESUELTA', 'DESCARTADA')
      else true end
  order by case when r.status in ('RESUELTA', 'DESCARTADA') then 1 else 0 end, r.priority, r.due_at nulls last, r.created_at
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.fn_admin_reports_summary(p_actor_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_permission(p_actor_id, 'report.read');
  return (
    select jsonb_build_object(
      'porAtender', count(*) filter (where status in ('ABIERTA', 'EN_REVISION', 'ESCALADA')),
      'sinAsignar', count(*) filter (where assigned_to is null and status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA')),
      'mias', count(*) filter (where assigned_to = p_actor_id and status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA')),
      'vencidas', count(*) filter (where status in ('ABIERTA', 'EN_REVISION', 'ESCALADA') and due_at < now()),
      'escaladas', count(*) filter (where status = 'ESCALADA'),
      'altaPrioridad', count(*) filter (where priority = 1 and status in ('ABIERTA', 'EN_REVISION', 'ESCALADA')))
    from public.reports);
end;
$$;

/*
 * Detalle para el GAD. NO incluye el contenido de mensajes ni las condiciones de la contratación:
 * eso requiere `fn_admin_access_report_evidence` con justificación (RN-09). Las reseñas sí se muestran
 * (el GAD puede verlas, RN-20).
 */
create or replace function public.fn_admin_get_report(p_actor_id uuid, p_report_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_r public.reports;
  v_worker uuid;
begin
  perform private.require_permission(p_actor_id, 'report.read');
  select * into v_r from public.reports where id = p_report_id;
  if not found then
    raise exception 'Denuncia no encontrada' using errcode = 'no_data_found';
  end if;
  v_worker := coalesce(
    case when v_r.target_type = 'WORKER' then v_r.target_id::uuid end,
    (select id from public.worker_profiles where user_id = v_r.reported_user_id));

  return jsonb_build_object(
    'id', v_r.id,
    'targetType', v_r.target_type,
    'targetId', v_r.target_id,
    'targetLabel', private.report_target_label(v_r),
    'reasonCode', v_r.reason_code,
    'reasonLabel', (select label from public.report_reasons where code = v_r.reason_code),
    'description', v_r.description,
    'status', v_r.status,
    'priority', v_r.priority,
    'dueAt', v_r.due_at,
    'overdue', v_r.status in ('ABIERTA', 'EN_REVISION', 'ESCALADA') and v_r.due_at < now(),
    'assignedTo', v_r.assigned_to,
    'assignedName', (select coalesce(display_name, email) from public.users where id = v_r.assigned_to),
    'resolution', v_r.resolution,
    'resolutionNote', v_r.resolution_note,
    'resolvedAt', v_r.resolved_at,
    'createdAt', v_r.created_at,
    'hasConversation', v_r.conversation_id is not null,
    'contractId', v_r.contract_id,
    'contractStatus', (select status from public.contracts where id = v_r.contract_id),
    'reporter', (select jsonb_build_object('id', u.id, 'name', coalesce(cp.full_name, u.display_name, u.email),
                   'status', u.status, 'reportsMade', (select count(*) from public.reports x where x.reporter_id = u.id))
                 from public.users u left join public.client_profiles cp on cp.user_id = u.id where u.id = v_r.reporter_id),
    'reported', (select jsonb_build_object('id', u.id, 'name', coalesce(cp.full_name, u.display_name, u.email),
                   'status', u.status, 'isStaff', private.is_staff_account(u.id),
                   'reportsReceived', (select count(*) from public.reports x where x.reported_user_id = u.id),
                   'actionsReceived', (select count(*) from public.moderation_actions m where m.target_user_id = u.id))
                 from public.users u left join public.client_profiles cp on cp.user_id = u.id where u.id = v_r.reported_user_id),
    'worker', (select jsonb_build_object('id', w.id, 'name', w.public_display_name, 'status', w.status,
                 'suspendedUntil', w.suspended_until)
               from public.worker_profiles w where w.id = v_worker),
    'review', case when v_r.target_type = 'REVIEW' then (
                select jsonb_build_object('id', rv.id, 'rating', rv.rating, 'comment', rv.comment, 'status', rv.status,
                                          'direction', rv.direction)
                from public.reviews rv where rv.id::text = v_r.target_id) end,
    'messageHidden', case when v_r.target_type = 'MESSAGE' then (
                select m.hidden_at is not null from public.messages m where m.id::text = v_r.target_id) end,
    'relatedOpen', (select count(*) from public.reports x where x.id <> v_r.id
                      and ((x.target_type = v_r.target_type and x.target_id = v_r.target_id)
                           or (v_r.reported_user_id is not null and x.reported_user_id = v_r.reported_user_id))
                      and x.status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA')),
    'evidenceCount', (select count(*) from public.report_evidence x where x.report_id = v_r.id),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'event', e.event, 'fromStatus', e.from_status,
                          'toStatus', e.to_status, 'note', e.note, 'visibleToReporter', e.visible_to_reporter,
                          'actorName', (select coalesce(u.display_name, u.email) from public.users u where u.id = e.actor_id),
                          'byReporter', e.actor_id = v_r.reporter_id, 'createdAt', e.created_at) order by e.id)
                        from public.report_events e where e.report_id = v_r.id), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'action', m.action, 'reason', m.reason,
                           'startsAt', m.starts_at, 'endsAt', m.ends_at, 'liftedAt', m.lifted_at, 'liftReason', m.lift_reason,
                           'actorName', (select coalesce(u.display_name, u.email) from public.users u where u.id = m.actor_id),
                           'createdAt', m.created_at) order by m.created_at)
                         from public.moderation_actions m where m.report_id = v_r.id), '[]'::jsonb),
    'accesses', coalesce((select jsonb_agg(jsonb_build_object('actorName', (select coalesce(u.display_name, u.email)
                            from public.users u where u.id = s.actor_id), 'resourceType', s.resource_type,
                            'justification', s.justification, 'occurredAt', s.occurred_at) order by s.occurred_at desc)
                          from public.sensitive_access_log s where s.report_id = v_r.id), '[]'::jsonb),
    'evidenceUnlockedUntil', (select max(s.occurred_at) + make_interval(mins => private.setting_int('reports.evidence_session_minutes', 30))
                              from public.sensitive_access_log s
                              where s.report_id = v_r.id and s.actor_id = p_actor_id and s.resource_type = 'REPORT_EVIDENCE')
  );
end;
$$;

create or replace function private.require_open_report(p_report_id uuid)
returns public.reports
language plpgsql
set search_path = ''
as $$
declare
  v_r public.reports;
begin
  select * into v_r from public.reports where id = p_report_id for update;
  if not found then
    raise exception 'Denuncia no encontrada' using errcode = 'no_data_found';
  end if;
  return v_r;
end;
$$;

/*
 * Gestión de la denuncia (report.manage). p_op:
 *   ASSIGN_ME · UNASSIGN · PRIORITY (p_priority) · REVIEW (→ EN_REVISION) · REQUEST_INFO (nota visible al
 *   denunciante) · ESCALATE · RESOLVE (p_resolution + nota) · DISCARD (nota) · NOTE (nota interna)
 */
create or replace function public.fn_admin_report_update(
  p_actor_id uuid,
  p_report_id uuid,
  p_op text,
  p_note text default null,
  p_resolution text default null,
  p_priority integer default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns public.report_status
language plpgsql
set search_path = ''
as $$
declare
  v_r public.reports;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_permission(p_actor_id, 'report.manage');
  perform set_config('acolita.actor', p_actor_id::text, true);
  v_r := private.require_open_report(p_report_id);
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'La nota admite hasta 1000 caracteres' using errcode = 'check_violation';
  end if;
  if p_op <> 'NOTE' and v_r.status in ('RESUELTA', 'DESCARTADA') then
    raise exception 'La denuncia ya está cerrada' using errcode = 'object_not_in_prerequisite_state';
  end if;
  -- La denuncia de una disputa se cierra al resolver la disputa (finalizar o cancelar la contratación).
  if p_op in ('RESOLVE', 'DISCARD') and exists (
       select 1 from public.contracts k where k.dispute_report_id = v_r.id and k.status = 'EN_DISPUTA') then
    raise exception 'Resuelve primero la disputa de la contratación (finalizarla o cancelarla)'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  case p_op
    when 'ASSIGN_ME' then
      update public.reports set assigned_to = p_actor_id, assigned_at = now(),
        status = case when status = 'ABIERTA' then 'EN_REVISION'::public.report_status else status end
        where id = p_report_id returning * into v_r;
    when 'UNASSIGN' then
      update public.reports set assigned_to = null, assigned_at = null where id = p_report_id returning * into v_r;
    when 'PRIORITY' then
      if p_priority is null or p_priority not between 1 and 3 then
        raise exception 'Prioridad no válida' using errcode = 'check_violation';
      end if;
      update public.reports set priority = p_priority where id = p_report_id returning * into v_r;
    when 'REVIEW' then
      update public.reports set status = 'EN_REVISION', assigned_to = coalesce(assigned_to, p_actor_id),
        assigned_at = coalesce(assigned_at, now()) where id = p_report_id returning * into v_r;
    when 'REQUEST_INFO' then
      if char_length(coalesce(v_note, '')) < 10 then
        raise exception 'Indica qué información necesitas (al menos 10 caracteres)' using errcode = 'check_violation';
      end if;
      update public.reports set status = 'EN_ESPERA_DE_INFORMACION' where id = p_report_id returning * into v_r;
      insert into public.report_events (report_id, event, actor_id, note, visible_to_reporter)
      values (p_report_id, 'INFO_SOLICITADA', p_actor_id, v_note, true);
      update public.notifications set body = left(v_note, 300)
        where user_id = v_r.reporter_id and dedupe_key = 'report:' || p_report_id and read_at is null;
    when 'ESCALATE' then
      if char_length(coalesce(v_note, '')) < 10 then
        raise exception 'Explica por qué escalas el caso (al menos 10 caracteres)' using errcode = 'check_violation';
      end if;
      update public.reports set status = 'ESCALADA' where id = p_report_id returning * into v_r;
      insert into public.report_events (report_id, event, actor_id, note) values (p_report_id, 'NOTA_INTERNA', p_actor_id, v_note);
    when 'RESOLVE' then
      if p_resolution is null or p_resolution not in ('MEDIDAS_APLICADAS', 'SIN_INCUMPLIMIENTO', 'RESUELTO_ENTRE_PARTES', 'DUPLICADA', 'OTRO') then
        raise exception 'Elige el resultado de la denuncia' using errcode = 'check_violation';
      end if;
      if char_length(coalesce(v_note, '')) < 10 then
        raise exception 'Registra la justificación de la resolución (al menos 10 caracteres)' using errcode = 'check_violation';
      end if;
      update public.reports set status = 'RESUELTA', resolution = p_resolution, resolution_note = v_note,
        resolved_by = p_actor_id where id = p_report_id returning * into v_r;
    when 'DISCARD' then
      if char_length(coalesce(v_note, '')) < 10 then
        raise exception 'Explica por qué se descarta (al menos 10 caracteres)' using errcode = 'check_violation';
      end if;
      update public.reports set status = 'DESCARTADA', resolution_note = v_note, resolved_by = p_actor_id
        where id = p_report_id returning * into v_r;
    when 'NOTE' then
      if v_note is null then
        raise exception 'Escribe la nota' using errcode = 'check_violation';
      end if;
      insert into public.report_events (report_id, event, actor_id, note) values (p_report_id, 'NOTA_INTERNA', p_actor_id, v_note);
      update public.reports set updated_at = now() where id = p_report_id returning * into v_r;
    else
      raise exception 'Operación no válida' using errcode = 'check_violation';
  end case;

  perform private.audit(p_actor_id,
    case p_op when 'ASSIGN_ME' then 'REPORT_ASSIGNED' when 'UNASSIGN' then 'REPORT_ASSIGNED'
              when 'RESOLVE' then 'REPORT_RESOLVED' when 'NOTE' then 'REPORT_NOTE_ADDED'
              else 'REPORT_STATUS_CHANGED' end,
    'report', p_report_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('op', p_op, 'status', v_r.status, 'resolution', p_resolution, 'priority', p_priority));
  return v_r.status;
end;
$$;

/*
 * RN-09: acceso a la conversación, la contratación y la evidencia de una denuncia. Exige
 * report.evidence.read y una justificación; cada acceso queda en sensitive_access_log y en la
 * auditoría (MESSAGE_REVIEWED). Sin denuncia no hay forma de leer una conversación.
 */
create or replace function public.fn_admin_access_report_evidence(
  p_actor_id uuid,
  p_report_id uuid,
  p_justification text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_r public.reports;
  v_just text := btrim(coalesce(p_justification, ''));
  v_focus bigint;
begin
  perform private.require_permission(p_actor_id, 'report.evidence.read');
  if not private.is_staff_account(p_actor_id) then
    raise exception 'Solo el personal del GAD accede a la evidencia' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_just) not between 20 and 1000 then
    raise exception 'Escribe la justificación del acceso (20 a 1000 caracteres)' using errcode = 'check_violation';
  end if;
  select * into v_r from public.reports where id = p_report_id;
  if not found then
    raise exception 'Denuncia no encontrada' using errcode = 'no_data_found';
  end if;
  v_focus := case when v_r.target_type = 'MESSAGE' then v_r.target_id::bigint end;

  insert into public.sensitive_access_log (actor_id, resource_type, resource_id, report_id, justification, ip, request_id)
  values (p_actor_id, 'REPORT_EVIDENCE', coalesce(v_r.conversation_id::text, v_r.target_id), p_report_id, v_just, p_ip, p_request_id);
  insert into public.report_events (report_id, event, actor_id, note)
  values (p_report_id, 'ACCESO_EVIDENCIA', p_actor_id, v_just);
  perform private.audit(p_actor_id, 'MESSAGE_REVIEWED', 'report', p_report_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('conversationId', v_r.conversation_id, 'contractId', v_r.contract_id));

  return jsonb_build_object(
    'focusMessageId', v_focus,
    'conversation', case when v_r.conversation_id is not null then (
      select jsonb_build_object(
        'clientName', (select coalesce(cp.full_name, u.display_name) from public.users u
                       left join public.client_profiles cp on cp.user_id = u.id where u.id = c.client_user_id),
        'clientUserId', c.client_user_id,
        'workerName', w.public_display_name,
        'workerUserId', w.user_id,
        'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'senderRole',
                       case when m.sender_id is null then 'SISTEMA' when m.sender_id = c.client_user_id then 'CLIENTE' else 'TRABAJADOR' end,
                       'kind', m.kind, 'body', m.body, 'hidden', m.hidden_at is not null, 'createdAt', m.created_at) order by m.id)
                     from (select * from public.messages x where x.conversation_id = c.id order by x.id desc limit 300) m), '[]'::jsonb))
      from public.conversations c join public.worker_profiles w on w.id = c.worker_id where c.id = v_r.conversation_id) end,
    'contract', case when v_r.contract_id is not null then (
      select jsonb_build_object('status', k.status, 'versions', coalesce((select jsonb_agg(jsonb_build_object(
               'version', t.version, 'proposerRole', t.proposer_role, 'description', t.description,
               'scheduledStart', t.scheduled_start, 'priceAmount', t.price_amount, 'priceUnit', t.price_unit,
               'conditions', t.conditions, 'agreed', t.id = k.agreed_terms_id, 'createdAt', t.created_at) order by t.version)
             from public.contract_terms t where t.contract_id = k.id), '[]'::jsonb),
             'events', coalesce((select jsonb_agg(jsonb_build_object('event', e.event, 'createdAt', e.created_at) order by e.id)
             from public.contract_events e where e.contract_id = k.id), '[]'::jsonb))
      from public.contracts k where k.id = v_r.contract_id) end,
    'evidence', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'name', x.original_name,
                   'mimeType', x.mime_type, 'sizeBytes', x.size_bytes, 'note', x.note, 'createdAt', x.created_at) order by x.created_at)
                 from public.report_evidence x where x.report_id = v_r.id), '[]'::jsonb));
end;
$$;

/* Ruta de un archivo de evidencia, solo dentro de la sesión de acceso justificado (30 min). Se audita. */
create or replace function public.fn_admin_evidence_file(
  p_actor_id uuid,
  p_report_id uuid,
  p_evidence_id uuid,
  p_ip inet default null,
  p_request_id text default null
)
returns table (storage_path text, mime_type text, original_name text)
language plpgsql
set search_path = ''
as $$
declare
  v_e public.report_evidence;
begin
  perform private.require_permission(p_actor_id, 'report.evidence.read');
  if not exists (select 1 from public.sensitive_access_log s
                 where s.report_id = p_report_id and s.actor_id = p_actor_id and s.resource_type = 'REPORT_EVIDENCE'
                   and s.occurred_at > now() - make_interval(mins => private.setting_int('reports.evidence_session_minutes', 30))) then
    raise exception 'Registra la justificación de acceso a la evidencia' using errcode = 'insufficient_privilege';
  end if;
  select * into v_e from public.report_evidence where id = p_evidence_id and report_id = p_report_id and kind = 'FILE';
  if not found then
    raise exception 'Archivo no encontrado' using errcode = 'no_data_found';
  end if;
  insert into public.sensitive_access_log (actor_id, resource_type, resource_id, report_id, justification, ip, request_id)
  values (p_actor_id, 'EVIDENCE_FILE', p_evidence_id::text, p_report_id,
          'Apertura de archivo dentro del acceso justificado a la evidencia', p_ip, p_request_id);
  return query select v_e.storage_path, v_e.mime_type, v_e.original_name;
end;
$$;

/*
 * Aplica una acción de moderación desde una denuncia. Advertir u ocultar: moderation.act.
 * Suspender, deshabilitar o bloquear: report.manage. Devuelve las sesiones revocadas (tokens cifrados)
 * cuando se suspende o bloquea una cuenta, para cerrar también la sesión en Cognito.
 */
create or replace function public.fn_admin_apply_moderation(
  p_actor_id uuid,
  p_report_id uuid,
  p_action text,
  p_reason text,
  p_ends_at timestamptz default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_r public.reports;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_worker public.worker_profiles;
  v_target_user uuid;
  v_message bigint;
  v_review uuid;
  v_id uuid;
  v_tokens text[] := '{}';
begin
  if p_action in ('ADVERTENCIA', 'OCULTAR_MENSAJE', 'OCULTAR_RESENA') then
    perform private.require_permission(p_actor_id, 'moderation.act');
  elsif p_action in ('SUSPENDER_TRABAJADOR', 'DESHABILITAR_TRABAJADOR', 'SUSPENDER_CUENTA', 'BLOQUEAR_CUENTA') then
    perform private.require_permission(p_actor_id, 'report.manage');
  else
    raise exception 'Acción no válida' using errcode = 'check_violation';
  end if;
  perform set_config('acolita.actor', p_actor_id::text, true);
  if char_length(v_reason) not between 10 and 1000 then
    raise exception 'Registra el motivo de la acción (10 a 1000 caracteres)' using errcode = 'check_violation';
  end if;
  v_r := private.require_open_report(p_report_id);
  if v_r.status in ('RESUELTA', 'DESCARTADA') then
    raise exception 'La denuncia ya está cerrada' using errcode = 'object_not_in_prerequisite_state';
  end if;
  v_target_user := v_r.reported_user_id;
  select * into v_worker from public.worker_profiles
    where id = case when v_r.target_type = 'WORKER' then v_r.target_id::uuid end
       or (v_r.target_type <> 'WORKER' and user_id = v_r.reported_user_id)
    limit 1;

  if p_action in ('SUSPENDER_TRABAJADOR', 'SUSPENDER_CUENTA')
     and (p_ends_at is null or p_ends_at <= now() or p_ends_at > now() + interval '366 days') then
    raise exception 'Indica hasta cuándo dura la suspensión (máximo un año)' using errcode = 'check_violation';
  end if;
  if v_target_user is not null and private.is_staff_account(v_target_user) then
    raise exception 'Las cuentas del personal del GAD no se sancionan desde aquí' using errcode = 'check_violation';
  end if;

  case p_action
    when 'ADVERTENCIA' then
      if v_target_user is null then
        raise exception 'La persona denunciada no tiene cuenta a la que advertir' using errcode = 'check_violation';
      end if;
      insert into public.notifications (user_id, type, title, body, link)
      values (v_target_user, 'MODERATION_WARNING', 'Advertencia del GAD', left(v_reason, 300), '/cuenta');
    when 'OCULTAR_MENSAJE' then
      if v_r.target_type <> 'MESSAGE' then
        raise exception 'Esta denuncia no es sobre un mensaje' using errcode = 'check_violation';
      end if;
      v_message := v_r.target_id::bigint;
      update public.messages set hidden_at = now(), hidden_by = p_actor_id, hidden_reason = left(v_reason, 500)
        where id = v_message and hidden_at is null;
      if not found then
        raise exception 'El mensaje ya está oculto' using errcode = 'object_not_in_prerequisite_state';
      end if;
    when 'OCULTAR_RESENA' then
      if v_r.target_type <> 'REVIEW' then
        raise exception 'Esta denuncia no es sobre una reseña' using errcode = 'check_violation';
      end if;
      v_review := v_r.target_id::uuid;
      update public.reviews set status = 'OCULTA', hidden_at = now(), hidden_by = p_actor_id, hidden_reason = left(v_reason, 500)
        where id = v_review and status = 'PUBLICADA';
      if not found then
        raise exception 'La reseña ya está oculta' using errcode = 'object_not_in_prerequisite_state';
      end if;
    when 'SUSPENDER_TRABAJADOR', 'DESHABILITAR_TRABAJADOR' then
      if v_worker.id is null then
        raise exception 'La denuncia no involucra a un trabajador' using errcode = 'check_violation';
      end if;
      if p_action = 'SUSPENDER_TRABAJADOR' and v_worker.status <> 'HABILITADO' then
        raise exception 'Solo se suspende a un trabajador habilitado' using errcode = 'object_not_in_prerequisite_state';
      end if;
      if p_action = 'DESHABILITAR_TRABAJADOR' and v_worker.status not in ('HABILITADO', 'SUSPENDIDO') then
        raise exception 'El trabajador no está habilitado ni suspendido' using errcode = 'object_not_in_prerequisite_state';
      end if;
      perform private.apply_worker_status(v_worker.id,
        case when p_action = 'SUSPENDER_TRABAJADOR' then 'SUSPENDIDO' else 'INACTIVO' end::public.worker_status,
        'Moderación: ' || v_reason, p_actor_id, case when p_action = 'SUSPENDER_TRABAJADOR' then p_ends_at end);
      v_target_user := coalesce(v_worker.user_id, v_target_user);
    when 'SUSPENDER_CUENTA', 'BLOQUEAR_CUENTA' then
      if v_target_user is null then
        raise exception 'La persona denunciada no tiene cuenta' using errcode = 'check_violation';
      end if;
      update public.users set status = 'BLOQUEADO', blocked_reason = left('Moderación: ' || v_reason, 500)
        where id = v_target_user and status = 'ACTIVO';
      if not found then
        raise exception 'La cuenta no está activa' using errcode = 'object_not_in_prerequisite_state';
      end if;
      with revocadas as (
        update public.auth_sessions set revoked_at = now()
        where user_id = v_target_user and revoked_at is null returning tokens_enc)
      select coalesce(array_agg(tokens_enc::text), '{}') into v_tokens from revocadas;
  end case;

  insert into public.moderation_actions (report_id, action, target_user_id, worker_id, message_id, review_id, reason, ends_at, actor_id)
  values (p_report_id, p_action, v_target_user,
          case when p_action in ('SUSPENDER_TRABAJADOR', 'DESHABILITAR_TRABAJADOR') then v_worker.id end,
          v_message, v_review, v_reason,
          case when p_action in ('SUSPENDER_TRABAJADOR', 'SUSPENDER_CUENTA') then p_ends_at end, p_actor_id)
  returning id into v_id;
  insert into public.report_events (report_id, event, actor_id, note)
  values (p_report_id, 'ACCION', p_actor_id, p_action || ': ' || v_reason);
  if v_r.status = 'ABIERTA' then
    update public.reports set status = 'EN_REVISION', assigned_to = coalesce(assigned_to, p_actor_id),
      assigned_at = coalesce(assigned_at, now()) where id = p_report_id;
  end if;
  perform private.audit(p_actor_id, 'MODERATION_ACTION_APPLIED', 'moderation_action', v_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('action', p_action, 'reportId', p_report_id, 'targetUserId', v_target_user, 'endsAt', p_ends_at));
  return jsonb_build_object('id', v_id, 'revokedTokens', to_jsonb(v_tokens));
end;
$$;

/* Levanta (revoca) una acción vigente y deshace su efecto. */
create or replace function public.fn_admin_lift_moderation(
  p_actor_id uuid,
  p_action_id uuid,
  p_reason text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_a public.moderation_actions;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_changed boolean;
begin
  select * into v_a from public.moderation_actions where id = p_action_id for update;
  if not found then
    raise exception 'Acción no encontrada' using errcode = 'no_data_found';
  end if;
  perform private.require_permission(p_actor_id,
    case when v_a.action in ('ADVERTENCIA', 'OCULTAR_MENSAJE', 'OCULTAR_RESENA') then 'moderation.act' else 'report.manage' end);
  perform set_config('acolita.actor', p_actor_id::text, true);
  if v_a.lifted_at is not null then
    raise exception 'La acción ya no está vigente' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_a.action in ('ADVERTENCIA', 'DESHABILITAR_TRABAJADOR') then
    raise exception 'Esta acción no se revoca desde aquí (reactiva al trabajador desde su ficha)'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if char_length(v_reason) not between 10 and 500 then
    raise exception 'Registra el motivo (10 a 500 caracteres)' using errcode = 'check_violation';
  end if;
  v_changed := private.moderation_undo(v_a, p_actor_id, 'Sanción revocada: ' || v_reason);
  update public.moderation_actions set lifted_at = now(), lifted_by = p_actor_id, lift_reason = v_reason where id = p_action_id;
  if v_a.report_id is not null then
    insert into public.report_events (report_id, event, actor_id, note)
    values (v_a.report_id, 'ACCION_REVOCADA', p_actor_id, v_a.action || ': ' || v_reason);
  end if;
  perform private.audit(p_actor_id, 'MODERATION_ACTION_LIFTED', 'moderation_action', p_action_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('action', v_a.action, 'effectUndone', v_changed));
  return v_changed;
end;
$$;

/* Tarea programada: levanta las suspensiones vencidas (también se ejecuta con pg_cron). */
create or replace function public.fn_run_moderation_maintenance(p_limit integer default 200)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_a public.moderation_actions;
  v_worker uuid;
  v_n integer := 0;
begin
  for v_a in
    select * from public.moderation_actions
    where lifted_at is null and ends_at is not null and ends_at <= now()
    order by ends_at
    limit least(greatest(coalesce(p_limit, 200), 1), 2000)
    for update skip locked
  loop
    perform private.moderation_undo(v_a, null, 'Fin de la suspensión');
    update public.moderation_actions set lifted_at = now(), lift_reason = 'Venció el plazo' where id = v_a.id;
    if v_a.report_id is not null then
      insert into public.report_events (report_id, event, note)
      values (v_a.report_id, 'ACCION_VENCIDA', v_a.action || ': venció el plazo');
    end if;
    perform private.audit(null, 'MODERATION_ACTION_EXPIRED', 'moderation_action', v_a.id::text, null, null, null,
      jsonb_build_object('action', v_a.action));
    v_n := v_n + 1;
  end loop;
  -- Suspensiones de trabajadores hechas desde su ficha (Fase 4) con fecha de fin vencida.
  for v_worker in
    select w.id from public.worker_profiles w
    where w.status = 'SUSPENDIDO' and w.suspended_until is not null and w.suspended_until <= now()
      and not exists (select 1 from public.moderation_actions m where m.worker_id = w.id and m.lifted_at is null)
    limit 200
  loop
    if private.worker_lift_suspension(v_worker, null, 'Fin de la suspensión') then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS y privilegios
-- -----------------------------------------------------------------------------

alter table public.report_events enable row level security;
alter table public.report_evidence enable row level security;
alter table public.sensitive_access_log enable row level security;
alter table public.moderation_actions enable row level security;

revoke all on public.report_events, public.report_evidence, public.sensitive_access_log, public.moderation_actions
  from anon, authenticated;
grant select, insert on public.report_events, public.report_evidence, public.sensitive_access_log to service_role;
grant select, insert, update on public.moderation_actions to service_role;
revoke update, delete, truncate on public.report_events, public.report_evidence, public.sensitive_access_log from service_role;
revoke delete, truncate on public.moderation_actions, public.reports from service_role;

revoke execute on function
  private.setting_int(text, integer),
  private.reports_before_insert(),
  private.report_transition_allowed(public.report_status, public.report_status),
  private.current_actor(),
  private.reports_guard(),
  private.report_public_message(public.report_status, text),
  private.reports_after_change(),
  private.moderation_actions_guard(),
  private.worker_lift_suspension(uuid, uuid, text),
  private.moderation_undo(public.moderation_actions, uuid, text),
  private.report_target_label(public.reports),
  private.require_open_report(uuid),
  public.fn_report_create(uuid, text, uuid, text, text, inet, text, text),
  public.fn_my_reports(uuid),
  public.fn_my_report(uuid, uuid),
  public.fn_report_add_evidence(uuid, uuid, text, text, text, integer, text, text),
  public.fn_admin_list_reports(uuid, text, text, integer, integer),
  public.fn_admin_reports_summary(uuid),
  public.fn_admin_get_report(uuid, uuid),
  public.fn_admin_report_update(uuid, uuid, text, text, text, integer, inet, text, text),
  public.fn_admin_access_report_evidence(uuid, uuid, text, inet, text, text),
  public.fn_admin_evidence_file(uuid, uuid, uuid, inet, text),
  public.fn_admin_apply_moderation(uuid, uuid, text, text, timestamptz, inet, text, text),
  public.fn_admin_lift_moderation(uuid, uuid, text, inet, text, text),
  public.fn_run_moderation_maintenance(integer)
  from public, anon, authenticated;

grant execute on function
  private.setting_int(text, integer),
  private.report_transition_allowed(public.report_status, public.report_status),
  private.current_actor(),
  private.report_public_message(public.report_status, text),
  private.worker_lift_suspension(uuid, uuid, text),
  private.moderation_undo(public.moderation_actions, uuid, text),
  private.report_target_label(public.reports),
  private.require_open_report(uuid),
  public.fn_report_create(uuid, text, uuid, text, text, inet, text, text),
  public.fn_my_reports(uuid),
  public.fn_my_report(uuid, uuid),
  public.fn_report_add_evidence(uuid, uuid, text, text, text, integer, text, text),
  public.fn_admin_list_reports(uuid, text, text, integer, integer),
  public.fn_admin_reports_summary(uuid),
  public.fn_admin_get_report(uuid, uuid),
  public.fn_admin_report_update(uuid, uuid, text, text, text, integer, inet, text, text),
  public.fn_admin_access_report_evidence(uuid, uuid, text, inet, text, text),
  public.fn_admin_evidence_file(uuid, uuid, uuid, inet, text),
  public.fn_admin_apply_moderation(uuid, uuid, text, text, timestamptz, inet, text, text),
  public.fn_admin_lift_moderation(uuid, uuid, text, inet, text, text),
  public.fn_run_moderation_maintenance(integer)
  to service_role;

-- -----------------------------------------------------------------------------
-- Tarea programada (pg_cron): vigencia de sanciones cada 15 minutos.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('acolita-moderacion-vigencias', '*/15 * * * *', 'select public.fn_run_moderation_maintenance()');
  end if;
end;
$$;
