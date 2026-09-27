-- =============================================================================
-- Fase 6 — Contrataciones: propuesta y contrapropuesta versionadas desde el chat, aceptación
-- bilateral con hash, rechazo, retiro, cancelación, expiración, inicio, finalización con
-- confirmación (o automática) y disputa.
-- Detalle: docs/phases/fase-06-contrataciones.md · Estados: src/server/domain/contracts/state-machine.ts
--
-- Reglas clave:
--   * RN-04: la contratación existe solo cuando AMBAS partes aceptaron la MISMA versión. Enviar una
--     versión cuenta como aceptación de quien la envía; la otra parte la acepta, rechaza o contrapropone.
--   * RN-05: las versiones son inmutables (trigger). Cambiar algo = nueva versión con nueva aceptación.
--     Tras CONTRATADA, una modificación queda pendiente; lo acordado sigue vigente hasta que se acepte.
--   * Aceptar exige la versión Y el hash vigentes: una versión obsoleta devuelve 409.
--   * Cada función bloquea el contrato (SELECT … FOR UPDATE): aceptaciones y contrapropuestas
--     concurrentes se serializan.
--   * Plazos (RN-12, configurables en app_settings): la propuesta expira a los 7 días; la finalización
--     se confirma sola a los 7 días. Se aplican al leer (siempre correctos) y con pg_cron (avisos).
--   * Solo las partes acceden (404 para terceros). El personal del GAD resuelve disputas (report.manage).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Parámetros configurables sin migración
-- -----------------------------------------------------------------------------

create table public.app_settings (
  key          text primary key,
  value        jsonb not null,
  description  text not null,
  updated_at   timestamptz not null default now(),
  constraint app_settings_key_format check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$')
);

comment on table public.app_settings is 'Parámetros de negocio ajustables sin migración (plazos, límites).';

insert into public.app_settings (key, value, description) values
  ('contracts.proposal_ttl_days', '7', 'Días para responder una propuesta de condiciones antes de que expire (RN-12)'),
  ('contracts.auto_confirm_days', '7', 'Días para que el cliente confirme la finalización; luego se confirma sola')
on conflict (key) do nothing;

create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function private.set_updated_at();

create or replace function private.setting_days(p_key text, p_default integer)
returns interval
language sql
stable
set search_path = ''
as $$
  select make_interval(days => coalesce(
    (select case when jsonb_typeof(value) = 'number' then greatest(least((value)::text::numeric::integer, 90), 1) end
     from public.app_settings where key = p_key), p_default));
$$;

-- -----------------------------------------------------------------------------
-- Contrataciones
-- -----------------------------------------------------------------------------

create type public.contract_status as enum (
  'PROPUESTA_ENVIADA',
  'CONTRATADA',
  'EN_CURSO',
  'FINALIZACION_PENDIENTE',
  'EN_DISPUTA',
  'FINALIZADA',
  'CANCELADA',
  'RECHAZADA',
  'EXPIRADA'
);

create table public.contracts (
  id                       uuid primary key default gen_random_uuid(),
  conversation_id          uuid not null references public.conversations (id),
  client_user_id           uuid not null references public.users (id),
  worker_id                uuid not null references public.worker_profiles (id),
  status                   public.contract_status not null default 'PROPUESTA_ENVIADA',
  current_terms_id         uuid,
  agreed_terms_id          uuid,
  agreed_at                timestamptz,
  started_at               timestamptz,
  completion_requested_at  timestamptz,
  completed_at             timestamptz,
  auto_confirmed           boolean not null default false,
  cancelled_at             timestamptz,
  cancelled_by             uuid references public.users (id),
  cancel_reason            text,
  disputed_at              timestamptz,
  disputed_by              uuid references public.users (id),
  dispute_report_id        uuid references public.reports (id),
  status_before_dispute    public.contract_status,
  -- Vence la propuesta (o la modificación) pendiente de respuesta.
  expires_at               timestamptz,
  -- Vence el plazo del cliente para confirmar la finalización.
  confirm_due_at           timestamptz,
  created_by               uuid not null references public.users (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint contracts_cancel_reason_len check (cancel_reason is null or char_length(cancel_reason) <= 500),
  -- RN-04: fuera de la negociación, siempre hay una versión acordada por ambas partes.
  constraint contracts_agreed_required check (
    status in ('PROPUESTA_ENVIADA', 'RECHAZADA', 'EXPIRADA', 'CANCELADA') or agreed_terms_id is not null
  ),
  constraint contracts_dispute_state check (status <> 'EN_DISPUTA' or status_before_dispute is not null)
);

comment on table public.contracts is
  'Contratación entre un cliente y un trabajador, nacida en una conversación. Las condiciones viven en contract_terms (versionadas e inmutables).';

create index contracts_client_idx on public.contracts (client_user_id, updated_at desc);
create index contracts_worker_idx on public.contracts (worker_id, updated_at desc);
create index contracts_conversation_idx on public.contracts (conversation_id, created_at desc);
create index contracts_created_by_idx on public.contracts (created_by, created_at desc);
create index contracts_cancelled_by_idx on public.contracts (cancelled_by);
create index contracts_disputed_by_idx on public.contracts (disputed_by);
create index contracts_dispute_report_idx on public.contracts (dispute_report_id);
create index contracts_current_terms_idx on public.contracts (current_terms_id);
create index contracts_agreed_terms_idx on public.contracts (agreed_terms_id);
-- Una sola negociación abierta por conversación.
create unique index contracts_open_proposal_key on public.contracts (conversation_id) where status = 'PROPUESTA_ENVIADA';
-- Plazos vencidos (expiración y confirmación automática).
create index contracts_expires_idx on public.contracts (expires_at) where expires_at is not null;
create index contracts_confirm_due_idx on public.contracts (confirm_due_at) where status = 'FINALIZACION_PENDIENTE';

-- -----------------------------------------------------------------------------
-- Versiones de condiciones (inmutables)
-- -----------------------------------------------------------------------------

create table public.contract_terms (
  id                  uuid primary key default gen_random_uuid(),
  contract_id         uuid not null references public.contracts (id),
  version             smallint not null,
  proposed_by         uuid not null references public.users (id),
  proposer_role       text not null,
  service_id          uuid references public.services (id),
  description         text not null,
  scheduled_start     date not null,
  scheduled_end       date,
  parish_id           smallint references public.parishes (id),
  -- Dirección o referencia exacta: visible solo para las partes.
  location_detail     text,
  price_amount        numeric(10, 2) not null,
  price_unit          text not null,
  conditions          text,
  content_hash        text not null,
  client_accepted_at  timestamptz,
  worker_accepted_at  timestamptz,
  rejected_at         timestamptz,
  rejected_by         uuid references public.users (id),
  withdrawn_at        timestamptz,
  response_note       text,
  created_at          timestamptz not null default now(),
  constraint contract_terms_version_key unique (contract_id, version),
  constraint contract_terms_version_positive check (version between 1 and 999),
  constraint contract_terms_role check (proposer_role in ('CLIENTE', 'TRABAJADOR')),
  constraint contract_terms_description_len check (char_length(btrim(description)) between 10 and 1000),
  constraint contract_terms_dates check (scheduled_end is null or scheduled_end >= scheduled_start),
  constraint contract_terms_location_len check (location_detail is null or char_length(location_detail) <= 200),
  constraint contract_terms_price check (price_amount > 0 and price_amount <= 100000),
  constraint contract_terms_price_unit check (price_unit in ('JORNAL', 'JORNADA', 'HORA', 'OBRA', 'SERVICIO')),
  constraint contract_terms_conditions_len check (conditions is null or char_length(conditions) <= 1000),
  constraint contract_terms_hash_format check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint contract_terms_note_len check (response_note is null or char_length(response_note) <= 500)
);

comment on table public.contract_terms is
  'Versiones de condiciones. Inmutables: solo se registran aceptaciones, rechazo o retiro (una vez).';

create index contract_terms_proposed_by_idx on public.contract_terms (proposed_by);
create index contract_terms_rejected_by_idx on public.contract_terms (rejected_by);
create index contract_terms_service_idx on public.contract_terms (service_id);
create index contract_terms_parish_idx on public.contract_terms (parish_id);

alter table public.contracts
  add constraint contracts_current_terms_fkey foreign key (current_terms_id) references public.contract_terms (id),
  add constraint contracts_agreed_terms_fkey foreign key (agreed_terms_id) references public.contract_terms (id);

-- Contenido canónico que se firma con SHA-256 (jsonb ordena las claves de forma determinista).
create or replace function private.contract_terms_payload(t public.contract_terms)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'contractId', t.contract_id,
    'version', t.version,
    'clientUserId', c.client_user_id,
    'workerId', c.worker_id,
    'proposedBy', t.proposed_by,
    'serviceId', t.service_id,
    'description', t.description,
    'scheduledStart', t.scheduled_start,
    'scheduledEnd', t.scheduled_end,
    'parishCode', (select p.code from public.parishes p where p.id = t.parish_id),
    'locationDetail', t.location_detail,
    'priceAmount', to_char(t.price_amount, 'FM9999990.00'),
    'priceUnit', t.price_unit,
    'conditions', t.conditions)
  from public.contracts c where c.id = t.contract_id;
$$;

create or replace function private.contract_terms_hash(t public.contract_terms)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(sha256(convert_to(private.contract_terms_payload(t)::text, 'UTF8')), 'hex');
$$;

create or replace function private.contract_terms_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las condiciones de una contratación no se eliminan' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' then
    -- El hash lo calcula siempre la base (no se confía en el valor recibido).
    new.content_hash := private.contract_terms_hash(new);
    return new;
  end if;
  if (to_jsonb(new) - array['client_accepted_at', 'worker_accepted_at', 'rejected_at', 'rejected_by',
        'withdrawn_at', 'response_note'])
     is distinct from
     (to_jsonb(old) - array['client_accepted_at', 'worker_accepted_at', 'rejected_at', 'rejected_by',
        'withdrawn_at', 'response_note']) then
    raise exception 'Las condiciones aceptadas no se modifican: se propone una nueva versión'
      using errcode = 'insufficient_privilege';
  end if;
  -- Aceptación, rechazo y retiro se registran una sola vez.
  if (old.client_accepted_at is not null and new.client_accepted_at is distinct from old.client_accepted_at)
     or (old.worker_accepted_at is not null and new.worker_accepted_at is distinct from old.worker_accepted_at)
     or (old.rejected_at is not null and new.rejected_at is distinct from old.rejected_at)
     or (old.rejected_by is not null and new.rejected_by is distinct from old.rejected_by)
     or (old.withdrawn_at is not null and new.withdrawn_at is distinct from old.withdrawn_at)
     or (old.response_note is not null and new.response_note is distinct from old.response_note) then
    raise exception 'La respuesta a una versión no se modifica' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger contract_terms_guard before insert or update or delete on public.contract_terms
  for each row execute function private.contract_terms_guard();

-- -----------------------------------------------------------------------------
-- Historial (append-only) y máquina de estados en la base
-- -----------------------------------------------------------------------------

create table public.contract_events (
  id             bigint generated always as identity primary key,
  contract_id    uuid not null references public.contracts (id),
  event          text not null,
  actor_id       uuid references public.users (id),
  from_status    public.contract_status,
  to_status      public.contract_status,
  terms_version  smallint,
  data           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  constraint contract_events_event_format check (event ~ '^[A-Z][A-Z_]*$')
);

create index contract_events_contract_idx on public.contract_events (contract_id, id);
create index contract_events_actor_idx on public.contract_events (actor_id);

create trigger contract_events_append_only before update or delete on public.contract_events
  for each row execute function private.prevent_mutation();

-- Espejo de TRANSICIONES en src/server/domain/contracts/state-machine.ts (un test compara ambas).
create or replace function private.contract_transition_allowed(p_from public.contract_status, p_to public.contract_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from::text || '>' || p_to::text) = any (array[
    'PROPUESTA_ENVIADA>CONTRATADA',
    'PROPUESTA_ENVIADA>RECHAZADA',
    'PROPUESTA_ENVIADA>CANCELADA',
    'PROPUESTA_ENVIADA>EXPIRADA',
    'CONTRATADA>EN_CURSO',
    'CONTRATADA>CANCELADA',
    'CONTRATADA>EN_DISPUTA',
    'EN_CURSO>FINALIZACION_PENDIENTE',
    'EN_CURSO>FINALIZADA',
    'EN_CURSO>EN_DISPUTA',
    'FINALIZACION_PENDIENTE>FINALIZADA',
    'FINALIZACION_PENDIENTE>EN_DISPUTA',
    'EN_DISPUTA>CONTRATADA',
    'EN_DISPUTA>EN_CURSO',
    'EN_DISPUTA>FINALIZACION_PENDIENTE',
    'EN_DISPUTA>FINALIZADA',
    'EN_DISPUTA>CANCELADA'
  ]);
$$;

create or replace function private.contracts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las contrataciones no se eliminan' using errcode = 'insufficient_privilege';
  end if;
  if new.client_user_id is distinct from old.client_user_id or new.worker_id is distinct from old.worker_id
     or new.conversation_id is distinct from old.conversation_id or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Las partes de una contratación no cambian' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status and not private.contract_transition_allowed(old.status, new.status) then
    raise exception 'Transición no permitida: % → %', old.status, new.status
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  -- RN-04: solo se acuerda una versión aceptada por ambas partes y propia del contrato.
  if new.agreed_terms_id is distinct from old.agreed_terms_id and not exists (
       select 1 from public.contract_terms t
       where t.id = new.agreed_terms_id and t.contract_id = new.id
         and t.client_accepted_at is not null and t.worker_accepted_at is not null) then
    raise exception 'Solo se acuerda una versión aceptada por ambas partes' using errcode = 'check_violation';
  end if;
  if new.current_terms_id is distinct from old.current_terms_id and new.current_terms_id is not null
     and not exists (select 1 from public.contract_terms t where t.id = new.current_terms_id and t.contract_id = new.id) then
    raise exception 'La versión no pertenece a la contratación' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger contracts_guard before update or delete on public.contracts
  for each row execute function private.contracts_guard();

create trigger contracts_set_updated_at before update on public.contracts
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Chat: mensajes de sistema vinculados a la contratación (tarjetas)
-- -----------------------------------------------------------------------------

alter table public.messages
  alter column sender_id drop not null,
  add column contract_id uuid references public.contracts (id),
  add column contract_terms_id uuid references public.contract_terms (id),
  add constraint messages_sender_required check (kind = 'SYSTEM' or sender_id is not null),
  add constraint messages_contract_system check (contract_id is null or kind = 'SYSTEM');

create index messages_contract_idx on public.messages (contract_id) where contract_id is not null;
create index messages_contract_terms_idx on public.messages (contract_terms_id) where contract_terms_id is not null;

comment on column public.messages.sender_id is 'NULL solo en mensajes de SISTEMA sin actor (expiraciones, resoluciones del GAD).';

create or replace function private.messages_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los mensajes no se eliminan (se ocultan)' using errcode = 'insufficient_privilege';
  end if;
  if new.body is distinct from old.body or new.sender_id is distinct from old.sender_id
     or new.conversation_id is distinct from old.conversation_id or new.created_at is distinct from old.created_at
     or new.kind is distinct from old.kind or new.client_message_id is distinct from old.client_message_id
     or new.contract_id is distinct from old.contract_id or new.contract_terms_id is distinct from old.contract_terms_id then
    raise exception 'El contenido de un mensaje no se modifica' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create or replace function private.messages_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_worker_user uuid;
begin
  select c.client_user_id, w.user_id into v_client, v_worker_user
  from public.conversations c join public.worker_profiles w on w.id = c.worker_id
  where c.id = new.conversation_id;

  perform private.broadcast('conversation:' || new.conversation_id, 'message', jsonb_build_object(
    'id', new.id, 'conversationId', new.conversation_id, 'senderId', new.sender_id,
    'kind', new.kind, 'body', new.body, 'contractId', new.contract_id, 'createdAt', new.created_at));
  perform private.broadcast('user:' || v_client, 'inbox', jsonb_build_object('conversationId', new.conversation_id));
  if v_worker_user is not null then
    perform private.broadcast('user:' || v_worker_user, 'inbox', jsonb_build_object('conversationId', new.conversation_id));
  end if;
  return null;
end;
$$;

-- La salida cambia (contract_id): se recrea la función.
drop function public.fn_list_messages(uuid, uuid, bigint, integer);

create function public.fn_list_messages(
  p_user_id uuid,
  p_conversation_id uuid,
  p_before bigint default null,
  p_limit integer default 50
)
returns table (
  id bigint,
  sender_id uuid,
  is_mine boolean,
  kind text,
  body text,
  hidden boolean,
  contract_id uuid,
  created_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_chat_user(p_user_id);
  if private.conversation_role(p_conversation_id, p_user_id) is null then
    raise exception 'Conversación no encontrada' using errcode = 'no_data_found';
  end if;
  return query
  select m.id, m.sender_id, coalesce(m.sender_id = p_user_id, false), m.kind,
         case when m.hidden_at is null then m.body end, m.hidden_at is not null, m.contract_id, m.created_at
  from public.messages m
  where m.conversation_id = p_conversation_id and (p_before is null or m.id < p_before)
  order by m.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

-- -----------------------------------------------------------------------------
-- Motivos de disputa (se registran como denuncias CONTRACT para la bandeja de la Fase 8)
-- -----------------------------------------------------------------------------

insert into public.report_reasons (code, target_type, label, severity, sort_order) values
  ('CONTRATO_INCUMPLIMIENTO', 'CONTRACT', 'El trabajo no se hizo o quedó incompleto', 3, 1),
  ('CONTRATO_CALIDAD', 'CONTRACT', 'El trabajo no cumple lo acordado', 2, 2),
  ('CONTRATO_COBRO', 'CONTRACT', 'Cobro o pago distinto al acordado', 3, 3),
  ('CONTRATO_CONDUCTA', 'CONTRACT', 'Conducta inapropiada o falta de respeto', 3, 4),
  ('CONTRATO_OTRO', 'CONTRACT', 'Otro motivo', 1, 5)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- Auxiliares de contratación
-- -----------------------------------------------------------------------------

-- Papel del usuario en la contratación ('CLIENTE' | 'TRABAJADOR') o NULL si no participa.
create or replace function private.contract_role(p_contract public.contracts, p_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_contract.client_user_id = p_user then 'CLIENTE'
    when (select w.user_id from public.worker_profiles w where w.id = p_contract.worker_id) = p_user then 'TRABAJADOR'
  end;
$$;

-- Nombre que ve la contraparte: el público del trabajador o «Nombre A.» del cliente.
create or replace function private.contract_party_name(p_contract public.contracts, p_role text)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_role = 'TRABAJADOR' then
    (select w.public_display_name from public.worker_profiles w where w.id = p_contract.worker_id)
  else
    (select private.short_name(coalesce(cp.full_name, u.display_name))
     from public.users u left join public.client_profiles cp on cp.user_id = u.id
     where u.id = p_contract.client_user_id)
  end;
$$;

create or replace function private.contract_log(
  p_contract uuid,
  p_event text,
  p_actor uuid,
  p_from public.contract_status,
  p_to public.contract_status,
  p_version smallint,
  p_data jsonb default '{}'::jsonb
)
returns void
language sql
set search_path = ''
as $$
  insert into public.contract_events (contract_id, event, actor_id, from_status, to_status, terms_version, data)
  values (p_contract, p_event, p_actor, p_from, p_to, p_version, coalesce(p_data, '{}'::jsonb));
$$;

/*
 * Publica el evento en el chat (tarjeta de sistema, difundida en tiempo real por el trigger de
 * mensajes) y notifica a la(s) parte(s) distinta(s) del actor: una notificación no leída por
 * contratación y push si hay dispositivos.
 */
create or replace function private.contract_announce(
  p_contract public.contracts,
  p_actor uuid,
  p_text text,
  p_title text,
  p_terms uuid default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_msg bigint;
  v_worker_user uuid;
  v_recipient uuid;
  v_preview text := left(regexp_replace(p_text, '\s+', ' ', 'g'), 140);
begin
  select w.user_id into v_worker_user from public.worker_profiles w where w.id = p_contract.worker_id;

  insert into public.messages (conversation_id, sender_id, kind, body, contract_id, contract_terms_id)
  values (p_contract.conversation_id, p_actor, 'SYSTEM', left(p_text, 2000), p_contract.id, p_terms)
  returning id into v_msg;

  update public.conversations
    set last_message_id = v_msg, last_message_at = now(), last_sender_id = p_actor,
        last_message_preview = v_preview,
        client_last_read_id = case when p_actor = client_user_id then v_msg else client_last_read_id end,
        worker_last_read_id = case when p_actor is not null and p_actor = v_worker_user then v_msg else worker_last_read_id end
    where id = p_contract.conversation_id;

  foreach v_recipient in array array[p_contract.client_user_id, v_worker_user] loop
    continue when v_recipient is null or v_recipient is not distinct from p_actor;
    insert into public.notifications (user_id, type, title, body, link, dedupe_key)
    values (v_recipient, 'CONTRACT_UPDATE', left(p_title, 120), left(v_preview, 300),
            '/contrataciones/' || p_contract.id, 'contract:' || p_contract.id)
    on conflict (user_id, dedupe_key) where read_at is null and dedupe_key is not null
    do update set title = excluded.title, body = excluded.body, created_at = now();

    if exists (select 1 from public.device_tokens where user_id = v_recipient and disabled_at is null) then
      insert into public.notification_outbox (event, recipient_id, payload)
      values ('CONTRACT_UPDATE', v_recipient, jsonb_build_object(
        'title', left(p_title, 120), 'body', v_preview,
        'link', '/contrataciones/' || p_contract.id, 'contractId', p_contract.id));
    end if;
  end loop;
end;
$$;

-- Finaliza la contratación (confirmada por el cliente, automática o por resolución del GAD).
create or replace function private.contract_finalize(p_id uuid, p_auto boolean)
returns public.contracts
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
begin
  update public.contracts
    set status = 'FINALIZADA', completed_at = now(), auto_confirmed = p_auto,
        confirm_due_at = null, expires_at = null,
        current_terms_id = agreed_terms_id
    where id = p_id
    returning * into v_c;
  update public.worker_profiles set contracts_completed = contracts_completed + 1 where id = v_c.worker_id;
  return v_c;
end;
$$;

/*
 * Aplica los plazos vencidos de UNA contratación (la fila debe estar bloqueada por el llamador):
 * propuesta sin respuesta → EXPIRADA; modificación sin respuesta → se descarta;
 * finalización sin confirmar → FINALIZADA (automática).
 */
create or replace function private.contract_apply_timeouts(p_id uuid)
returns public.contracts
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
  v_version smallint;
begin
  select * into v_c from public.contracts where id = p_id for update;
  if not found then
    return null;
  end if;
  select version into v_version from public.contract_terms where id = v_c.current_terms_id;

  if v_c.status = 'PROPUESTA_ENVIADA' and v_c.expires_at <= now() then
    update public.contracts set status = 'EXPIRADA', expires_at = null where id = p_id returning * into v_c;
    perform private.contract_log(p_id, 'EXPIRADA', null, 'PROPUESTA_ENVIADA', 'EXPIRADA', v_version);
    perform private.contract_announce(v_c, null,
      'La propuesta de condiciones (versión ' || v_version || ') expiró sin respuesta.',
      'Una propuesta expiró', v_c.current_terms_id);
  elsif v_c.status in ('CONTRATADA', 'EN_CURSO') and v_c.current_terms_id is distinct from v_c.agreed_terms_id
        and v_c.expires_at <= now() then
    update public.contracts set current_terms_id = agreed_terms_id, expires_at = null where id = p_id returning * into v_c;
    perform private.contract_log(p_id, 'MODIFICACION_EXPIRADA', null, v_c.status, v_c.status, v_version);
    perform private.contract_announce(v_c, null,
      'La modificación propuesta (versión ' || v_version || ') expiró sin respuesta. Siguen vigentes las condiciones acordadas.',
      'Una modificación expiró', null);
  elsif v_c.status = 'FINALIZACION_PENDIENTE' and v_c.confirm_due_at <= now() then
    v_c := private.contract_finalize(p_id, true);
    perform private.contract_log(p_id, 'FINALIZADA_AUTOMATICAMENTE', null, 'FINALIZACION_PENDIENTE', 'FINALIZADA', null);
    perform private.contract_announce(v_c, null,
      'La contratación se dio por finalizada automáticamente al vencer el plazo de confirmación.',
      'Contratación finalizada', null);
  end if;
  return v_c;
end;
$$;

/*
 * Carga y BLOQUEA la contratación para una acción del usuario, tras aplicar los plazos vencidos.
 * Un tercero (o una cuenta inactiva o del personal) recibe «no encontrada».
 */
create or replace function private.contract_for_action(p_contract uuid, p_user uuid)
returns public.contracts
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
begin
  perform private.require_chat_user(p_user);
  select * into v_c from public.contracts where id = p_contract for update;
  if not found or private.contract_role(v_c, p_user) is null then
    raise exception 'Contratación no encontrada' using errcode = 'no_data_found';
  end if;
  return private.contract_apply_timeouts(p_contract);
end;
$$;

create or replace function private.require_state(p_ok boolean, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not p_ok then
    raise exception '%', p_message using errcode = 'object_not_in_prerequisite_state';
  end if;
end;
$$;

-- Nueva versión de condiciones. Quien la envía la acepta al enviarla.
create or replace function private.contract_insert_terms(
  p_contract public.contracts,
  p_user uuid,
  p_role text,
  p_terms jsonb
)
returns public.contract_terms
language plpgsql
set search_path = ''
as $$
declare
  v_t public.contract_terms;
  v_version smallint;
  v_service uuid;
  v_start date;
  v_end date;
  v_today date := (now() at time zone 'America/Guayaquil')::date;
begin
  if jsonb_typeof(p_terms) is distinct from 'object' then
    raise exception 'Condiciones no válidas' using errcode = 'check_violation';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.contract_terms where contract_id = p_contract.id;
  if v_version > 20 then
    raise exception 'Se alcanzó el máximo de 20 versiones. Cancela y empieza una nueva propuesta.'
      using errcode = 'program_limit_exceeded';
  end if;

  v_service := nullif(p_terms ->> 'serviceId', '')::uuid;
  if v_service is not null and not exists (
       select 1 from public.worker_services ws where ws.worker_id = p_contract.worker_id and ws.service_id = v_service) then
    raise exception 'El servicio no está entre los que ofrece el trabajador' using errcode = 'check_violation';
  end if;
  v_start := (p_terms ->> 'scheduledStart')::date;
  v_end := nullif(p_terms ->> 'scheduledEnd', '')::date;
  if v_start is null or v_start < v_today or v_start > v_today + 365 then
    raise exception 'La fecha de inicio debe estar entre hoy y un año' using errcode = 'check_violation';
  end if;
  if v_end is not null and (v_end < v_start or v_end > v_start + 365) then
    raise exception 'La fecha de fin debe ser posterior al inicio (máximo un año)' using errcode = 'check_violation';
  end if;
  if nullif(p_terms ->> 'priceAmount', '') is null
     or coalesce(p_terms ->> 'priceUnit', '') not in ('JORNAL', 'JORNADA', 'HORA', 'OBRA', 'SERVICIO') then
    raise exception 'Indica el precio y la modalidad de pago' using errcode = 'check_violation';
  end if;
  if char_length(btrim(coalesce(p_terms ->> 'description', ''))) not between 10 and 1000 then
    raise exception 'Describe el trabajo (10 a 1000 caracteres)' using errcode = 'check_violation';
  end if;

  insert into public.contract_terms (
    contract_id, version, proposed_by, proposer_role, service_id, description, scheduled_start, scheduled_end,
    parish_id, location_detail, price_amount, price_unit, conditions, content_hash,
    client_accepted_at, worker_accepted_at)
  values (
    p_contract.id, v_version, p_user, p_role, v_service, btrim(coalesce(p_terms ->> 'description', '')), v_start, v_end,
    private.parish_id_by_code(p_terms ->> 'parishCode'), nullif(btrim(coalesce(p_terms ->> 'locationDetail', '')), ''),
    round((p_terms ->> 'priceAmount')::numeric, 2), coalesce(p_terms ->> 'priceUnit', ''),
    nullif(btrim(coalesce(p_terms ->> 'conditions', '')), ''), repeat('0', 64),
    case when p_role = 'CLIENTE' then now() end, case when p_role = 'TRABAJADOR' then now() end)
  returning * into v_t;
  return v_t;
end;
$$;

-- -----------------------------------------------------------------------------
-- Casos de uso (los ejecuta el servidor en nombre del usuario autenticado)
-- -----------------------------------------------------------------------------

/* Primera propuesta de condiciones desde una conversación (cualquiera de las partes). */
create or replace function public.fn_contract_propose(
  p_user_id uuid,
  p_conversation_id uuid,
  p_terms jsonb,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_conv public.conversations;
  v_role text;
  v_worker public.worker_profiles;
  v_c public.contracts;
  v_t public.contract_terms;
begin
  perform private.require_chat_user(p_user_id);
  -- Bloquear la conversación serializa las propuestas simultáneas de ambas partes.
  select * into v_conv from public.conversations where id = p_conversation_id for update;
  v_role := case when found then private.conversation_role(p_conversation_id, p_user_id) end;
  if v_role is null then
    raise exception 'Conversación no encontrada' using errcode = 'no_data_found';
  end if;
  select * into v_worker from public.worker_profiles where id = v_conv.worker_id;
  if v_worker.user_id is null then
    raise exception 'El trabajador aún no activa su cuenta: podrá recibir propuestas cuando lo haga'
      using errcode = 'check_violation';
  end if;
  -- RN-14: un trabajador no habilitado no acepta contrataciones nuevas.
  if v_worker.status <> 'HABILITADO' then
    raise exception 'El trabajador no está habilitado para nuevas contrataciones' using errcode = 'check_violation';
  end if;
  if v_conv.client_blocked_at is not null or v_conv.worker_blocked_at is not null or v_conv.status = 'CERRADA' then
    raise exception 'La conversación está bloqueada' using errcode = 'insufficient_privilege';
  end if;
  -- Una propuesta vencida no cuenta como abierta.
  perform private.contract_apply_timeouts(c.id)
    from public.contracts c where c.conversation_id = p_conversation_id and c.status = 'PROPUESTA_ENVIADA';
  if exists (select 1 from public.contracts where conversation_id = p_conversation_id and status = 'PROPUESTA_ENVIADA') then
    raise exception 'Ya hay una propuesta abierta en esta conversación: respóndela o retírala primero'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if (select count(*) from public.contracts where created_by = p_user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Alcanzaste el máximo de propuestas nuevas por hoy. Inténtalo mañana.'
      using errcode = 'program_limit_exceeded';
  end if;

  insert into public.contracts (conversation_id, client_user_id, worker_id, created_by, expires_at)
  values (p_conversation_id, v_conv.client_user_id, v_conv.worker_id, p_user_id,
          now() + private.setting_days('contracts.proposal_ttl_days', 7))
  returning * into v_c;
  v_t := private.contract_insert_terms(v_c, p_user_id, v_role, p_terms);
  update public.contracts set current_terms_id = v_t.id where id = v_c.id returning * into v_c;

  perform private.contract_log(v_c.id, 'PROPUESTA', p_user_id, null, 'PROPUESTA_ENVIADA', v_t.version,
    jsonb_build_object('hash', v_t.content_hash));
  perform private.contract_announce(v_c, p_user_id,
    private.contract_party_name(v_c, v_role) || ' propuso condiciones de contratación (versión 1).',
    'Nueva propuesta de ' || private.contract_party_name(v_c, v_role), v_t.id);
  perform private.audit(p_user_id, 'CONTRACT_PROPOSED', 'contract', v_c.id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('version', v_t.version, 'hash', v_t.content_hash, 'conversationId', p_conversation_id));
  return v_c.id;
end;
$$;

/*
 * Contrapropuesta (en negociación) o modificación (ya contratada o en curso). Exige la versión
 * vigente como base: si otra parte la cambió mientras tanto, 409.
 */
create or replace function public.fn_contract_counter(
  p_user_id uuid,
  p_contract_id uuid,
  p_base_version integer,
  p_terms jsonb,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
  v_role text;
  v_current public.contract_terms;
  v_t public.contract_terms;
  v_blocked boolean;
  v_modification boolean;
begin
  v_c := private.contract_for_action(p_contract_id, p_user_id);
  v_role := private.contract_role(v_c, p_user_id);
  perform private.require_state(v_c.status <> 'EXPIRADA', 'La propuesta expiró sin respuesta: envía una nueva');
  perform private.require_state(v_c.status in ('PROPUESTA_ENVIADA', 'CONTRATADA', 'EN_CURSO'),
    'La contratación ya no admite cambios de condiciones');
  select * into v_current from public.contract_terms where id = v_c.current_terms_id;
  perform private.require_state(v_current.version = p_base_version,
    'Las condiciones cambiaron mientras tanto. Revisa la versión vigente.');
  select c.client_blocked_at is not null or c.worker_blocked_at is not null into v_blocked
  from public.conversations c where c.id = v_c.conversation_id;
  if v_blocked then
    raise exception 'La conversación está bloqueada' using errcode = 'insufficient_privilege';
  end if;
  v_modification := v_c.status <> 'PROPUESTA_ENVIADA';
  if not v_modification and (select status from public.worker_profiles where id = v_c.worker_id) <> 'HABILITADO' then
    raise exception 'El trabajador no está habilitado para nuevas contrataciones' using errcode = 'check_violation';
  end if;

  v_t := private.contract_insert_terms(v_c, p_user_id, v_role, p_terms);
  update public.contracts
    set current_terms_id = v_t.id, expires_at = now() + private.setting_days('contracts.proposal_ttl_days', 7)
    where id = v_c.id returning * into v_c;

  perform private.contract_log(v_c.id, case when v_modification then 'MODIFICACION_PROPUESTA' else 'CONTRAPROPUESTA' end,
    p_user_id, v_c.status, v_c.status, v_t.version, jsonb_build_object('hash', v_t.content_hash));
  perform private.contract_announce(v_c, p_user_id,
    private.contract_party_name(v_c, v_role)
      || case when v_modification then ' propuso modificar las condiciones acordadas (versión '
              else ' envió una contrapropuesta (versión ' end || v_t.version || ').',
    case when v_modification then 'Propuesta de modificación de ' else 'Contrapropuesta de ' end
      || private.contract_party_name(v_c, v_role), v_t.id);
  perform private.audit(p_user_id, case when v_modification then 'CONTRACT_MODIFICATION_PROPOSED' else 'CONTRACT_COUNTER_PROPOSED' end,
    'contract', v_c.id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('version', v_t.version, 'hash', v_t.content_hash));
  return v_t.version;
end;
$$;

/*
 * Acepta la versión vigente. Deben coincidir la versión Y el hash que vio el usuario (si no, 409).
 * Con la aceptación de ambas partes, la versión queda acordada (CONTRATADA o modificación aplicada).
 */
create or replace function public.fn_contract_accept(
  p_user_id uuid,
  p_contract_id uuid,
  p_version integer,
  p_content_hash text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns public.contract_status
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
  v_role text;
  v_t public.contract_terms;
  v_from public.contract_status;
  v_blocked boolean;
begin
  v_c := private.contract_for_action(p_contract_id, p_user_id);
  v_role := private.contract_role(v_c, p_user_id);
  v_from := v_c.status;
  perform private.require_state(v_c.status <> 'EXPIRADA', 'La propuesta expiró sin respuesta: envía una nueva');
  perform private.require_state(
    v_c.status = 'PROPUESTA_ENVIADA'
    or (v_c.status in ('CONTRATADA', 'EN_CURSO') and v_c.current_terms_id is distinct from v_c.agreed_terms_id),
    'No hay condiciones pendientes de aceptar');
  select * into v_t from public.contract_terms where id = v_c.current_terms_id;
  perform private.require_state(v_t.version = p_version and v_t.content_hash = lower(coalesce(p_content_hash, '')),
    'Las condiciones cambiaron mientras tanto. Revisa la versión vigente antes de aceptar.');
  perform private.require_state(
    (v_role = 'CLIENTE' and v_t.client_accepted_at is null) or (v_role = 'TRABAJADOR' and v_t.worker_accepted_at is null),
    'Ya aceptaste esta versión; falta la respuesta de la otra parte');
  select c.client_blocked_at is not null or c.worker_blocked_at is not null into v_blocked
  from public.conversations c where c.id = v_c.conversation_id;
  if v_blocked then
    raise exception 'La conversación está bloqueada' using errcode = 'insufficient_privilege';
  end if;
  if v_c.status = 'PROPUESTA_ENVIADA' and (select status from public.worker_profiles where id = v_c.worker_id) <> 'HABILITADO' then
    raise exception 'El trabajador no está habilitado para nuevas contrataciones' using errcode = 'check_violation';
  end if;

  update public.contract_terms
    set client_accepted_at = coalesce(client_accepted_at, case when v_role = 'CLIENTE' then now() end),
        worker_accepted_at = coalesce(worker_accepted_at, case when v_role = 'TRABAJADOR' then now() end)
    where id = v_t.id returning * into v_t;

  update public.contracts
    set agreed_terms_id = v_t.id, agreed_at = now(), expires_at = null,
        status = case when status = 'PROPUESTA_ENVIADA' then 'CONTRATADA'::public.contract_status else status end
    where id = v_c.id returning * into v_c;

  perform private.contract_log(v_c.id, case when v_from = 'PROPUESTA_ENVIADA' then 'ACEPTADA' else 'MODIFICACION_ACEPTADA' end,
    p_user_id, v_from, v_c.status, v_t.version, jsonb_build_object('hash', v_t.content_hash));
  perform private.contract_announce(v_c, p_user_id,
    private.contract_party_name(v_c, v_role)
      || case when v_from = 'PROPUESTA_ENVIADA'
              then ' aceptó las condiciones (versión ' || v_t.version || '). La contratación quedó confirmada.'
              else ' aceptó la modificación (versión ' || v_t.version || '). Son las nuevas condiciones acordadas.' end,
    case when v_from = 'PROPUESTA_ENVIADA' then 'Contratación confirmada' else 'Modificación aceptada' end, v_t.id);
  perform private.audit(p_user_id, case when v_from = 'PROPUESTA_ENVIADA' then 'CONTRACT_ACCEPTED' else 'CONTRACT_MODIFICATION_ACCEPTED' end,
    'contract', v_c.id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('version', v_t.version, 'hash', v_t.content_hash));
  return v_c.status;
end;
$$;

/*
 * Responde a la versión vigente sin aceptarla:
 *   REJECT   — la contraparte la rechaza (la negociación termina; una modificación se descarta).
 *   WITHDRAW — quien la envió la retira (la propuesta se cancela; una modificación se descarta).
 */
create or replace function public.fn_contract_decline(
  p_user_id uuid,
  p_contract_id uuid,
  p_version integer,
  p_mode text,
  p_note text default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns public.contract_status
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
  v_role text;
  v_t public.contract_terms;
  v_from public.contract_status;
  v_name text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_mode not in ('REJECT', 'WITHDRAW') then
    raise exception 'Acción no válida' using errcode = 'check_violation';
  end if;
  v_c := private.contract_for_action(p_contract_id, p_user_id);
  v_role := private.contract_role(v_c, p_user_id);
  v_from := v_c.status;
  perform private.require_state(v_c.status <> 'EXPIRADA', 'La propuesta expiró sin respuesta: envía una nueva');
  perform private.require_state(
    v_c.status = 'PROPUESTA_ENVIADA'
    or (v_c.status in ('CONTRATADA', 'EN_CURSO') and v_c.current_terms_id is distinct from v_c.agreed_terms_id),
    'No hay condiciones pendientes de respuesta');
  select * into v_t from public.contract_terms where id = v_c.current_terms_id;
  perform private.require_state(v_t.version = p_version,
    'Las condiciones cambiaron mientras tanto. Revisa la versión vigente.');
  if p_mode = 'REJECT' then
    perform private.require_state(v_t.proposed_by <> p_user_id, 'No puedes rechazar tu propia propuesta: retírala');
  else
    perform private.require_state(v_t.proposed_by = p_user_id, 'Solo quien envió la propuesta puede retirarla');
  end if;

  update public.contract_terms
    set rejected_at = case when p_mode = 'REJECT' then now() end,
        rejected_by = case when p_mode = 'REJECT' then p_user_id end,
        withdrawn_at = case when p_mode = 'WITHDRAW' then now() end,
        response_note = v_note
    where id = v_t.id;

  if v_from = 'PROPUESTA_ENVIADA' then
    update public.contracts
      set status = case when p_mode = 'REJECT' then 'RECHAZADA'::public.contract_status else 'CANCELADA'::public.contract_status end,
          expires_at = null,
          cancelled_at = case when p_mode = 'WITHDRAW' then now() end,
          cancelled_by = case when p_mode = 'WITHDRAW' then p_user_id end,
          cancel_reason = case when p_mode = 'WITHDRAW' then coalesce(v_note, 'Propuesta retirada') end
      where id = v_c.id returning * into v_c;
  else
    update public.contracts set current_terms_id = agreed_terms_id, expires_at = null where id = v_c.id returning * into v_c;
  end if;

  v_name := private.contract_party_name(v_c, v_role);
  perform private.contract_log(v_c.id,
    case when v_from = 'PROPUESTA_ENVIADA' then (case when p_mode = 'REJECT' then 'RECHAZADA' else 'RETIRADA' end)
         else (case when p_mode = 'REJECT' then 'MODIFICACION_RECHAZADA' else 'MODIFICACION_RETIRADA' end) end,
    p_user_id, v_from, v_c.status, v_t.version,
    case when v_note is null then '{}'::jsonb else jsonb_build_object('note', v_note) end);
  perform private.contract_announce(v_c, p_user_id,
    v_name || case
      when v_from = 'PROPUESTA_ENVIADA' and p_mode = 'REJECT' then ' rechazó la propuesta (versión ' || v_t.version || ').'
      when v_from = 'PROPUESTA_ENVIADA' then ' retiró su propuesta (versión ' || v_t.version || ').'
      when p_mode = 'REJECT' then ' rechazó la modificación (versión ' || v_t.version || '). Siguen vigentes las condiciones acordadas.'
      else ' retiró la modificación propuesta (versión ' || v_t.version || ').' end
      || coalesce(' Motivo: ' || v_note, ''),
    case when p_mode = 'REJECT' then 'Propuesta rechazada' else 'Propuesta retirada' end, v_t.id);
  perform private.audit(p_user_id, case when p_mode = 'REJECT' then 'CONTRACT_REJECTED' else 'CONTRACT_WITHDRAWN' end,
    'contract', v_c.id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('version', v_t.version, 'modification', v_from <> 'PROPUESTA_ENVIADA'));
  return v_c.status;
end;
$$;

/* Cancelación de una contratación confirmada que aún no empezó (motivo obligatorio). */
create or replace function public.fn_contract_cancel(
  p_user_id uuid,
  p_contract_id uuid,
  p_reason text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns public.contract_status
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
  v_role text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v_c := private.contract_for_action(p_contract_id, p_user_id);
  v_role := private.contract_role(v_c, p_user_id);
  perform private.require_state(v_c.status = 'CONTRATADA',
    'Solo se cancela una contratación confirmada que aún no empezó');
  if char_length(v_reason) not between 10 and 500 then
    raise exception 'Explica el motivo de la cancelación (10 a 500 caracteres)' using errcode = 'check_violation';
  end if;

  update public.contracts
    set status = 'CANCELADA', cancelled_at = now(), cancelled_by = p_user_id, cancel_reason = v_reason,
        expires_at = null, current_terms_id = agreed_terms_id
    where id = v_c.id returning * into v_c;
  perform private.contract_log(v_c.id, 'CANCELADA', p_user_id, 'CONTRATADA', 'CANCELADA', null,
    jsonb_build_object('reason', v_reason));
  perform private.contract_announce(v_c, p_user_id,
    private.contract_party_name(v_c, v_role) || ' canceló la contratación. Motivo: ' || v_reason,
    'Contratación cancelada', null);
  perform private.audit(p_user_id, 'CONTRACT_CANCELLED', 'contract', v_c.id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('role', v_role));
  return v_c.status;
end;
$$;

/*
 * Avance de la ejecución:
 *   START    — el trabajador marca el inicio (CONTRATADA → EN_CURSO).
 *   COMPLETE — el trabajador marca el fin; el cliente tiene N días para confirmar (→ FINALIZACION_PENDIENTE).
 *   CONFIRM  — el cliente confirma la finalización (FINALIZACION_PENDIENTE o EN_CURSO → FINALIZADA).
 */
create or replace function public.fn_contract_progress(
  p_user_id uuid,
  p_contract_id uuid,
  p_step text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns public.contract_status
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
  v_role text;
  v_from public.contract_status;
  v_name text;
begin
  v_c := private.contract_for_action(p_contract_id, p_user_id);
  v_role := private.contract_role(v_c, p_user_id);
  v_from := v_c.status;
  v_name := private.contract_party_name(v_c, v_role);

  if p_step = 'START' then
    perform private.require_state(v_role = 'TRABAJADOR', 'Solo el trabajador marca el inicio del trabajo');
    perform private.require_state(v_c.status = 'CONTRATADA', 'La contratación no está lista para iniciar');
    update public.contracts set status = 'EN_CURSO', started_at = now() where id = v_c.id returning * into v_c;
    perform private.contract_log(v_c.id, 'INICIADA', p_user_id, v_from, v_c.status, null);
    perform private.contract_announce(v_c, p_user_id, v_name || ' marcó el inicio del trabajo.', 'Trabajo iniciado', null);
  elsif p_step = 'COMPLETE' then
    perform private.require_state(v_role = 'TRABAJADOR', 'Solo el trabajador marca el trabajo como terminado');
    perform private.require_state(v_c.status = 'EN_CURSO', 'El trabajo no está en curso');
    update public.contracts
      set status = 'FINALIZACION_PENDIENTE', completion_requested_at = now(),
          confirm_due_at = now() + private.setting_days('contracts.auto_confirm_days', 7)
      where id = v_c.id returning * into v_c;
    perform private.contract_log(v_c.id, 'FINALIZACION_SOLICITADA', p_user_id, v_from, v_c.status, null);
    perform private.contract_announce(v_c, p_user_id,
      v_name || ' marcó el trabajo como terminado. Confirma la finalización o abre una disputa si hay un problema.',
      'Confirma la finalización del trabajo', null);
  elsif p_step = 'CONFIRM' then
    perform private.require_state(v_role = 'CLIENTE', 'Solo el cliente confirma la finalización');
    perform private.require_state(v_c.status in ('FINALIZACION_PENDIENTE', 'EN_CURSO'), 'El trabajo no está por finalizar');
    v_c := private.contract_finalize(v_c.id, false);
    perform private.contract_log(v_c.id, 'FINALIZADA', p_user_id, v_from, 'FINALIZADA', null);
    perform private.contract_announce(v_c, p_user_id, v_name || ' confirmó que el trabajo terminó. Contratación finalizada.',
      'Contratación finalizada', null);
  else
    raise exception 'Acción no válida' using errcode = 'check_violation';
  end if;

  perform private.audit(p_user_id,
    case p_step when 'START' then 'CONTRACT_STARTED' when 'COMPLETE' then 'CONTRACT_COMPLETION_REQUESTED'
                else 'CONTRACT_COMPLETED' end,
    'contract', v_c.id::text, p_ip, p_user_agent, p_request_id, jsonb_build_object('from', v_from, 'to', v_c.status));
  return v_c.status;
end;
$$;

/*
 * Disputa: congela la contratación (se pausa la confirmación automática) y crea una denuncia
 * CONTRACT para la bandeja del GAD (Fase 8). Quien la abrió puede retirarla.
 */
create or replace function public.fn_contract_dispute(
  p_user_id uuid,
  p_contract_id uuid,
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
  v_c public.contracts;
  v_role text;
  v_from public.contract_status;
  v_other uuid;
  v_report uuid;
  v_description text := btrim(coalesce(p_description, ''));
begin
  v_c := private.contract_for_action(p_contract_id, p_user_id);
  v_role := private.contract_role(v_c, p_user_id);
  v_from := v_c.status;
  perform private.require_state(v_c.status in ('CONTRATADA', 'EN_CURSO', 'FINALIZACION_PENDIENTE'),
    'Esta contratación no admite una disputa');
  if not exists (select 1 from public.report_reasons where code = p_reason_code and target_type = 'CONTRACT' and active) then
    raise exception 'Motivo no válido' using errcode = 'check_violation';
  end if;
  if char_length(v_description) not between 20 and 1000 then
    raise exception 'Describe el problema (20 a 1000 caracteres)' using errcode = 'check_violation';
  end if;
  v_other := case when v_role = 'CLIENTE' then (select user_id from public.worker_profiles where id = v_c.worker_id)
                  else v_c.client_user_id end;

  insert into public.reports (reporter_id, target_type, target_id, reported_user_id, conversation_id, reason_code, description)
  values (p_user_id, 'CONTRACT', v_c.id::text, v_other, v_c.conversation_id, p_reason_code, v_description)
  returning id into v_report;

  update public.contracts
    set status = 'EN_DISPUTA', status_before_dispute = v_from, disputed_at = now(), disputed_by = p_user_id,
        dispute_report_id = v_report, confirm_due_at = null
    where id = v_c.id returning * into v_c;
  perform private.contract_log(v_c.id, 'DISPUTA_ABIERTA', p_user_id, v_from, 'EN_DISPUTA', null,
    jsonb_build_object('reason', p_reason_code, 'reportId', v_report));
  perform private.contract_announce(v_c, p_user_id,
    private.contract_party_name(v_c, v_role) || ' abrió una disputa. El GAD revisará el caso.',
    'Se abrió una disputa', null);
  perform private.audit(p_user_id, 'CONTRACT_DISPUTED', 'contract', v_c.id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('reason', p_reason_code, 'reportId', v_report));
  perform private.audit(p_user_id, 'REPORT_CREATED', 'report', v_report::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('targetType', 'CONTRACT', 'targetId', v_c.id, 'reason', p_reason_code));
  return v_report;
end;
$$;

create or replace function public.fn_contract_withdraw_dispute(
  p_user_id uuid,
  p_contract_id uuid,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns public.contract_status
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
  v_role text;
begin
  v_c := private.contract_for_action(p_contract_id, p_user_id);
  v_role := private.contract_role(v_c, p_user_id);
  perform private.require_state(v_c.status = 'EN_DISPUTA', 'La contratación no está en disputa');
  perform private.require_state(v_c.disputed_by = p_user_id, 'Solo quien abrió la disputa puede retirarla');

  update public.reports set status = 'DESCARTADA'
    where id = v_c.dispute_report_id and status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA');
  update public.contracts
    set status = status_before_dispute, status_before_dispute = null,
        confirm_due_at = case when status_before_dispute = 'FINALIZACION_PENDIENTE'
                              then now() + private.setting_days('contracts.auto_confirm_days', 7) end
    where id = v_c.id returning * into v_c;
  perform private.contract_log(v_c.id, 'DISPUTA_RETIRADA', p_user_id, 'EN_DISPUTA', v_c.status, null);
  perform private.contract_announce(v_c, p_user_id,
    private.contract_party_name(v_c, v_role) || ' retiró la disputa. La contratación continúa.', 'Disputa retirada', null);
  perform private.audit(p_user_id, 'CONTRACT_DISPUTE_WITHDRAWN', 'contract', v_c.id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('to', v_c.status));
  return v_c.status;
end;
$$;

/* Resolución de una disputa por el personal del GAD (la interfaz llega con la bandeja de la Fase 8). */
create or replace function public.fn_admin_resolve_contract_dispute(
  p_actor_id uuid,
  p_contract_id uuid,
  p_outcome public.contract_status,
  p_note text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns public.contract_status
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
  v_note text := btrim(coalesce(p_note, ''));
begin
  perform private.require_permission(p_actor_id, 'report.manage');
  if p_outcome not in ('FINALIZADA', 'CANCELADA') then
    raise exception 'La disputa se resuelve como FINALIZADA o CANCELADA' using errcode = 'check_violation';
  end if;
  if char_length(v_note) not between 10 and 1000 then
    raise exception 'Registra la justificación de la resolución (10 a 1000 caracteres)' using errcode = 'check_violation';
  end if;
  select * into v_c from public.contracts where id = p_contract_id for update;
  if not found then
    raise exception 'Contratación no encontrada' using errcode = 'no_data_found';
  end if;
  perform private.require_state(v_c.status = 'EN_DISPUTA', 'La contratación no está en disputa');

  if p_outcome = 'FINALIZADA' then
    v_c := private.contract_finalize(v_c.id, false);
  else
    update public.contracts
      set status = 'CANCELADA', cancelled_at = now(), cancelled_by = p_actor_id, cancel_reason = left(v_note, 500)
      where id = v_c.id returning * into v_c;
  end if;
  update public.reports set status = 'RESUELTA' where id = v_c.dispute_report_id;
  perform private.contract_log(v_c.id, 'DISPUTA_RESUELTA', p_actor_id, 'EN_DISPUTA', v_c.status, null,
    jsonb_build_object('outcome', p_outcome));
  perform private.contract_announce(v_c, null,
    'El GAD resolvió la disputa: la contratación quedó ' || case when p_outcome = 'FINALIZADA' then 'finalizada.' else 'cancelada.' end,
    'El GAD resolvió la disputa', null);
  perform private.audit(p_actor_id, 'CONTRACT_DISPUTE_RESOLVED', 'contract', v_c.id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('outcome', p_outcome, 'reportId', v_c.dispute_report_id));
  return v_c.status;
end;
$$;

-- -----------------------------------------------------------------------------
-- Consultas
-- -----------------------------------------------------------------------------

-- Aplica los plazos vencidos de las contrataciones de un usuario (antes de listarlas).
create or replace function private.contract_timeouts_for_user(p_user uuid)
returns void
language sql
set search_path = ''
as $$
  select count(private.contract_apply_timeouts(c.id))
  from public.contracts c
  left join public.worker_profiles w on w.id = c.worker_id
  where (c.client_user_id = p_user or w.user_id = p_user)
    and ((c.expires_at is not null and c.expires_at <= now())
         or (c.status = 'FINALIZACION_PENDIENTE' and c.confirm_due_at <= now()));
$$;

/*
 * «Mis contrataciones» (como cliente y como trabajador). p_scope: ACTIVAS | HISTORIAL | NULL (todas).
 * p_conversation_id limita a las de una conversación (banda del chat).
 */
create or replace function public.fn_list_contracts(
  p_user_id uuid,
  p_scope text default null,
  p_conversation_id uuid default null
)
returns table (
  id uuid,
  conversation_id uuid,
  my_role text,
  counterpart_name text,
  worker_id uuid,
  status public.contract_status,
  needs_my_action boolean,
  pending_modification boolean,
  current_version smallint,
  description text,
  service_name text,
  scheduled_start date,
  price_amount numeric,
  price_unit text,
  expires_at timestamptz,
  confirm_due_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_chat_user(p_user_id);
  perform private.contract_timeouts_for_user(p_user_id);
  return query
  with mias as (
    select c.*, case when c.client_user_id = p_user_id then 'CLIENTE' else 'TRABAJADOR' end as rol,
           w.public_display_name as worker_name
    from public.contracts c
    join public.worker_profiles w on w.id = c.worker_id
    where (c.client_user_id = p_user_id or w.user_id = p_user_id)
      and (p_conversation_id is null or c.conversation_id = p_conversation_id)
      and (p_scope is null
           or (p_scope = 'ACTIVAS' and c.status in ('PROPUESTA_ENVIADA', 'CONTRATADA', 'EN_CURSO', 'FINALIZACION_PENDIENTE', 'EN_DISPUTA'))
           or (p_scope = 'HISTORIAL' and c.status in ('FINALIZADA', 'CANCELADA', 'RECHAZADA', 'EXPIRADA')))
  )
  select m.id, m.conversation_id, m.rol,
         case when m.rol = 'CLIENTE' then m.worker_name
              else (select private.short_name(coalesce(cp.full_name, u.display_name))
                    from public.users u left join public.client_profiles cp on cp.user_id = u.id
                    where u.id = m.client_user_id) end,
         m.worker_id, m.status,
         case
           when m.status = 'PROPUESTA_ENVIADA' or (m.status in ('CONTRATADA', 'EN_CURSO') and m.current_terms_id is distinct from m.agreed_terms_id)
             then (case when m.rol = 'CLIENTE' then t.client_accepted_at else t.worker_accepted_at end) is null
           when m.status in ('CONTRATADA', 'EN_CURSO') then m.rol = 'TRABAJADOR'
           when m.status = 'FINALIZACION_PENDIENTE' then m.rol = 'CLIENTE'
           else false
         end,
         m.status in ('CONTRATADA', 'EN_CURSO') and m.current_terms_id is distinct from m.agreed_terms_id,
         t.version, t.description, s.name, t.scheduled_start, t.price_amount, t.price_unit,
         m.expires_at, m.confirm_due_at, m.created_at, m.updated_at
  from mias m
  join public.contract_terms t on t.id = m.current_terms_id
  left join public.services s on s.id = t.service_id
  order by m.updated_at desc
  limit 200;
end;
$$;

/* Detalle con todas las versiones y el historial. Marca como leídas sus notificaciones. */
create or replace function public.fn_get_contract(p_user_id uuid, p_contract_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
  v_role text;
  v_other text;
begin
  perform private.require_chat_user(p_user_id);
  select * into v_c from public.contracts where id = p_contract_id;
  v_role := case when found then private.contract_role(v_c, p_user_id) end;
  if v_role is null then
    raise exception 'Contratación no encontrada' using errcode = 'no_data_found';
  end if;
  if (v_c.expires_at is not null and v_c.expires_at <= now())
     or (v_c.status = 'FINALIZACION_PENDIENTE' and v_c.confirm_due_at <= now()) then
    v_c := private.contract_apply_timeouts(p_contract_id);
  end if;
  v_other := case when v_role = 'CLIENTE' then 'TRABAJADOR' else 'CLIENTE' end;

  update public.notifications set read_at = now()
    where user_id = p_user_id and dedupe_key = 'contract:' || p_contract_id and read_at is null;

  return jsonb_build_object(
    'id', v_c.id,
    'conversationId', v_c.conversation_id,
    'workerId', v_c.worker_id,
    'myRole', v_role,
    'counterpartName', private.contract_party_name(v_c, v_other),
    'status', v_c.status,
    'statusBeforeDispute', v_c.status_before_dispute,
    'currentTermsId', v_c.current_terms_id,
    'agreedTermsId', v_c.agreed_terms_id,
    'agreedAt', v_c.agreed_at,
    'startedAt', v_c.started_at,
    'completionRequestedAt', v_c.completion_requested_at,
    'completedAt', v_c.completed_at,
    'autoConfirmed', v_c.auto_confirmed,
    'cancelledAt', v_c.cancelled_at,
    'cancelledByMe', v_c.cancelled_by = p_user_id,
    'cancelReason', v_c.cancel_reason,
    'disputedAt', v_c.disputed_at,
    'disputedByMe', v_c.disputed_by = p_user_id,
    'expiresAt', v_c.expires_at,
    'confirmDueAt', v_c.confirm_due_at,
    'createdAt', v_c.created_at,
    'updatedAt', v_c.updated_at,
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'version', t.version,
        'proposedByMe', t.proposed_by = p_user_id,
        'proposerRole', t.proposer_role,
        'serviceId', t.service_id,
        'serviceName', s.name,
        'description', t.description,
        'scheduledStart', t.scheduled_start,
        'scheduledEnd', t.scheduled_end,
        'parishCode', p.code,
        'parishName', p.name,
        'locationDetail', t.location_detail,
        'priceAmount', t.price_amount,
        'priceUnit', t.price_unit,
        'conditions', t.conditions,
        'contentHash', t.content_hash,
        'clientAcceptedAt', t.client_accepted_at,
        'workerAcceptedAt', t.worker_accepted_at,
        'rejectedAt', t.rejected_at,
        'withdrawnAt', t.withdrawn_at,
        'responseNote', t.response_note,
        'createdAt', t.created_at) order by t.version desc)
      from public.contract_terms t
      left join public.services s on s.id = t.service_id
      left join public.parishes p on p.id = t.parish_id
      where t.contract_id = v_c.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'event', e.event,
        'byMe', e.actor_id = p_user_id,
        'actorRole', case when e.actor_id is null then 'SISTEMA'
                          when e.actor_id = v_c.client_user_id then 'CLIENTE'
                          when e.actor_id = (select w.user_id from public.worker_profiles w where w.id = v_c.worker_id) then 'TRABAJADOR'
                          else 'GAD' end,
        'fromStatus', e.from_status,
        'toStatus', e.to_status,
        'termsVersion', e.terms_version,
        'createdAt', e.created_at) order by e.id)
      from public.contract_events e where e.contract_id = v_c.id), '[]'::jsonb)
  );
end;
$$;

/* Datos para el formulario de condiciones: servicios que ofrece el trabajador de la conversación. */
create or replace function public.fn_contract_form_options(p_user_id uuid, p_conversation_id uuid)
returns table (service_id uuid, service_name text, price_unit text, is_primary boolean)
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.require_chat_user(p_user_id);
  if private.conversation_role(p_conversation_id, p_user_id) is null then
    raise exception 'Conversación no encontrada' using errcode = 'no_data_found';
  end if;
  return query
  select s.id, s.name, coalesce(ws.price_unit, s.price_unit), ws.is_primary
  from public.conversations c
  join public.worker_services ws on ws.worker_id = c.worker_id
  join public.services s on s.id = ws.service_id
  where c.id = p_conversation_id
  order by ws.is_primary desc, s.name;
end;
$$;

/* Tarea programada: aplica plazos vencidos en lote (varias ejecuciones concurrentes no chocan). */
create or replace function public.fn_run_contract_maintenance(p_limit integer default 500)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in
    select c.id from public.contracts c
    where (c.expires_at is not null and c.expires_at <= now())
       or (c.status = 'FINALIZACION_PENDIENTE' and c.confirm_due_at <= now())
    order by coalesce(c.expires_at, c.confirm_due_at)
    limit least(greatest(coalesce(p_limit, 500), 1), 5000)
    for update skip locked
  loop
    perform private.contract_apply_timeouts(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Realtime: la contratación usa el canal de su conversación (tarjetas de sistema).
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- RLS y privilegios
-- -----------------------------------------------------------------------------

alter table public.app_settings enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_terms enable row level security;
alter table public.contract_events enable row level security;
-- Sin políticas para anon/authenticated: todo el acceso pasa por el servidor.

revoke all on public.app_settings, public.contracts, public.contract_terms, public.contract_events from anon, authenticated;

grant select on public.app_settings to service_role;
grant select, insert, update on public.contracts, public.contract_terms to service_role;
grant select, insert on public.contract_events to service_role;
revoke delete, truncate on public.contracts, public.contract_terms, public.contract_events from service_role;

revoke execute on function
  private.setting_days(text, integer),
  private.contract_terms_payload(public.contract_terms),
  private.contract_terms_hash(public.contract_terms),
  private.contract_terms_guard(),
  private.contract_transition_allowed(public.contract_status, public.contract_status),
  private.contracts_guard(),
  private.contract_role(public.contracts, uuid),
  private.contract_party_name(public.contracts, text),
  private.contract_log(uuid, text, uuid, public.contract_status, public.contract_status, smallint, jsonb),
  private.contract_announce(public.contracts, uuid, text, text, uuid),
  private.contract_finalize(uuid, boolean),
  private.contract_apply_timeouts(uuid),
  private.contract_for_action(uuid, uuid),
  private.require_state(boolean, text),
  private.contract_insert_terms(public.contracts, uuid, text, jsonb),
  private.contract_timeouts_for_user(uuid),
  public.fn_list_messages(uuid, uuid, bigint, integer),
  public.fn_contract_propose(uuid, uuid, jsonb, inet, text, text),
  public.fn_contract_counter(uuid, uuid, integer, jsonb, inet, text, text),
  public.fn_contract_accept(uuid, uuid, integer, text, inet, text, text),
  public.fn_contract_decline(uuid, uuid, integer, text, text, inet, text, text),
  public.fn_contract_cancel(uuid, uuid, text, inet, text, text),
  public.fn_contract_progress(uuid, uuid, text, inet, text, text),
  public.fn_contract_dispute(uuid, uuid, text, text, inet, text, text),
  public.fn_contract_withdraw_dispute(uuid, uuid, inet, text, text),
  public.fn_admin_resolve_contract_dispute(uuid, uuid, public.contract_status, text, inet, text, text),
  public.fn_list_contracts(uuid, text, uuid),
  public.fn_get_contract(uuid, uuid),
  public.fn_contract_form_options(uuid, uuid),
  public.fn_run_contract_maintenance(integer)
  from public, anon, authenticated;

grant execute on function
  private.setting_days(text, integer),
  private.contract_terms_payload(public.contract_terms),
  private.contract_terms_hash(public.contract_terms),
  private.contract_transition_allowed(public.contract_status, public.contract_status),
  private.contract_role(public.contracts, uuid),
  private.contract_party_name(public.contracts, text),
  private.contract_log(uuid, text, uuid, public.contract_status, public.contract_status, smallint, jsonb),
  private.contract_announce(public.contracts, uuid, text, text, uuid),
  private.contract_finalize(uuid, boolean),
  private.contract_apply_timeouts(uuid),
  private.contract_for_action(uuid, uuid),
  private.require_state(boolean, text),
  private.contract_insert_terms(public.contracts, uuid, text, jsonb),
  private.contract_timeouts_for_user(uuid),
  public.fn_list_messages(uuid, uuid, bigint, integer),
  public.fn_contract_propose(uuid, uuid, jsonb, inet, text, text),
  public.fn_contract_counter(uuid, uuid, integer, jsonb, inet, text, text),
  public.fn_contract_accept(uuid, uuid, integer, text, inet, text, text),
  public.fn_contract_decline(uuid, uuid, integer, text, text, inet, text, text),
  public.fn_contract_cancel(uuid, uuid, text, inet, text, text),
  public.fn_contract_progress(uuid, uuid, text, inet, text, text),
  public.fn_contract_dispute(uuid, uuid, text, text, inet, text, text),
  public.fn_contract_withdraw_dispute(uuid, uuid, inet, text, text),
  public.fn_admin_resolve_contract_dispute(uuid, uuid, public.contract_status, text, inet, text, text),
  public.fn_list_contracts(uuid, text, uuid),
  public.fn_get_contract(uuid, uuid),
  public.fn_contract_form_options(uuid, uuid),
  public.fn_run_contract_maintenance(integer)
  to service_role;

-- -----------------------------------------------------------------------------
-- Tarea programada (pg_cron): avisos de expiración y confirmación automática cada 15 minutos.
-- Los plazos se aplican igual al leer, así que la corrección no depende de la tarea.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('acolita-contratos-plazos', '*/15 * * * *', 'select public.fn_run_contract_maintenance()');
  end if;
end;
$$;
