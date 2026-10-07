-- pgTAP: Fase 4 — gestión de trabajadores. Ejecutar: supabase test db
begin;
select plan(41);

-- -----------------------------------------------------------------------------
-- Máquina de estados: la base impone EXACTAMENTE la matriz del dominio
-- (misma lista que tests/unit/fase4-trabajadores.test.ts)
-- -----------------------------------------------------------------------------
select set_eq(
  $$ select f::text || '>' || t::text
     from unnest(enum_range(null::public.worker_status)) f, unnest(enum_range(null::public.worker_status)) t
     where private.worker_transition_allowed(f, t) $$,
  array[
    'REGISTRADO>DOCUMENTACION_PENDIENTE', 'REGISTRADO>PENDIENTE_REVISION', 'REGISTRADO>RECHAZADO',
    'DOCUMENTACION_PENDIENTE>PENDIENTE_REVISION', 'DOCUMENTACION_PENDIENTE>RECHAZADO',
    'PENDIENTE_REVISION>DOCUMENTACION_PENDIENTE', 'PENDIENTE_REVISION>CAPACITACION_PENDIENTE', 'PENDIENTE_REVISION>RECHAZADO',
    'CAPACITACION_PENDIENTE>CAPACITACION_EN_PROCESO', 'CAPACITACION_PENDIENTE>RECHAZADO',
    'CAPACITACION_EN_PROCESO>CAPACITACION_PENDIENTE', 'CAPACITACION_EN_PROCESO>CAPACITACION_APROBADA',
    'CAPACITACION_EN_PROCESO>RECHAZADO',
    'CAPACITACION_APROBADA>HABILITADO', 'CAPACITACION_APROBADA>RECHAZADO',
    'HABILITADO>SUSPENDIDO', 'HABILITADO>INACTIVO',
    'SUSPENDIDO>HABILITADO', 'SUSPENDIDO>INACTIVO',
    'INACTIVO>HABILITADO'
  ],
  'las transiciones permitidas en la base coinciden con el dominio');

-- -----------------------------------------------------------------------------
-- Seguridad: RLS, privilegios, bucket privado, historial inmutable
-- -----------------------------------------------------------------------------
select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('worker_status_history', 'document_types', 'worker_documents',
    'trainings', 'training_enrollments', 'worker_activation_codes')), 'RLS activado en las tablas nuevas');
select ok(not has_table_privilege('anon', 'public.worker_documents', 'SELECT'), 'anon no lee documentos');
select ok(not has_table_privilege('authenticated', 'public.worker_documents', 'SELECT'), 'authenticated no lee documentos');
select ok(not has_table_privilege('authenticated', 'public.worker_activation_codes', 'SELECT'),
  'authenticated no lee códigos de activación');
select ok(not has_table_privilege('service_role', 'public.worker_status_history', 'UPDATE'),
  'ni el servidor puede modificar el historial');
select ok(not has_function_privilege('anon', 'public.fn_admin_change_worker_status(uuid, uuid, public.worker_status, text, timestamptz, inet, text, text)', 'EXECUTE'),
  'anon no cambia estados');
select ok(not has_function_privilege('authenticated', 'public.fn_redeem_activation_code(uuid, text, inet, text, text)', 'EXECUTE'),
  'authenticated no canjea códigos directamente');
select ok(not has_function_privilege('anon', 'public.fn_public_worker_photo_path(uuid)', 'EXECUTE'),
  'la ruta de la foto se resuelve solo en el servidor');
select is((select public from storage.buckets where id = 'worker-files'), false, 'el bucket worker-files es privado');
select is((select file_size_limit from storage.buckets where id = 'worker-files'), 4194304::bigint, 'límite de 4 MB por archivo');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and qual ilike '%worker-files%'), 0,
  'sin políticas de Storage para el bucket (solo el servidor accede)');

-- -----------------------------------------------------------------------------
-- Datos de prueba: personal con permisos, operador, ciudadano
-- -----------------------------------------------------------------------------
insert into public.users (id, display_name) values
  ('00000000-0000-0000-0000-0000000004a1', 'Admin trabajadores'),
  ('00000000-0000-0000-0000-0000000004a2', 'Operador'),
  ('00000000-0000-0000-0000-0000000004a3', 'Ciudadano');
insert into public.user_roles (user_id, role_code) values
  ('00000000-0000-0000-0000-0000000004a1', 'ADMIN_TRABAJADORES'),
  ('00000000-0000-0000-0000-0000000004a1', 'RESP_CAPACITACION'),
  ('00000000-0000-0000-0000-0000000004a2', 'OPERADOR_PUNTO'),
  ('00000000-0000-0000-0000-0000000004a3', 'CLIENTE');

create temp table t (k text primary key, v uuid) on commit drop;
insert into t values ('w', public.fn_admin_create_worker('00000000-0000-0000-0000-0000000004a2',
  '{"firstNames":"Rosa","lastNames":"Pérez","idDocumentType":"CEDULA","idDocumentNumber":"1801234566","phone":"0998887766","publicDisplayName":"Rosa P.","yearsExperience":5,"parishCode":"izamba"}',
  jsonb_build_array(jsonb_build_object('serviceId', (select id from public.services where slug = 'plomeria'), 'isPrimary', true))));

select is((select status::text from public.worker_profiles where id = (select v from t where k = 'w')), 'REGISTRADO',
  'el operador registra al trabajador en estado REGISTRADO');
select is((select count(*)::int from public.worker_status_history where worker_id = (select v from t where k = 'w')), 1,
  'el alta queda en el historial');
select is((select count(*)::int from public.audit_log where action = 'WORKER_CREATED' and resource_id = (select v::text from t where k = 'w')), 1,
  'el alta queda en la auditoría');
select ok((select not (metadata ? 'phone') and not (metadata::text ilike '%0998887766%') from public.audit_log
  where action = 'WORKER_CREATED' and resource_id = (select v::text from t where k = 'w')), 'la auditoría no guarda datos personales');

select throws_ok($$ select public.fn_admin_create_worker('00000000-0000-0000-0000-0000000004a3',
  '{"firstNames":"X","lastNames":"Y","publicDisplayName":"X Y."}', '[]') $$, '42501', null,
  'un ciudadano no registra trabajadores');
select throws_ok($$ select public.fn_admin_create_worker('00000000-0000-0000-0000-0000000004a2',
  '{"firstNames":"X","lastNames":"Y","idDocumentType":"PASAPORTE","idDocumentNumber":"XY12345","publicDisplayName":"X Y."}', '[]') $$, '23514', null,
  'se exige al menos un oficio');
select throws_ok($$ select public.fn_admin_create_worker('00000000-0000-0000-0000-0000000004a2',
  '{"firstNames":"X","lastNames":"Y","idDocumentType":"PASAPORTE","idDocumentNumber":"XY12345","publicDisplayName":"X Y.","birthDate":"2015-01-01"}',
  jsonb_build_array(jsonb_build_object('serviceId', (select id from public.services where slug = 'plomeria'), 'isPrimary', true))) $$,
  '23514', null, 'se rechaza a menores de edad');

select is((select reasons from public.fn_admin_find_worker_duplicates('00000000-0000-0000-0000-0000000004a2',
  '0998887766', null, 'ROSA', 'perez') where id = (select v from t where k = 'w')), array['TELEFONO', 'NOMBRES'],
  'detecta duplicados por teléfono y nombres (sin tildes ni mayúsculas)');

-- -----------------------------------------------------------------------------
-- Transiciones: permisos, motivo y reglas de negocio
-- -----------------------------------------------------------------------------
select throws_ok($$ select public.fn_admin_change_worker_status('00000000-0000-0000-0000-0000000004a2',
  (select v from t where k = 'w'), 'RECHAZADO', 'Motivo suficiente') $$, '42501', null,
  'el operador no puede rechazar (worker.suspend)');
select throws_ok($$ select public.fn_admin_change_worker_status('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'w'), 'HABILITADO') $$, '23514', null,
  'no se salta de REGISTRADO a HABILITADO');
select lives_ok($$ select public.fn_admin_change_worker_status('00000000-0000-0000-0000-0000000004a2',
  (select v from t where k = 'w'), 'PENDIENTE_REVISION') $$, 'el operador envía a revisión');

-- Documento pendiente bloquea la aprobación de la documentación
insert into t values ('d', public.fn_admin_register_document('00000000-0000-0000-0000-0000000004a2',
  (select v from t where k = 'w'), 'CERT_OFICIO',
  'workers/' || (select v from t where k = 'w') || '/documents/00000000-0000-4000-8000-0000000000d1.pdf',
  'certificado.pdf', 'application/pdf', 1024, repeat('a', 64)));
select throws_ok($$ select public.fn_admin_register_document('00000000-0000-0000-0000-0000000004a2',
  (select v from t where k = 'w'), 'CERT_OFICIO', 'workers/otro/documents/x.pdf', 'x.pdf', 'application/pdf', 10, repeat('b', 64)) $$,
  '23514', null, 'la ruta del archivo debe pertenecer al trabajador');
select throws_ok($$ select public.fn_admin_change_worker_status('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'w'), 'CAPACITACION_PENDIENTE') $$, '23514', 'Hay documentos pendientes de revisión',
  'no se aprueba la documentación con documentos pendientes');
select throws_ok($$ select public.fn_admin_review_document('00000000-0000-0000-0000-0000000004a2',
  (select v from t where k = 'd'), 'VALIDADO') $$, '42501', null, 'el operador no valida documentos');
select lives_ok($$ select public.fn_admin_review_document('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'd'), 'VALIDADO') $$, 'el administrador valida el documento');
select lives_ok($$ select public.fn_admin_change_worker_status('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'w'), 'CAPACITACION_PENDIENTE') $$, 'se aprueba la documentación');

-- Capacitación: inscribir mueve a EN_PROCESO; reprobar vuelve a PENDIENTE; aprobar mueve a APROBADA
insert into t values ('e1', public.fn_admin_enroll_worker('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'w'), (select id from public.trainings where code = 'GENERAL')));
select is((select status::text from public.worker_profiles where id = (select v from t where k = 'w')),
  'CAPACITACION_EN_PROCESO', 'inscribir lleva al trabajador a capacitación en proceso');
select throws_ok($$ select public.fn_admin_update_enrollment('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'e1'), 'REPROBADO') $$, '23514', null, 'reprobar exige observación');
select lives_ok($$ select public.fn_admin_update_enrollment('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'e1'), 'REPROBADO', 40, 'No aprobó la evaluación') $$, 'se registra el reprobado');
select is((select status::text from public.worker_profiles where id = (select v from t where k = 'w')),
  'CAPACITACION_PENDIENTE', 'al reprobar vuelve a capacitación pendiente');

-- HABILITAR sin capacitación aprobada → error (la regla vive en la base)
update public.worker_profiles set status = 'CAPACITACION_APROBADA' where id = (select v from t where k = 'w');
select throws_ok($$ select public.fn_admin_change_worker_status('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'w'), 'HABILITADO') $$, '23514', 'El trabajador no tiene una capacitación aprobada y vigente',
  'habilitar sin capacitación aprobada falla');
update public.worker_profiles set status = 'CAPACITACION_PENDIENTE' where id = (select v from t where k = 'w');

insert into t values ('e2', public.fn_admin_enroll_worker('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'w'), (select id from public.trainings where code = 'GENERAL')));
select lives_ok($$ select public.fn_admin_update_enrollment('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'e2'), 'APROBADO', 95) $$, 'se aprueba la capacitación');
select is((select status::text from public.worker_profiles where id = (select v from t where k = 'w')),
  'CAPACITACION_APROBADA', 'aprobar la capacitación avanza el estado');
select lives_ok($$ select public.fn_admin_change_worker_status('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'w'), 'HABILITADO') $$, 'se habilita al trabajador');
select is((select count(*)::int from public.fn_public_worker((select v from t where k = 'w'))), 1,
  'el habilitado aparece en la lectura pública');

-- Suspender exige motivo y oculta al trabajador de inmediato
select throws_ok($$ select public.fn_admin_change_worker_status('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'w'), 'SUSPENDIDO') $$, '23514', null, 'suspender exige motivo');
select lives_ok($$ select public.fn_admin_change_worker_status('00000000-0000-0000-0000-0000000004a1',
  (select v from t where k = 'w'), 'SUSPENDIDO', 'Denuncia en revisión') $$, 'se suspende con motivo');
select is((select count(*)::int from public.fn_public_worker((select v from t where k = 'w'))), 0,
  'el suspendido desaparece de la lectura pública');

-- Historial append-only
select throws_ok($$ update public.worker_status_history set reason = 'x' where worker_id = (select v from t where k = 'w') $$,
  '42501', null, 'el historial no se puede modificar');

select * from finish();
rollback;
