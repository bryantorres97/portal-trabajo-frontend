-- pgTAP: Fase 5 — chat, notificaciones y autorización de Realtime. Ejecutar: supabase test db
begin;
select plan(37);

-- -----------------------------------------------------------------------------
-- Seguridad: RLS, privilegios, política de Realtime
-- -----------------------------------------------------------------------------
select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('conversations', 'messages', 'notifications', 'device_tokens',
    'notification_outbox', 'report_reasons', 'reports')), 'RLS activado en las tablas del chat');
select ok(not has_table_privilege('authenticated', 'public.messages', 'SELECT'), 'authenticated no lee mensajes directamente');
select ok(not has_table_privilege('anon', 'public.conversations', 'SELECT'), 'anon no lee conversaciones');
select ok(not has_table_privilege('service_role', 'public.messages', 'DELETE'), 'ni el servidor borra mensajes');
select ok(not has_function_privilege('authenticated', 'public.fn_send_message(uuid, uuid, text, uuid)', 'EXECUTE'),
  'authenticated no envía mensajes directamente');
select ok(has_function_privilege('authenticated', 'private.can_read_realtime_topic(text)', 'EXECUTE'),
  'la política de Realtime puede evaluarse con el rol authenticated');
select is((select count(*)::int from pg_policies where schemaname = 'realtime' and tablename = 'messages'
  and cmd = 'SELECT' and 'authenticated' = any (roles)), 1, 'una política de lectura en realtime.messages');
select is((select count(*)::int from pg_policies where schemaname = 'realtime' and tablename = 'messages'
  and cmd in ('INSERT', 'ALL')), 0, 'ninguna política permite publicar desde el navegador');

-- -----------------------------------------------------------------------------
-- Datos: cliente, trabajador habilitado con cuenta, tercero, personal
-- -----------------------------------------------------------------------------
insert into public.users (id, display_name) values
  ('00000000-0000-0000-0000-0000000005c1', 'Carla Mena'),
  ('00000000-0000-0000-0000-0000000005c2', 'Walter Trabajador'),
  ('00000000-0000-0000-0000-0000000005c3', 'Tercero Curioso'),
  ('00000000-0000-0000-0000-0000000005c4', 'Funcionario');
insert into public.user_identities (user_id, issuer, sub, provider) values
  ('00000000-0000-0000-0000-0000000005c4', 'https://login.microsoftonline.com/t/v2.0', 'oid-5c4', 'ENTRA');
insert into public.client_profiles (user_id, full_name) values ('00000000-0000-0000-0000-0000000005c1', 'Carla Andrea Mena Ruiz');
insert into public.worker_profiles (id, user_id, first_names, last_names, public_display_name, status) values
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000005c2', 'Walter', 'Paz', 'Walter P.', 'HABILITADO'),
  ('00000000-0000-0000-0000-0000000005a2', null, 'Nora', 'Vaca', 'Nora V.', 'CAPACITACION_EN_PROCESO');

create temp table t (k text primary key, v text) on commit drop;
insert into t select 'c', conversation_id::text from public.fn_start_conversation(
  '00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005a1', 'Hola, necesito un gasfitero',
  '00000000-0000-4000-8000-00000000c001');

select is((select count(*)::int from public.messages where conversation_id = (select v::uuid from t where k = 'c')), 1,
  'el cliente inicia la conversación con el primer mensaje');
select is((select count(*)::int from public.audit_log where action = 'CONVERSATION_STARTED'
  and resource_id = (select v from t where k = 'c')), 1, 'el inicio queda auditado (sin el contenido)');
select ok((select not (metadata::text ilike '%gasfitero%') from public.audit_log where action = 'CONVERSATION_STARTED'
  and resource_id = (select v from t where k = 'c')), 'la auditoría no guarda el texto del mensaje');

select throws_ok($$ select * from public.fn_start_conversation('00000000-0000-0000-0000-0000000005c1',
  '00000000-0000-0000-0000-0000000005a2', 'Hola') $$, '23514', null, 'no se inicia chat con un trabajador no habilitado');
select throws_ok($$ select * from public.fn_start_conversation('00000000-0000-0000-0000-0000000005c2',
  '00000000-0000-0000-0000-0000000005a1', 'Hola') $$, '23514', null, 'el trabajador no conversa consigo mismo');
select throws_ok($$ select * from public.fn_start_conversation('00000000-0000-0000-0000-0000000005c4',
  '00000000-0000-0000-0000-0000000005a1', 'Hola') $$, '42501', null, 'el personal del GAD no participa en el chat');

-- Idempotencia: el mismo clientMessageId no duplica
select is(
  (select message_id from public.fn_start_conversation('00000000-0000-0000-0000-0000000005c1',
     '00000000-0000-0000-0000-0000000005a1', 'Hola, necesito un gasfitero', '00000000-0000-4000-8000-00000000c001')),
  (select min(id) from public.messages where conversation_id = (select v::uuid from t where k = 'c')),
  'reintentar el envío devuelve el mismo mensaje');
select is((select count(*)::int from public.messages where conversation_id = (select v::uuid from t where k = 'c')), 1,
  'no se duplicó el mensaje');

-- El trabajador responde; un tercero no puede leer ni escribir
select lives_ok($$ select public.fn_send_message('00000000-0000-0000-0000-0000000005c2',
  (select v::uuid from t where k = 'c'), 'Claro, ¿en qué sector?') $$, 'el trabajador responde');
select throws_ok($$ select public.fn_send_message('00000000-0000-0000-0000-0000000005c3',
  (select v::uuid from t where k = 'c'), 'Intruso') $$, 'P0002', null, 'un tercero no puede escribir');
select throws_ok($$ select * from public.fn_list_messages('00000000-0000-0000-0000-0000000005c3',
  (select v::uuid from t where k = 'c')) $$, 'P0002', null, 'un tercero no puede leer');
select is((select count(*)::int from public.fn_list_conversations('00000000-0000-0000-0000-0000000005c3')), 0,
  'la bandeja del tercero está vacía');
select is((select counterpart_name from public.fn_list_conversations('00000000-0000-0000-0000-0000000005c2')), 'Carla M.',
  'el trabajador ve al cliente como «Nombre A.»');
select is((select unread from public.fn_list_conversations('00000000-0000-0000-0000-0000000005c1')), 1::bigint,
  'el cliente tiene 1 mensaje sin leer');

-- Notificación in-app: una por conversación, no una por mensaje
select lives_ok($$ select public.fn_send_message('00000000-0000-0000-0000-0000000005c2',
  (select v::uuid from t where k = 'c'), 'Y a qué hora le queda bien') $$, 'segundo mensaje del trabajador');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000005c1'
  and read_at is null), 1, 'una sola notificación sin leer por conversación');
select lives_ok($$ select public.fn_mark_conversation_read('00000000-0000-0000-0000-0000000005c1',
  (select v::uuid from t where k = 'c')) $$, 'el cliente marca como leído');
select is((select unread from public.fn_list_conversations('00000000-0000-0000-0000-0000000005c1')), 0::bigint,
  'sin mensajes pendientes tras leer');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000005c1'
  and read_at is null), 0, 'leer la conversación marca su notificación');

-- Bloqueo (RN-13)
select lives_ok($$ select public.fn_set_conversation_block('00000000-0000-0000-0000-0000000005c1',
  (select v::uuid from t where k = 'c'), true) $$, 'el cliente bloquea');
select throws_ok($$ select public.fn_send_message('00000000-0000-0000-0000-0000000005c2',
  (select v::uuid from t where k = 'c'), '¿Sigue ahí?') $$, '42501', 'La conversación está bloqueada',
  'con la conversación bloqueada el trabajador no puede escribir');
select lives_ok($$ select public.fn_set_conversation_block('00000000-0000-0000-0000-0000000005c1',
  (select v::uuid from t where k = 'c'), false) $$, 'el cliente desbloquea');

-- Inmutabilidad
select throws_ok($$ update public.messages set body = 'editado' where conversation_id = (select v::uuid from t where k = 'c') $$,
  '42501', null, 'el texto de un mensaje no se edita');
select throws_ok($$ delete from public.messages where conversation_id = (select v::uuid from t where k = 'c') $$,
  '42501', null, 'los mensajes no se borran');

-- Denuncia (enganche de la Fase 8)
select throws_ok($$ select public.fn_report_message('00000000-0000-0000-0000-0000000005c1',
  (select min(id) from public.messages where conversation_id = (select v::uuid from t where k = 'c')), 'MENSAJE_SPAM') $$,
  '23514', null, 'no se denuncia un mensaje propio');
select lives_ok($$ select public.fn_report_message('00000000-0000-0000-0000-0000000005c1',
  (select max(id) from public.messages where conversation_id = (select v::uuid from t where k = 'c')), 'MENSAJE_ACOSO') $$,
  'el cliente denuncia un mensaje recibido');

-- -----------------------------------------------------------------------------
-- Autorización de canales de Realtime (JWT propio: iss = llankana)
-- -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"iss":"llankana","role":"authenticated","sub":"00000000-0000-0000-0000-0000000005c1"}', true);
select ok(private.can_read_realtime_topic('conversation:' || (select v from t where k = 'c'))
  and private.can_read_realtime_topic('user:00000000-0000-0000-0000-0000000005c1'),
  'el cliente lee su conversación y su canal personal');
select set_config('request.jwt.claims', '{"iss":"llankana","role":"authenticated","sub":"00000000-0000-0000-0000-0000000005c3"}', true);
select ok(not private.can_read_realtime_topic('conversation:' || (select v from t where k = 'c'))
  and not private.can_read_realtime_topic('user:00000000-0000-0000-0000-0000000005c1'),
  'un tercero no puede suscribirse a la conversación ni al canal ajeno');
select set_config('request.jwt.claims', '{"iss":"otro-emisor","role":"authenticated","sub":"00000000-0000-0000-0000-0000000005c1"}', true);
select ok(not private.can_read_realtime_topic('user:00000000-0000-0000-0000-0000000005c1'),
  'un token de otro emisor no sirve');

select * from finish();
rollback;
