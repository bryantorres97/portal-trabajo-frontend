-- =============================================================================
-- Fase 5 — Chat cliente ↔ trabajador, notificaciones in-app, outbox de push y
-- punto de enganche de denuncias (Fase 8).
-- Detalle: docs/phases/fase-05-chat.md · ADR-004 (Realtime con JWT propio) · ADR-010 (solo chat)
--
-- Modelo de acceso:
--   * Toda lectura y escritura del chat pasa por funciones `fn_*` que ejecuta el servidor
--     (service_role) y que verifican que el usuario sea parte de la conversación.
--   * El navegador solo se SUSCRIBE a canales privados de Realtime (Broadcast) con un JWT
--     corto emitido por el servidor (iss = 'acolita', sub = users.id). RLS sobre
--     realtime.messages permite leer `conversation:{id}` a sus dos partes y `user:{id}` a su dueño.
--     Nadie puede publicar desde el navegador (sin política INSERT).
--   * El personal del GAD no tiene acceso al contenido (RN-09): llega en la Fase 8, con denuncia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Conversaciones: exactamente un cliente y un trabajador (estado de lectura y bloqueo por parte)
-- -----------------------------------------------------------------------------

create type public.conversation_status as enum ('ACTIVA', 'BLOQUEADA', 'CERRADA');

create table public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  client_user_id        uuid not null references public.users (id),
  worker_id             uuid not null references public.worker_profiles (id),
  status                public.conversation_status not null default 'ACTIVA',
  client_last_read_id   bigint,
  worker_last_read_id   bigint,
  client_blocked_at     timestamptz,
  worker_blocked_at     timestamptz,
  last_message_id       bigint,
  last_message_at       timestamptz,
  last_message_preview  text,
  last_sender_id        uuid references public.users (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint conversations_pair_key unique (client_user_id, worker_id),
  constraint conversations_preview_len check (last_message_preview is null or char_length(last_message_preview) <= 140)
);

comment on table public.conversations is
  'Conversación 1:1 cliente ↔ trabajador. El trabajador participa con worker_profiles.user_id (puede vincular su cuenta después).';

create index conversations_client_idx on public.conversations (client_user_id, last_message_at desc nulls last);
create index conversations_worker_idx on public.conversations (worker_id, last_message_at desc nulls last);
create index conversations_last_sender_idx on public.conversations (last_sender_id);

create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Mensajes: el contenido no se modifica ni se borra; moderar = ocultar (Fase 8)
-- -----------------------------------------------------------------------------

create table public.messages (
  id                 bigint generated always as identity primary key,
  conversation_id    uuid not null references public.conversations (id) on delete cascade,
  sender_id          uuid not null references public.users (id),
  kind               text not null default 'TEXT',
  body               text not null,
  client_message_id  uuid,
  hidden_at          timestamptz,
  hidden_by          uuid references public.users (id),
  hidden_reason      text,
  created_at         timestamptz not null default now(),
  constraint messages_kind check (kind in ('TEXT', 'SYSTEM')),
  constraint messages_body_len check (char_length(body) between 1 and 2000),
  constraint messages_hidden_reason_len check (hidden_reason is null or char_length(hidden_reason) <= 500),
  -- Idempotencia: reintentar el mismo envío no duplica el mensaje.
  constraint messages_idempotency_key unique (sender_id, client_message_id)
);

create index messages_conversation_idx on public.messages (conversation_id, id desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);
create index messages_hidden_by_idx on public.messages (hidden_by);

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
     or new.kind is distinct from old.kind or new.client_message_id is distinct from old.client_message_id then
    raise exception 'El contenido de un mensaje no se modifica' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger messages_guard before update or delete on public.messages
  for each row execute function private.messages_guard();

-- -----------------------------------------------------------------------------
-- Notificaciones in-app, dispositivos y outbox de push (FCM)
-- -----------------------------------------------------------------------------

create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users (id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint notifications_type_format check (type ~ '^[A-Z][A-Z_]*$'),
  constraint notifications_title_len check (char_length(title) between 1 and 120),
  constraint notifications_body_len check (body is null or char_length(body) <= 300),
  constraint notifications_link_format check (link is null or (link ~ '^/[^/\\]' and char_length(link) <= 300))
);

create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);
-- Una sola notificación NO leída por clave (p. ej. una por conversación, no una por mensaje).
create unique index notifications_dedupe_key on public.notifications (user_id, dedupe_key)
  where read_at is null and dedupe_key is not null;

create table public.device_tokens (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.users (id) on delete cascade,
  platform      text not null,
  token         text not null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  disabled_at   timestamptz,
  constraint device_tokens_token_key unique (token),
  constraint device_tokens_platform check (platform in ('WEB', 'ANDROID', 'IOS')),
  constraint device_tokens_token_len check (char_length(token) between 20 and 4096)
);

create index device_tokens_user_idx on public.device_tokens (user_id) where disabled_at is null;

create table public.notification_outbox (
  id               bigint generated always as identity primary key,
  event            text not null,
  recipient_id     uuid not null references public.users (id) on delete cascade,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'PENDIENTE',
  attempts         smallint not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  constraint notification_outbox_status check (status in ('PENDIENTE', 'ENVIADA', 'FALLIDA', 'DESCARTADA')),
  constraint notification_outbox_event_format check (event ~ '^[A-Z][A-Z_]*$'),
  constraint notification_outbox_error_len check (last_error is null or char_length(last_error) <= 500)
);

create index notification_outbox_pending_idx on public.notification_outbox (next_attempt_at) where status = 'PENDIENTE';
create index notification_outbox_recipient_idx on public.notification_outbox (recipient_id);

-- -----------------------------------------------------------------------------
-- Denuncias: punto de enganche mínimo (la Fase 8 agrega bandeja, evidencia y resolución)
-- -----------------------------------------------------------------------------

create type public.report_status as enum (
  'ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA', 'RESUELTA', 'DESCARTADA'
);

create table public.report_reasons (
  code         text primary key,
  target_type  text not null,
  label        text not null,
  severity     smallint not null default 2,
  sort_order   smallint not null default 0,
  active       boolean not null default true,
  constraint report_reasons_code_format check (code ~ '^[A-Z][A-Z_]*$'),
  constraint report_reasons_target check (target_type in ('WORKER', 'CLIENT', 'REVIEW', 'MESSAGE', 'CONVERSATION', 'CONTRACT')),
  constraint report_reasons_severity check (severity between 1 and 3)
);

insert into public.report_reasons (code, target_type, label, severity, sort_order) values
  ('MENSAJE_ACOSO', 'MESSAGE', 'Acoso, amenazas o intimidación', 3, 1),
  ('MENSAJE_OFENSIVO', 'MESSAGE', 'Lenguaje ofensivo o discriminatorio', 2, 2),
  ('MENSAJE_FRAUDE', 'MESSAGE', 'Intento de estafa o cobro indebido', 3, 3),
  ('MENSAJE_SPAM', 'MESSAGE', 'Spam o publicidad', 1, 4),
  ('MENSAJE_OTRO', 'MESSAGE', 'Otro motivo', 1, 5)
on conflict (code) do nothing;

create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references public.users (id),
  target_type       text not null,
  target_id         text not null,
  reported_user_id  uuid references public.users (id),
  conversation_id   uuid references public.conversations (id),
  reason_code       text not null references public.report_reasons (code),
  description       text,
  status            public.report_status not null default 'ABIERTA',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint reports_target check (target_type in ('WORKER', 'CLIENT', 'REVIEW', 'MESSAGE', 'CONVERSATION', 'CONTRACT')),
  constraint reports_description_len check (description is null or char_length(description) <= 1000),
  constraint reports_not_self check (reported_user_id is null or reported_user_id <> reporter_id)
);

create index reports_status_idx on public.reports (status, created_at);
create index reports_target_idx on public.reports (target_type, target_id);
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_reported_user_idx on public.reports (reported_user_id);
create index reports_conversation_idx on public.reports (conversation_id);
create index reports_reason_idx on public.reports (reason_code);
-- RN-16: una sola denuncia abierta por denunciante y objeto.
create unique index reports_open_key on public.reports (reporter_id, target_type, target_id)
  where status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA');

create trigger reports_set_updated_at before update on public.reports
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Auxiliares
-- -----------------------------------------------------------------------------

-- "Ana María Pérez" → "Ana P." (minimización: la contraparte no necesita el nombre completo).
create or replace function private.short_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(btrim(p_name), '') = '' then 'Usuario'
    when array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1) = 1 then btrim(p_name)
    else split_part(btrim(p_name), ' ', 1) || ' '
         || upper(left((regexp_split_to_array(btrim(p_name), '\s+'))[
              greatest(2, array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1) - 1)], 1)) || '.'
  end;
$$;

-- Papel del usuario en la conversación ('CLIENTE' | 'TRABAJADOR') o NULL si no participa.
create or replace function private.conversation_role(p_conversation uuid, p_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when c.client_user_id = p_user then 'CLIENTE'
    when w.user_id = p_user then 'TRABAJADOR'
  end
  from public.conversations c
  join public.worker_profiles w on w.id = c.worker_id
  where c.id = p_conversation;
$$;

create or replace function private.require_chat_user(p_user uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.users where id = p_user and status = 'ACTIVO') then
    raise exception 'La cuenta no está activa' using errcode = 'insufficient_privilege';
  end if;
  if private.is_staff_account(p_user) then
    raise exception 'Las cuentas institucionales no participan en el chat' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Envío a un canal privado de Realtime (Broadcast). SECURITY DEFINER: escribe en realtime.messages.
create or replace function private.broadcast(p_topic text, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(p_payload, p_event, p_topic, true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Envío de mensajes (idempotente, con límites, bloqueo y notificación)
-- -----------------------------------------------------------------------------

create or replace function private.post_message(
  p_conversation uuid,
  p_sender uuid,
  p_body text,
  p_client_message_id uuid
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_id bigint;
  v_c public.conversations;
  v_role text;
  v_worker_user uuid;
  v_worker_status public.worker_status;
  v_worker_name text;
  v_recipient uuid;
  v_sender_name text;
  v_body text := btrim(coalesce(p_body, ''));
begin
  -- El bloqueo de la conversación serializa los envíos: orden estable y reintentos concurrentes seguros.
  select * into v_c from public.conversations where id = p_conversation for update;
  if not found then
    raise exception 'Conversación no encontrada' using errcode = 'no_data_found';
  end if;

  -- Reintento del mismo envío: devuelve el mensaje ya guardado.
  if p_client_message_id is not null then
    select id into v_id from public.messages
    where sender_id = p_sender and client_message_id = p_client_message_id and conversation_id = p_conversation;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  select w.user_id, w.status, w.public_display_name into v_worker_user, v_worker_status, v_worker_name
  from public.worker_profiles w where w.id = v_c.worker_id;

  v_role := case when v_c.client_user_id = p_sender then 'CLIENTE' when v_worker_user = p_sender then 'TRABAJADOR' end;
  if v_role is null then
    raise exception 'Conversación no encontrada' using errcode = 'no_data_found';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 2000 then
    raise exception 'El mensaje debe tener entre 1 y 2000 caracteres' using errcode = 'check_violation';
  end if;
  if v_c.client_blocked_at is not null or v_c.worker_blocked_at is not null then
    raise exception 'La conversación está bloqueada' using errcode = 'insufficient_privilege';
  end if;
  if v_c.status = 'CERRADA' or v_worker_status in ('RECHAZADO', 'INACTIVO') then
    raise exception 'La conversación ya no admite mensajes' using errcode = 'check_violation';
  end if;
  -- RN-11: como máximo 20 mensajes por minuto por usuario.
  if (select count(*) from public.messages
      where sender_id = p_sender and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Estás enviando mensajes muy rápido. Espera un momento.' using errcode = 'program_limit_exceeded';
  end if;

  insert into public.messages (conversation_id, sender_id, body, client_message_id)
  values (p_conversation, p_sender, v_body, p_client_message_id)
  returning id into v_id;

  update public.conversations
    set last_message_id = v_id, last_message_at = now(), last_sender_id = p_sender,
        last_message_preview = left(regexp_replace(v_body, '\s+', ' ', 'g'), 140),
        client_last_read_id = case when v_role = 'CLIENTE' then v_id else client_last_read_id end,
        worker_last_read_id = case when v_role = 'TRABAJADOR' then v_id else worker_last_read_id end
    where id = p_conversation;

  -- Notificación in-app al destinatario: una no leída por conversación (no una por mensaje).
  v_recipient := case when v_role = 'CLIENTE' then v_worker_user else v_c.client_user_id end;
  if v_recipient is not null then
    v_sender_name := case when v_role = 'TRABAJADOR' then v_worker_name else (
      select private.short_name(coalesce(cp.full_name, u.display_name))
      from public.users u left join public.client_profiles cp on cp.user_id = u.id where u.id = p_sender) end;

    insert into public.notifications (user_id, type, title, body, link, dedupe_key)
    values (v_recipient, 'NEW_MESSAGE', 'Nuevo mensaje de ' || v_sender_name,
            left(regexp_replace(v_body, '\s+', ' ', 'g'), 140), '/mensajes/' || p_conversation,
            'conversation:' || p_conversation)
    on conflict (user_id, dedupe_key) where read_at is null and dedupe_key is not null
    do update set title = excluded.title, body = excluded.body, created_at = now();

    -- Push (FCM) solo si el destinatario registró dispositivos.
    if exists (select 1 from public.device_tokens where user_id = v_recipient and disabled_at is null) then
      insert into public.notification_outbox (event, recipient_id, payload)
      values ('NEW_MESSAGE', v_recipient, jsonb_build_object(
        'title', 'Nuevo mensaje de ' || v_sender_name,
        'body', left(regexp_replace(v_body, '\s+', ' ', 'g'), 140),
        'link', '/mensajes/' || p_conversation,
        'conversationId', p_conversation));
    end if;
  end if;

  return v_id;
end;
$$;

-- Difusión en tiempo real de cada mensaje nuevo: a la conversación y a la bandeja de cada parte.
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
    'kind', new.kind, 'body', new.body, 'createdAt', new.created_at));
  perform private.broadcast('user:' || v_client, 'inbox', jsonb_build_object('conversationId', new.conversation_id));
  if v_worker_user is not null then
    perform private.broadcast('user:' || v_worker_user, 'inbox', jsonb_build_object('conversationId', new.conversation_id));
  end if;
  return null;
end;
$$;

create trigger messages_broadcast after insert on public.messages
  for each row execute function private.messages_broadcast();

-- -----------------------------------------------------------------------------
-- Casos de uso del chat (los ejecuta el servidor en nombre del usuario autenticado)
-- -----------------------------------------------------------------------------

/*
 * Inicia (o retoma) la conversación de un cliente con un trabajador HABILITADO y envía el primer
 * mensaje (RN-10). Límite: 10 conversaciones nuevas por cliente y día (RN-11).
 */
create or replace function public.fn_start_conversation(
  p_user_id uuid,
  p_worker_id uuid,
  p_body text,
  p_client_message_id uuid default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns table (conversation_id uuid, message_id bigint, created boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_conv uuid;
  v_created boolean := false;
  v_worker record;
begin
  perform private.require_chat_user(p_user_id);

  select w.status, w.user_id into v_worker from public.worker_profiles w where w.id = p_worker_id;
  if not found then
    raise exception 'Trabajador no encontrado' using errcode = 'no_data_found';
  end if;
  if v_worker.user_id = p_user_id then
    raise exception 'No puedes iniciar una conversación contigo mismo' using errcode = 'check_violation';
  end if;

  select id into v_conv from public.conversations where client_user_id = p_user_id and worker_id = p_worker_id;
  if v_conv is null then
    if v_worker.status <> 'HABILITADO' then
      raise exception 'El trabajador no está disponible para nuevas conversaciones' using errcode = 'check_violation';
    end if;
    if (select count(*) from public.conversations
        where client_user_id = p_user_id and created_at > now() - interval '1 day') >= 10 then
      raise exception 'Alcanzaste el máximo de conversaciones nuevas por hoy. Inténtalo mañana.'
        using errcode = 'program_limit_exceeded';
    end if;
    insert into public.conversations (client_user_id, worker_id)
    values (p_user_id, p_worker_id)
    on conflict (client_user_id, worker_id) do nothing
    returning id into v_conv;
    if v_conv is null then
      select id into v_conv from public.conversations where client_user_id = p_user_id and worker_id = p_worker_id;
    else
      v_created := true;
      perform private.audit(p_user_id, 'CONVERSATION_STARTED', 'conversation', v_conv::text,
        p_ip, p_user_agent, p_request_id, jsonb_build_object('workerId', p_worker_id));
    end if;
  end if;

  return query select v_conv, private.post_message(v_conv, p_user_id, p_body, p_client_message_id), v_created;
end;
$$;

create or replace function public.fn_send_message(
  p_user_id uuid,
  p_conversation_id uuid,
  p_body text,
  p_client_message_id uuid default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
begin
  perform private.require_chat_user(p_user_id);
  return private.post_message(p_conversation_id, p_user_id, p_body, p_client_message_id);
end;
$$;

-- Bandeja del usuario (como cliente y como trabajador), con mensajes no leídos.
create or replace function public.fn_list_conversations(p_user_id uuid, p_conversation_id uuid default null)
returns table (
  id uuid,
  my_role text,
  counterpart_name text,
  worker_id uuid,
  worker_has_photo boolean,
  worker_linked boolean,
  status public.conversation_status,
  blocked_by_me boolean,
  blocked_by_other boolean,
  last_message_preview text,
  last_message_at timestamptz,
  last_sender_is_me boolean,
  unread bigint,
  other_last_read_id bigint,
  created_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with mias as (
    select c.*, w.user_id as worker_user_id, w.public_display_name, w.photo_path, w.status as worker_status,
           case when c.client_user_id = p_user_id then 'CLIENTE' else 'TRABAJADOR' end as rol
    from public.conversations c
    join public.worker_profiles w on w.id = c.worker_id
    where (c.client_user_id = p_user_id or w.user_id = p_user_id)
      and (p_conversation_id is null or c.id = p_conversation_id)
  )
  select m.id, m.rol,
         case when m.rol = 'CLIENTE' then m.public_display_name
              else (select private.short_name(coalesce(cp.full_name, u.display_name))
                    from public.users u left join public.client_profiles cp on cp.user_id = u.id
                    where u.id = m.client_user_id) end,
         m.worker_id,
         m.photo_path is not null and m.worker_status = 'HABILITADO',
         m.worker_user_id is not null,
         m.status,
         case when m.rol = 'CLIENTE' then m.client_blocked_at is not null else m.worker_blocked_at is not null end,
         case when m.rol = 'CLIENTE' then m.worker_blocked_at is not null else m.client_blocked_at is not null end,
         m.last_message_preview, m.last_message_at, m.last_sender_id = p_user_id,
         (select count(*) from public.messages x
          where x.conversation_id = m.id and x.sender_id <> p_user_id
            and x.id > coalesce(case when m.rol = 'CLIENTE' then m.client_last_read_id else m.worker_last_read_id end, 0)),
         case when m.rol = 'CLIENTE' then m.worker_last_read_id else m.client_last_read_id end,
         m.created_at
  from mias m
  where exists (select 1 from public.users u where u.id = p_user_id and u.status = 'ACTIVO')
  order by coalesce(m.last_message_at, m.created_at) desc
  limit 200;
$$;

-- Historial paginado (más recientes primero). Los mensajes ocultos por moderación no muestran su texto.
create or replace function public.fn_list_messages(
  p_user_id uuid,
  p_conversation_id uuid,
  p_before bigint default null,
  p_limit integer default 50
)
returns table (id bigint, sender_id uuid, is_mine boolean, kind text, body text, hidden boolean, created_at timestamptz)
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
  select m.id, m.sender_id, m.sender_id = p_user_id, m.kind,
         case when m.hidden_at is null then m.body end, m.hidden_at is not null, m.created_at
  from public.messages m
  where m.conversation_id = p_conversation_id and (p_before is null or m.id < p_before)
  order by m.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

create or replace function public.fn_mark_conversation_read(
  p_user_id uuid,
  p_conversation_id uuid,
  p_message_id bigint default null
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_role text := private.conversation_role(p_conversation_id, p_user_id);
  v_last bigint;
  v_leido bigint;
begin
  perform private.require_chat_user(p_user_id);
  if v_role is null then
    raise exception 'Conversación no encontrada' using errcode = 'no_data_found';
  end if;
  select last_message_id into v_last from public.conversations where id = p_conversation_id for update;
  v_leido := least(coalesce(p_message_id, v_last), v_last);

  update public.conversations
    set client_last_read_id = case when v_role = 'CLIENTE' then greatest(coalesce(client_last_read_id, 0), v_leido) else client_last_read_id end,
        worker_last_read_id = case when v_role = 'TRABAJADOR' then greatest(coalesce(worker_last_read_id, 0), v_leido) else worker_last_read_id end
    where id = p_conversation_id
    returning case when v_role = 'CLIENTE' then client_last_read_id else worker_last_read_id end into v_leido;

  update public.notifications set read_at = now()
    where user_id = p_user_id and dedupe_key = 'conversation:' || p_conversation_id and read_at is null;

  if v_leido is not null then
    perform private.broadcast('conversation:' || p_conversation_id, 'read',
      jsonb_build_object('role', v_role, 'lastReadId', v_leido));
  end if;
  return v_leido;
end;
$$;

-- RN-13: bloquear impide enviar mensajes en la conversación (a ambas partes, mientras dure).
create or replace function public.fn_set_conversation_block(
  p_user_id uuid,
  p_conversation_id uuid,
  p_blocked boolean,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_role text := private.conversation_role(p_conversation_id, p_user_id);
  v_c public.conversations;
begin
  perform private.require_chat_user(p_user_id);
  if v_role is null then
    raise exception 'Conversación no encontrada' using errcode = 'no_data_found';
  end if;

  update public.conversations
    set client_blocked_at = case when v_role = 'CLIENTE' then (case when p_blocked then coalesce(client_blocked_at, now()) end) else client_blocked_at end,
        worker_blocked_at = case when v_role = 'TRABAJADOR' then (case when p_blocked then coalesce(worker_blocked_at, now()) end) else worker_blocked_at end
    where id = p_conversation_id
    returning * into v_c;

  update public.conversations
    set status = case when v_c.client_blocked_at is not null or v_c.worker_blocked_at is not null then 'BLOQUEADA'::public.conversation_status
                      when status = 'BLOQUEADA' then 'ACTIVA'::public.conversation_status else status end
    where id = p_conversation_id;

  perform private.audit(p_user_id, case when p_blocked then 'CONVERSATION_BLOCKED' else 'CONVERSATION_UNBLOCKED' end,
    'conversation', p_conversation_id::text, p_ip, p_user_agent, p_request_id, jsonb_build_object('role', v_role));
  perform private.broadcast('conversation:' || p_conversation_id, 'status',
    jsonb_build_object('blocked', v_c.client_blocked_at is not null or v_c.worker_blocked_at is not null));
end;
$$;

-- Denuncia de un mensaje recibido (enganche de la Fase 8). No expone el contenido al personal aún.
create or replace function public.fn_report_message(
  p_user_id uuid,
  p_message_id bigint,
  p_reason_code text,
  p_description text default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_m public.messages;
  v_id uuid;
begin
  perform private.require_chat_user(p_user_id);
  select * into v_m from public.messages where id = p_message_id;
  if not found or private.conversation_role(v_m.conversation_id, p_user_id) is null then
    raise exception 'Mensaje no encontrado' using errcode = 'no_data_found';
  end if;
  if v_m.sender_id = p_user_id then
    raise exception 'No puedes denunciar tus propios mensajes' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.report_reasons where code = p_reason_code and target_type = 'MESSAGE' and active) then
    raise exception 'Motivo no válido' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.reports where reporter_id = p_user_id and target_type = 'MESSAGE'
             and target_id = p_message_id::text
             and status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA')) then
    raise exception 'Ya denunciaste este mensaje; el GAD lo está revisando' using errcode = 'unique_violation';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reported_user_id, conversation_id, reason_code, description)
  values (p_user_id, 'MESSAGE', p_message_id::text, v_m.sender_id, v_m.conversation_id, p_reason_code,
          nullif(btrim(p_description), ''))
  returning id into v_id;

  perform private.audit(p_user_id, 'REPORT_CREATED', 'report', v_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('targetType', 'MESSAGE', 'targetId', p_message_id, 'reason', p_reason_code));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Notificaciones y dispositivos
-- -----------------------------------------------------------------------------

create or replace function public.fn_mark_notifications_read(p_user_id uuid, p_ids bigint[] default null)
returns integer
language sql
set search_path = ''
as $$
  with actualizadas as (
    update public.notifications set read_at = now()
    where user_id = p_user_id and read_at is null and (p_ids is null or id = any (p_ids))
    returning 1
  )
  select count(*)::integer from actualizadas;
$$;

create or replace function public.fn_register_device(p_user_id uuid, p_platform text, p_token text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.require_chat_user(p_user_id);
  -- Un token pertenece a un solo usuario (el último que inició sesión en ese dispositivo).
  insert into public.device_tokens (user_id, platform, token)
  values (p_user_id, p_platform, p_token)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now(), disabled_at = null;
end;
$$;

create or replace function public.fn_unregister_device(p_user_id uuid, p_token text)
returns void
language sql
set search_path = ''
as $$
  update public.device_tokens set disabled_at = now() where user_id = p_user_id and token = p_token and disabled_at is null;
$$;

/*
 * Toma un lote de envíos pendientes para el despachador (FOR UPDATE SKIP LOCKED: varios
 * despachadores concurrentes no toman el mismo). Reintentos con espera exponencial; 5 intentos máx.
 */
create or replace function public.fn_claim_outbox(p_limit integer default 50)
returns table (id bigint, event text, recipient_id uuid, payload jsonb, attempts smallint, tokens text[])
language sql
set search_path = ''
as $$
  with lote as (
    select o.id from public.notification_outbox o
    where o.status = 'PENDIENTE' and o.next_attempt_at <= now()
    order by o.next_attempt_at
    limit least(greatest(coalesce(p_limit, 50), 1), 500)
    for update skip locked
  ), tomados as (
    update public.notification_outbox o
      set attempts = o.attempts + 1,
          next_attempt_at = now() + make_interval(secs => 30 * power(2, o.attempts)::integer)
    from lote where o.id = lote.id
    returning o.id, o.event, o.recipient_id, o.payload, o.attempts
  )
  select t.id, t.event, t.recipient_id, t.payload, t.attempts,
         coalesce((select array_agg(d.token) from public.device_tokens d
                   where d.user_id = t.recipient_id and d.disabled_at is null), '{}')
  from tomados t;
$$;

-- p_result: ENVIADA (llegó a algún dispositivo) · DESCARTADA (sin dispositivos válidos) · REINTENTAR.
create or replace function public.fn_complete_outbox(
  p_id bigint,
  p_result text,
  p_error text default null,
  p_invalid_tokens text[] default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_result not in ('ENVIADA', 'DESCARTADA', 'REINTENTAR') then
    raise exception 'Resultado no válido' using errcode = 'check_violation';
  end if;
  update public.notification_outbox
    set status = case when p_result = 'REINTENTAR' then (case when attempts >= 5 then 'FALLIDA' else 'PENDIENTE' end)
                      else p_result end,
        sent_at = case when p_result = 'ENVIADA' then now() else sent_at end,
        last_error = left(p_error, 500)
    where id = p_id;
  if p_invalid_tokens is not null then
    update public.device_tokens set disabled_at = now() where token = any (p_invalid_tokens) and disabled_at is null;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Realtime: autorización de canales privados (ADR-004)
-- -----------------------------------------------------------------------------

/*
 * ¿El JWT actual puede leer el canal? Solo tokens del servidor del portal (iss = 'acolita')
 * de usuarios ACTIVOS: `user:{id}` para su dueño y `conversation:{id}` para sus dos partes.
 * SECURITY DEFINER porque el rol authenticated no lee las tablas de negocio.
 */
create or replace function private.can_read_realtime_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := auth.jwt();
  v_sub uuid;
begin
  if v_claims ->> 'iss' is distinct from 'acolita' or p_topic is null then
    return false;
  end if;
  begin
    v_sub := (v_claims ->> 'sub')::uuid;
  exception when others then
    return false;
  end;
  if not exists (select 1 from public.users where id = v_sub and status = 'ACTIVO') then
    return false;
  end if;
  if p_topic = 'user:' || v_sub::text then
    return true;
  end if;
  if p_topic like 'conversation:%' then
    return exists (
      select 1 from public.conversations c join public.worker_profiles w on w.id = c.worker_id
      where c.id::text = substr(p_topic, 14) and (c.client_user_id = v_sub or w.user_id = v_sub)
    );
  end if;
  return false;
end;
$$;

revoke execute on function private.can_read_realtime_topic(text) from public, anon;
grant execute on function private.can_read_realtime_topic(text) to authenticated;

create policy acolita_private_channels_read on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and private.can_read_realtime_topic((select realtime.topic())));
-- Sin política INSERT: el navegador no publica en ningún canal; solo el servidor (vía triggers).

-- Vinculación tardía: el trabajador que canjea su código después ve sus conversaciones previas,
-- porque la autorización usa worker_profiles.user_id (no hay filas de participantes que migrar).

-- -----------------------------------------------------------------------------
-- RLS y privilegios
-- -----------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.device_tokens enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.report_reasons enable row level security;
alter table public.reports enable row level security;
-- Sin políticas para anon/authenticated: todo el acceso pasa por el servidor.

revoke all on public.conversations, public.messages, public.notifications, public.device_tokens,
  public.notification_outbox, public.report_reasons, public.reports from anon, authenticated;

grant select, insert, update on public.conversations, public.notifications, public.device_tokens,
  public.notification_outbox, public.reports to service_role;
grant select, insert, update on public.messages to service_role;
revoke delete, truncate on public.messages from service_role;
grant select on public.report_reasons to service_role;

revoke execute on function
  private.short_name(text),
  private.conversation_role(uuid, uuid),
  private.require_chat_user(uuid),
  private.broadcast(text, text, jsonb),
  private.post_message(uuid, uuid, text, uuid),
  private.messages_broadcast(),
  private.messages_guard(),
  public.fn_start_conversation(uuid, uuid, text, uuid, inet, text, text),
  public.fn_send_message(uuid, uuid, text, uuid),
  public.fn_list_conversations(uuid, uuid),
  public.fn_list_messages(uuid, uuid, bigint, integer),
  public.fn_mark_conversation_read(uuid, uuid, bigint),
  public.fn_set_conversation_block(uuid, uuid, boolean, inet, text, text),
  public.fn_report_message(uuid, bigint, text, text, inet, text, text),
  public.fn_mark_notifications_read(uuid, bigint[]),
  public.fn_register_device(uuid, text, text),
  public.fn_unregister_device(uuid, text),
  public.fn_claim_outbox(integer),
  public.fn_complete_outbox(bigint, text, text, text[])
  from public, anon, authenticated;

grant execute on function
  private.short_name(text),
  private.conversation_role(uuid, uuid),
  private.require_chat_user(uuid),
  private.broadcast(text, text, jsonb),
  private.post_message(uuid, uuid, text, uuid),
  public.fn_start_conversation(uuid, uuid, text, uuid, inet, text, text),
  public.fn_send_message(uuid, uuid, text, uuid),
  public.fn_list_conversations(uuid, uuid),
  public.fn_list_messages(uuid, uuid, bigint, integer),
  public.fn_mark_conversation_read(uuid, uuid, bigint),
  public.fn_set_conversation_block(uuid, uuid, boolean, inet, text, text),
  public.fn_report_message(uuid, bigint, text, text, inet, text, text),
  public.fn_mark_notifications_read(uuid, bigint[]),
  public.fn_register_device(uuid, text, text),
  public.fn_unregister_device(uuid, text),
  public.fn_claim_outbox(integer),
  public.fn_complete_outbox(bigint, text, text, text[])
  to service_role;
