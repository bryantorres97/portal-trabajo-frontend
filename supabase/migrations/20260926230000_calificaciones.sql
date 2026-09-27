-- =============================================================================
-- Fase 7 — Calificaciones: reseña 1–5 + comentario ≤200 palabras, en ambos sentidos (ADR-011).
-- Detalle: docs/phases/fase-07-calificaciones.md
--
-- Reglas clave:
--   * RN-06: solo con una contratación FINALIZADA; una reseña por parte (unique contract + dirección).
--   * RN-07: ≤200 palabras en web, API y base (CHECK con private.word_count).
--   * RN-08: el autor edita durante 7 días; nunca la borra. El GAD la oculta o restaura (moderation.act).
--   * RN-20: la reseña del trabajador al cliente la ven solo trabajadores (rol TRABAJADOR activo, en el
--     contexto de su conversación o contratación) y el personal del GAD. Nunca clientes ni páginas públicas.
--   * Promedio y conteo desnormalizados en worker_profiles (solo reseñas PUBLICADAS del cliente).
--   * Plazos en app_settings: 30 días desde la finalización para calificar; 7 días para editar.
-- =============================================================================

insert into public.app_settings (key, value, description) values
  ('reviews.window_days', '30', 'Días desde la finalización de la contratación para dejar una calificación'),
  ('reviews.edit_days', '7', 'Días durante los que el autor puede editar su calificación (RN-08)')
on conflict (key) do nothing;

-- Palabras de un texto (separadas por espacios). Misma regla que countWords() en TypeScript.
create or replace function private.word_count(p_text text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(btrim(p_text), '') = '' then 0
              else array_length(regexp_split_to_array(btrim(p_text), '\s+'), 1) end;
$$;

-- -----------------------------------------------------------------------------
-- Reseñas
-- -----------------------------------------------------------------------------

create type public.review_direction as enum ('CLIENTE_A_TRABAJADOR', 'TRABAJADOR_A_CLIENTE');
create type public.review_status as enum ('PUBLICADA', 'OCULTA');

create table public.reviews (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid not null references public.contracts (id),
  direction       public.review_direction not null,
  worker_id       uuid not null references public.worker_profiles (id),
  client_user_id  uuid not null references public.users (id),
  author_user_id  uuid not null references public.users (id),
  rating          smallint not null,
  comment         text,
  status          public.review_status not null default 'PUBLICADA',
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  editable_until  timestamptz not null,
  hidden_at       timestamptz,
  hidden_by       uuid references public.users (id),
  hidden_reason   text,
  constraint reviews_contract_direction_key unique (contract_id, direction),
  constraint reviews_rating check (rating between 1 and 5),
  -- RN-07: máximo 200 palabras (y un tope de caracteres para textos sin espacios).
  constraint reviews_comment_len check (
    comment is null or (char_length(comment) between 1 and 2000 and private.word_count(comment) <= 200)
  ),
  constraint reviews_hidden_reason_len check (hidden_reason is null or char_length(hidden_reason) <= 500),
  constraint reviews_hidden_state check ((status = 'OCULTA') = (hidden_at is not null))
);

comment on table public.reviews is
  'Calificaciones de contrataciones finalizadas. CLIENTE_A_TRABAJADOR es pública; TRABAJADOR_A_CLIENTE solo para trabajadores y el GAD (RN-20).';

create index reviews_worker_public_idx on public.reviews (worker_id, created_at desc)
  where direction = 'CLIENTE_A_TRABAJADOR' and status = 'PUBLICADA';
create index reviews_client_idx on public.reviews (client_user_id, created_at desc)
  where direction = 'TRABAJADOR_A_CLIENTE';
create index reviews_author_idx on public.reviews (author_user_id);
create index reviews_hidden_by_idx on public.reviews (hidden_by);
create index reviews_status_idx on public.reviews (status, created_at desc);

-- Integridad: solo con contratación FINALIZADA, por la parte correcta; identidad inmutable; sin DELETE.
create or replace function private.reviews_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
  v_worker_user uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'Las calificaciones no se eliminan (se ocultan)' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'INSERT' then
    select * into v_c from public.contracts where id = new.contract_id;
    select user_id into v_worker_user from public.worker_profiles where id = v_c.worker_id;
    if v_c.status is distinct from 'FINALIZADA' then
      raise exception 'Solo se califica una contratación finalizada' using errcode = 'check_violation';
    end if;
    if new.worker_id is distinct from v_c.worker_id or new.client_user_id is distinct from v_c.client_user_id
       or new.author_user_id is distinct from
          (case when new.direction = 'CLIENTE_A_TRABAJADOR' then v_c.client_user_id else v_worker_user end) then
      raise exception 'Solo las partes de la contratación se califican entre sí' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.contract_id is distinct from old.contract_id or new.direction is distinct from old.direction
     or new.worker_id is distinct from old.worker_id or new.client_user_id is distinct from old.client_user_id
     or new.author_user_id is distinct from old.author_user_id or new.created_at is distinct from old.created_at
     or new.editable_until is distinct from old.editable_until then
    raise exception 'Los datos de una calificación no se reasignan' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger reviews_guard before insert or update or delete on public.reviews
  for each row execute function private.reviews_guard();

-- Promedio y conteo del trabajador: solo reseñas PUBLICADAS del cliente al trabajador.
create or replace function private.refresh_worker_rating(p_worker uuid)
returns void
language sql
set search_path = ''
as $$
  update public.worker_profiles w
    set rating_avg = coalesce(r.promedio, 0), rating_count = coalesce(r.total, 0)
  from (select round(avg(rating)::numeric, 2) as promedio, count(*)::integer as total
        from public.reviews
        where worker_id = p_worker and direction = 'CLIENTE_A_TRABAJADOR' and status = 'PUBLICADA') r
  where w.id = p_worker;
$$;

create or replace function private.reviews_after_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.direction = 'CLIENTE_A_TRABAJADOR'
     and (tg_op = 'INSERT' or new.rating is distinct from old.rating or new.status is distinct from old.status) then
    perform private.refresh_worker_rating(new.worker_id);
  end if;
  return null;
end;
$$;

create trigger reviews_after_change after insert or update on public.reviews
  for each row execute function private.reviews_after_change();

-- -----------------------------------------------------------------------------
-- Visibilidad (RN-20)
-- -----------------------------------------------------------------------------

-- ¿Puede ver calificaciones hechas A CLIENTES? Trabajadores con rol activo y personal del GAD.
create or replace function private.can_see_client_reviews(p_viewer uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.users where id = p_viewer and status = 'ACTIVO')
    and (exists (select 1 from public.user_roles where user_id = p_viewer and role_code = 'TRABAJADOR' and revoked_at is null)
         or (private.is_staff_account(p_viewer) and private.has_permission(p_viewer, 'admin.access')));
$$;

create or replace function private.review_json(r public.reviews, p_viewer uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'direction', r.direction,
    'rating', r.rating,
    'comment', case when r.status = 'PUBLICADA' or r.author_user_id = p_viewer then r.comment end,
    'status', r.status,
    'isMine', r.author_user_id = p_viewer,
    'createdAt', r.created_at,
    'editedAt', r.edited_at,
    'editableUntil', r.editable_until,
    'canEdit', r.author_user_id = p_viewer and r.status = 'PUBLICADA' and r.editable_until > now());
$$;

-- -----------------------------------------------------------------------------
-- Casos de uso
-- -----------------------------------------------------------------------------

/*
 * Crea o edita la calificación del usuario sobre la otra parte de una contratación FINALIZADA.
 * Crear: hasta N días desde la finalización. Editar: hasta 7 días desde la creación y si no está oculta.
 */
create or replace function public.fn_review_save(
  p_user_id uuid,
  p_contract_id uuid,
  p_rating integer,
  p_comment text,
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
  v_direction public.review_direction;
  v_r public.reviews;
  v_comment text := nullif(btrim(regexp_replace(coalesce(p_comment, ''), '\r\n', E'\n', 'g')), '');
begin
  perform private.require_chat_user(p_user_id);
  select * into v_c from public.contracts where id = p_contract_id;
  v_role := case when found then private.contract_role(v_c, p_user_id) end;
  if v_role is null then
    raise exception 'Contratación no encontrada' using errcode = 'no_data_found';
  end if;
  if v_c.status <> 'FINALIZADA' then
    raise exception 'Podrás calificar cuando la contratación esté finalizada' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Elige de 1 a 5 estrellas' using errcode = 'check_violation';
  end if;
  if private.word_count(v_comment) > 200 then
    raise exception 'El comentario admite hasta 200 palabras' using errcode = 'check_violation';
  end if;
  v_direction := case when v_role = 'CLIENTE' then 'CLIENTE_A_TRABAJADOR' else 'TRABAJADOR_A_CLIENTE' end;

  select * into v_r from public.reviews where contract_id = p_contract_id and direction = v_direction for update;
  if not found then
    if v_c.completed_at + private.setting_days('reviews.window_days', 30) < now() then
      raise exception 'Venció el plazo para calificar esta contratación' using errcode = 'object_not_in_prerequisite_state';
    end if;
    insert into public.reviews (contract_id, direction, worker_id, client_user_id, author_user_id, rating, comment, editable_until)
    values (p_contract_id, v_direction, v_c.worker_id, v_c.client_user_id, p_user_id, p_rating, v_comment,
            now() + private.setting_days('reviews.edit_days', 7))
    on conflict (contract_id, direction) do nothing
    returning * into v_r;
    if v_r.id is null then
      raise exception 'Ya calificaste esta contratación' using errcode = 'unique_violation';
    end if;
    update public.notifications set read_at = now()
      where user_id = p_user_id and dedupe_key = 'review:' || p_contract_id and read_at is null;
    perform private.audit(p_user_id, 'REVIEW_CREATED', 'review', v_r.id::text, p_ip, p_user_agent, p_request_id,
      jsonb_build_object('contractId', p_contract_id, 'direction', v_direction, 'rating', p_rating));
  else
    if v_r.status = 'OCULTA' then
      raise exception 'El GAD ocultó esta calificación: ya no se puede editar' using errcode = 'object_not_in_prerequisite_state';
    end if;
    if v_r.editable_until <= now() then
      raise exception 'Venció el plazo de 7 días para editar tu calificación' using errcode = 'object_not_in_prerequisite_state';
    end if;
    update public.reviews set rating = p_rating, comment = v_comment, edited_at = now()
      where id = v_r.id returning * into v_r;
    perform private.audit(p_user_id, 'REVIEW_EDITED', 'review', v_r.id::text, p_ip, p_user_agent, p_request_id,
      jsonb_build_object('contractId', p_contract_id, 'direction', v_direction, 'rating', p_rating));
  end if;
  return v_r.id;
end;
$$;

/* Calificaciones de una contratación para una de sus partes (la propia y, si puede verla, la recibida). */
create or replace function public.fn_contract_reviews(p_user_id uuid, p_contract_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_c public.contracts;
  v_role text;
  v_mine public.reviews;
  v_theirs public.reviews;
  v_theirs_visible boolean;
begin
  perform private.require_chat_user(p_user_id);
  select * into v_c from public.contracts where id = p_contract_id;
  v_role := case when found then private.contract_role(v_c, p_user_id) end;
  if v_role is null then
    raise exception 'Contratación no encontrada' using errcode = 'no_data_found';
  end if;
  select * into v_mine from public.reviews where contract_id = p_contract_id and author_user_id = p_user_id;
  select * into v_theirs from public.reviews where contract_id = p_contract_id and author_user_id <> p_user_id;
  -- La reseña que recibe el trabajador es pública; la que recibe el cliente, solo para trabajadores (RN-20).
  v_theirs_visible := v_theirs.id is not null and v_theirs.status = 'PUBLICADA'
    and (v_theirs.direction = 'CLIENTE_A_TRABAJADOR' or private.can_see_client_reviews(p_user_id));

  return jsonb_build_object(
    'canCreate', v_c.status = 'FINALIZADA' and v_mine.id is null
                 and v_c.completed_at + private.setting_days('reviews.window_days', 30) >= now(),
    'windowEndsAt', case when v_c.status = 'FINALIZADA' then v_c.completed_at + private.setting_days('reviews.window_days', 30) end,
    'mine', case when v_mine.id is not null then private.review_json(v_mine, p_user_id) end,
    'theirs', case when v_theirs_visible then private.review_json(v_theirs, p_user_id) end);
end;
$$;

/* Reseñas públicas de un trabajador HABILITADO (del cliente al trabajador, publicadas). */
create or replace function public.fn_public_worker_reviews(p_worker_id uuid, p_limit integer default 10, p_offset integer default 0)
returns table (
  id uuid,
  rating smallint,
  comment text,
  author_name text,
  service_name text,
  created_at timestamptz,
  edited boolean,
  total bigint
)
language sql
stable
set search_path = ''
as $$
  select r.id, r.rating, r.comment,
         (select private.short_name(coalesce(cp.full_name, u.display_name))
          from public.users u left join public.client_profiles cp on cp.user_id = u.id where u.id = r.author_user_id),
         (select s.name from public.contracts c join public.contract_terms t on t.id = c.agreed_terms_id
          left join public.services s on s.id = t.service_id where c.id = r.contract_id),
         r.created_at, r.edited_at is not null,
         count(*) over ()
  from public.reviews r
  join public.worker_profiles w on w.id = r.worker_id and w.status = 'HABILITADO'
  where r.worker_id = p_worker_id and r.direction = 'CLIENTE_A_TRABAJADOR' and r.status = 'PUBLICADA'
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

/*
 * Reputación del cliente de una conversación, para el TRABAJADOR de esa conversación (RN-20).
 * Un cliente o un tercero recibe «no encontrada»/403; nunca se expone en páginas públicas.
 */
create or replace function public.fn_client_reputation(p_user_id uuid, p_conversation_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_client uuid;
begin
  perform private.require_chat_user(p_user_id);
  if private.conversation_role(p_conversation_id, p_user_id) is distinct from 'TRABAJADOR' then
    raise exception 'Conversación no encontrada' using errcode = 'no_data_found';
  end if;
  if not private.can_see_client_reviews(p_user_id) then
    raise exception 'Solo los trabajadores ven las calificaciones de los clientes' using errcode = 'insufficient_privilege';
  end if;
  select client_user_id into v_client from public.conversations where id = p_conversation_id;

  return (
    select jsonb_build_object(
      'average', coalesce(round(avg(r.rating)::numeric, 1), 0),
      'count', count(*),
      'contractsCompleted', (select count(*) from public.contracts c where c.client_user_id = v_client and c.status = 'FINALIZADA'),
      'recent', coalesce((
        select jsonb_agg(x.j order by x.created_at desc) from (
          select jsonb_build_object('rating', r2.rating, 'comment', r2.comment, 'createdAt', r2.created_at,
                   'authorName', w.public_display_name) as j, r2.created_at
          from public.reviews r2 join public.worker_profiles w on w.id = r2.worker_id
          where r2.client_user_id = v_client and r2.direction = 'TRABAJADOR_A_CLIENTE' and r2.status = 'PUBLICADA'
          order by r2.created_at desc limit 5) x), '[]'::jsonb))
    from public.reviews r
    where r.client_user_id = v_client and r.direction = 'TRABAJADOR_A_CLIENTE' and r.status = 'PUBLICADA');
end;
$$;

-- Denuncia de una reseña visible para el usuario (no la propia). Enganche de la Fase 8.
insert into public.report_reasons (code, target_type, label, severity, sort_order) values
  ('RESENA_FALSA', 'REVIEW', 'No corresponde a un trabajo real o es falsa', 3, 1),
  ('RESENA_OFENSIVA', 'REVIEW', 'Lenguaje ofensivo o discriminatorio', 2, 2),
  ('RESENA_DATOS_PERSONALES', 'REVIEW', 'Publica datos personales', 3, 3),
  ('RESENA_EXTORSION', 'REVIEW', 'Amenaza o presión con la calificación', 3, 4),
  ('RESENA_OTRO', 'REVIEW', 'Otro motivo', 1, 5)
on conflict (code) do nothing;

create or replace function public.fn_report_review(
  p_user_id uuid,
  p_review_id uuid,
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
  v_r public.reviews;
  v_id uuid;
begin
  perform private.require_chat_user(p_user_id);
  select * into v_r from public.reviews where id = p_review_id;
  if not found or v_r.status <> 'PUBLICADA'
     or (v_r.direction = 'TRABAJADOR_A_CLIENTE' and not private.can_see_client_reviews(p_user_id)) then
    raise exception 'Calificación no encontrada' using errcode = 'no_data_found';
  end if;
  if v_r.author_user_id = p_user_id then
    raise exception 'No puedes denunciar tu propia calificación' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.report_reasons where code = p_reason_code and target_type = 'REVIEW' and active) then
    raise exception 'Motivo no válido' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.reports where reporter_id = p_user_id and target_type = 'REVIEW' and target_id = p_review_id::text
             and status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA')) then
    raise exception 'Ya denunciaste esta calificación; el GAD la está revisando' using errcode = 'unique_violation';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reported_user_id, reason_code, description)
  values (p_user_id, 'REVIEW', p_review_id::text, v_r.author_user_id, p_reason_code, nullif(btrim(p_description), ''))
  returning id into v_id;
  perform private.audit(p_user_id, 'REPORT_CREATED', 'report', v_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('targetType', 'REVIEW', 'targetId', p_review_id, 'reason', p_reason_code));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Moderación (personal del GAD con moderation.act)
-- -----------------------------------------------------------------------------

/* p_filter: DENUNCIADAS (con denuncias abiertas) | OCULTAS | TODAS. Incluye ambas direcciones (RN-20: el GAD sí las ve). */
create or replace function public.fn_admin_list_reviews(
  p_actor_id uuid,
  p_filter text default 'DENUNCIADAS',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  direction public.review_direction,
  rating smallint,
  comment text,
  status public.review_status,
  author_name text,
  subject_name text,
  worker_id uuid,
  contract_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text,
  open_reports bigint,
  report_reasons text[],
  total bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_permission(p_actor_id, 'moderation.act');
  return query
  with base as (
    select r.*,
           (select count(*) from public.reports x where x.target_type = 'REVIEW' and x.target_id = r.id::text
              and x.status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA')) as abiertas
    from public.reviews r
  )
  select b.id, b.direction, b.rating, b.comment, b.status,
         case when b.direction = 'CLIENTE_A_TRABAJADOR'
              then (select coalesce(cp.full_name, u.display_name) from public.users u
                    left join public.client_profiles cp on cp.user_id = u.id where u.id = b.author_user_id)
              else w.public_display_name end,
         case when b.direction = 'CLIENTE_A_TRABAJADOR' then w.public_display_name
              else (select coalesce(cp.full_name, u.display_name) from public.users u
                    left join public.client_profiles cp on cp.user_id = u.id where u.id = b.client_user_id) end,
         b.worker_id, b.contract_id, b.created_at, b.edited_at, b.hidden_at, b.hidden_reason, b.abiertas,
         coalesce((select array_agg(distinct rr.label) from public.reports x join public.report_reasons rr on rr.code = x.reason_code
                   where x.target_type = 'REVIEW' and x.target_id = b.id::text
                     and x.status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA')), '{}'),
         count(*) over ()
  from base b
  join public.worker_profiles w on w.id = b.worker_id
  where case upper(coalesce(p_filter, 'DENUNCIADAS'))
          when 'DENUNCIADAS' then b.abiertas > 0
          when 'OCULTAS' then b.status = 'OCULTA'
          else true end
  order by b.abiertas desc, b.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

/* Oculta (con motivo) o restaura una reseña. Al ocultar se resuelven sus denuncias abiertas. */
create or replace function public.fn_admin_set_review_hidden(
  p_actor_id uuid,
  p_review_id uuid,
  p_hidden boolean,
  p_reason text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns public.review_status
language plpgsql
set search_path = ''
as $$
declare
  v_r public.reviews;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform private.require_permission(p_actor_id, 'moderation.act');
  if char_length(v_reason) not between 10 and 500 then
    raise exception 'Registra el motivo (10 a 500 caracteres)' using errcode = 'check_violation';
  end if;
  select * into v_r from public.reviews where id = p_review_id for update;
  if not found then
    raise exception 'Calificación no encontrada' using errcode = 'no_data_found';
  end if;
  if (v_r.status = 'OCULTA') = p_hidden then
    raise exception '%', case when p_hidden then 'La calificación ya está oculta' else 'La calificación ya está publicada' end
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update public.reviews
    set status = case when p_hidden then 'OCULTA'::public.review_status else 'PUBLICADA'::public.review_status end,
        hidden_at = case when p_hidden then now() end,
        hidden_by = case when p_hidden then p_actor_id end,
        hidden_reason = case when p_hidden then v_reason end
    where id = p_review_id returning * into v_r;
  if p_hidden then
    update public.reports set status = 'RESUELTA'
      where target_type = 'REVIEW' and target_id = p_review_id::text
        and status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA');
  end if;
  perform private.audit(p_actor_id, case when p_hidden then 'REVIEW_HIDDEN' else 'REVIEW_RESTORED' end,
    'review', p_review_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('reason', v_reason, 'direction', v_r.direction));
  return v_r.status;
end;
$$;

-- -----------------------------------------------------------------------------
-- Contrataciones: aviso para calificar y «Te toca calificar» en «Mis contrataciones»
-- -----------------------------------------------------------------------------

create or replace function private.contract_finalize(p_id uuid, p_auto boolean)
returns public.contracts
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contracts;
  v_worker_user uuid;
  v_worker_name text;
  v_client_name text;
begin
  update public.contracts
    set status = 'FINALIZADA', completed_at = now(), auto_confirmed = p_auto,
        confirm_due_at = null, expires_at = null,
        current_terms_id = agreed_terms_id
    where id = p_id
    returning * into v_c;
  update public.worker_profiles set contracts_completed = contracts_completed + 1 where id = v_c.worker_id
    returning user_id, public_display_name into v_worker_user, v_worker_name;
  v_client_name := private.contract_party_name(v_c, 'CLIENTE');

  -- Invitación a calificar a ambas partes (una no leída por contratación y persona).
  insert into public.notifications (user_id, type, title, body, link, dedupe_key)
  values (v_c.client_user_id, 'REVIEW_REQUEST', left('¿Cómo te fue con ' || v_worker_name || '?', 120),
          'Califica el trabajo: ayudas a otras personas a elegir.', '/contrataciones/' || v_c.id, 'review:' || v_c.id)
  on conflict (user_id, dedupe_key) where read_at is null and dedupe_key is not null do nothing;
  if v_worker_user is not null then
    insert into public.notifications (user_id, type, title, body, link, dedupe_key)
    values (v_worker_user, 'REVIEW_REQUEST', left('Califica a ' || v_client_name, 120),
            'Tu calificación del cliente solo la ven otros trabajadores y el GAD.', '/contrataciones/' || v_c.id,
            'review:' || v_c.id)
    on conflict (user_id, dedupe_key) where read_at is null and dedupe_key is not null do nothing;
  end if;
  return v_c;
end;
$$;

-- La salida cambia (review_pending): se recrea la función.
drop function public.fn_list_contracts(uuid, text, uuid);

create function public.fn_list_contracts(
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
  updated_at timestamptz,
  review_pending boolean
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
         m.expires_at, m.confirm_due_at, m.created_at, m.updated_at,
         m.status = 'FINALIZADA'
           and m.completed_at + private.setting_days('reviews.window_days', 30) >= now()
           and not exists (select 1 from public.reviews r where r.contract_id = m.id and r.author_user_id = p_user_id)
  from mias m
  join public.contract_terms t on t.id = m.current_terms_id
  left join public.services s on s.id = t.service_id
  order by m.updated_at desc
  limit 200;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS y privilegios
-- -----------------------------------------------------------------------------

alter table public.reviews enable row level security;
-- Sin políticas para anon/authenticated: todo el acceso pasa por el servidor (y RN-20 en las funciones).
revoke all on public.reviews from anon, authenticated;
grant select, insert, update on public.reviews to service_role;
revoke delete, truncate on public.reviews from service_role;

revoke execute on function
  private.word_count(text),
  private.reviews_guard(),
  private.refresh_worker_rating(uuid),
  private.reviews_after_change(),
  private.can_see_client_reviews(uuid),
  private.review_json(public.reviews, uuid),
  public.fn_review_save(uuid, uuid, integer, text, inet, text, text),
  public.fn_contract_reviews(uuid, uuid),
  public.fn_public_worker_reviews(uuid, integer, integer),
  public.fn_client_reputation(uuid, uuid),
  public.fn_report_review(uuid, uuid, text, text, inet, text, text),
  public.fn_admin_list_reviews(uuid, text, integer, integer),
  public.fn_admin_set_review_hidden(uuid, uuid, boolean, text, inet, text, text),
  public.fn_list_contracts(uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function
  private.word_count(text),
  private.refresh_worker_rating(uuid),
  private.can_see_client_reviews(uuid),
  private.review_json(public.reviews, uuid),
  public.fn_review_save(uuid, uuid, integer, text, inet, text, text),
  public.fn_contract_reviews(uuid, uuid),
  public.fn_public_worker_reviews(uuid, integer, integer),
  public.fn_client_reputation(uuid, uuid),
  public.fn_report_review(uuid, uuid, text, text, inet, text, text),
  public.fn_admin_list_reviews(uuid, text, integer, integer),
  public.fn_admin_set_review_hidden(uuid, uuid, boolean, text, inet, text, text),
  public.fn_list_contracts(uuid, text, uuid)
  to service_role;
