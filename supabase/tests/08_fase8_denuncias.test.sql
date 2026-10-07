-- pgTAP: Fase 8 — denuncias y moderación (RN-09, RN-16, sanciones con vigencia). Ejecutar: supabase test db
begin;
select plan(57);

-- -----------------------------------------------------------------------------
-- Seguridad
-- -----------------------------------------------------------------------------
select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('report_events', 'report_evidence', 'sensitive_access_log', 'moderation_actions')),
  'RLS activado en las tablas de moderación');
select ok(not has_table_privilege('authenticated', 'public.sensitive_access_log', 'SELECT'), 'authenticated no lee accesos sensibles');
select ok(not has_table_privilege('service_role', 'public.sensitive_access_log', 'UPDATE')
  and not has_table_privilege('service_role', 'public.sensitive_access_log', 'DELETE'), 'ni el servidor altera el registro de accesos');
select ok(not has_function_privilege('authenticated', 'public.fn_admin_access_report_evidence(uuid, uuid, text, inet, text, text)', 'EXECUTE'),
  'authenticated no accede a la evidencia directamente');
select ok(exists (select 1 from storage.buckets where id = 'report-evidence' and not public), 'bucket privado para la evidencia');
select ok(exists (select 1 from public.role_permissions where role_code = 'ADMIN_SISTEMA' and permission_code = 'report.read'),
  'el administrador del sistema consulta las denuncias');
select ok(not exists (select 1 from public.role_permissions where role_code = 'ADMIN_SISTEMA'
  and permission_code in ('report.manage', 'report.evidence.read')), 'pero no las gestiona ni ve la evidencia');

-- -----------------------------------------------------------------------------
-- Datos: cliente, trabajador, tercero, moderador y responsable de denuncias
-- -----------------------------------------------------------------------------
insert into public.users (id, display_name) values
  ('00000000-0000-0000-0000-0000000008c1', 'Carla Mena'),
  ('00000000-0000-0000-0000-0000000008c2', 'Walter Trabajador'),
  ('00000000-0000-0000-0000-0000000008c3', 'Tercero Curioso'),
  ('00000000-0000-0000-0000-0000000008c4', 'Moderadora GAD'),
  ('00000000-0000-0000-0000-0000000008c5', 'Responsable Denuncias');
insert into public.user_identities (user_id, issuer, sub, provider) values
  ('00000000-0000-0000-0000-0000000008c4', 'https://login.microsoftonline.com/t/v2.0', 'oid-8c4', 'ENTRA'),
  ('00000000-0000-0000-0000-0000000008c5', 'https://login.microsoftonline.com/t/v2.0', 'oid-8c5', 'ENTRA');
insert into public.user_roles (user_id, role_code) values
  ('00000000-0000-0000-0000-0000000008c2', 'TRABAJADOR'),
  ('00000000-0000-0000-0000-0000000008c4', 'MODERADOR'),
  ('00000000-0000-0000-0000-0000000008c5', 'RESP_DENUNCIAS');
insert into public.client_profiles (user_id, full_name) values ('00000000-0000-0000-0000-0000000008c1', 'Carla Andrea Mena Ruiz');
insert into public.worker_profiles (id, user_id, first_names, last_names, public_display_name, status) values
  ('00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-0000000008c2', 'Walter', 'Paz', 'Walter P.', 'HABILITADO');
insert into public.auth_sessions (token_hash, user_id, tokens_enc, access_expires_at, expires_at)
values (repeat('a', 64), '00000000-0000-0000-0000-0000000008c1', 'cifrado-de-prueba', now() + interval '1 hour', now() + interval '1 day');

create temp table t (k text primary key, v text) on commit drop;
insert into t select 'conv', conversation_id::text from public.fn_start_conversation(
  '00000000-0000-0000-0000-0000000008c1', '00000000-0000-0000-0000-0000000008a1', 'Hola, necesito un gasfitero');
insert into t select 'msg', public.fn_send_message('00000000-0000-0000-0000-0000000008c2',
  (select v::uuid from t where k = 'conv'), 'Deposítame por adelantado a esta cuenta')::text;

-- -----------------------------------------------------------------------------
-- Crear denuncias (todos los tipos)
-- -----------------------------------------------------------------------------
insert into t select 'rw', public.fn_report_create('00000000-0000-0000-0000-0000000008c1', 'WORKER',
  '00000000-0000-0000-0000-0000000008a1', 'TRABAJADOR_FRAUDE', 'Me pidió dinero por adelantado fuera de la plataforma')::text;
select ok((select priority = 1 and due_at between now() + interval '23 hours' and now() + interval '25 hours'
  from public.reports where id = (select v::uuid from t where k = 'rw')), 'la gravedad del motivo fija la prioridad alta y el plazo de 24 h');
select is((select event from public.report_events where report_id = (select v::uuid from t where k = 'rw') order by id limit 1), 'CREADA',
  'la creación queda en el historial');
select throws_ok($$ select public.fn_report_create('00000000-0000-0000-0000-0000000008c1', 'WORKER',
  '00000000-0000-0000-0000-0000000008a1', 'TRABAJADOR_CONDUCTA', 'Otra denuncia sobre lo mismo') $$,
  '23505', null, 'no se duplica una denuncia abierta sobre el mismo objeto (RN-16)');
select throws_ok($$ select public.fn_report_create('00000000-0000-0000-0000-0000000008c2', 'WORKER',
  '00000000-0000-0000-0000-0000000008a1', 'TRABAJADOR_OTRO', 'Me denuncio a mí mismo') $$,
  '23514', null, 'no se permite la auto-denuncia');
select throws_ok($$ select public.fn_report_create('00000000-0000-0000-0000-0000000008c1', 'CLIENT',
  (select v::uuid from t where k = 'conv'), 'CLIENTE_OTRO', 'Solo el trabajador denuncia a un cliente') $$,
  'P0002', null, 'solo el trabajador de la conversación denuncia al cliente');
select throws_ok($$ select public.fn_report_create('00000000-0000-0000-0000-0000000008c3', 'CONVERSATION',
  (select v::uuid from t where k = 'conv'), 'CONVERSACION_OTRO', 'Una conversación ajena') $$,
  'P0002', null, 'un tercero no denuncia una conversación ajena');
insert into t select 'rc', public.fn_report_create('00000000-0000-0000-0000-0000000008c2', 'CLIENT',
  (select v::uuid from t where k = 'conv'), 'CLIENTE_CONDUCTA', 'El cliente me insultó en la conversación')::text;
insert into t select 'rm', public.fn_report_message('00000000-0000-0000-0000-0000000008c1',
  (select v::bigint from t where k = 'msg'), 'MENSAJE_FRAUDE', 'Pide depósito')::text;
update public.app_settings set value = '2' where key = 'reports.daily_limit';
select throws_ok($$ select public.fn_report_create('00000000-0000-0000-0000-0000000008c1', 'CONVERSATION',
  (select v::uuid from t where k = 'conv'), 'CONVERSACION_SPAM', 'Superando el límite diario') $$,
  '54000', null, 'límite diario de denuncias por persona');
update public.app_settings set value = '10' where key = 'reports.daily_limit';

-- Seguimiento del denunciante
select is((select count(*)::int from public.fn_my_reports('00000000-0000-0000-0000-0000000008c1')), 2,
  'el denunciante ve sus denuncias');
select throws_ok($$ select public.fn_my_report('00000000-0000-0000-0000-0000000008c3', (select v::uuid from t where k = 'rw')) $$,
  'P0002', null, 'nadie más ve el seguimiento');

-- -----------------------------------------------------------------------------
-- RN-09: acceso a la conversación solo con denuncia, permiso y justificación
-- -----------------------------------------------------------------------------
select throws_ok($$ select public.fn_admin_access_report_evidence('00000000-0000-0000-0000-0000000008c4',
  (select v::uuid from t where k = 'rm'), 'Revisar el mensaje denunciado por fraude') $$,
  '42501', null, 'un moderador sin permiso de evidencia no lee mensajes');
select throws_ok($$ select public.fn_admin_access_report_evidence('00000000-0000-0000-0000-0000000008c5',
  (select v::uuid from t where k = 'rm'), 'Corta') $$, '23514', null, 'el acceso exige una justificación');
select is(jsonb_array_length(public.fn_admin_access_report_evidence('00000000-0000-0000-0000-0000000008c5',
  (select v::uuid from t where k = 'rm'), 'Verificar el intento de cobro por adelantado denunciado') -> 'conversation' -> 'messages'), 2,
  'con denuncia y justificación, el responsable ve la conversación');
select ok((select count(*) = 1 from public.sensitive_access_log where report_id = (select v::uuid from t where k = 'rm')
  and actor_id = '00000000-0000-0000-0000-0000000008c5' and justification like 'Verificar%')
  and (select count(*) = 1 from public.audit_log where action = 'MESSAGE_REVIEWED' and resource_id = (select v from t where k = 'rm')),
  'cada acceso queda registrado con su justificación y en la auditoría');
select throws_ok($$ update public.sensitive_access_log set justification = 'cambiada para ocultar' $$,
  '42501', null, 'el registro de accesos es inmutable');
select throws_ok($$ select * from public.fn_admin_evidence_file('00000000-0000-0000-0000-0000000008c5',
  (select v::uuid from t where k = 'rw'), gen_random_uuid()) $$, '42501', null,
  'los archivos de evidencia exigen el acceso justificado a esa denuncia');

-- -----------------------------------------------------------------------------
-- Flujo de la denuncia
-- -----------------------------------------------------------------------------
select throws_ok($$ select public.fn_admin_report_update('00000000-0000-0000-0000-0000000008c4',
  (select v::uuid from t where k = 'rw'), 'ASSIGN_ME') $$, '42501', null, 'gestionar denuncias exige report.manage');
select is(public.fn_admin_report_update('00000000-0000-0000-0000-0000000008c5', (select v::uuid from t where k = 'rw'), 'ASSIGN_ME')::text,
  'EN_REVISION', 'al asignársela pasa a revisión');
select ok((select assigned_to = '00000000-0000-0000-0000-0000000008c5' from public.reports where id = (select v::uuid from t where k = 'rw')),
  'queda asignada al responsable');
select is(public.fn_admin_report_update('00000000-0000-0000-0000-0000000008c5', (select v::uuid from t where k = 'rw'), 'REQUEST_INFO',
  '¿Tienes captura del mensaje donde te pidió el depósito?')::text, 'EN_ESPERA_DE_INFORMACION', 'el GAD pide información');
select ok((select body like '¿Tienes captura%' from public.notifications where user_id = '00000000-0000-0000-0000-0000000008c1'
  and dedupe_key = 'report:' || (select v from t where k = 'rw') and read_at is null), 'el denunciante recibe el pedido');
select lives_ok($$ select public.fn_report_add_evidence('00000000-0000-0000-0000-0000000008c1', (select v::uuid from t where k = 'rw'),
  'Sí, me escribió el lunes a las 10:00 pidiendo 50 dólares') $$, 'el denunciante aporta información');
select is((select status::text from public.reports where id = (select v::uuid from t where k = 'rw')), 'EN_REVISION',
  'al aportar información vuelve a revisión');
select throws_ok($$ select public.fn_report_add_evidence('00000000-0000-0000-0000-0000000008c1', (select v::uuid from t where k = 'rw'),
  null, 'reports/otra-denuncia/x.pdf', 'application/pdf', 10, repeat('a', 64), 'x.pdf') $$, '23514', null,
  'la ruta del archivo pertenece a la denuncia');

-- -----------------------------------------------------------------------------
-- Sanciones
-- -----------------------------------------------------------------------------
select lives_ok($$ select public.fn_admin_apply_moderation('00000000-0000-0000-0000-0000000008c4', (select v::uuid from t where k = 'rm'),
  'OCULTAR_MENSAJE', 'Intento de cobro fuera de la plataforma') $$, 'el moderador oculta el mensaje denunciado');
select ok((select body is null and hidden from public.fn_list_messages('00000000-0000-0000-0000-0000000008c1',
  (select v::uuid from t where k = 'conv')) where id = (select v::bigint from t where k = 'msg')), 'las partes ya no ven el texto');
select throws_ok($$ select public.fn_admin_apply_moderation('00000000-0000-0000-0000-0000000008c4', (select v::uuid from t where k = 'rw'),
  'SUSPENDER_TRABAJADOR', 'Fraude comprobado con capturas', now() + interval '7 days') $$, '42501', null,
  'suspender exige report.manage');
select throws_ok($$ select public.fn_admin_apply_moderation('00000000-0000-0000-0000-0000000008c5', (select v::uuid from t where k = 'rw'),
  'SUSPENDER_TRABAJADOR', 'Fraude comprobado con capturas') $$, '23514', null, 'la suspensión exige fecha de fin');
select lives_ok($$ select public.fn_admin_apply_moderation('00000000-0000-0000-0000-0000000008c5', (select v::uuid from t where k = 'rw'),
  'SUSPENDER_TRABAJADOR', 'Fraude comprobado con capturas', now() + interval '7 days') $$, 'el responsable suspende al trabajador 7 días');
select ok((select status = 'SUSPENDIDO' and suspended_until is not null from public.worker_profiles where id = '00000000-0000-0000-0000-0000000008a1')
  and not exists (select 1 from public.fn_public_worker('00000000-0000-0000-0000-0000000008a1')),
  'suspendido: desaparece del portal público');

-- La suspensión temporal vence (se simula el paso del tiempo)
alter table public.moderation_actions disable trigger moderation_actions_guard;
update public.moderation_actions set starts_at = now() - interval '8 days', ends_at = now() - interval '1 minute'
  where action = 'SUSPENDER_TRABAJADOR' and report_id = (select v::uuid from t where k = 'rw');
alter table public.moderation_actions enable trigger moderation_actions_guard;
select ok(public.fn_run_moderation_maintenance() >= 1, 'la tarea programada procesa las sanciones vencidas');
select ok((select status = 'HABILITADO' and suspended_until is null from public.worker_profiles where id = '00000000-0000-0000-0000-0000000008a1'),
  'al vencer la suspensión el trabajador vuelve a estar habilitado');
select ok((select lifted_at is not null from public.moderation_actions where action = 'SUSPENDER_TRABAJADOR'
  and report_id = (select v::uuid from t where k = 'rw')), 'la acción queda levantada');

-- Suspensión de cuenta: bloquea y cierra sesiones; se puede revocar
select is(jsonb_array_length(public.fn_admin_apply_moderation('00000000-0000-0000-0000-0000000008c5', (select v::uuid from t where k = 'rc'),
  'SUSPENDER_CUENTA', 'Insultos reiterados al trabajador', now() + interval '3 days') -> 'revokedTokens'), 1,
  'suspender la cuenta revoca sus sesiones');
select is((select status::text from public.users where id = '00000000-0000-0000-0000-0000000008c1'), 'BLOQUEADO', 'la cuenta queda bloqueada');
select throws_ok($$ update public.moderation_actions set reason = 'otro motivo cualquiera' where report_id = (select v::uuid from t where k = 'rc') $$,
  '42501', null, 'una acción de moderación no se reescribe');
select ok(public.fn_admin_lift_moderation('00000000-0000-0000-0000-0000000008c5',
  (select id from public.moderation_actions where report_id = (select v::uuid from t where k = 'rc')),
  'Se comprobó que fue un malentendido'), 'el responsable revoca la suspensión');
select is((select status::text from public.users where id = '00000000-0000-0000-0000-0000000008c1'), 'ACTIVO', 'la cuenta vuelve a estar activa');

-- -----------------------------------------------------------------------------
-- Resolución
-- -----------------------------------------------------------------------------
select throws_ok($$ select public.fn_admin_report_update('00000000-0000-0000-0000-0000000008c5', (select v::uuid from t where k = 'rw'),
  'RESOLVE', 'Se suspendió al trabajador') $$, '23514', null, 'resolver exige el resultado');
select is(public.fn_admin_report_update('00000000-0000-0000-0000-0000000008c5', (select v::uuid from t where k = 'rw'), 'RESOLVE',
  'Se suspendió al trabajador una semana', 'MEDIDAS_APLICADAS')::text, 'RESUELTA', 'la denuncia se resuelve');
select ok((select resolved_at is not null and resolved_by = '00000000-0000-0000-0000-0000000008c5' from public.reports
  where id = (select v::uuid from t where k = 'rw')), 'queda quién y cuándo la resolvió');
select ok((select body = 'Revisamos tu denuncia y aplicamos medidas.' from public.notifications
  where user_id = '00000000-0000-0000-0000-0000000008c1' and dedupe_key = 'report:' || (select v from t where k = 'rw') and read_at is null),
  'el denunciante recibe un resultado genérico');
select throws_ok($$ update public.reports set status = 'ABIERTA' where id = (select v::uuid from t where k = 'rw') $$,
  '55000', null, 'una denuncia cerrada no se reabre (se crea una nueva)');
select ok((select count(*) >= 5 from public.report_events where report_id = (select v::uuid from t where k = 'rw')),
  'el historial de la denuncia es completo');

-- Disputa: la denuncia se cierra resolviendo la contratación
insert into t select 'k', public.fn_contract_propose('00000000-0000-0000-0000-0000000008c1', (select v::uuid from t where k = 'conv'),
  jsonb_build_object('description', 'Cambiar la tubería del baño', 'priceAmount', 40, 'priceUnit', 'OBRA',
    'scheduledStart', ((now() at time zone 'America/Guayaquil')::date + 2)::text))::text;
select lives_ok($$ select public.fn_contract_accept('00000000-0000-0000-0000-0000000008c2', (select v::uuid from t where k = 'k'), 1,
  (select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k'))) $$, 'contratación aceptada');
insert into t select 'rd', public.fn_contract_dispute('00000000-0000-0000-0000-0000000008c1', (select v::uuid from t where k = 'k'),
  'CONTRATO_INCUMPLIMIENTO', 'El trabajador no se presentó el día acordado')::text;
select throws_ok($$ select public.fn_admin_report_update('00000000-0000-0000-0000-0000000008c5', (select v::uuid from t where k = 'rd'),
  'DISCARD', 'Intento de cerrar sin resolver la disputa') $$, '55000', null,
  'la denuncia de una disputa no se cierra mientras la contratación siga en disputa');
select is(public.fn_admin_resolve_contract_dispute('00000000-0000-0000-0000-0000000008c5', (select v::uuid from t where k = 'k'),
  'CANCELADA', 'Se verificó que no se presentó')::text, 'CANCELADA', 'resolver la disputa cierra la contratación');
select is((select status::text from public.reports where id = (select v::uuid from t where k = 'rd')), 'RESUELTA',
  'y resuelve su denuncia');

-- Bandeja
select ok((select count(*) >= 1 from public.fn_admin_list_reports('00000000-0000-0000-0000-0000000008c4', 'TODAS')),
  'el moderador consulta la bandeja');
select throws_ok($$ select * from public.fn_admin_list_reports('00000000-0000-0000-0000-0000000008c3') $$, '42501', null,
  'un ciudadano no consulta la bandeja');
select ok((public.fn_admin_reports_summary('00000000-0000-0000-0000-0000000008c5') ->> 'porAtender')::int >= 1,
  'resumen de denuncias por atender');

select * from finish();
rollback;
