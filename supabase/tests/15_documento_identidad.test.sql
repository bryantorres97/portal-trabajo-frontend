-- pgTAP: documento de identidad del trabajador (ADR-019) — cédula con dígito verificador o pasaporte,
-- obligatorio en el alta y la edición, único, detectado como duplicado y borrado al eliminar la cuenta.
-- Ejecutar: supabase test db
begin;
select plan(20);

-- -----------------------------------------------------------------------------
-- Validación de la cédula y permisos
-- -----------------------------------------------------------------------------
select ok(private.cedula_valida('1801234566') and private.cedula_valida('1710034065')
  and private.cedula_valida('0609876545') and private.cedula_valida('3000000012'), 'acepta cédulas válidas');
select ok(not private.cedula_valida('1801234560'), 'rechaza un dígito verificador incorrecto');
select ok(not private.cedula_valida('2501234567') and not private.cedula_valida('1871234567'),
  'rechaza provincias inexistentes y tercer dígito ≥ 6');
select ok(not private.cedula_valida('180123456') and not private.cedula_valida(null), 'rechaza longitudes y nulos');
select ok(not has_function_privilege('authenticated', 'private.worker_check_id_document(jsonb, uuid)', 'EXECUTE'),
  'authenticated no ejecuta la verificación del documento');
select ok(not has_column_privilege('authenticated', 'public.worker_profiles', 'id_document_number', 'SELECT')
  and not has_column_privilege('anon', 'public.worker_profiles', 'id_document_number', 'SELECT'),
  'el documento no se lee con las claves públicas');

-- -----------------------------------------------------------------------------
-- Datos
-- -----------------------------------------------------------------------------
insert into public.users (id, display_name) values ('00000000-0000-0000-0000-0000000015a1', 'Operador');
insert into public.user_roles (user_id, role_code) values ('00000000-0000-0000-0000-0000000015a1', 'ADMIN_TRABAJADORES');

create temp table t (k text primary key, v uuid) on commit drop;
create temp table s (v jsonb) on commit drop;
insert into s values (jsonb_build_array(jsonb_build_object(
  'serviceId', (select id from public.services where slug = 'plomeria'), 'isPrimary', true)));

-- -----------------------------------------------------------------------------
-- Alta
-- -----------------------------------------------------------------------------
select throws_ok($$ select public.fn_admin_create_worker('00000000-0000-0000-0000-0000000015a1',
  '{"firstNames":"Sin","lastNames":"Documento","phone":"0991110001","publicDisplayName":"Sin D."}', (select v from s)) $$,
  '23514', 'Ingresa la cédula o el pasaporte del trabajador', 'el documento es obligatorio en el alta');
select throws_ok($$ select public.fn_admin_create_worker('00000000-0000-0000-0000-0000000015a1',
  '{"firstNames":"Mala","lastNames":"Cédula","idDocumentType":"CEDULA","idDocumentNumber":"1801234560","phone":"0991110002","publicDisplayName":"Mala C."}',
  (select v from s)) $$, '23514', 'La cédula no es válida', 'se rechaza una cédula inválida');
select throws_ok($$ select public.fn_admin_create_worker('00000000-0000-0000-0000-0000000015a1',
  '{"firstNames":"Otro","lastNames":"Tipo","idDocumentType":"RUC","idDocumentNumber":"1801234566001","phone":"0991110003","publicDisplayName":"Otro T."}',
  (select v from s)) $$, '23514', 'Tipo de documento no válido', 'solo cédula o pasaporte');

insert into t values ('a', public.fn_admin_create_worker('00000000-0000-0000-0000-0000000015a1',
  '{"firstNames":"Ana","lastNames":"Cédula","idDocumentType":"CEDULA","idDocumentNumber":"180123456-6","phone":"0991110004","publicDisplayName":"Ana C."}',
  (select v from s)));
insert into t values ('b', public.fn_admin_create_worker('00000000-0000-0000-0000-0000000015a1',
  '{"firstNames":"Beto","lastNames":"Pasaporte","idDocumentType":"PASAPORTE","idDocumentNumber":"ab 123456","phone":"0991110005","publicDisplayName":"Beto P."}',
  (select v from s)));

select is((select id_document_type || ':' || id_document_number from public.worker_profiles where id = (select v from t where k = 'a')),
  'CEDULA:1801234566', 'la cédula se guarda sin guiones');
select is((select id_document_number from public.worker_profiles where id = (select v from t where k = 'b')),
  'AB123456', 'el pasaporte se guarda sin espacios y en mayúsculas');
select ok((select not (metadata::text ilike '%1801234566%') from public.audit_log
  where action = 'WORKER_CREATED' and resource_id = (select v::text from t where k = 'a')), 'la auditoría no guarda el documento');

select throws_ok($$ select public.fn_admin_create_worker('00000000-0000-0000-0000-0000000015a1',
  '{"firstNames":"Copia","lastNames":"Ana","idDocumentType":"CEDULA","idDocumentNumber":"1801234566","phone":"0991110006","publicDisplayName":"Copia A."}',
  (select v from s)) $$, '23505', 'Ya hay un trabajador registrado con ese documento de identidad',
  'un documento no puede pertenecer a dos trabajadores');
select lives_ok($$ select public.fn_admin_create_worker('00000000-0000-0000-0000-0000000015a1',
  '{"firstNames":"Pasaporte","lastNames":"Numérico","idDocumentType":"PASAPORTE","idDocumentNumber":"1801234566","phone":"0991110007","publicDisplayName":"Pasaporte N."}',
  (select v from s)) $$, 'el mismo número con otro tipo de documento es otro documento');

select is((select reasons from public.fn_admin_find_worker_duplicates('00000000-0000-0000-0000-0000000015a1',
  null, null, 'Nadie', 'Igual', null, 'CEDULA', '1801234566') where id = (select v from t where k = 'a')),
  array['DOCUMENTO'], 'detecta el duplicado por documento');

-- -----------------------------------------------------------------------------
-- Edición
-- -----------------------------------------------------------------------------
select throws_ok($$ select public.fn_admin_update_worker('00000000-0000-0000-0000-0000000015a1', (select v from t where k = 'b'),
  '{"firstNames":"Beto","lastNames":"Pasaporte","idDocumentType":"CEDULA","idDocumentNumber":"1801234566","phone":"0991110005","publicDisplayName":"Beto P."}',
  (select v from s)) $$, '23505', null, 'no se puede editar a un documento ajeno');
select lives_ok($$ select public.fn_admin_update_worker('00000000-0000-0000-0000-0000000015a1', (select v from t where k = 'a'),
  '{"firstNames":"Ana","lastNames":"Cédula","idDocumentType":"CEDULA","idDocumentNumber":"1801234566","phone":"0991110004","publicDisplayName":"Ana C. Editada"}',
  (select v from s)) $$, 'se conserva el propio documento al editar');
select throws_ok($$ select public.fn_admin_update_worker('00000000-0000-0000-0000-0000000015a1', (select v from t where k = 'a'),
  '{"firstNames":"Ana","lastNames":"Cédula","phone":"0991110004","publicDisplayName":"Ana C."}', (select v from s)) $$,
  '23514', null, 'el documento también es obligatorio al editar');

-- -----------------------------------------------------------------------------
-- Restricción de la tabla y eliminación de la cuenta
-- -----------------------------------------------------------------------------
select throws_ok($$ update public.worker_profiles set id_document_number = '1801234560'
  where id = (select v from t where k = 'a') $$, '23514', null, 'la tabla rechaza una cédula inválida');

update public.worker_profiles set deleted_at = now() where id = (select v from t where k = 'a');
select ok((select id_document_type is null and id_document_number is null from public.worker_profiles
  where id = (select v from t where k = 'a')), 'al eliminar la cuenta se borra el documento');

select * from finish();
rollback;
