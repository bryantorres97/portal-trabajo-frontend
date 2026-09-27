-- pgTAP: avisos push del GAD — segmentos, preferencia, dispositivos anónimos, sesión web,
-- programación, despacho, reintentos, cancelación y permisos.
-- Ejecutar: supabase test db
begin;
select plan(46);

select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('push_campaigns', 'push_deliveries')), 'RLS activado en campañas y entregas');
select ok(not has_table_privilege('authenticated', 'public.push_campaigns', 'SELECT'), 'authenticated no lee campañas');
select ok(not has_function_privilege('anon', 'public.fn_register_anonymous_device(text, text, text)', 'EXECUTE'),
  'anon no registra dispositivos directamente en la base');
select ok(exists (select 1 from public.role_permissions where role_code = 'ADMIN_SISTEMA' and permission_code = 'notifications.broadcast'),
  'el administrador del sistema envía avisos');

-- -----------------------------------------------------------------------------
-- Personas y dispositivos
-- -----------------------------------------------------------------------------
insert into public.users (id, display_name, email) values
  ('00000000-0000-0000-0000-000000000ac1', 'Admin Avisos', 'admin.avisos@gad.test'),
  ('00000000-0000-0000-0000-000000000ac2', 'Moderador Avisos', 'mod.avisos@gad.test'),
  ('00000000-0000-0000-0000-000000000a01', 'Clara Cliente', 'clara.push@test.ec'),
  ('00000000-0000-0000-0000-000000000a02', 'Tomás Trabajador', 'tomas.push@test.ec'),
  ('00000000-0000-0000-0000-000000000a03', 'Olga Sin Avisos', 'olga.push@test.ec'),
  ('00000000-0000-0000-0000-000000000a04', 'Beto Bloqueado', 'beto.push@test.ec');
insert into public.user_identities (user_id, issuer, sub, provider) values
  ('00000000-0000-0000-0000-000000000ac1', 'https://login.microsoftonline.com/t/v2.0', 'oid-ac1', 'ENTRA'),
  ('00000000-0000-0000-0000-000000000ac2', 'https://login.microsoftonline.com/t/v2.0', 'oid-ac2', 'ENTRA');
insert into public.user_roles (user_id, role_code) values
  ('00000000-0000-0000-0000-000000000ac1', 'ADMIN_SISTEMA'),
  ('00000000-0000-0000-0000-000000000ac2', 'MODERADOR'),
  ('00000000-0000-0000-0000-000000000a01', 'CLIENTE'),
  ('00000000-0000-0000-0000-000000000a02', 'CLIENTE'),
  ('00000000-0000-0000-0000-000000000a02', 'TRABAJADOR'),
  ('00000000-0000-0000-0000-000000000a03', 'CLIENTE'),
  ('00000000-0000-0000-0000-000000000a04', 'CLIENTE');
insert into public.auth_sessions (id, token_hash, user_id, tokens_enc, access_expires_at, expires_at) values
  ('00000000-0000-0000-0000-000000000a51', repeat('b', 64), '00000000-0000-0000-0000-000000000a01', 'cifrado-de-prueba',
   now() + interval '1 hour', now() + interval '1 day');

select public.fn_register_device('00000000-0000-0000-0000-000000000a01', 'ANDROID', 'tok-push-clara-android-000000');
select public.fn_register_device('00000000-0000-0000-0000-000000000a01', 'WEB', 'tok-push-clara-web-00000000000',
  '00000000-0000-0000-0000-000000000a51');
select public.fn_register_device('00000000-0000-0000-0000-000000000a02', 'IOS', 'tok-push-tomas-ios-0000000000');
select public.fn_register_device('00000000-0000-0000-0000-000000000a03', 'ANDROID', 'tok-push-olga-android-0000000');
select public.fn_register_device('00000000-0000-0000-0000-000000000a04', 'ANDROID', 'tok-push-beto-android-0000000');
update public.users set push_announcements = false where id = '00000000-0000-0000-0000-000000000a03';
update public.users set status = 'BLOQUEADO' where id = '00000000-0000-0000-0000-000000000a04';

select throws_ok($$ select public.fn_register_device('00000000-0000-0000-0000-000000000a02', 'WEB', 'tok-push-otra-sesion-000000000',
  '00000000-0000-0000-0000-000000000a51') $$, '42501', 'Sesión no válida', 'no se liga un token a la sesión de otra persona');

select is(public.fn_register_anonymous_device('ANDROID', 'tok-push-anonimo-android-0000', repeat('c', 64)), 'OK',
  'la app sin sesión registra un dispositivo anónimo');
select ok((select user_id is null from public.device_tokens where token = 'tok-push-anonimo-android-0000'), 'queda sin dueño');
select throws_ok($$ select public.fn_register_anonymous_device('WEB', 'tok-push-anonimo-web-000000000', repeat('c', 64)) $$,
  '23514', null, 'el navegador no registra dispositivos anónimos');
select is(public.fn_register_anonymous_device('ANDROID', 'tok-push-clara-android-000000', repeat('c', 64)), 'OK',
  'registrar como anónimo un token con dueño activo responde OK…');
select is((select user_id from public.device_tokens where token = 'tok-push-clara-android-000000'),
  '00000000-0000-0000-0000-000000000a01'::uuid, '…pero no lo desvincula de su dueño');

create temp table t (k text primary key, v text) on commit drop;
insert into t select 'clara_android', id::text from public.device_tokens where token = 'tok-push-clara-android-000000';
insert into t select 'clara_web', id::text from public.device_tokens where token = 'tok-push-clara-web-00000000000';
insert into t select 'tomas', id::text from public.device_tokens where token = 'tok-push-tomas-ios-0000000000';
insert into t select 'olga', id::text from public.device_tokens where token = 'tok-push-olga-android-0000000';
insert into t select 'beto', id::text from public.device_tokens where token = 'tok-push-beto-android-0000000';
insert into t select 'anon', id::text from public.device_tokens where token = 'tok-push-anonimo-android-0000';

-- Límite de dispositivos anónimos por IP
select is((select count(*)::int from (
  select public.fn_register_anonymous_device('IOS', 'tok-push-limite-' || lpad(g::text, 20, '0'), repeat('d', 64)) as r
  from generate_series(1, 31) g) x where r = 'RATE_LIMITED'), 1, 'el token 31 de la misma IP en una hora se rechaza');

-- -----------------------------------------------------------------------------
-- Segmentos
-- -----------------------------------------------------------------------------
create temp table aud (segment text, device_id bigint) on commit drop;
insert into aud select s, a.device_id from unnest(array['TODOS', 'USUARIOS', 'CLIENTES', 'TRABAJADORES']) s,
  private.push_audience_devices(s, array['WEB', 'ANDROID', 'IOS'], '{}', '{}') a;

select ok(exists (select 1 from aud where segment = 'TODOS' and device_id = (select v::bigint from t where k = 'anon')),
  'TODOS incluye los dispositivos anónimos');
select ok(not exists (select 1 from aud where segment = 'USUARIOS' and device_id = (select v::bigint from t where k = 'anon')),
  'USUARIOS excluye los anónimos');
select ok(exists (select 1 from aud where segment = 'CLIENTES' and device_id = (select v::bigint from t where k = 'clara_android')),
  'CLIENTES incluye a la clienta');
select ok(not exists (select 1 from aud where segment = 'CLIENTES' and device_id = (select v::bigint from t where k = 'tomas')),
  'CLIENTES excluye a quien también es trabajador');
select ok(exists (select 1 from aud where segment = 'TRABAJADORES' and device_id = (select v::bigint from t where k = 'tomas')),
  'TRABAJADORES incluye al trabajador');
select ok(not exists (select 1 from aud where segment = 'TRABAJADORES' and device_id = (select v::bigint from t where k = 'clara_android')),
  'TRABAJADORES excluye a los clientes');
select ok(not exists (select 1 from aud where device_id = (select v::bigint from t where k = 'olga')),
  'quien desactivó los avisos del GAD no los recibe por push');
select ok(not exists (select 1 from aud where device_id = (select v::bigint from t where k = 'beto')),
  'las cuentas bloqueadas no reciben avisos');
select is((select count(*)::int from private.push_audience_devices('TODOS', array['IOS'], '{}', '{}') a
  where a.device_id in ((select v::bigint from t where k = 'tomas'), (select v::bigint from t where k = 'clara_android'))), 1,
  'el filtro de plataforma se respeta');
select ok(exists (select 1 from private.push_audience_users('CLIENTES', '{}', '{}') a
  where a.user_id = '00000000-0000-0000-0000-000000000a03'), 'la bandeja del portal sí incluye a quien desactivó el push');
select ok(not exists (select 1 from private.push_audience_users('TODOS', '{}', '{}') a
  where a.user_id = '00000000-0000-0000-0000-000000000ac1'), 'el personal del GAD no recibe avisos ciudadanos');

select is((public.fn_admin_push_audience('00000000-0000-0000-0000-000000000ac1', 'SELECCION', array['WEB', 'ANDROID', 'IOS'],
  array['00000000-0000-0000-0000-000000000a01']::uuid[], array[(select v::bigint from t where k = 'tomas')]) ->> 'devices')::int, 3,
  'selección: los dispositivos de la usuaria elegida y el dispositivo elegido');
select throws_ok($$ select public.fn_admin_push_audience('00000000-0000-0000-0000-000000000ac2', 'TODOS', array['WEB']) $$,
  '42501', null, 'sin notifications.broadcast no se estima la audiencia');

-- -----------------------------------------------------------------------------
-- Campaña inmediata a una selección, con aviso en la bandeja
-- -----------------------------------------------------------------------------
insert into t select 'c1', public.fn_admin_create_push_campaign('00000000-0000-0000-0000-000000000ac1', 'Corte de agua',
  'Mañana no habrá atención en el punto de Huachi.', '/preguntas-frecuentes', 'SELECCION', array['WEB', 'ANDROID', 'IOS'],
  array['00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a03']::uuid[],
  array[(select v::bigint from t where k = 'tomas')], true, null)::text;

select is((select status from public.push_campaigns where id = (select v::uuid from t where k = 'c1')), 'ENVIANDO',
  'una campaña sin fecha se inicia al crearla');
select is((select total_devices from public.push_campaigns where id = (select v::uuid from t where k = 'c1')), 3,
  'una entrega por dispositivo (Olga desactivó el push)');
select is((select count(*)::int from public.notifications where dedupe_key = 'campaign:' || (select v from t where k = 'c1')), 3,
  'el aviso queda en la bandeja de las tres personas');
select is((select count(*)::int from public.audit_log where action = 'PUSH_CAMPAIGN_CREATED'
  and resource_id = (select v from t where k = 'c1')), 1, 'la creación queda auditada');

select throws_ok($$ select public.fn_admin_create_push_campaign('00000000-0000-0000-0000-000000000ac2', 'Hola a todos', 'Texto de prueba',
  null, 'TODOS', array['WEB'], '{}', '{}', false, null) $$, '42501', null, 'sin permiso no se crean campañas');
select throws_ok($$ select public.fn_admin_create_push_campaign('00000000-0000-0000-0000-000000000ac1', 'Hola a todos', 'Texto de prueba',
  null, 'SELECCION', array['WEB'], '{}', '{}', false, null) $$, '23514', null, 'una selección necesita destinatarios');

-- Despacho: se toman las 3, una llega, una tiene token inválido y otra falla temporalmente
create temp table lote as select * from public.fn_claim_push_deliveries(1000) where campaign_id = (select v::uuid from t where k = 'c1');
select is((select count(*)::int from lote), 3, 'el despachador toma las tres entregas');
select is((select count(*)::int from public.fn_claim_push_deliveries(1000) where campaign_id = (select v::uuid from t where k = 'c1')), 0,
  'una entrega tomada no se vuelve a tomar antes de su espera');
select lives_ok($$ select public.fn_complete_push_deliveries(jsonb_build_array(
  jsonb_build_object('id', (select id from lote where token = 'tok-push-clara-android-000000'), 'result', 'ENVIADA'),
  jsonb_build_object('id', (select id from lote where token = 'tok-push-clara-web-00000000000'), 'result', 'DESCARTADA',
    'error', 'FCM 404: UNREGISTERED', 'invalid', true),
  jsonb_build_object('id', (select id from lote where token = 'tok-push-tomas-ios-0000000000'), 'result', 'REINTENTAR',
    'error', 'FCM 503'))) $$, 'se registran los resultados');
select ok((select disabled_at is not null from public.device_tokens where token = 'tok-push-clara-web-00000000000'),
  'el token inválido se desactiva');
select is((select array[sent_count, failed_count, discarded_count] from public.push_campaigns where id = (select v::uuid from t where k = 'c1')),
  array[1, 0, 1], 'conteos: 1 enviada, 1 descartada');
select is((select status from public.push_campaigns where id = (select v::uuid from t where k = 'c1')), 'ENVIANDO',
  'sigue enviando mientras haya reintentos pendientes');

-- Agotar los reintentos (3 intentos)
update public.push_deliveries set next_attempt_at = now() - interval '1 second'
  where campaign_id = (select v::uuid from t where k = 'c1') and status = 'PENDIENTE';
select public.fn_complete_push_deliveries(jsonb_build_array(jsonb_build_object('id', id, 'result', 'REINTENTAR', 'error', 'FCM 503')))
  from public.fn_claim_push_deliveries(1000) where campaign_id = (select v::uuid from t where k = 'c1');
update public.push_deliveries set next_attempt_at = now() - interval '1 second'
  where campaign_id = (select v::uuid from t where k = 'c1') and status = 'PENDIENTE';
select public.fn_complete_push_deliveries(jsonb_build_array(jsonb_build_object('id', id, 'result', 'REINTENTAR', 'error', 'FCM 503')))
  from public.fn_claim_push_deliveries(1000) where campaign_id = (select v::uuid from t where k = 'c1');
select is((select status from public.push_campaigns where id = (select v::uuid from t where k = 'c1')), 'COMPLETADA',
  'tras el tercer intento fallido la entrega queda FALLIDA y la campaña termina');
select is((select failed_count from public.push_campaigns where id = (select v::uuid from t where k = 'c1')), 1, '1 fallida');
select throws_ok($$ select public.fn_admin_cancel_push_campaign('00000000-0000-0000-0000-000000000ac1',
  (select v::uuid from t where k = 'c1')) $$, '55000', null, 'una campaña terminada no se cancela');

-- -----------------------------------------------------------------------------
-- Programada, cancelación y sesión web
-- -----------------------------------------------------------------------------
insert into t select 'c2', public.fn_admin_create_push_campaign('00000000-0000-0000-0000-000000000ac1', 'Feria de empleo',
  'Te esperamos el sábado en el parque Cevallos.', null, 'TRABAJADORES', array['IOS'], '{}', '{}', false,
  now() + interval '1 day')::text;
select is((select status from public.push_campaigns where id = (select v::uuid from t where k = 'c2')), 'PROGRAMADA',
  'con fecha futura queda programada');
select is((select count(*)::int from public.push_deliveries where campaign_id = (select v::uuid from t where k = 'c2')), 0,
  'la audiencia se fija recién al iniciar');
update public.push_campaigns set scheduled_at = now() - interval '1 minute' where id = (select v::uuid from t where k = 'c2');
select ok((select count(*) from public.fn_claim_push_deliveries(1000) where campaign_id = (select v::uuid from t where k = 'c2')) >= 1,
  'el despachador inicia la campaña vencida y toma sus entregas');

insert into t select 'c3', public.fn_admin_create_push_campaign('00000000-0000-0000-0000-000000000ac1', 'Aviso cancelable',
  'Este aviso se cancela antes de enviarse.', null, 'SELECCION', array['ANDROID'], '{}',
  array[(select v::bigint from t where k = 'anon')], false, now() + interval '2 hours')::text;
select lives_ok($$ select public.fn_admin_cancel_push_campaign('00000000-0000-0000-0000-000000000ac1', (select v::uuid from t where k = 'c3')) $$,
  'se cancela un aviso programado');
select is((select status from public.push_campaigns where id = (select v::uuid from t where k = 'c3')), 'CANCELADA', 'queda cancelado');

select public.fn_register_device('00000000-0000-0000-0000-000000000a01', 'WEB', 'tok-push-clara-web-00000000000',
  '00000000-0000-0000-0000-000000000a51');
update public.auth_sessions set revoked_at = now() where id = '00000000-0000-0000-0000-000000000a51';
select ok((select disabled_at is not null from public.device_tokens where token = 'tok-push-clara-web-00000000000'),
  'al cerrar la sesión web se desactiva su token');

select public.fn_unregister_device('00000000-0000-0000-0000-000000000a02', 'tok-push-tomas-ios-0000000000', true);
select ok((select user_id is null and disabled_at is null from public.device_tokens where token = 'tok-push-tomas-ios-0000000000'),
  'al cerrar sesión en la app el dispositivo sigue como anónimo');

select * from finish();
rollback;
