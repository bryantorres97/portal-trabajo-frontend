-- =============================================================================
-- Notificaciones push (FCM): avisos del GAD a todos los dispositivos, a usuarios registrados,
-- solo a clientes, solo a trabajadores o a usuarios y dispositivos elegidos (notifications.broadcast).
-- Además: dispositivos anónimos de la app móvil, preferencia «avisos del GAD» de cada usuario y
-- tokens web ligados a la sesión (se desactivan al cerrarla).
-- Detalle: docs/phases/fase-09b-notificaciones-push.md
-- =============================================================================

insert into public.permissions (code, description) values
  ('notifications.broadcast', 'Enviar avisos push a todos, por segmento o a destinatarios elegidos')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
select v.role_code, v.permission_code
from (values ('ADMIN_SISTEMA', 'notifications.broadcast')) as v(role_code, permission_code)
where exists (select 1 from public.roles r where r.code = v.role_code)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Preferencia del usuario: avisos del GAD por push (los avisos del chat y de las contrataciones
-- no dependen de ella). En la bandeja del portal los avisos se ven siempre.
-- -----------------------------------------------------------------------------

alter table public.users add column push_announcements boolean not null default true;

comment on column public.users.push_announcements is
  'Acepta recibir por push los avisos del GAD (campañas). No afecta a las notificaciones del chat ni de contrataciones.';

-- -----------------------------------------------------------------------------
-- Dispositivos: anónimos (app sin sesión) y ligados a la sesión web
-- -----------------------------------------------------------------------------

alter table public.device_tokens alter column user_id drop not null;
alter table public.device_tokens
  -- Sesión web con la que se registró: al cerrarla o vencer, el navegador deja de recibir push.
  add column session_id uuid references public.auth_sessions (id) on delete cascade,
  -- Solo dispositivos anónimos: HMAC de la IP de registro (límite anti-abuso), nunca la IP.
  add column registered_ip_hash text,
  add constraint device_tokens_ip_hash_format check (registered_ip_hash is null or registered_ip_hash ~ '^[0-9a-f]{64}$');

create index device_tokens_session_idx on public.device_tokens (session_id) where session_id is not null;
create index device_tokens_anonymous_ip_idx on public.device_tokens (registered_ip_hash, created_at)
  where registered_ip_hash is not null;

comment on column public.device_tokens.user_id is
  'Dueño del dispositivo; NULL = app instalada sin sesión (solo recibe avisos para «todos los dispositivos»).';

-- ¿Se le puede enviar push? Activo, con sesión web vigente si la tiene, y con dueño activo si lo tiene.
create or replace function private.device_is_deliverable(p_device public.device_tokens)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_device.disabled_at is null
     and (p_device.session_id is null or exists (
           select 1 from public.auth_sessions s
           where s.id = p_device.session_id and s.revoked_at is null and s.expires_at > now()))
     and (p_device.user_id is null or exists (
           select 1 from public.users u where u.id = p_device.user_id and u.status = 'ACTIVO'));
$$;

-- Al cerrar una sesión (logout, «cerrar en todos los dispositivos», bloqueo) se desactivan sus tokens web.
create or replace function private.device_tokens_on_session_revoked()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.device_tokens set disabled_at = now() where session_id = new.id and disabled_at is null;
  return new;
end;
$$;

create trigger auth_sessions_disable_devices
  after update of revoked_at on public.auth_sessions
  for each row when (old.revoked_at is null and new.revoked_at is not null)
  execute function private.device_tokens_on_session_revoked();

drop function public.fn_register_device(uuid, text, text);

create or replace function public.fn_register_device(
  p_user_id uuid,
  p_platform text,
  p_token text,
  p_session_id uuid default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.require_chat_user(p_user_id);
  if p_session_id is not null and not exists (
    select 1 from public.auth_sessions where id = p_session_id and user_id = p_user_id and revoked_at is null
  ) then
    raise exception 'Sesión no válida' using errcode = 'insufficient_privilege';
  end if;
  -- Un token pertenece a un solo usuario (el último que inició sesión en ese dispositivo).
  insert into public.device_tokens (user_id, platform, token, session_id)
  values (p_user_id, p_platform, p_token, p_session_id)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, session_id = excluded.session_id,
        registered_ip_hash = null, last_seen_at = now(), disabled_at = null;
end;
$$;

/*
 * App móvil sin sesión: registra el token como anónimo. Si el token ya pertenece a un usuario
 * y está activo, no lo desvincula (solo actualiza last_seen_at). Máximo 30 tokens nuevos por
 * IP y hora. Devuelve 'OK' o 'RATE_LIMITED'.
 */
create or replace function public.fn_register_anonymous_device(p_platform text, p_token text, p_ip_hash text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_row public.device_tokens;
begin
  if p_platform not in ('ANDROID', 'IOS') then
    raise exception 'Solo la app móvil registra dispositivos sin sesión' using errcode = 'check_violation';
  end if;
  select * into v_row from public.device_tokens where token = p_token for update;
  if found then
    if v_row.user_id is not null and v_row.disabled_at is null then
      update public.device_tokens set last_seen_at = now() where id = v_row.id;
    else
      update public.device_tokens
        set user_id = null, session_id = null, platform = p_platform, last_seen_at = now(), disabled_at = null
        where id = v_row.id;
    end if;
    return 'OK';
  end if;
  if (select count(*) from public.device_tokens
      where registered_ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 30 then
    return 'RATE_LIMITED';
  end if;
  insert into public.device_tokens (user_id, platform, token, registered_ip_hash)
  values (null, p_platform, p_token, p_ip_hash);
  return 'OK';
end;
$$;

drop function public.fn_unregister_device(uuid, text);

-- p_keep_anonymous: la app cierra sesión pero sigue instalada → el dispositivo pasa a anónimo.
create or replace function public.fn_unregister_device(p_user_id uuid, p_token text, p_keep_anonymous boolean default false)
returns void
language sql
set search_path = ''
as $$
  update public.device_tokens
    set disabled_at = case when p_keep_anonymous and platform <> 'WEB' then null else now() end,
        user_id = case when p_keep_anonymous and platform <> 'WEB' then null else user_id end,
        session_id = null
    where user_id = p_user_id and token = p_token and disabled_at is null;
$$;

-- Outbox de eventos (chat, contrataciones): solo dispositivos a los que se puede enviar.
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
                   where d.user_id = t.recipient_id and private.device_is_deliverable(d)), '{}')
  from tomados t;
$$;

-- -----------------------------------------------------------------------------
-- Campañas (avisos del GAD) y entregas por dispositivo
-- -----------------------------------------------------------------------------

create table public.push_campaigns (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  body               text not null,
  link               text,
  segment            text not null,
  platforms          text[] not null default array['WEB', 'ANDROID', 'IOS'],
  target_user_ids    uuid[] not null default '{}',
  target_device_ids  bigint[] not null default '{}',
  also_in_app        boolean not null default false,
  status             text not null default 'PROGRAMADA',
  scheduled_at       timestamptz not null default now(),
  created_by         uuid not null references public.users (id),
  created_at         timestamptz not null default now(),
  started_at         timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  cancelled_by       uuid references public.users (id),
  total_devices      integer not null default 0,
  in_app_users       integer not null default 0,
  sent_count         integer not null default 0,
  failed_count       integer not null default 0,
  discarded_count    integer not null default 0,
  constraint push_campaigns_title_len check (char_length(btrim(title)) between 3 and 65),
  constraint push_campaigns_body_len check (char_length(btrim(body)) between 3 and 240),
  constraint push_campaigns_link_format check (link is null or (link ~ '^/[^/\\]' and char_length(link) <= 300)),
  constraint push_campaigns_segment check (segment in ('TODOS', 'USUARIOS', 'CLIENTES', 'TRABAJADORES', 'SELECCION')),
  constraint push_campaigns_platforms check (
    cardinality(platforms) between 1 and 3 and platforms <@ array['WEB', 'ANDROID', 'IOS']),
  constraint push_campaigns_targets check (
    cardinality(target_user_ids) <= 500 and cardinality(target_device_ids) <= 1000
    and (segment = 'SELECCION') = (cardinality(target_user_ids) + cardinality(target_device_ids) > 0)),
  constraint push_campaigns_status check (status in ('PROGRAMADA', 'ENVIANDO', 'COMPLETADA', 'CANCELADA'))
);

create index push_campaigns_created_idx on public.push_campaigns (created_at desc);
create index push_campaigns_due_idx on public.push_campaigns (scheduled_at) where status = 'PROGRAMADA';
create index push_campaigns_created_by_idx on public.push_campaigns (created_by);
create index push_campaigns_cancelled_by_idx on public.push_campaigns (cancelled_by);

create table public.push_deliveries (
  id               bigint generated always as identity primary key,
  campaign_id      uuid not null references public.push_campaigns (id) on delete cascade,
  device_id        bigint not null references public.device_tokens (id) on delete cascade,
  status           text not null default 'PENDIENTE',
  attempts         smallint not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  sent_at          timestamptz,
  constraint push_deliveries_campaign_device_key unique (campaign_id, device_id),
  constraint push_deliveries_status check (status in ('PENDIENTE', 'ENVIADA', 'FALLIDA', 'DESCARTADA')),
  constraint push_deliveries_error_len check (last_error is null or char_length(last_error) <= 500)
);

create index push_deliveries_pending_idx on public.push_deliveries (next_attempt_at) where status = 'PENDIENTE';
create index push_deliveries_campaign_status_idx on public.push_deliveries (campaign_id, status);
create index push_deliveries_device_idx on public.push_deliveries (device_id);

/*
 * Dispositivos de un segmento. Los dispositivos con dueño requieren que acepte avisos del GAD
 * (push_announcements). Clientes = cuentas ciudadanas sin rol TRABAJADOR.
 */
create or replace function private.push_audience_devices(
  p_segment text,
  p_platforms text[],
  p_user_ids uuid[],
  p_device_ids bigint[]
)
returns table (device_id bigint, user_id uuid, platform text)
language sql
stable
set search_path = ''
as $$
  select d.id, d.user_id, d.platform
  from public.device_tokens d
  left join public.users u on u.id = d.user_id
  where d.platform = any (p_platforms)
    and private.device_is_deliverable(d)
    and (d.user_id is null or u.push_announcements)
    and case p_segment
      when 'TODOS' then true
      when 'USUARIOS' then d.user_id is not null
      when 'TRABAJADORES' then exists (select 1 from public.user_roles r
        where r.user_id = d.user_id and r.role_code = 'TRABAJADOR' and r.revoked_at is null)
      when 'CLIENTES' then exists (select 1 from public.user_roles r
        where r.user_id = d.user_id and r.role_code = 'CLIENTE' and r.revoked_at is null)
        and not exists (select 1 from public.user_roles r
        where r.user_id = d.user_id and r.role_code = 'TRABAJADOR' and r.revoked_at is null)
      when 'SELECCION' then d.id = any (p_device_ids) or d.user_id = any (p_user_ids)
      else false
    end;
$$;

-- Usuarios que reciben el aviso en la bandeja del portal (cuentas ciudadanas activas, tengan o no dispositivos).
create or replace function private.push_audience_users(p_segment text, p_user_ids uuid[], p_device_ids bigint[])
returns table (user_id uuid)
language sql
stable
set search_path = ''
as $$
  select u.id
  from public.users u
  where u.status = 'ACTIVO'
    and not private.is_staff_account(u.id)
    and case p_segment
      when 'TODOS' then true
      when 'USUARIOS' then true
      when 'TRABAJADORES' then exists (select 1 from public.user_roles r
        where r.user_id = u.id and r.role_code = 'TRABAJADOR' and r.revoked_at is null)
      when 'CLIENTES' then exists (select 1 from public.user_roles r
        where r.user_id = u.id and r.role_code = 'CLIENTE' and r.revoked_at is null)
        and not exists (select 1 from public.user_roles r
        where r.user_id = u.id and r.role_code = 'TRABAJADOR' and r.revoked_at is null)
      when 'SELECCION' then u.id = any (p_user_ids)
        or u.id in (select d.user_id from public.device_tokens d where d.id = any (p_device_ids))
      else false
    end;
$$;

-- Estimación para el formulario: dispositivos por plataforma y usuarios alcanzados.
create or replace function public.fn_admin_push_audience(
  p_actor_id uuid,
  p_segment text,
  p_platforms text[],
  p_user_ids uuid[] default '{}',
  p_device_ids bigint[] default '{}'
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform private.require_permission(p_actor_id, 'notifications.broadcast');
  select jsonb_build_object(
    'devices', count(*),
    'anonymousDevices', count(*) filter (where a.user_id is null),
    'pushUsers', count(distinct a.user_id),
    'byPlatform', jsonb_build_object(
      'WEB', count(*) filter (where a.platform = 'WEB'),
      'ANDROID', count(*) filter (where a.platform = 'ANDROID'),
      'IOS', count(*) filter (where a.platform = 'IOS')))
  into v
  from private.push_audience_devices(p_segment, p_platforms, coalesce(p_user_ids, '{}'), coalesce(p_device_ids, '{}')) a;
  return v || jsonb_build_object('inAppUsers',
    (select count(*) from private.push_audience_users(p_segment, coalesce(p_user_ids, '{}'), coalesce(p_device_ids, '{}'))));
end;
$$;

-- Recalcula los conteos y cierra la campaña cuando no quedan entregas pendientes.
create or replace function private.refresh_push_campaigns(p_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.push_campaigns c
    set sent_count = s.sent, failed_count = s.failed, discarded_count = s.discarded,
        status = case when s.pending = 0 and c.status = 'ENVIANDO' then 'COMPLETADA' else c.status end,
        completed_at = case when s.pending = 0 and c.status = 'ENVIANDO' then now() else c.completed_at end
  from (
    select x.id,
           count(d.id) filter (where d.status = 'ENVIADA') as sent,
           count(d.id) filter (where d.status = 'FALLIDA') as failed,
           count(d.id) filter (where d.status = 'DESCARTADA') as discarded,
           count(d.id) filter (where d.status = 'PENDIENTE') as pending
    from unnest(p_ids) as x(id)
    left join public.push_deliveries d on d.campaign_id = x.id
    group by x.id
  ) s
  where c.id = s.id;
$$;

/*
 * Inicia una campaña: fija la audiencia en ese momento (una entrega por dispositivo) y, si se pidió,
 * deja el aviso en la bandeja del portal de cada usuario del segmento.
 */
create or replace function private.start_push_campaign(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  c public.push_campaigns;
  v_total integer;
  v_in_app integer := 0;
begin
  select * into c from public.push_campaigns where id = p_id and status = 'PROGRAMADA' for update;
  if not found then
    return;
  end if;
  insert into public.push_deliveries (campaign_id, device_id)
  select c.id, a.device_id
  from private.push_audience_devices(c.segment, c.platforms, c.target_user_ids, c.target_device_ids) a
  on conflict do nothing;
  get diagnostics v_total = row_count;
  if c.also_in_app then
    insert into public.notifications (user_id, type, title, body, link, dedupe_key)
    select a.user_id, 'AVISO_GAD', c.title, c.body, c.link, 'campaign:' || c.id
    from private.push_audience_users(c.segment, c.target_user_ids, c.target_device_ids) a
    on conflict (user_id, dedupe_key) where read_at is null and dedupe_key is not null do nothing;
    get diagnostics v_in_app = row_count;
  end if;
  update public.push_campaigns
    set status = 'ENVIANDO', started_at = now(), total_devices = v_total, in_app_users = v_in_app
    where id = c.id;
  perform private.refresh_push_campaigns(array[c.id]);
end;
$$;

create or replace function public.fn_admin_create_push_campaign(
  p_actor_id uuid,
  p_title text,
  p_body text,
  p_link text,
  p_segment text,
  p_platforms text[],
  p_user_ids uuid[],
  p_device_ids bigint[],
  p_also_in_app boolean,
  p_scheduled_at timestamptz,
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
  v_at timestamptz := coalesce(p_scheduled_at, now());
begin
  perform private.require_permission(p_actor_id, 'notifications.broadcast');
  if v_at > now() + interval '90 days' then
    raise exception 'Solo se puede programar hasta 90 días hacia adelante' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.push_campaigns
      where created_by = p_actor_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Llegaste al límite de 20 avisos por hora' using errcode = 'program_limit_exceeded';
  end if;
  insert into public.push_campaigns (title, body, link, segment, platforms, target_user_ids, target_device_ids,
    also_in_app, scheduled_at, created_by)
  values (btrim(p_title), btrim(p_body), nullif(btrim(coalesce(p_link, '')), ''), p_segment,
    (select array_agg(distinct x order by x) from unnest(p_platforms) x),
    case when p_segment = 'SELECCION' then coalesce((select array_agg(distinct x) from unnest(p_user_ids) x), '{}') else '{}' end,
    case when p_segment = 'SELECCION' then coalesce((select array_agg(distinct x) from unnest(p_device_ids) x), '{}') else '{}' end,
    coalesce(p_also_in_app, false), greatest(v_at, now()), p_actor_id)
  returning id into v_id;
  perform private.audit(p_actor_id, 'PUSH_CAMPAIGN_CREATED', 'push_campaign', v_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('title', btrim(p_title), 'segment', p_segment, 'platforms', p_platforms,
      'targetUsers', cardinality(coalesce(p_user_ids, '{}')), 'targetDevices', cardinality(coalesce(p_device_ids, '{}')),
      'alsoInApp', coalesce(p_also_in_app, false), 'scheduledAt', v_at));
  if v_at <= now() then
    perform private.start_push_campaign(v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.fn_admin_cancel_push_campaign(
  p_actor_id uuid,
  p_id uuid,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  perform private.require_permission(p_actor_id, 'notifications.broadcast');
  select status into v_status from public.push_campaigns where id = p_id for update;
  if v_status is null then
    raise exception 'Aviso no encontrado' using errcode = 'no_data_found';
  end if;
  if v_status not in ('PROGRAMADA', 'ENVIANDO') then
    raise exception 'El aviso ya terminó y no se puede cancelar' using errcode = 'object_not_in_prerequisite_state';
  end if;
  update public.push_deliveries set status = 'DESCARTADA', last_error = 'Aviso cancelado'
    where campaign_id = p_id and status = 'PENDIENTE';
  perform private.refresh_push_campaigns(array[p_id]);
  update public.push_campaigns set status = 'CANCELADA', cancelled_at = now(), cancelled_by = p_actor_id where id = p_id;
  perform private.audit(p_actor_id, 'PUSH_CAMPAIGN_CANCELLED', 'push_campaign', p_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('previousStatus', v_status));
end;
$$;

create or replace function public.fn_admin_push_campaigns(p_actor_id uuid, p_limit integer default 20, p_offset integer default 0)
returns table (
  id uuid, title text, body text, link text, segment text, platforms text[], target_users integer, target_devices integer,
  also_in_app boolean, status text, scheduled_at timestamptz, created_at timestamptz, started_at timestamptz,
  completed_at timestamptz, cancelled_at timestamptz, created_by_name text, total_devices integer, in_app_users integer,
  sent_count integer, failed_count integer, discarded_count integer, total_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_permission(p_actor_id, 'notifications.broadcast');
  return query
  select c.id, c.title, c.body, c.link, c.segment, c.platforms, cardinality(c.target_user_ids), cardinality(c.target_device_ids),
         c.also_in_app, c.status, c.scheduled_at, c.created_at, c.started_at, c.completed_at, c.cancelled_at,
         coalesce(u.display_name, u.email), c.total_devices, c.in_app_users, c.sent_count, c.failed_count, c.discarded_count,
         count(*) over ()
  from public.push_campaigns c
  left join public.users u on u.id = c.created_by
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- Buscador de destinatarios (segmento SELECCION): cuentas ciudadanas por nombre o correo, con sus dispositivos.
create or replace function public.fn_admin_push_search_recipients(p_actor_id uuid, p_query text, p_limit integer default 20)
returns table (
  user_id uuid, display_name text, email text, roles text[], push_announcements boolean, status text, devices jsonb
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := btrim(coalesce(p_query, ''));
begin
  perform private.require_permission(p_actor_id, 'notifications.broadcast');
  if char_length(v_q) < 3 then
    raise exception 'Escribe al menos 3 caracteres' using errcode = 'check_violation';
  end if;
  v_q := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select u.id, coalesce(cp.full_name, u.display_name), u.email,
         coalesce((select array_agg(r.role_code order by r.role_code) from public.user_roles r
                   where r.user_id = u.id and r.revoked_at is null), '{}'),
         u.push_announcements, u.status::text,
         coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'platform', d.platform, 'lastSeenAt', d.last_seen_at)
                                    order by d.last_seen_at desc)
                   from public.device_tokens d where d.user_id = u.id and private.device_is_deliverable(d)), '[]'::jsonb)
  from public.users u
  left join public.client_profiles cp on cp.user_id = u.id
  where not private.is_staff_account(u.id)
    and (u.display_name ilike v_q or u.email ilike v_q or cp.full_name ilike v_q)
  order by coalesce(cp.full_name, u.display_name, u.email)
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

/*
 * Despachador: inicia las campañas programadas que vencieron, descarta entregas a dispositivos
 * que ya no reciben push y toma un lote (FOR UPDATE SKIP LOCKED). Hasta 3 intentos con espera.
 */
create or replace function public.fn_claim_push_deliveries(p_limit integer default 200)
returns table (id bigint, campaign_id uuid, token text, title text, body text, link text)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid;
  v_afectadas uuid[];
begin
  for v_id in
    select c.id from public.push_campaigns c
    where c.status = 'PROGRAMADA' and c.scheduled_at <= now()
    order by c.scheduled_at limit 5
    for update skip locked
  loop
    perform private.start_push_campaign(v_id);
  end loop;

  with descartadas as (
    update public.push_deliveries pd
      set status = 'DESCARTADA', last_error = 'El dispositivo ya no recibe avisos'
    from public.device_tokens d
    where d.id = pd.device_id and pd.status = 'PENDIENTE' and not private.device_is_deliverable(d)
    returning pd.campaign_id
  )
  select array_agg(distinct x.campaign_id) into v_afectadas from descartadas x;
  if v_afectadas is not null then
    perform private.refresh_push_campaigns(v_afectadas);
  end if;

  return query
  with lote as (
    select pd.id from public.push_deliveries pd
    join public.push_campaigns c on c.id = pd.campaign_id
    where pd.status = 'PENDIENTE' and pd.next_attempt_at <= now() and c.status = 'ENVIANDO'
    order by pd.next_attempt_at, pd.id
    limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    for update of pd skip locked
  ), tomadas as (
    update public.push_deliveries pd
      set attempts = pd.attempts + 1,
          next_attempt_at = now() + make_interval(secs => 60 * power(2, pd.attempts)::integer)
    from lote where pd.id = lote.id
    returning pd.id, pd.campaign_id, pd.device_id
  )
  select t.id, t.campaign_id, d.token, c.title, c.body, c.link
  from tomadas t
  join public.device_tokens d on d.id = t.device_id
  join public.push_campaigns c on c.id = t.campaign_id;
end;
$$;

-- p_results: [{ "id": 1, "result": "ENVIADA" | "DESCARTADA" | "REINTENTAR", "error": "…", "invalid": true }]
create or replace function public.fn_complete_push_deliveries(p_results jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_afectadas uuid[];
begin
  if exists (select 1 from jsonb_to_recordset(p_results) as r(result text)
             where r.result is null or r.result not in ('ENVIADA', 'DESCARTADA', 'REINTENTAR')) then
    raise exception 'Resultado no válido' using errcode = 'check_violation';
  end if;
  with r as (
    select * from jsonb_to_recordset(p_results) as x(id bigint, result text, error text, invalid boolean)
  ), actualizadas as (
    update public.push_deliveries pd
      set status = case when r.result = 'REINTENTAR' then (case when pd.attempts >= 3 then 'FALLIDA' else 'PENDIENTE' end)
                        else r.result end,
          sent_at = case when r.result = 'ENVIADA' then now() else pd.sent_at end,
          last_error = case when r.result = 'ENVIADA' then null else left(r.error, 500) end
    from r
    where pd.id = r.id and pd.status = 'PENDIENTE'
    returning pd.campaign_id, pd.device_id, coalesce(r.invalid, false) as invalid
  ), desactivados as (
    update public.device_tokens d set disabled_at = now()
    where d.id in (select a.device_id from actualizadas a where a.invalid) and d.disabled_at is null
    returning d.id
  )
  select array_agg(distinct a.campaign_id) into v_afectadas from actualizadas a;
  if v_afectadas is not null then
    perform private.refresh_push_campaigns(v_afectadas);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS y privilegios
-- -----------------------------------------------------------------------------

alter table public.push_campaigns enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_campaigns, public.push_deliveries from anon, authenticated;
grant select, insert, update on public.push_campaigns, public.push_deliveries to service_role;

revoke execute on function
  private.device_is_deliverable(public.device_tokens),
  private.device_tokens_on_session_revoked(),
  private.push_audience_devices(text, text[], uuid[], bigint[]),
  private.push_audience_users(text, uuid[], bigint[]),
  private.refresh_push_campaigns(uuid[]),
  private.start_push_campaign(uuid),
  public.fn_register_device(uuid, text, text, uuid),
  public.fn_register_anonymous_device(text, text, text),
  public.fn_unregister_device(uuid, text, boolean),
  public.fn_claim_outbox(integer),
  public.fn_admin_push_audience(uuid, text, text[], uuid[], bigint[]),
  public.fn_admin_create_push_campaign(uuid, text, text, text, text, text[], uuid[], bigint[], boolean, timestamptz, inet, text, text),
  public.fn_admin_cancel_push_campaign(uuid, uuid, inet, text, text),
  public.fn_admin_push_campaigns(uuid, integer, integer),
  public.fn_admin_push_search_recipients(uuid, text, integer),
  public.fn_claim_push_deliveries(integer),
  public.fn_complete_push_deliveries(jsonb)
  from public, anon, authenticated;

grant execute on function
  private.device_is_deliverable(public.device_tokens),
  private.push_audience_devices(text, text[], uuid[], bigint[]),
  private.push_audience_users(text, uuid[], bigint[]),
  private.refresh_push_campaigns(uuid[]),
  private.start_push_campaign(uuid),
  public.fn_register_device(uuid, text, text, uuid),
  public.fn_register_anonymous_device(text, text, text),
  public.fn_unregister_device(uuid, text, boolean),
  public.fn_claim_outbox(integer),
  public.fn_admin_push_audience(uuid, text, text[], uuid[], bigint[]),
  public.fn_admin_create_push_campaign(uuid, text, text, text, text, text[], uuid[], bigint[], boolean, timestamptz, inet, text, text),
  public.fn_admin_cancel_push_campaign(uuid, uuid, inet, text, text),
  public.fn_admin_push_campaigns(uuid, integer, integer),
  public.fn_admin_push_search_recipients(uuid, text, integer),
  public.fn_claim_push_deliveries(integer),
  public.fn_complete_push_deliveries(jsonb)
  to service_role;
