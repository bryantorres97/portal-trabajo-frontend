-- Rendimiento de la búsqueda (Fase 3): 5 000 trabajadores sintéticos, p95 < 300 ms.
-- Todo ocurre dentro de un bloque que termina con una excepción → se revierte y no deja datos.
-- Uso (local): supabase db query -f scripts/perf-busqueda.sql
do $$
declare
  v_servicios uuid[] := array(select id from public.services);
  v_parroquias smallint[] := array(select id from public.parishes);
  v_consultas text[] := array['plomeria', 'electricista', 'pintura exterior', 'albañil', 'jardin', 'cerrajero',
                              'limpieza profunda', 'mudanza', 'cuidado adulto mayor', 'carpinteria muebles'];
  v_tiempos double precision[] := '{}';
  v_t0 timestamptz;
  v_i integer;
  v_q text;
  v_p95 double precision;
begin
  insert into public.worker_profiles (first_names, last_names, public_display_name, specialty, public_bio,
                                      years_experience, is_available, parish_id, status, rating_avg)
  select 'Sintético', 'N' || g, 'Trabajador ' || g || ' S.',
         (array['Enlucidos', 'Fugas y sanitarios', 'Tableros eléctricos', 'Muebles a medida', 'Pintura interior',
                'Limpieza de oficinas', 'Poda de árboles', 'Fletes', 'Acompañamiento', 'Cerraduras'])[1 + g % 10],
         'Trabajador con experiencia en diversos trabajos del hogar y la construcción en Ambato.',
         g % 30, g % 3 <> 0, v_parroquias[1 + g % array_length(v_parroquias, 1)],
         case when g % 10 = 0 then 'REGISTRADO'::public.worker_status else 'HABILITADO'::public.worker_status end,
         round((1 + (g % 40) / 10.0)::numeric, 2)
  from generate_series(1, 5000) g;

  insert into public.worker_services (worker_id, service_id, is_primary)
  select w.id, v_servicios[1 + (abs(hashtext(w.id::text)) % array_length(v_servicios, 1))], true
  from public.worker_profiles w where w.first_names = 'Sintético';

  analyze public.worker_profiles;
  analyze public.worker_services;

  for v_i in 1..60 loop
    v_q := v_consultas[1 + v_i % array_length(v_consultas, 1)];
    v_t0 := clock_timestamp();
    perform * from public.fn_public_search_workers(
      p_q => case when v_i % 4 = 0 then null else v_q end,
      p_service => case when v_i % 5 = 0 then 'plomeria' end,
      p_available => case when v_i % 2 = 0 then true end,
      p_min_rating => case when v_i % 3 = 0 then 3 end,
      p_offset => (v_i % 3) * 12);
    v_tiempos := v_tiempos || extract(epoch from clock_timestamp() - v_t0) * 1000;
  end loop;

  v_p95 := (select percentile_cont(0.95) within group (order by t) from unnest(v_tiempos) t);
  raise exception '% trabajadores=% p50=%ms p95=%ms max=%ms (umbral p95 300ms)',
    case when v_p95 > 300 then 'PERF_FALLO' else 'PERF_OK' end,
    (select count(*) from public.worker_profiles),
    round((select percentile_cont(0.5) within group (order by t) from unnest(v_tiempos) t)::numeric, 1),
    round(v_p95::numeric, 1),
    round((select max(t) from unnest(v_tiempos) t)::numeric, 1);
end;
$$;
