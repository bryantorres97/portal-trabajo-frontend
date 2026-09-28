-- =============================================================================
-- Fase 3 — Catálogo (categorías → oficios), parroquias, trabajadores y búsqueda.
-- Detalle: docs/phases/fase-03-catalogo-busqueda.md · Modelo: docs/analysis/04-modelo-datos.md
--
-- Privacidad (RN-01, RN-19): la lectura pública pasa SOLO por fn_public_search_workers y
-- fn_public_worker, que devuelven columnas explícitas de trabajadores HABILITADOS.
-- Nunca exponen teléfono, email, dirección, fecha de nacimiento ni nombres legales.
-- =============================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent() no es IMMUTABLE; este envoltorio sí lo es (diccionario fijo) y permite usarlo en índices.
create or replace function private.normalize_text(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, '')));
$$;

-- -----------------------------------------------------------------------------
-- Parroquias del cantón Ambato (ubicación aproximada). [INFERIDO — validar con el GAD, P-12]
-- -----------------------------------------------------------------------------

create table public.parishes (
  id          smallint generated always as identity primary key,
  code        text not null,
  name        text not null,
  kind        text not null,
  sort_order  smallint not null default 0,
  active      boolean not null default true,
  constraint parishes_code_key unique (code),
  constraint parishes_code_format check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint parishes_kind check (kind in ('URBANA', 'RURAL'))
);

-- -----------------------------------------------------------------------------
-- Catálogo: categorías (grupos) → servicios (oficios)
-- -----------------------------------------------------------------------------

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories (id),
  slug        text not null,
  name        text not null,
  description text,
  color       text not null default 'azul',
  sort_order  smallint not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint categories_slug_key unique (slug),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint categories_name_len check (char_length(btrim(name)) between 2 and 80),
  constraint categories_description_len check (description is null or char_length(description) <= 300),
  constraint categories_color check (color in ('verde', 'azul', 'magenta', 'amarillo', 'naranja')),
  constraint categories_not_self_parent check (parent_id is null or parent_id <> id)
);

create index categories_parent_idx on public.categories (parent_id);

create table public.services (
  id                   uuid primary key default gen_random_uuid(),
  category_id          uuid not null references public.categories (id),
  slug                 text not null,
  name                 text not null,
  description          text,
  reference_price_min  numeric(10, 2),
  reference_price_max  numeric(10, 2),
  price_unit           text not null default 'JORNAL',
  image_path           text,
  color                text not null default 'azul',
  sort_order           smallint not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint services_slug_key unique (slug),
  constraint services_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint services_name_len check (char_length(btrim(name)) between 2 and 80),
  constraint services_description_len check (description is null or char_length(description) <= 300),
  constraint services_price_unit check (price_unit in ('JORNAL', 'JORNADA', 'HORA', 'OBRA', 'SERVICIO')),
  constraint services_prices check (
    (reference_price_min is null or reference_price_min >= 0)
    and (reference_price_max is null or reference_price_max >= 0)
    and (reference_price_min is null or reference_price_max is null or reference_price_min <= reference_price_max)
  ),
  constraint services_color check (color in ('verde', 'azul', 'magenta', 'amarillo', 'naranja')),
  constraint services_image_path check (image_path is null or image_path ~ '^/images/[a-z0-9/_.-]+$')
);

create index services_category_idx on public.services (category_id);

create trigger categories_set_updated_at before update on public.categories
  for each row execute function private.set_updated_at();
create trigger services_set_updated_at before update on public.services
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Trabajadores
-- -----------------------------------------------------------------------------

create type public.worker_status as enum (
  'REGISTRADO',
  'DOCUMENTACION_PENDIENTE',
  'PENDIENTE_REVISION',
  'CAPACITACION_PENDIENTE',
  'CAPACITACION_EN_PROCESO',
  'CAPACITACION_APROBADA',
  'HABILITADO',
  'SUSPENDIDO',
  'RECHAZADO',
  'INACTIVO'
);

create table public.worker_profiles (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references public.users (id),
  -- Datos privados (RN-19): solo personal del GAD con worker.read.private
  first_names              text not null,
  last_names               text not null,
  phone                    text,
  email                    text,
  address                  text,
  birth_date               date,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  -- Datos públicos (solo cuando está HABILITADO)
  public_display_name      text not null,
  specialty                text,
  public_bio               text,
  photo_path               text,
  photo_status             text not null default 'SIN_FOTO',
  years_experience         smallint not null default 0,
  is_available             boolean not null default true,
  availability_note        text,
  parish_id                smallint references public.parishes (id),
  -- Estado (máquina de estados completa en la Fase 4)
  status                   public.worker_status not null default 'REGISTRADO',
  status_changed_at        timestamptz not null default now(),
  enabled_at               timestamptz,
  suspended_until          timestamptz,
  -- Reputación (desnormalizada; se recalcula en la Fase 7)
  rating_avg               numeric(3, 2) not null default 0,
  rating_count             integer not null default 0,
  contracts_completed      integer not null default 0,
  -- Búsqueda (mantenidos por trigger)
  search_text              text not null default '',
  search_vector            tsvector not null default ''::tsvector,
  registered_by            uuid references public.users (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint worker_profiles_user_key unique (user_id),
  constraint worker_profiles_names_len check (
    char_length(btrim(first_names)) between 1 and 80 and char_length(btrim(last_names)) between 1 and 80
  ),
  constraint worker_profiles_display_name_len check (char_length(btrim(public_display_name)) between 3 and 80),
  constraint worker_profiles_specialty_len check (specialty is null or char_length(specialty) <= 120),
  constraint worker_profiles_bio_len check (public_bio is null or char_length(public_bio) <= 800),
  constraint worker_profiles_phone_format check (phone is null or phone ~ '^09[0-9]{8}$'),
  constraint worker_profiles_emergency_phone_format check (
    emergency_contact_phone is null or emergency_contact_phone ~ '^0[2-9][0-9]{7,8}$'
  ),
  constraint worker_profiles_email_format check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint worker_profiles_photo_status check (photo_status in ('SIN_FOTO', 'PENDIENTE', 'APROBADA', 'RECHAZADA')),
  constraint worker_profiles_experience check (years_experience between 0 and 70),
  constraint worker_profiles_availability_note_len check (availability_note is null or char_length(availability_note) <= 160),
  constraint worker_profiles_rating check (rating_avg between 0 and 5 and rating_count >= 0 and contracts_completed >= 0)
);

comment on table public.worker_profiles is
  'Trabajadores registrados por el GAD. Datos privados y públicos separados por columnas; la exposición pública solo es vía fn_public_*.';

create index worker_profiles_enabled_idx on public.worker_profiles (rating_avg desc, years_experience desc)
  where status = 'HABILITADO';
create index worker_profiles_parish_idx on public.worker_profiles (parish_id);
create index worker_profiles_registered_by_idx on public.worker_profiles (registered_by);
create index worker_profiles_search_vector_idx on public.worker_profiles using gin (search_vector);
create index worker_profiles_search_trgm_idx on public.worker_profiles using gin (search_text extensions.gin_trgm_ops);

create table public.worker_services (
  worker_id         uuid not null references public.worker_profiles (id) on delete cascade,
  service_id        uuid not null references public.services (id),
  description       text,
  years_experience  smallint,
  price_min         numeric(10, 2),
  price_max         numeric(10, 2),
  price_unit        text,
  is_primary        boolean not null default false,
  created_at        timestamptz not null default now(),
  primary key (worker_id, service_id),
  constraint worker_services_description_len check (description is null or char_length(description) <= 300),
  constraint worker_services_experience check (years_experience is null or years_experience between 0 and 70),
  constraint worker_services_price_unit check (price_unit is null or price_unit in ('JORNAL', 'JORNADA', 'HORA', 'OBRA', 'SERVICIO')),
  constraint worker_services_prices check (
    (price_min is null or price_min >= 0) and (price_max is null or price_max >= 0)
    and (price_min is null or price_max is null or price_min <= price_max)
  )
);

create index worker_services_service_idx on public.worker_services (service_id, worker_id);

create trigger worker_profiles_set_updated_at before update on public.worker_profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Índice de búsqueda: search_text (sin tildes) + search_vector (spanish, con pesos)
--   A: oficios y especialidad · B: nombre público y categorías · C: biografía y parroquia
-- -----------------------------------------------------------------------------

create or replace function private.worker_search_trigger()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_servicios text;
  v_categorias text;
  v_parroquia text;
begin
  select coalesce(string_agg(s.name || ' ' || coalesce(ws.description, ''), ' '), ''),
         coalesce(string_agg(distinct c.name, ' '), '')
    into v_servicios, v_categorias
  from public.worker_services ws
  join public.services s on s.id = ws.service_id
  join public.categories c on c.id = s.category_id
  where ws.worker_id = new.id;

  select name into v_parroquia from public.parishes where id = new.parish_id;

  new.search_text := private.normalize_text(concat_ws(' ',
    v_servicios, new.specialty, new.public_display_name, v_categorias, new.public_bio, v_parroquia));
  new.search_vector :=
    setweight(to_tsvector('spanish', private.normalize_text(concat_ws(' ', v_servicios, new.specialty))), 'A')
    || setweight(to_tsvector('spanish', private.normalize_text(concat_ws(' ', new.public_display_name, v_categorias))), 'B')
    || setweight(to_tsvector('spanish', private.normalize_text(concat_ws(' ', new.public_bio, v_parroquia))), 'C');
  return new;
end;
$$;

create trigger worker_profiles_search
  before insert or update of public_display_name, specialty, public_bio, parish_id, search_text
  on public.worker_profiles
  for each row execute function private.worker_search_trigger();

-- Recalcula el índice de los trabajadores afectados (asignar search_text dispara el trigger anterior).
create or replace function private.touch_worker_search(p_worker_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.worker_profiles set search_text = search_text where id = any (p_worker_ids);
$$;

create or replace function private.worker_services_search_trigger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.touch_worker_search(array[coalesce(new.worker_id, old.worker_id)]);
  return null;
end;
$$;

create trigger worker_services_search
  after insert or update or delete on public.worker_services
  for each row execute function private.worker_services_search_trigger();

create or replace function private.catalog_search_trigger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'services' then
    perform private.touch_worker_search(array(select worker_id from public.worker_services where service_id = new.id));
  else
    perform private.touch_worker_search(array(
      select ws.worker_id from public.worker_services ws
      join public.services s on s.id = ws.service_id where s.category_id = new.id));
  end if;
  return null;
end;
$$;

create trigger services_search after update of name on public.services
  for each row execute function private.catalog_search_trigger();
create trigger categories_search after update of name on public.categories
  for each row execute function private.catalog_search_trigger();

-- -----------------------------------------------------------------------------
-- Lectura pública (solo HABILITADO, columnas explícitas, sin datos privados)
-- -----------------------------------------------------------------------------

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
  services jsonb
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
         ), '[]'::jsonb)
  from public.worker_profiles w
  left join public.parishes pa on pa.id = w.parish_id
  where w.id = p_id and w.status = 'HABILITADO';
$$;

-- Catálogo público con número de trabajadores habilitados por oficio.
create or replace function public.fn_public_catalog()
returns table (
  category_slug text,
  category_name text,
  category_description text,
  category_color text,
  service_id uuid,
  service_slug text,
  service_name text,
  service_description text,
  reference_price_min numeric,
  reference_price_max numeric,
  price_unit text,
  image_path text,
  color text,
  enabled_workers bigint
)
language sql
stable
set search_path = ''
as $$
  select c.slug, c.name, c.description, c.color,
         s.id, s.slug, s.name, s.description, s.reference_price_min, s.reference_price_max, s.price_unit,
         s.image_path, s.color,
         (select count(*) from public.worker_services ws
          join public.worker_profiles w on w.id = ws.worker_id
          where ws.service_id = s.id and w.status = 'HABILITADO')
  from public.services s
  join public.categories c on c.id = s.category_id
  where s.active and c.active
  order by c.sort_order, c.name, s.sort_order, s.name;
$$;

-- -----------------------------------------------------------------------------
-- Administración del catálogo (catalog.manage) con auditoría atómica
-- -----------------------------------------------------------------------------

create or replace function public.fn_admin_save_category(
  p_actor_id uuid,
  p_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_color text,
  p_sort_order smallint,
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
  v_accion text;
begin
  perform private.require_permission(p_actor_id, 'catalog.manage');
  if p_id is null then
    insert into public.categories (slug, name, description, color, sort_order, active)
    values (p_slug, btrim(p_name), nullif(btrim(p_description), ''), p_color, p_sort_order, p_active)
    returning id into v_id;
    v_accion := 'CATEGORY_CREATED';
  else
    update public.categories
      set slug = p_slug, name = btrim(p_name), description = nullif(btrim(p_description), ''),
          color = p_color, sort_order = p_sort_order, active = p_active
      where id = p_id
      returning id into v_id;
    if v_id is null then
      raise exception 'Categoría no encontrada' using errcode = 'no_data_found';
    end if;
    v_accion := 'CATEGORY_UPDATED';
  end if;

  insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
  values (p_actor_id, private.user_active_roles(p_actor_id), v_accion, 'category', v_id::text,
          p_ip, left(p_user_agent, 512), p_request_id,
          jsonb_build_object('slug', p_slug, 'name', btrim(p_name), 'active', p_active));
  return v_id;
end;
$$;

create or replace function public.fn_admin_save_service(
  p_actor_id uuid,
  p_id uuid,
  p_category_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_price_min numeric,
  p_price_max numeric,
  p_price_unit text,
  p_color text,
  p_sort_order smallint,
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
  v_accion text;
begin
  perform private.require_permission(p_actor_id, 'catalog.manage');
  if p_id is null then
    insert into public.services (category_id, slug, name, description, reference_price_min, reference_price_max,
                                 price_unit, color, sort_order, active)
    values (p_category_id, p_slug, btrim(p_name), nullif(btrim(p_description), ''), p_price_min, p_price_max,
            p_price_unit, p_color, p_sort_order, p_active)
    returning id into v_id;
    v_accion := 'SERVICE_CREATED';
  else
    update public.services
      set category_id = p_category_id, slug = p_slug, name = btrim(p_name),
          description = nullif(btrim(p_description), ''), reference_price_min = p_price_min,
          reference_price_max = p_price_max, price_unit = p_price_unit, color = p_color,
          sort_order = p_sort_order, active = p_active
      where id = p_id
      returning id into v_id;
    if v_id is null then
      raise exception 'Oficio no encontrado' using errcode = 'no_data_found';
    end if;
    v_accion := 'SERVICE_UPDATED';
  end if;

  insert into public.audit_log (actor_id, actor_roles, action, resource_type, resource_id, ip, user_agent, request_id, metadata)
  values (p_actor_id, private.user_active_roles(p_actor_id), v_accion, 'service', v_id::text,
          p_ip, left(p_user_agent, 512), p_request_id,
          jsonb_build_object('slug', p_slug, 'name', btrim(p_name), 'active', p_active));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS y privilegios
-- -----------------------------------------------------------------------------

alter table public.parishes enable row level security;
alter table public.categories enable row level security;
alter table public.services enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.worker_services enable row level security;

-- Catálogo y parroquias activos: información pública.
create policy parishes_select_active on public.parishes for select to anon, authenticated using (active);
create policy categories_select_active on public.categories for select to anon, authenticated using (active);
create policy services_select_active on public.services for select to anon, authenticated using (active);
-- worker_profiles / worker_services: sin políticas para anon/authenticated (datos privados).

revoke all on public.parishes, public.categories, public.services, public.worker_profiles, public.worker_services
  from anon, authenticated;
grant select on public.parishes, public.categories, public.services to anon, authenticated;

grant select on public.parishes to service_role;
grant select, insert, update on public.categories, public.services to service_role;
grant select, insert, update on public.worker_profiles to service_role;
grant select, insert, update, delete on public.worker_services to service_role;

revoke execute on function
  public.fn_public_search_workers(text, text, text, text, boolean, integer, numeric, text, integer, integer),
  public.fn_public_worker(uuid),
  public.fn_public_catalog(),
  public.fn_admin_save_category(uuid, uuid, text, text, text, text, smallint, boolean, inet, text, text),
  public.fn_admin_save_service(uuid, uuid, uuid, text, text, text, numeric, numeric, text, text, smallint, boolean, inet, text, text)
  from public, anon, authenticated;
grant execute on function
  public.fn_public_search_workers(text, text, text, text, boolean, integer, numeric, text, integer, integer),
  public.fn_public_worker(uuid),
  public.fn_public_catalog(),
  public.fn_admin_save_category(uuid, uuid, text, text, text, text, smallint, boolean, inet, text, text),
  public.fn_admin_save_service(uuid, uuid, uuid, text, text, text, numeric, numeric, text, text, smallint, boolean, inet, text, text)
  to service_role;

revoke execute on function private.normalize_text(text), private.touch_worker_search(uuid[]) from public, anon, authenticated;
grant execute on function private.normalize_text(text), private.touch_worker_search(uuid[]) to service_role;

-- -----------------------------------------------------------------------------
-- Datos iniciales (editables desde /admin/catalogo). [PENDIENTE] validación del GAD.
-- -----------------------------------------------------------------------------

insert into public.parishes (code, name, kind, sort_order) values
  ('atocha-ficoa', 'Atocha - Ficoa', 'URBANA', 1),
  ('celiano-monge', 'Celiano Monge', 'URBANA', 2),
  ('huachi-chico', 'Huachi Chico', 'URBANA', 3),
  ('huachi-loreto', 'Huachi Loreto', 'URBANA', 4),
  ('la-matriz', 'La Matriz', 'URBANA', 5),
  ('la-merced', 'La Merced', 'URBANA', 6),
  ('la-peninsula', 'La Península', 'URBANA', 7),
  ('pishilata', 'Pishilata', 'URBANA', 8),
  ('san-francisco', 'San Francisco', 'URBANA', 9),
  ('ambatillo', 'Ambatillo', 'RURAL', 10),
  ('atahualpa', 'Atahualpa', 'RURAL', 11),
  ('augusto-n-martinez', 'Augusto N. Martínez', 'RURAL', 12),
  ('constantino-fernandez', 'Constantino Fernández', 'RURAL', 13),
  ('cunchibamba', 'Cunchibamba', 'RURAL', 14),
  ('huachi-grande', 'Huachi Grande', 'RURAL', 15),
  ('izamba', 'Izamba', 'RURAL', 16),
  ('juan-benigno-vela', 'Juan Benigno Vela', 'RURAL', 17),
  ('montalvo', 'Montalvo', 'RURAL', 18),
  ('pasa', 'Pasa', 'RURAL', 19),
  ('picaigua', 'Picaigua', 'RURAL', 20),
  ('pilahuin', 'Pilahuín', 'RURAL', 21),
  ('quisapincha', 'Quisapincha', 'RURAL', 22),
  ('san-bartolome-de-pinllo', 'San Bartolomé de Pinllo', 'RURAL', 23),
  ('san-fernando', 'San Fernando', 'RURAL', 24),
  ('santa-rosa', 'Santa Rosa', 'RURAL', 25),
  ('totoras', 'Totoras', 'RURAL', 26),
  ('unamuncho', 'Unamuncho', 'RURAL', 27)
on conflict (code) do nothing;

insert into public.categories (slug, name, description, color, sort_order) values
  ('construccion', 'Construcción y reparaciones', 'Obras menores, instalaciones y arreglos en viviendas y locales.', 'naranja', 1),
  ('hogar', 'Servicios para el hogar', 'Limpieza, jardinería, mudanzas y apoyo en el hogar.', 'verde', 2),
  ('cuidado', 'Cuidado de personas', 'Acompañamiento de adultos mayores y cuidado infantil.', 'magenta', 3)
on conflict (slug) do nothing;

insert into public.services (category_id, slug, name, description, reference_price_min, reference_price_max, price_unit, image_path, color, sort_order)
select c.id, v.slug, v.name, v.description, v.pmin, v.pmax, v.unit, v.image, v.color, v.ord
from (values
  ('construccion', 'albanileria', 'Albañilería', 'Mampostería, enlucidos, contrapisos y reparaciones menores.', 25, 35, 'JORNAL', '/images/oficios/albanileria.jpg', 'verde', 1),
  ('construccion', 'plomeria', 'Plomería y gasfitería', 'Fugas, cambio de grifería, desagües y sanitarios.', 25, 40, 'JORNAL', '/images/oficios/plomeria.jpg', 'azul', 2),
  ('construccion', 'electricidad', 'Electricidad', 'Puntos de luz, tomacorrientes y revisión de tableros.', 30, 45, 'JORNAL', '/images/oficios/electricidad.jpg', 'amarillo', 3),
  ('construccion', 'carpinteria', 'Carpintería', 'Muebles a medida, puertas, closets y arreglos de madera.', 28, 42, 'JORNAL', '/images/oficios/carpinteria.jpg', 'naranja', 4),
  ('construccion', 'pintura', 'Pintura', 'Pintura interior y exterior, empaste y acabados.', 25, 38, 'JORNAL', '/images/oficios/pintura.jpg', 'azul', 5),
  ('construccion', 'cerrajeria', 'Cerrajería', 'Apertura de puertas, cambio de cerraduras y llaves.', 15, 35, 'SERVICIO', '/images/oficios/cerrajeria.jpg', 'naranja', 6),
  ('hogar', 'limpieza', 'Limpieza del hogar', 'Limpieza profunda de viviendas, oficinas y locales.', 20, 30, 'JORNAL', '/images/oficios/limpieza.jpg', 'magenta', 1),
  ('hogar', 'jardineria', 'Jardinería', 'Poda, mantenimiento de césped y sembrado de plantas.', 20, 30, 'JORNAL', '/images/oficios/jardineria.jpg', 'verde', 2),
  ('hogar', 'mudanzas', 'Mudanzas y fletes', 'Carga, transporte y embalaje de muebles y enseres.', 30, 60, 'SERVICIO', '/images/oficios/mudanzas.jpg', 'amarillo', 3),
  ('cuidado', 'cuidado', 'Cuidado de personas', 'Acompañamiento de adultos mayores y cuidado infantil.', 20, 35, 'JORNADA', '/images/oficios/cuidado.jpg', 'magenta', 1)
) as v(cat, slug, name, description, pmin, pmax, unit, image, color, ord)
join public.categories c on c.slug = v.cat
on conflict (slug) do nothing;
