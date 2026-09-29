-- pgTAP: eliminación de cuenta por el titular (ADR-018) — bloqueo por contrataciones en marcha,
-- propuestas canceladas, anonimización de la cuenta y de la ficha, contenido conservado y permisos.
-- Ejecutar: supabase test db
begin;
select plan(39);

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.fn_delete_account(uuid, inet, text, text)', 'EXECUTE'),
  'authenticated no elimina cuentas');
select ok(not has_function_privilege('anon', 'public.fn_account_deletion_check(uuid)', 'EXECUTE'),
  'anon no consulta la verificación');
select ok(has_function_privilege('service_role', 'public.fn_delete_account(uuid, inet, text, text)', 'EXECUTE'),
  'el servidor elimina cuentas');
select is(private.short_name('Cuenta eliminada'), 'Cuenta eliminada', '«Cuenta eliminada» no se abrevia');
select is(private.short_name('Carla Andrea Mena Ruiz'), 'Carla M.', 'los demás nombres se abrevian como antes');

-- -----------------------------------------------------------------------------
-- Datos: cliente, trabajador con cuenta (foto y documento), otro cliente y personal del GAD
-- -----------------------------------------------------------------------------
insert into public.users (id, display_name, email) values
  ('00000000-0000-0000-0000-00000000e0c1', 'Elena Cliente', 'elena@example.com'),
  ('00000000-0000-0000-0000-00000000e0c2', 'Esteban Trabajador', 'esteban@example.com'),
  ('00000000-0000-0000-0000-00000000e0c3', 'Otra Clienta', 'otra@example.com'),
  ('00000000-0000-0000-0000-00000000e0c4', 'Funcionario GAD', 'gad@example.com');
insert into public.user_identities (user_id, issuer, sub, provider) values
  ('00000000-0000-0000-0000-00000000e0c1', 'https://cognito.example', 'sub-e0c1', 'COGNITO'),
  ('00000000-0000-0000-0000-00000000e0c2', 'https://cognito.example', 'sub-e0c2', 'COGNITO'),
  ('00000000-0000-0000-0000-00000000e0c4', 'https://login.microsoftonline.com/t/v2.0', 'oid-e0c4', 'ENTRA');
insert into public.user_roles (user_id, role_code) values
  ('00000000-0000-0000-0000-00000000e0c1', 'CLIENTE'),
  ('00000000-0000-0000-0000-00000000e0c2', 'TRABAJADOR'),
  ('00000000-0000-0000-0000-00000000e0c3', 'CLIENTE'),
  ('00000000-0000-0000-0000-00000000e0c4', 'RESP_DENUNCIAS');
insert into public.client_profiles (user_id, full_name, phone) values
  ('00000000-0000-0000-0000-00000000e0c1', 'Elena María Cliente Ruiz', '0991234567');
insert into public.worker_profiles (id, user_id, first_names, last_names, public_display_name, status, phone, photo_path, photo_status) values
  ('00000000-0000-0000-0000-00000000e0a1', '00000000-0000-0000-0000-00000000e0c2', 'Esteban', 'Paz', 'Esteban P.',
   'HABILITADO', '0987654321', 'workers/00000000-0000-0000-0000-00000000e0a1/photos/00000000-0000-0000-0000-00000000f001.jpg', 'APROBADA');
insert into public.worker_services (worker_id, service_id, is_primary)
  select '00000000-0000-0000-0000-00000000e0a1', id, true from public.services order by sort_order, name limit 1;
insert into public.worker_documents (worker_id, type_code, storage_path, mime_type, size_bytes, sha256, uploaded_by) values
  ('00000000-0000-0000-0000-00000000e0a1', 'CERT_CAPACITACION',
   'workers/00000000-0000-0000-0000-00000000e0a1/documents/00000000-0000-0000-0000-00000000f002.pdf',
   'application/pdf', 1000, repeat('a', 64), '00000000-0000-0000-0000-00000000e0c4');
insert into public.device_tokens (user_id, platform, token) values
  ('00000000-0000-0000-0000-00000000e0c1', 'ANDROID', 'tok-eliminacion-cliente-00000');

create temp table t (k text primary key, v text) on commit drop;
insert into t values ('servicio', (select service_id::text from public.worker_services
  where worker_id = '00000000-0000-0000-0000-00000000e0a1'));
insert into t select 'conv', conversation_id::text from public.fn_start_conversation(
  '00000000-0000-0000-0000-00000000e0c1', '00000000-0000-0000-0000-00000000e0a1', 'Hola, necesito ayuda con una pared');
insert into t select 'conv_otra', conversation_id::text from public.fn_start_conversation(
  '00000000-0000-0000-0000-00000000e0c3', '00000000-0000-0000-0000-00000000e0a1', 'Buenas, ¿trabaja los sábados?');

create function pg_temp.terminos() returns jsonb language sql as $$
  select jsonb_build_object(
    'description', 'Enlucir y pintar una pared del patio',
    'serviceId', (select v from t where k = 'servicio'),
    'scheduledStart', ((now() at time zone 'America/Guayaquil')::date + 3)::text,
    'parishCode', 'atocha-ficoa',
    'locationDetail', 'Av. Cevallos y Quito',
    'priceAmount', 80,
    'priceUnit', 'OBRA');
$$;

-- Elena propone (quedará pendiente); la otra clienta tiene una contratación confirmada con Esteban.
insert into t select 'k_elena', public.fn_contract_propose('00000000-0000-0000-0000-00000000e0c1',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos())::text;
insert into t select 'k_otra', public.fn_contract_propose('00000000-0000-0000-0000-00000000e0c3',
  (select v::uuid from t where k = 'conv_otra'), pg_temp.terminos())::text;
select public.fn_contract_accept('00000000-0000-0000-0000-00000000e0c2', (select v::uuid from t where k = 'k_otra'), 1,
  (select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k_otra') and version = 1));

-- -----------------------------------------------------------------------------
-- Verificación y bloqueo
-- -----------------------------------------------------------------------------
select is((public.fn_account_deletion_check('00000000-0000-0000-0000-00000000e0c2') -> 'blockingContracts' -> 0 ->> 'status'),
  'CONTRATADA', 'la verificación lista la contratación confirmada del trabajador');
select is((public.fn_account_deletion_check('00000000-0000-0000-0000-00000000e0c2') -> 'blockingContracts' -> 0 ->> 'counterpartName'),
  'Otra C.', '…con el nombre corto de la otra parte');
select is((public.fn_account_deletion_check('00000000-0000-0000-0000-00000000e0c2') ->> 'isWorker')::boolean, true,
  'la verificación sabe que es trabajador');
select throws_ok($$ select public.fn_delete_account('00000000-0000-0000-0000-00000000e0c2') $$, '55000', null,
  'no se elimina con contrataciones en marcha (409)');
select is((select status::text from public.users where id = '00000000-0000-0000-0000-00000000e0c2'), 'ACTIVO',
  '…y la cuenta sigue intacta');
select throws_ok($$ select public.fn_delete_account('00000000-0000-0000-0000-00000000e0c4') $$, '42501', null,
  'las cuentas institucionales no se eliminan por aquí');

select is(public.fn_account_deletion_check('00000000-0000-0000-0000-00000000e0c1'),
  jsonb_build_object('isWorker', false, 'blockingContracts', '[]'::jsonb, 'pendingProposals', 1),
  'la cliente puede eliminar y se le cancelará una propuesta');

-- -----------------------------------------------------------------------------
-- Eliminación de la cliente
-- -----------------------------------------------------------------------------
insert into t select 'r_elena', public.fn_delete_account('00000000-0000-0000-0000-00000000e0c1',
  '10.0.0.1', 'pgtap', 'req-eliminacion')::text;

select is((select v::jsonb ->> 'cancelledProposals' from t where k = 'r_elena')::int, 1, 'devuelve las propuestas canceladas');
select is((select v::jsonb -> 'files' from t where k = 'r_elena'), '[]'::jsonb, 'una cliente no tiene archivos que borrar');
select is((select status::text from public.contracts where id = (select v::uuid from t where k = 'k_elena')), 'CANCELADA',
  'su propuesta pendiente queda cancelada');
select is((select cancel_reason from public.contracts where id = (select v::uuid from t where k = 'k_elena')),
  'La otra parte eliminó su cuenta', '…con el motivo para la otra parte');
select ok((select withdrawn_at is not null from public.contract_terms
  where contract_id = (select v::uuid from t where k = 'k_elena') and version = 1),
  '…y su versión queda retirada (la había enviado ella)');
select ok(exists (select 1 from public.contract_events
  where contract_id = (select v::uuid from t where k = 'k_elena') and event = 'CUENTA_ELIMINADA'),
  'el historial de la contratación registra el motivo');
select ok(exists (select 1 from public.notifications
  where user_id = '00000000-0000-0000-0000-00000000e0c2' and type = 'CONTRACT_UPDATE' and title = 'Propuesta cancelada'),
  'el trabajador recibe el aviso de la cancelación');
select is((select status::text from public.conversations where id = (select v::uuid from t where k = 'conv')), 'CERRADA',
  'la conversación queda cerrada');
select is((select count(*)::int from public.messages where conversation_id = (select v::uuid from t where k = 'conv')
  and sender_id = '00000000-0000-0000-0000-00000000e0c1' and kind = 'TEXT'), 1,
  'sus mensajes se conservan para la otra parte');

select is((select row(status::text, email, display_name, master_user_id)::text from public.users
  where id = '00000000-0000-0000-0000-00000000e0c1'), row('ELIMINADO', null::text, 'Cuenta eliminada', null::text)::text,
  'la cuenta queda como seudónimo sin datos personales');
select ok((select tokens_valid_after is not null from public.users where id = '00000000-0000-0000-0000-00000000e0c1'),
  'los tokens de la app dejan de valer');
select is((select count(*)::int from public.user_identities where user_id = '00000000-0000-0000-0000-00000000e0c1'), 0,
  'se borran sus identidades (un nuevo ingreso crea una cuenta nueva)');
select is((select count(*)::int from public.client_profiles where user_id = '00000000-0000-0000-0000-00000000e0c1'), 0,
  'se borra su perfil (nombre y teléfono)');
select is((select count(*)::int from public.device_tokens where user_id = '00000000-0000-0000-0000-00000000e0c1'), 0,
  'se borran sus dispositivos');
select is((select count(*)::int from public.user_roles
  where user_id = '00000000-0000-0000-0000-00000000e0c1' and revoked_at is null), 0, 'se revocan sus roles');
select ok(exists (select 1 from public.audit_log where action = 'ACCOUNT_DELETED'
  and actor_id = '00000000-0000-0000-0000-00000000e0c1' and 'CLIENTE' = any (actor_roles) and request_id = 'req-eliminacion'),
  'la auditoría registra la eliminación con los roles que tenía');
select is(private.contract_party_name((select c from public.contracts c where id = (select v::uuid from t where k = 'k_elena')),
  'CLIENTE'), 'Cuenta eliminada', 'la otra parte la ve como «Cuenta eliminada»');
select throws_ok($$ select public.fn_delete_account('00000000-0000-0000-0000-00000000e0c1') $$, '42501', null,
  'una cuenta eliminada no se vuelve a eliminar');

-- -----------------------------------------------------------------------------
-- Eliminación del trabajador (cuando su contratación ya no está en marcha)
-- -----------------------------------------------------------------------------
select public.fn_contract_cancel('00000000-0000-0000-0000-00000000e0c3', (select v::uuid from t where k = 'k_otra'),
  'Cambié de planes, lo siento');
insert into t select 'r_esteban', public.fn_delete_account('00000000-0000-0000-0000-00000000e0c2')::text;

select is((select v::jsonb -> 'files' from t where k = 'r_esteban'),
  '["workers/00000000-0000-0000-0000-00000000e0a1/photos/00000000-0000-0000-0000-00000000f001.jpg", "workers/00000000-0000-0000-0000-00000000e0a1/documents/00000000-0000-0000-0000-00000000f002.pdf"]'::jsonb,
  'devuelve la foto y los documentos para borrarlos del bucket');
select is((select row(status::text, user_id, public_display_name, phone, photo_path, photo_status)::text
  from public.worker_profiles where id = '00000000-0000-0000-0000-00000000e0a1'),
  row('INACTIVO', null::uuid, 'Cuenta eliminada', null::text, null::text, 'SIN_FOTO')::text,
  'la ficha queda inactiva, desvinculada y sin datos personales');
select is((select count(*)::int from public.worker_documents where worker_id = '00000000-0000-0000-0000-00000000e0a1')
  + (select count(*)::int from public.worker_services where worker_id = '00000000-0000-0000-0000-00000000e0a1'), 0,
  'se borran sus documentos y oficios');
select ok(exists (select 1 from public.worker_status_history where worker_id = '00000000-0000-0000-0000-00000000e0a1'
  and to_status = 'INACTIVO' and reason = 'Cuenta eliminada por el titular'), 'el historial de estados lo registra');
select is((select count(*)::int from public.fn_public_search_workers(p_limit => 100)
  where id = '00000000-0000-0000-0000-00000000e0a1'), 0, 'sale del catálogo público');
select is((select status::text from public.conversations where id = (select v::uuid from t where k = 'conv_otra')), 'CERRADA',
  'sus conversaciones con otros clientes quedan cerradas');

-- La ficha queda congelada.
select throws_ok($$ update public.worker_profiles set status = 'HABILITADO' where id = '00000000-0000-0000-0000-00000000e0a1' $$,
  '55000', null, 'el GAD no reactiva una ficha eliminada');
select lives_ok($$ update public.worker_profiles set rating_avg = 4.5, rating_count = 2
  where id = '00000000-0000-0000-0000-00000000e0a1' $$, '…pero sus estadísticas se siguen actualizando');
select throws_ok($$ insert into public.worker_services (worker_id, service_id)
  values ('00000000-0000-0000-0000-00000000e0a1', (select v::uuid from t where k = 'servicio')) $$,
  '55000', null, 'no se le agregan oficios');

select * from finish();
rollback;
