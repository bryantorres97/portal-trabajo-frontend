-- pgTAP: Fase 6 — contrataciones (versiones inmutables, aceptación bilateral con hash, estados,
-- plazos, disputa y control de acceso). Ejecutar: supabase test db
begin;
select plan(73);

-- -----------------------------------------------------------------------------
-- Seguridad: RLS y privilegios
-- -----------------------------------------------------------------------------
select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('contracts', 'contract_terms', 'contract_events', 'app_settings')),
  'RLS activado en las tablas de contratación');
select ok(not has_table_privilege('authenticated', 'public.contracts', 'SELECT'), 'authenticated no lee contrataciones');
select ok(not has_table_privilege('anon', 'public.contract_terms', 'SELECT'), 'anon no lee condiciones');
select ok(not has_table_privilege('service_role', 'public.contract_terms', 'DELETE'), 'ni el servidor borra condiciones');
select ok(not has_function_privilege('authenticated',
  'public.fn_contract_accept(uuid, uuid, integer, text, inet, text, text)', 'EXECUTE'),
  'authenticated no acepta condiciones directamente');

-- -----------------------------------------------------------------------------
-- Datos: cliente, trabajador habilitado con cuenta, trabajador sin cuenta, tercero, personal
-- -----------------------------------------------------------------------------
insert into public.users (id, display_name) values
  ('00000000-0000-0000-0000-0000000006c1', 'Carla Mena'),
  ('00000000-0000-0000-0000-0000000006c2', 'Walter Trabajador'),
  ('00000000-0000-0000-0000-0000000006c3', 'Tercero Curioso'),
  ('00000000-0000-0000-0000-0000000006c4', 'Funcionaria GAD');
insert into public.user_identities (user_id, issuer, sub, provider) values
  ('00000000-0000-0000-0000-0000000006c4', 'https://login.microsoftonline.com/t/v2.0', 'oid-6c4', 'ENTRA');
insert into public.user_roles (user_id, role_code) values ('00000000-0000-0000-0000-0000000006c4', 'RESP_DENUNCIAS');
insert into public.client_profiles (user_id, full_name) values ('00000000-0000-0000-0000-0000000006c1', 'Carla Andrea Mena Ruiz');
insert into public.worker_profiles (id, user_id, first_names, last_names, public_display_name, status) values
  ('00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-0000000006c2', 'Walter', 'Paz', 'Walter P.', 'HABILITADO'),
  ('00000000-0000-0000-0000-0000000006a2', null, 'Nora', 'Vaca', 'Nora V.', 'HABILITADO');
insert into public.worker_services (worker_id, service_id, is_primary)
  select '00000000-0000-0000-0000-0000000006a1', id, true from public.services order by sort_order, name limit 1;

create temp table t (k text primary key, v text) on commit drop;
insert into t values ('servicio', (select service_id::text from public.worker_services
  where worker_id = '00000000-0000-0000-0000-0000000006a1'));
insert into t values ('otro_servicio', (select id::text from public.services
  where id <> (select v::uuid from t where k = 'servicio') limit 1));
insert into t select 'conv', conversation_id::text from public.fn_start_conversation(
  '00000000-0000-0000-0000-0000000006c1', '00000000-0000-0000-0000-0000000006a1', 'Hola, necesito un gasfitero');
insert into t select 'conv_sin_cuenta', conversation_id::text from public.fn_start_conversation(
  '00000000-0000-0000-0000-0000000006c1', '00000000-0000-0000-0000-0000000006a2', 'Hola, ¿tiene disponibilidad?');

-- Condiciones de ejemplo (fecha futura en la zona de Ecuador).
create function pg_temp.terminos(p_precio numeric default 45, p_inicio integer default 3, p_servicio text default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'description', 'Cambiar la tubería del baño y revisar las llaves de paso',
    'serviceId', coalesce(p_servicio, (select v from t where k = 'servicio')),
    'scheduledStart', ((now() at time zone 'America/Guayaquil')::date + p_inicio)::text,
    'parishCode', 'atocha-ficoa',
    'locationDetail', 'Calle Bolívar y Montalvo, casa esquinera',
    'priceAmount', p_precio,
    'priceUnit', 'OBRA');
$$;

-- -----------------------------------------------------------------------------
-- Propuesta
-- -----------------------------------------------------------------------------
select throws_ok($$ select public.fn_contract_propose('00000000-0000-0000-0000-0000000006c3',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos()) $$, 'P0002', null, 'un tercero no propone en una conversación ajena');
select throws_ok($$ select public.fn_contract_propose('00000000-0000-0000-0000-0000000006c1',
  (select v::uuid from t where k = 'conv_sin_cuenta'), pg_temp.terminos()) $$, '23514', null,
  'no se propone a un trabajador que aún no activa su cuenta');
select throws_ok($$ select public.fn_contract_propose('00000000-0000-0000-0000-0000000006c1',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos(45, -5)) $$, '23514', null, 'la fecha de inicio no puede ser pasada');
select throws_ok($$ select public.fn_contract_propose('00000000-0000-0000-0000-0000000006c1',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos(45, 3, (select v from t where k = 'otro_servicio'))) $$,
  '23514', null, 'el servicio debe ser uno de los que ofrece el trabajador');
select throws_ok($$ select public.fn_contract_propose('00000000-0000-0000-0000-0000000006c1',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos(0)) $$, '23514', null, 'el precio debe ser positivo');

insert into t select 'k1', public.fn_contract_propose('00000000-0000-0000-0000-0000000006c1',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos())::text;

select is((select status::text from public.contracts where id = (select v::uuid from t where k = 'k1')), 'PROPUESTA_ENVIADA',
  'el cliente envía la propuesta');
select ok((select client_accepted_at is not null and worker_accepted_at is null from public.contract_terms
  where contract_id = (select v::uuid from t where k = 'k1') and version = 1),
  'enviar la versión cuenta como aceptación de quien la envía, no de la otra parte');
select is((select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k1') and version = 1),
  (select private.contract_terms_hash(x) from public.contract_terms x where contract_id = (select v::uuid from t where k = 'k1') and version = 1),
  'el hash SHA-256 lo calcula la base y es verificable');
select throws_ok($$ select public.fn_contract_propose('00000000-0000-0000-0000-0000000006c2',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos()) $$, '55000', null,
  'una sola propuesta abierta por conversación');
select is((select count(*)::int from public.messages where conversation_id = (select v::uuid from t where k = 'conv')
  and kind = 'SYSTEM' and contract_id = (select v::uuid from t where k = 'k1')), 1, 'la propuesta aparece como tarjeta en el chat');
select is((select contract_id::text from public.fn_list_messages('00000000-0000-0000-0000-0000000006c2',
  (select v::uuid from t where k = 'conv')) where kind = 'SYSTEM' limit 1), (select v from t where k = 'k1'),
  'el historial del chat enlaza la tarjeta con la contratación');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000006c2'
  and type = 'CONTRACT_UPDATE' and read_at is null), 1, 'el trabajador recibe una notificación');
select is((select needs_my_action from public.fn_list_contracts('00000000-0000-0000-0000-0000000006c2')), true,
  'la propuesta espera respuesta del trabajador');
select is((select needs_my_action from public.fn_list_contracts('00000000-0000-0000-0000-0000000006c1')), false,
  'el cliente ya respondió (propuso)');
select is((select counterpart_name from public.fn_list_contracts('00000000-0000-0000-0000-0000000006c2')), 'Carla M.',
  'el trabajador ve al cliente como «Nombre A.»');

-- Solo las partes acceden
select throws_ok($$ select public.fn_get_contract('00000000-0000-0000-0000-0000000006c3', (select v::uuid from t where k = 'k1')) $$,
  'P0002', null, 'un tercero no ve la contratación');
select throws_ok($$ select public.fn_contract_accept('00000000-0000-0000-0000-0000000006c3', (select v::uuid from t where k = 'k1'),
  1, (select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k1') and version = 1)) $$,
  'P0002', null, 'un tercero no acepta');
select throws_ok($$ select public.fn_get_contract('00000000-0000-0000-0000-0000000006c4', (select v::uuid from t where k = 'k1')) $$,
  '42501', null, 'el personal del GAD no ve contrataciones sin una disputa');
select is((select count(*)::int from public.fn_list_contracts('00000000-0000-0000-0000-0000000006c3')), 0,
  'el tercero no tiene contrataciones');
select throws_ok($$ select public.fn_contract_accept('00000000-0000-0000-0000-0000000006c1', (select v::uuid from t where k = 'k1'),
  1, (select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k1') and version = 1)) $$,
  '55000', null, 'quien propuso no vuelve a aceptar su propia versión');

-- -----------------------------------------------------------------------------
-- Contrapropuesta y aceptación de la misma versión
-- -----------------------------------------------------------------------------
select is(public.fn_contract_counter('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k1'), 1,
  pg_temp.terminos(60)), 2, 'el trabajador contrapropone (versión 2)');
select throws_ok($$ select public.fn_contract_accept('00000000-0000-0000-0000-0000000006c1', (select v::uuid from t where k = 'k1'),
  1, (select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k1') and version = 1)) $$,
  '55000', null, 'aceptar una versión obsoleta → conflicto (409)');
select throws_ok($$ select public.fn_contract_accept('00000000-0000-0000-0000-0000000006c1', (select v::uuid from t where k = 'k1'),
  2, repeat('a', 64)) $$, '55000', null, 'aceptar con un hash distinto → conflicto (409)');
select throws_ok($$ select public.fn_contract_counter('00000000-0000-0000-0000-0000000006c1', (select v::uuid from t where k = 'k1'),
  1, pg_temp.terminos(50)) $$, '55000', null, 'contraproponer sobre una versión obsoleta → conflicto (409)');
select is(public.fn_contract_accept('00000000-0000-0000-0000-0000000006c1', (select v::uuid from t where k = 'k1'), 2,
  (select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k1') and version = 2))::text,
  'CONTRATADA', 'el cliente acepta la versión 2: contratación confirmada');
select ok((select c.agreed_terms_id = x.id and x.client_accepted_at is not null and x.worker_accepted_at is not null
  from public.contracts c join public.contract_terms x on x.contract_id = c.id and x.version = 2
  where c.id = (select v::uuid from t where k = 'k1')), 'la versión acordada tiene la aceptación de ambas partes (RN-04)');
select ok((select not (metadata::text ilike '%tubería%') from public.audit_log where action = 'CONTRACT_ACCEPTED'
  and resource_id = (select v from t where k = 'k1')), 'la aceptación se audita con el hash, sin el contenido');

-- -----------------------------------------------------------------------------
-- Inmutabilidad y reglas en la base
-- -----------------------------------------------------------------------------
select throws_ok($$ update public.contract_terms set price_amount = 1 where contract_id = (select v::uuid from t where k = 'k1') $$,
  '42501', null, 'los términos no se pueden modificar (trigger)');
select throws_ok($$ update public.contract_terms set client_accepted_at = now() - interval '1 day'
  where contract_id = (select v::uuid from t where k = 'k1') and version = 2 $$, '42501', null, 'una aceptación no se reescribe');
select throws_ok($$ delete from public.contract_terms where contract_id = (select v::uuid from t where k = 'k1') $$,
  '42501', null, 'las versiones no se eliminan');
select throws_ok($$ update public.contract_events set event = 'X' where contract_id = (select v::uuid from t where k = 'k1') $$,
  '42501', null, 'el historial es append-only');
select throws_ok($$ update public.contracts set status = 'FINALIZADA' where id = (select v::uuid from t where k = 'k1') $$,
  '55000', null, 'la base rechaza transiciones no permitidas');
select throws_ok($$ update public.contracts set agreed_terms_id = (select id from public.contract_terms
  where contract_id = (select v::uuid from t where k = 'k1') and version = 1) where id = (select v::uuid from t where k = 'k1') $$,
  '23514', null, 'no se acuerda una versión sin la aceptación de ambas partes');

-- -----------------------------------------------------------------------------
-- Modificación tras contratar: lo acordado sigue vigente hasta aceptar la nueva versión
-- -----------------------------------------------------------------------------
select is(public.fn_contract_counter('00000000-0000-0000-0000-0000000006c1', (select v::uuid from t where k = 'k1'), 2,
  pg_temp.terminos(70, 4)), 3, 'el cliente propone una modificación (versión 3)');
select ok((select status = 'CONTRATADA' and agreed_terms_id <> current_terms_id from public.contracts
  where id = (select v::uuid from t where k = 'k1')), 'la versión 2 sigue acordada mientras la 3 está pendiente');
select is(public.fn_contract_decline('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k1'), 3, 'REJECT',
  'Prefiero mantener lo acordado')::text, 'CONTRATADA', 'el trabajador rechaza la modificación');
select ok((select current_terms_id = agreed_terms_id from public.contracts where id = (select v::uuid from t where k = 'k1')),
  'tras el rechazo, lo vigente vuelve a ser lo acordado');

-- -----------------------------------------------------------------------------
-- Ejecución, disputa y confirmación automática
-- -----------------------------------------------------------------------------
select throws_ok($$ select public.fn_contract_progress('00000000-0000-0000-0000-0000000006c1', (select v::uuid from t where k = 'k1'), 'START') $$,
  '55000', null, 'solo el trabajador marca el inicio');
select is(public.fn_contract_progress('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k1'), 'START')::text,
  'EN_CURSO', 'el trabajador marca el inicio');
select is(public.fn_contract_progress('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k1'), 'COMPLETE')::text,
  'FINALIZACION_PENDIENTE', 'el trabajador marca el fin; falta la confirmación del cliente');
select throws_ok($$ select public.fn_contract_dispute('00000000-0000-0000-0000-0000000006c1', (select v::uuid from t where k = 'k1'),
  'CONTRATO_CALIDAD', 'Corto') $$, '23514', null, 'la disputa exige una descripción');
select lives_ok($$ select public.fn_contract_dispute('00000000-0000-0000-0000-0000000006c1', (select v::uuid from t where k = 'k1'),
  'CONTRATO_CALIDAD', 'La llave de paso sigue goteando después del trabajo') $$, 'el cliente abre una disputa');
select ok((select c.status = 'EN_DISPUTA' and c.confirm_due_at is null and r.target_type = 'CONTRACT' and r.status = 'ABIERTA'
  from public.contracts c join public.reports r on r.id = c.dispute_report_id where c.id = (select v::uuid from t where k = 'k1')),
  'la disputa pausa la confirmación automática y crea una denuncia para el GAD');
select throws_ok($$ select public.fn_contract_withdraw_dispute('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k1')) $$,
  '55000', null, 'solo quien abrió la disputa la retira');
select is(public.fn_contract_withdraw_dispute('00000000-0000-0000-0000-0000000006c1', (select v::uuid from t where k = 'k1'))::text,
  'FINALIZACION_PENDIENTE', 'al retirar la disputa vuelve al estado anterior');
update public.contracts set confirm_due_at = now() - interval '1 minute' where id = (select v::uuid from t where k = 'k1');
select ok(public.fn_run_contract_maintenance() >= 1, 'la tarea programada procesa los plazos vencidos');
select ok((select status = 'FINALIZADA' and auto_confirmed from public.contracts where id = (select v::uuid from t where k = 'k1')),
  'sin confirmación del cliente, la finalización se confirma sola');
select is((select contracts_completed from public.worker_profiles where id = '00000000-0000-0000-0000-0000000006a1'), 1,
  'se cuenta la contratación finalizada en el perfil del trabajador');
select is((select array_agg(event order by id) from public.contract_events where contract_id = (select v::uuid from t where k = 'k1')),
  array['PROPUESTA', 'CONTRAPROPUESTA', 'ACEPTADA', 'MODIFICACION_PROPUESTA', 'MODIFICACION_RECHAZADA', 'INICIADA',
        'FINALIZACION_SOLICITADA', 'DISPUTA_ABIERTA', 'DISPUTA_RETIRADA', 'FINALIZADA_AUTOMATICAMENTE'],
  'el historial completo es reconstruible');
select is((select count(*)::int from public.fn_list_contracts('00000000-0000-0000-0000-0000000006c1', 'HISTORIAL')), 1,
  '«Mis contrataciones» la muestra en el historial');

-- -----------------------------------------------------------------------------
-- Expiración, rechazo, retiro y cancelación
-- -----------------------------------------------------------------------------
insert into t select 'k2', public.fn_contract_propose('00000000-0000-0000-0000-0000000006c1',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos(30))::text;
update public.contracts set expires_at = now() - interval '1 minute' where id = (select v::uuid from t where k = 'k2');
select throws_ok($$ select public.fn_contract_accept('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k2'),
  1, (select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k2') and version = 1)) $$,
  '55000', null, 'una propuesta vencida no se puede aceptar');
select is(public.fn_get_contract('00000000-0000-0000-0000-0000000006c1', (select v::uuid from t where k = 'k2')) ->> 'status',
  'EXPIRADA', 'al consultarla, la propuesta vencida queda EXPIRADA');
select is((select count(*)::int from public.contract_events where contract_id = (select v::uuid from t where k = 'k2')
  and event = 'EXPIRADA' and actor_id is null), 1, 'la expiración queda en el historial como acción del sistema');

insert into t select 'k3', public.fn_contract_propose('00000000-0000-0000-0000-0000000006c1',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos(30))::text;
select is(public.fn_contract_decline('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k3'), 1, 'REJECT')::text,
  'RECHAZADA', 'el trabajador rechaza la propuesta');

insert into t select 'k4', public.fn_contract_propose('00000000-0000-0000-0000-0000000006c2',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos(30))::text;
select throws_ok($$ select public.fn_contract_decline('00000000-0000-0000-0000-0000000006c1', (select v::uuid from t where k = 'k4'), 1, 'WITHDRAW') $$,
  '55000', null, 'solo quien propuso puede retirar la propuesta');
select is(public.fn_contract_decline('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k4'), 1, 'WITHDRAW')::text,
  'CANCELADA', 'el trabajador retira su propuesta');

insert into t select 'k5', public.fn_contract_propose('00000000-0000-0000-0000-0000000006c1',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos(30))::text;
select lives_ok($$ select public.fn_contract_accept('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k5'),
  1, (select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k5') and version = 1)) $$,
  'el trabajador acepta la versión 1');
select throws_ok($$ select public.fn_contract_cancel('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k5'), 'No') $$,
  '23514', null, 'cancelar exige un motivo');
select is(public.fn_contract_cancel('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k5'),
  'Tuve una emergencia familiar y no podré asistir')::text, 'CANCELADA', 'se cancela antes de iniciar, con motivo');

-- RN-13 y RN-14
select lives_ok($$ select public.fn_set_conversation_block('00000000-0000-0000-0000-0000000006c2',
  (select v::uuid from t where k = 'conv'), true) $$, 'el trabajador bloquea la conversación');
select throws_ok($$ select public.fn_contract_propose('00000000-0000-0000-0000-0000000006c1',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos()) $$, '42501', null, 'no se propone en una conversación bloqueada');
select lives_ok($$ select public.fn_set_conversation_block('00000000-0000-0000-0000-0000000006c2',
  (select v::uuid from t where k = 'conv'), false) $$, 'se desbloquea');
insert into t select 'k6', public.fn_contract_propose('00000000-0000-0000-0000-0000000006c1',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos(30))::text;
update public.worker_profiles set status = 'SUSPENDIDO' where id = '00000000-0000-0000-0000-0000000006a1';
select throws_ok($$ select public.fn_contract_accept('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k6'),
  1, (select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k6') and version = 1)) $$,
  '23514', null, 'un trabajador suspendido no acepta contrataciones nuevas (RN-14)');
update public.worker_profiles set status = 'HABILITADO' where id = '00000000-0000-0000-0000-0000000006a1';

-- -----------------------------------------------------------------------------
-- Resolución de una disputa por el GAD
-- -----------------------------------------------------------------------------
select lives_ok($$ select public.fn_contract_accept('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k6'),
  1, (select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k6') and version = 1)) $$,
  'rehabilitado, el trabajador acepta');
select lives_ok($$ select public.fn_contract_dispute('00000000-0000-0000-0000-0000000006c2', (select v::uuid from t where k = 'k6'),
  'CONTRATO_COBRO', 'El cliente pide un descuento que no estaba acordado') $$, 'el trabajador abre una disputa');
select throws_ok($$ select public.fn_admin_resolve_contract_dispute('00000000-0000-0000-0000-0000000006c3',
  (select v::uuid from t where k = 'k6'), 'CANCELADA', 'Sin permiso para resolver') $$, '42501', null,
  'resolver disputas exige report.manage');
select is(public.fn_admin_resolve_contract_dispute('00000000-0000-0000-0000-0000000006c4', (select v::uuid from t where k = 'k6'),
  'CANCELADA', 'Las partes acordaron por teléfono no continuar')::text, 'CANCELADA', 'el GAD resuelve la disputa');
select is((select r.status::text from public.contracts c join public.reports r on r.id = c.dispute_report_id
  where c.id = (select v::uuid from t where k = 'k6')), 'RESUELTA', 'la denuncia asociada queda resuelta');

select * from finish();
rollback;
