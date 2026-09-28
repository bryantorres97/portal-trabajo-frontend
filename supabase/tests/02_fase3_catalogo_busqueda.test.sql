-- pgTAP: Fase 3 — privacidad y visibilidad de la búsqueda pública. Ejecutar: supabase test db
begin;
select plan(10);

-- Las funciones públicas no devuelven columnas privadas (RN-19)
select ok(not exists (
  select 1 from unnest(array['phone', 'email', 'address', 'birth_date', 'first_names', 'last_names',
                             'emergency_contact_name', 'emergency_contact_phone']) c
  where c = any (select unnest(proargnames) from pg_proc where proname = 'fn_public_search_workers')
     or c = any (select unnest(proargnames) from pg_proc where proname = 'fn_public_worker')
), 'fn_public_* no exponen datos privados');

-- Datos: un habilitado y uno en capacitación con un término único
insert into public.worker_profiles (id, first_names, last_names, phone, public_display_name, specialty, status)
values ('00000000-0000-4000-b000-000000000001', 'Prueba', 'Visible', '0991234567', 'Xylofonista Visible', 'xylofono', 'HABILITADO'),
       ('00000000-0000-4000-b000-000000000002', 'Prueba', 'Oculto', '0991234568', 'Xylofonista Oculto', 'xylofono', 'CAPACITACION_EN_PROCESO');

select is((select count(*)::int from public.fn_public_search_workers(p_q => 'xylofono')), 1,
  'solo aparece el trabajador HABILITADO');
select is((select count(*)::int from public.fn_public_worker('00000000-0000-4000-b000-000000000002')), 0,
  'el perfil de un no habilitado no se devuelve');
select is((select count(*)::int from public.fn_public_worker('00000000-0000-4000-b000-000000000001')), 1,
  'el perfil de un habilitado sí se devuelve');

-- Índice de búsqueda sin tildes y actualizado por trigger
select ok((select search_text from public.worker_profiles where id = '00000000-0000-4000-b000-000000000001') like '%xylofonista visible%',
  'search_text se calcula al insertar');
insert into public.worker_services (worker_id, service_id)
  select '00000000-0000-4000-b000-000000000001', id from public.services where slug = 'electricidad';
select ok((select search_text from public.worker_profiles where id = '00000000-0000-4000-b000-000000000001') like '%electricidad%',
  'asignar un oficio reindexa al trabajador');

-- Acceso: anon no lee trabajadores; el catálogo activo sí es público
select ok(not has_table_privilege('anon', 'public.worker_profiles', 'SELECT'), 'anon no lee worker_profiles');
select ok(not has_function_privilege('anon', 'public.fn_public_search_workers(text, text, text, text, boolean, integer, numeric, text, integer, integer)', 'EXECUTE'),
  'la búsqueda solo la ejecuta el servidor');
select ok(has_table_privilege('anon', 'public.services', 'SELECT'), 'el catálogo es legible públicamente');
select is((select count(*)::int from public.parishes), 27, '27 parroquias del cantón Ambato');

select * from finish();
rollback;
