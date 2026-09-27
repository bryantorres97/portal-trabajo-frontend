-- =============================================================================
-- Fase 9 — Panel administrativo: indicadores (metrics.read), reportes filtrables y CSV
-- (data.export, auditado), visor de auditoría y de accesos sensibles (audit.read), y contenido
-- administrable: preguntas frecuentes y documentos legales versionados (content.manage).
-- Detalle: docs/phases/fase-09-panel-administrativo.md
--
-- Fechas: los filtros son días de calendario en Ecuador (America/Guayaquil), inclusivos.
-- =============================================================================

insert into public.permissions (code, description) values
  ('content.manage', 'Administrar preguntas frecuentes y documentos legales')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
select v.role_code, v.permission_code
from (values ('ADMIN_SISTEMA', 'content.manage')) as v(role_code, permission_code)
where exists (select 1 from public.roles r where r.code = v.role_code)
on conflict do nothing;

-- Rango [desde, hasta] en días de Ecuador → instantes [inicio, fin).
create or replace function private.ec_range(p_from date, p_to date, out r_start timestamptz, out r_end timestamptz)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas no válido' using errcode = 'check_violation';
  end if;
  if p_to - p_from > 731 then
    raise exception 'El rango admite hasta dos años' using errcode = 'check_violation';
  end if;
  r_start := (p_from::timestamp) at time zone 'America/Guayaquil';
  r_end := ((p_to + 1)::timestamp) at time zone 'America/Guayaquil';
end;
$$;

-- -----------------------------------------------------------------------------
-- Indicadores (metrics.read)
-- -----------------------------------------------------------------------------

create or replace function public.fn_admin_metrics(p_actor_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  perform private.require_permission(p_actor_id, 'metrics.read');
  select r_start, r_end into v_start, v_end from private.ec_range(p_from, p_to);

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'workers', jsonb_build_object(
      'byStatus', coalesce((select jsonb_object_agg(status, n) from
                   (select status::text, count(*) as n from public.worker_profiles group by status) s), '{}'::jsonb),
      'registered', (select count(*) from public.worker_profiles where created_at >= v_start and created_at < v_end),
      'enabled', (select count(distinct worker_id) from public.worker_status_history
                  where to_status = 'HABILITADO' and created_at >= v_start and created_at < v_end),
      'enabledByCategory', coalesce((select jsonb_agg(jsonb_build_object('category', c.name, 'count', x.n) order by x.n desc, c.name)
                              from (select s.category_id, count(distinct w.id) as n
                                    from public.worker_profiles w
                                    join public.worker_services ws on ws.worker_id = w.id
                                    join public.services s on s.id = ws.service_id
                                    where w.status = 'HABILITADO'
                                    group by s.category_id) x
                              join public.categories c on c.id = x.category_id), '[]'::jsonb),
      'linked', (select count(*) from public.worker_profiles where user_id is not null)),
    'citizens', jsonb_build_object(
      'total', (select count(*) from public.users u where u.status = 'ACTIVO' and not private.is_staff_account(u.id)),
      'new', (select count(*) from public.users u where u.created_at >= v_start and u.created_at < v_end
                and not private.is_staff_account(u.id))),
    'chat', jsonb_build_object(
      'conversationsTotal', (select count(*) from public.conversations),
      'conversationsNew', (select count(*) from public.conversations where created_at >= v_start and created_at < v_end),
      'messages', (select count(*) from public.messages where kind = 'TEXT' and created_at >= v_start and created_at < v_end)),
    'contracts', jsonb_build_object(
      'byStatus', coalesce((select jsonb_object_agg(status, n) from
                   (select status::text, count(*) as n from public.contracts group by status) s), '{}'::jsonb),
      'proposed', (select count(*) from public.contracts where created_at >= v_start and created_at < v_end),
      'agreed', (select count(*) from public.contracts where agreed_at >= v_start and agreed_at < v_end),
      'completed', (select count(*) from public.contracts where status = 'FINALIZADA' and completed_at >= v_start and completed_at < v_end),
      'cancelled', (select count(*) from public.contracts where status = 'CANCELADA' and cancelled_at >= v_start and cancelled_at < v_end),
      'conversionPct', (select case when count(*) = 0 then null
                                    else round(100.0 * count(*) filter (where agreed_at is not null) / count(*), 1) end
                        from public.contracts where created_at >= v_start and created_at < v_end),
      'avgHoursToAgreement', (select round(avg(extract(epoch from agreed_at - created_at) / 3600)::numeric, 1)
                              from public.contracts where agreed_at >= v_start and agreed_at < v_end)),
    'reviews', jsonb_build_object(
      'count', (select count(*) from public.reviews where direction = 'CLIENTE_A_TRABAJADOR' and status = 'PUBLICADA'
                and created_at >= v_start and created_at < v_end),
      'avgRating', (select round(avg(rating)::numeric, 2) from public.reviews
                    where direction = 'CLIENTE_A_TRABAJADOR' and status = 'PUBLICADA' and created_at >= v_start and created_at < v_end),
      'hidden', (select count(*) from public.reviews where hidden_at >= v_start and hidden_at < v_end)),
    'reports', jsonb_build_object(
      'created', (select count(*) from public.reports where created_at >= v_start and created_at < v_end),
      'byTargetType', coalesce((select jsonb_object_agg(target_type, n) from
                        (select target_type, count(*) as n from public.reports
                         where created_at >= v_start and created_at < v_end group by target_type) s), '{}'::jsonb),
      'open', (select count(*) from public.reports where status in ('ABIERTA', 'EN_REVISION', 'EN_ESPERA_DE_INFORMACION', 'ESCALADA')),
      'overdue', (select count(*) from public.reports where status in ('ABIERTA', 'EN_REVISION', 'ESCALADA') and due_at < now()),
      'resolved', (select count(*) from public.reports where status in ('RESUELTA', 'DESCARTADA')
                   and resolved_at >= v_start and resolved_at < v_end),
      'avgResolutionHours', (select round(avg(extract(epoch from resolved_at - created_at) / 3600)::numeric, 1)
                             from public.reports where status in ('RESUELTA', 'DESCARTADA')
                             and resolved_at >= v_start and resolved_at < v_end),
      'withinDeadlinePct', (select case when count(*) = 0 then null
                                        else round(100.0 * count(*) filter (where resolved_at <= due_at) / count(*), 1) end
                            from public.reports where status in ('RESUELTA', 'DESCARTADA')
                            and resolved_at >= v_start and resolved_at < v_end),
      'sanctions', (select count(*) from public.moderation_actions where created_at >= v_start and created_at < v_end))
  );
end;
$$;

/* Actividad semanal (lunes a domingo, en Ecuador) de las últimas N semanas. */
create or replace function public.fn_admin_weekly_activity(p_actor_id uuid, p_weeks integer default 12)
returns table (week_start date, conversations bigint, contracts bigint, completed bigint, reports bigint)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Guayaquil')::date;
  v_first date;
begin
  perform private.require_permission(p_actor_id, 'metrics.read');
  v_first := date_trunc('week', v_today)::date - 7 * (least(greatest(coalesce(p_weeks, 12), 1), 52) - 1);
  return query
  with semanas as (select generate_series(v_first, date_trunc('week', v_today)::date, interval '7 days')::date as s)
  select w.s,
    (select count(*) from public.conversations c where (c.created_at at time zone 'America/Guayaquil')::date between w.s and w.s + 6),
    (select count(*) from public.contracts k where (k.created_at at time zone 'America/Guayaquil')::date between w.s and w.s + 6),
    (select count(*) from public.contracts k where k.status = 'FINALIZADA'
       and (k.completed_at at time zone 'America/Guayaquil')::date between w.s and w.s + 6),
    (select count(*) from public.reports r where (r.created_at at time zone 'America/Guayaquil')::date between w.s and w.s + 6)
  from semanas w
  order by w.s;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reportes (metrics.read para ver; data.export para descargar, auditado desde el servidor)
-- Sin datos personales de clientes: se muestran códigos y nombres públicos.
-- -----------------------------------------------------------------------------

create or replace function public.fn_admin_report_workers(
  p_actor_id uuid,
  p_from date,
  p_to date,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  worker_id uuid,
  public_name text,
  status text,
  parish text,
  services text,
  registered_at timestamptz,
  enabled_at timestamptz,
  rating_avg numeric,
  rating_count integer,
  contracts_completed integer,
  account_linked boolean,
  total bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  perform private.require_permission(p_actor_id, 'metrics.read');
  select r_start, r_end into v_start, v_end from private.ec_range(p_from, p_to);
  return query
  select w.id, w.public_display_name, w.status::text, pa.name,
         (select string_agg(s.name, ', ' order by ws.is_primary desc, s.name) from public.worker_services ws
          join public.services s on s.id = ws.service_id where ws.worker_id = w.id),
         w.created_at, w.enabled_at, w.rating_avg, w.rating_count, w.contracts_completed, w.user_id is not null,
         count(*) over ()
  from public.worker_profiles w
  left join public.parishes pa on pa.id = w.parish_id
  where w.created_at >= v_start and w.created_at < v_end
    and (p_status is null or w.status::text = p_status)
  order by w.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.fn_admin_report_contracts(
  p_actor_id uuid,
  p_from date,
  p_to date,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  contract_id uuid,
  status text,
  worker_name text,
  service text,
  parish text,
  price_amount numeric,
  price_unit text,
  versions integer,
  created_at timestamptz,
  agreed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  disputed boolean,
  total bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  perform private.require_permission(p_actor_id, 'metrics.read');
  select r_start, r_end into v_start, v_end from private.ec_range(p_from, p_to);
  return query
  select k.id, k.status::text, w.public_display_name, s.name, pa.name, t.price_amount, t.price_unit,
         (select count(*)::integer from public.contract_terms x where x.contract_id = k.id),
         k.created_at, k.agreed_at, k.completed_at, k.cancelled_at, k.disputed_at is not null,
         count(*) over ()
  from public.contracts k
  join public.worker_profiles w on w.id = k.worker_id
  join public.contract_terms t on t.id = coalesce(k.agreed_terms_id, k.current_terms_id)
  left join public.services s on s.id = t.service_id
  left join public.parishes pa on pa.id = t.parish_id
  where k.created_at >= v_start and k.created_at < v_end
    and (p_status is null or k.status::text = p_status)
  order by k.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.fn_admin_report_reports(
  p_actor_id uuid,
  p_from date,
  p_to date,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  report_id uuid,
  target_type text,
  reason text,
  status text,
  priority smallint,
  created_at timestamptz,
  due_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  hours_to_resolve numeric,
  within_deadline boolean,
  sanctions integer,
  total bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  perform private.require_permission(p_actor_id, 'metrics.read');
  select r_start, r_end into v_start, v_end from private.ec_range(p_from, p_to);
  return query
  select r.id, r.target_type, rr.label, r.status::text, r.priority, r.created_at, r.due_at, r.resolved_at, r.resolution,
         case when r.resolved_at is not null then round((extract(epoch from r.resolved_at - r.created_at) / 3600)::numeric, 1) end,
         case when r.resolved_at is not null then r.resolved_at <= r.due_at end,
         (select count(*)::integer from public.moderation_actions m where m.report_id = r.id),
         count(*) over ()
  from public.reports r
  join public.report_reasons rr on rr.code = r.reason_code
  where r.created_at >= v_start and r.created_at < v_end
    and (p_status is null or r.status::text = p_status)
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- Visor de auditoría y de accesos sensibles (audit.read)
-- -----------------------------------------------------------------------------

create or replace function public.fn_admin_audit_search(
  p_actor_id uuid,
  p_from date,
  p_to date,
  p_action text default null,
  p_resource_type text default null,
  p_actor_q text default null,
  p_resource_id text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  occurred_at timestamptz,
  action text,
  result text,
  actor_id uuid,
  actor_name text,
  actor_roles text[],
  resource_type text,
  resource_id text,
  ip text,
  request_id text,
  metadata jsonb,
  total bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
  v_q text := nullif(btrim(coalesce(p_actor_q, '')), '');
begin
  perform private.require_permission(p_actor_id, 'audit.read');
  select r_start, r_end into v_start, v_end from private.ec_range(p_from, p_to);
  return query
  select a.id, a.occurred_at, a.action, a.result::text, a.actor_id,
         coalesce(u.display_name, u.email), a.actor_roles, a.resource_type, a.resource_id, host(a.ip), a.request_id,
         a.metadata, count(*) over ()
  from public.audit_log a
  left join public.users u on u.id = a.actor_id
  where a.occurred_at >= v_start and a.occurred_at < v_end
    and (p_action is null or a.action like upper(p_action) || '%')
    and (p_resource_type is null or a.resource_type = p_resource_type)
    and (p_resource_id is null or a.resource_id = p_resource_id)
    and (v_q is null or u.display_name ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%'
         or a.actor_id::text = v_q)
  order by a.occurred_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.fn_admin_sensitive_access_search(
  p_actor_id uuid,
  p_from date,
  p_to date,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  occurred_at timestamptz,
  actor_name text,
  resource_type text,
  resource_id text,
  report_id uuid,
  justification text,
  total bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  perform private.require_permission(p_actor_id, 'audit.read');
  select r_start, r_end into v_start, v_end from private.ec_range(p_from, p_to);
  return query
  select s.id, s.occurred_at, coalesce(u.display_name, u.email), s.resource_type, s.resource_id, s.report_id,
         s.justification, count(*) over ()
  from public.sensitive_access_log s
  left join public.users u on u.id = s.actor_id
  where s.occurred_at >= v_start and s.occurred_at < v_end
  order by s.occurred_at desc, s.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- Preguntas frecuentes (content.manage)
-- -----------------------------------------------------------------------------

create table public.faq_items (
  id          uuid primary key default gen_random_uuid(),
  audience    text not null default 'GENERAL',
  question    text not null,
  answer_md   text not null,
  sort_order  smallint not null default 0,
  published   boolean not null default false,
  updated_by  uuid references public.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint faq_items_audience check (audience in ('GENERAL', 'CLIENTES', 'TRABAJADORES')),
  constraint faq_items_question_len check (char_length(btrim(question)) between 5 and 200),
  constraint faq_items_answer_len check (char_length(btrim(answer_md)) between 5 and 4000),
  constraint faq_items_sort check (sort_order between 0 and 999)
);

create index faq_items_public_idx on public.faq_items (audience, sort_order) where published;
create index faq_items_updated_by_idx on public.faq_items (updated_by);

create trigger faq_items_set_updated_at before update on public.faq_items
  for each row execute function private.set_updated_at();

insert into public.faq_items (audience, question, answer_md, sort_order, published) values
  ('GENERAL', '¿Qué es Acolita.App?',
   'Es la plataforma del GAD Municipalidad de Ambato para encontrar trabajadores de oficio **registrados, capacitados y habilitados** por el Municipio, conversar con ellos y dejar por escrito lo que acuerdan.', 1, true),
  ('CLIENTES', '¿Cuánto cuesta usar la plataforma?',
   'Nada. La plataforma no cobra comisiones ni procesa pagos: el precio que acuerdas es una referencia y le pagas directamente al trabajador.', 2, true),
  ('CLIENTES', '¿Por qué no veo el teléfono del trabajador?',
   'Para proteger a ambas partes, todo el contacto se hace por el chat del portal. Así la conversación queda registrada y puedes denunciar cualquier abuso.', 3, true),
  ('CLIENTES', '¿Cuándo existe una contratación?',
   'Cuando ambas partes aceptan **la misma versión** de las condiciones. Si alguien cambia algo, se crea una nueva versión que la otra parte debe aceptar.', 4, true),
  ('TRABAJADORES', '¿Cómo me registro como trabajador?',
   'El registro es **presencial** en los puntos de atención del GAD. Después de la revisión de documentos y la capacitación, el GAD te habilita y te entrega un código para activar tu cuenta.', 5, true),
  ('GENERAL', '¿Qué hago si tengo un problema con alguien?',
   'Puedes bloquear la conversación y denunciar el mensaje, la conversación, el perfil o la contratación. El personal del GAD revisa cada denuncia y puedes seguir su estado en «Mis denuncias».', 6, true)
on conflict do nothing;

create or replace function public.fn_public_faq()
returns table (id uuid, audience text, question text, answer_md text)
language sql
stable
set search_path = ''
as $$
  select id, audience, question, answer_md from public.faq_items where published order by sort_order, question;
$$;

create or replace function public.fn_admin_save_faq(
  p_actor_id uuid,
  p_id uuid,
  p_audience text,
  p_question text,
  p_answer_md text,
  p_sort_order integer,
  p_published boolean,
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
  perform private.require_permission(p_actor_id, 'content.manage');
  if p_id is null then
    insert into public.faq_items (audience, question, answer_md, sort_order, published, updated_by)
    values (p_audience, btrim(p_question), btrim(p_answer_md), coalesce(p_sort_order, 0), coalesce(p_published, false), p_actor_id)
    returning id into v_id;
  else
    update public.faq_items
      set audience = p_audience, question = btrim(p_question), answer_md = btrim(p_answer_md),
          sort_order = coalesce(p_sort_order, 0), published = coalesce(p_published, false), updated_by = p_actor_id
      where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Pregunta no encontrada' using errcode = 'no_data_found';
    end if;
  end if;
  perform private.audit(p_actor_id, case when p_id is null then 'FAQ_CREATED' else 'FAQ_UPDATED' end, 'faq', v_id::text,
    p_ip, p_user_agent, p_request_id, jsonb_build_object('published', p_published, 'audience', p_audience));
  return v_id;
end;
$$;

create or replace function public.fn_admin_delete_faq(
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
  v_q text;
begin
  perform private.require_permission(p_actor_id, 'content.manage');
  delete from public.faq_items where id = p_id returning question into v_q;
  if v_q is null then
    raise exception 'Pregunta no encontrada' using errcode = 'no_data_found';
  end if;
  perform private.audit(p_actor_id, 'FAQ_DELETED', 'faq', p_id::text, p_ip, p_user_agent, p_request_id,
    jsonb_build_object('question', v_q));
end;
$$;

-- -----------------------------------------------------------------------------
-- Documentos legales versionados (content.manage)
-- Una versión PUBLICADA es inmutable (los consentimientos la referencian). Se edita un borrador y,
-- al publicarlo, todos deben aceptar la nueva versión (RN-18).
-- -----------------------------------------------------------------------------

create or replace function private.legal_documents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null then
      raise exception 'Una versión publicada no se elimina' using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if old.published_at is not null then
    raise exception 'Una versión publicada no se modifica: crea una nueva versión' using errcode = 'insufficient_privilege';
  end if;
  if new.code is distinct from old.code or new.version is distinct from old.version then
    raise exception 'El código y la versión no cambian' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger legal_documents_guard before update or delete on public.legal_documents
  for each row execute function private.legal_documents_guard();

alter table public.legal_documents
  add column updated_by uuid references public.users (id),
  add constraint legal_documents_content_len check (char_length(btrim(content_md)) between 20 and 100000);

create index legal_documents_updated_by_idx on public.legal_documents (updated_by);
-- Un solo borrador por documento.
create unique index legal_documents_one_draft_key on public.legal_documents (code) where published_at is null;

create or replace function public.fn_admin_legal_documents(p_actor_id uuid)
returns table (code text, version integer, title text, content_md text, published_at timestamptz, created_at timestamptz,
               acceptances bigint)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_permission(p_actor_id, 'content.manage');
  return query
  select d.code, d.version, d.title, d.content_md, d.published_at, d.created_at,
         (select count(*) from public.consents c where c.document_code = d.code and c.document_version = d.version)
  from public.legal_documents d
  order by d.code, d.version desc;
end;
$$;

/* Guarda el borrador (crea la siguiente versión si no existe). */
create or replace function public.fn_admin_save_legal_draft(
  p_actor_id uuid,
  p_code text,
  p_title text,
  p_content_md text,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_version integer;
begin
  perform private.require_permission(p_actor_id, 'content.manage');
  if p_code not in ('TERMINOS', 'PRIVACIDAD') then
    raise exception 'Documento no válido' using errcode = 'check_violation';
  end if;
  perform pg_advisory_xact_lock(hashtext('legal:' || p_code));
  update public.legal_documents set title = btrim(p_title), content_md = btrim(p_content_md), updated_by = p_actor_id
    where code = p_code and published_at is null returning version into v_version;
  if v_version is null then
    select coalesce(max(version), 0) + 1 into v_version from public.legal_documents where code = p_code;
    insert into public.legal_documents (code, version, title, content_md, updated_by)
    values (p_code, v_version, btrim(p_title), btrim(p_content_md), p_actor_id);
  end if;
  perform private.audit(p_actor_id, 'LEGAL_DRAFT_SAVED', 'legal_document', p_code || '@' || v_version,
    p_ip, p_user_agent, p_request_id, '{}'::jsonb);
  return v_version;
end;
$$;

create or replace function public.fn_admin_publish_legal(
  p_actor_id uuid,
  p_code text,
  p_version integer,
  p_ip inet default null,
  p_user_agent text default null,
  p_request_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.require_permission(p_actor_id, 'content.manage');
  perform pg_advisory_xact_lock(hashtext('legal:' || p_code));
  -- Publicar es el último cambio permitido: después, el guardia bloquea cualquier modificación.
  update public.legal_documents set published_at = now(), updated_by = p_actor_id
    where code = p_code and version = p_version and published_at is null;
  if not found then
    raise exception 'No hay un borrador con esa versión' using errcode = 'no_data_found';
  end if;
  perform private.audit(p_actor_id, 'LEGAL_DOCUMENT_PUBLISHED', 'legal_document', p_code || '@' || p_version,
    p_ip, p_user_agent, p_request_id, jsonb_build_object('code', p_code, 'version', p_version));
end;
$$;

create or replace function public.fn_admin_discard_legal_draft(p_actor_id uuid, p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.require_permission(p_actor_id, 'content.manage');
  delete from public.legal_documents where code = p_code and published_at is null;
  if not found then
    raise exception 'No hay un borrador' using errcode = 'no_data_found';
  end if;
  perform private.audit(p_actor_id, 'LEGAL_DRAFT_DISCARDED', 'legal_document', p_code, null, null, null, '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS y privilegios
-- -----------------------------------------------------------------------------

alter table public.faq_items enable row level security;
revoke all on public.faq_items from anon, authenticated;
grant select, insert, update, delete on public.faq_items to service_role;
grant delete on public.legal_documents to service_role;

revoke execute on function
  private.ec_range(date, date),
  private.legal_documents_guard(),
  public.fn_admin_metrics(uuid, date, date),
  public.fn_admin_weekly_activity(uuid, integer),
  public.fn_admin_report_workers(uuid, date, date, text, integer, integer),
  public.fn_admin_report_contracts(uuid, date, date, text, integer, integer),
  public.fn_admin_report_reports(uuid, date, date, text, integer, integer),
  public.fn_admin_audit_search(uuid, date, date, text, text, text, text, integer, integer),
  public.fn_admin_sensitive_access_search(uuid, date, date, integer, integer),
  public.fn_public_faq(),
  public.fn_admin_save_faq(uuid, uuid, text, text, text, integer, boolean, inet, text, text),
  public.fn_admin_delete_faq(uuid, uuid, inet, text, text),
  public.fn_admin_legal_documents(uuid),
  public.fn_admin_save_legal_draft(uuid, text, text, text, inet, text, text),
  public.fn_admin_publish_legal(uuid, text, integer, inet, text, text),
  public.fn_admin_discard_legal_draft(uuid, text)
  from public, anon, authenticated;

grant execute on function
  private.ec_range(date, date),
  public.fn_admin_metrics(uuid, date, date),
  public.fn_admin_weekly_activity(uuid, integer),
  public.fn_admin_report_workers(uuid, date, date, text, integer, integer),
  public.fn_admin_report_contracts(uuid, date, date, text, integer, integer),
  public.fn_admin_report_reports(uuid, date, date, text, integer, integer),
  public.fn_admin_audit_search(uuid, date, date, text, text, text, text, integer, integer),
  public.fn_admin_sensitive_access_search(uuid, date, date, integer, integer),
  public.fn_public_faq(),
  public.fn_admin_save_faq(uuid, uuid, text, text, text, integer, boolean, inet, text, text),
  public.fn_admin_delete_faq(uuid, uuid, inet, text, text),
  public.fn_admin_legal_documents(uuid),
  public.fn_admin_save_legal_draft(uuid, text, text, text, inet, text, text),
  public.fn_admin_publish_legal(uuid, text, integer, inet, text, text),
  public.fn_admin_discard_legal_draft(uuid, text)
  to service_role;
