-- pgTAP: Fase 7 — calificaciones (RN-06, RN-07, RN-08, RN-20). Ejecutar: supabase test db
begin;
select plan(47);

-- -----------------------------------------------------------------------------
-- Seguridad
-- -----------------------------------------------------------------------------
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'reviews'), 'RLS activado en reviews');
select ok(not has_table_privilege('anon', 'public.reviews', 'SELECT'), 'anon no lee reseñas directamente');
select ok(not has_table_privilege('authenticated', 'public.reviews', 'SELECT'), 'authenticated no lee reseñas directamente');
select ok(not has_table_privilege('service_role', 'public.reviews', 'DELETE'), 'ni el servidor borra reseñas');
select is(private.word_count('  uno   dos' || E'\n' || 'tres '), 3, 'cuenta palabras separadas por cualquier espacio');

-- -----------------------------------------------------------------------------
-- Datos: cliente, trabajador (con cuenta y rol), otro trabajador, otro cliente, moderador
-- -----------------------------------------------------------------------------
insert into public.users (id, display_name) values
  ('00000000-0000-0000-0000-0000000007c1', 'Carla Mena'),
  ('00000000-0000-0000-0000-0000000007c2', 'Walter Trabajador'),
  ('00000000-0000-0000-0000-0000000007c3', 'Otro Trabajador'),
  ('00000000-0000-0000-0000-0000000007c4', 'Otra Clienta'),
  ('00000000-0000-0000-0000-0000000007c5', 'Moderadora GAD');
insert into public.user_identities (user_id, issuer, sub, provider) values
  ('00000000-0000-0000-0000-0000000007c5', 'https://login.microsoftonline.com/t/v2.0', 'oid-7c5', 'ENTRA');
insert into public.user_roles (user_id, role_code) values
  ('00000000-0000-0000-0000-0000000007c2', 'TRABAJADOR'),
  ('00000000-0000-0000-0000-0000000007c3', 'TRABAJADOR'),
  ('00000000-0000-0000-0000-0000000007c5', 'MODERADOR');
insert into public.client_profiles (user_id, full_name) values ('00000000-0000-0000-0000-0000000007c1', 'Carla Andrea Mena Ruiz');
insert into public.worker_profiles (id, user_id, first_names, last_names, public_display_name, status) values
  ('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007c2', 'Walter', 'Paz', 'Walter P.', 'HABILITADO'),
  ('00000000-0000-0000-0000-0000000007a2', '00000000-0000-0000-0000-0000000007c3', 'Otro', 'Trabajador', 'Otro T.', 'HABILITADO');

create temp table t (k text primary key, v text) on commit drop;
insert into t select 'conv', conversation_id::text from public.fn_start_conversation(
  '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007a1', 'Hola, necesito un gasfitero');
insert into t select 'conv_otro', conversation_id::text from public.fn_start_conversation(
  '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007a2', 'Hola');

create function pg_temp.terminos() returns jsonb language sql as $$
  select jsonb_build_object('description', 'Cambiar la tubería del baño',
    'scheduledStart', ((now() at time zone 'America/Guayaquil')::date + 2)::text, 'priceAmount', 45, 'priceUnit', 'OBRA');
$$;

-- Contratación k1: en curso (aún no finalizada)
insert into t select 'k1', public.fn_contract_propose('00000000-0000-0000-0000-0000000007c1',
  (select v::uuid from t where k = 'conv'), pg_temp.terminos())::text;
select lives_ok($$ select public.fn_contract_accept('00000000-0000-0000-0000-0000000007c2', (select v::uuid from t where k = 'k1'), 1,
  (select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k1'))) $$, 'contratación aceptada');
select lives_ok($$ select public.fn_contract_progress('00000000-0000-0000-0000-0000000007c2', (select v::uuid from t where k = 'k1'), 'START') $$,
  'trabajo iniciado');

-- -----------------------------------------------------------------------------
-- Solo con contratación finalizada (RN-06)
-- -----------------------------------------------------------------------------
select throws_ok($$ select public.fn_review_save('00000000-0000-0000-0000-0000000007c1', (select v::uuid from t where k = 'k1'), 5, 'Excelente') $$,
  '55000', null, 'no se califica una contratación que no está finalizada');
select throws_ok($$ insert into public.reviews (contract_id, direction, worker_id, client_user_id, author_user_id, rating, editable_until)
  values ((select v::uuid from t where k = 'k1'), 'CLIENTE_A_TRABAJADOR', '00000000-0000-0000-0000-0000000007a1',
          '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007c1', 5, now()) $$,
  '23514', null, 'la base rechaza la reseña sin contratación finalizada (trigger)');

select lives_ok($$ select public.fn_contract_progress('00000000-0000-0000-0000-0000000007c1', (select v::uuid from t where k = 'k1'), 'CONFIRM') $$,
  'el cliente confirma la finalización');
select is((select count(*)::int from public.notifications where type = 'REVIEW_REQUEST' and dedupe_key = 'review:' || (select v from t where k = 'k1')),
  2, 'al finalizar se invita a calificar a ambas partes');
select is((select review_pending from public.fn_list_contracts('00000000-0000-0000-0000-0000000007c1', 'HISTORIAL')), true,
  '«Mis contrataciones» marca la calificación pendiente');

select throws_ok($$ select public.fn_review_save('00000000-0000-0000-0000-0000000007c4', (select v::uuid from t where k = 'k1'), 1, 'Malo') $$,
  'P0002', null, 'un tercero no califica');
select throws_ok($$ select public.fn_review_save('00000000-0000-0000-0000-0000000007c1', (select v::uuid from t where k = 'k1'), 6, null) $$,
  '23514', null, 'la calificación va de 1 a 5');

-- RN-07: 200 palabras sí, 201 no (en la función y en la tabla)
select throws_ok(format($$ select public.fn_review_save('00000000-0000-0000-0000-0000000007c1', %L::uuid, 4, %L) $$,
  (select v from t where k = 'k1'), rtrim(repeat('palabra ', 201))), '23514', null, '201 palabras → rechazo en la función');
select lives_ok(format($$ select public.fn_review_save('00000000-0000-0000-0000-0000000007c1', %L::uuid, 4, %L) $$,
  (select v from t where k = 'k1'), rtrim(repeat('palabra ', 200))), '200 palabras → aceptado');
select throws_ok($$ update public.reviews set comment = rtrim(repeat('palabra ', 201))
  where contract_id = (select v::uuid from t where k = 'k1') $$, '23514', null, '201 palabras → rechazo en la tabla (CHECK)');

-- Una por parte; editar durante 7 días
select is((select count(*)::int from public.reviews where contract_id = (select v::uuid from t where k = 'k1')), 1,
  'el cliente tiene una sola reseña');
select lives_ok($$ select public.fn_review_save('00000000-0000-0000-0000-0000000007c1', (select v::uuid from t where k = 'k1'), 5,
  'Muy puntual y dejó todo limpio') $$, 'el autor edita dentro del plazo');
select ok((select rating = 5 and edited_at is not null and comment = 'Muy puntual y dejó todo limpio'
  from public.reviews where contract_id = (select v::uuid from t where k = 'k1')), 'la edición queda marcada');
select throws_ok($$ insert into public.reviews (contract_id, direction, worker_id, client_user_id, author_user_id, rating, editable_until)
  values ((select v::uuid from t where k = 'k1'), 'CLIENTE_A_TRABAJADOR', '00000000-0000-0000-0000-0000000007a1',
          '00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007c1', 1, now()) $$,
  '23505', null, 'doble reseña de la misma parte → rechazo');
select throws_ok($$ update public.reviews set author_user_id = '00000000-0000-0000-0000-0000000007c4'
  where contract_id = (select v::uuid from t where k = 'k1') $$, '42501', null, 'el autor no se reasigna');
select throws_ok($$ delete from public.reviews where contract_id = (select v::uuid from t where k = 'k1') $$,
  '42501', null, 'las reseñas no se eliminan');
select throws_ok($$ update public.reviews set editable_until = now() - interval '1 day'
  where contract_id = (select v::uuid from t where k = 'k1') $$, '42501', null, 'el plazo de edición no se altera');

-- Promedio desnormalizado
select ok((select rating_avg = 5 and rating_count = 1 from public.worker_profiles where id = '00000000-0000-0000-0000-0000000007a1'),
  'el perfil del trabajador refleja el promedio y el conteo');
select is((select count(*)::int from public.fn_public_worker_reviews('00000000-0000-0000-0000-0000000007a1')), 1,
  'la reseña aparece en el perfil público');
select is((select author_name from public.fn_public_worker_reviews('00000000-0000-0000-0000-0000000007a1')), 'Carla M.',
  'el autor se muestra como «Nombre A.»');

-- -----------------------------------------------------------------------------
-- RN-20: la reseña del trabajador al cliente
-- -----------------------------------------------------------------------------
select lives_ok($$ select public.fn_review_save('00000000-0000-0000-0000-0000000007c2', (select v::uuid from t where k = 'k1'), 2,
  'Cambió la fecha varias veces') $$, 'el trabajador califica al cliente');
select is((select count(*)::int from public.fn_public_worker_reviews('00000000-0000-0000-0000-0000000007a1')), 1,
  'la reseña al cliente nunca aparece en el perfil público');
select ok((public.fn_contract_reviews('00000000-0000-0000-0000-0000000007c1', (select v::uuid from t where k = 'k1')) -> 'theirs') = 'null'::jsonb,
  'el cliente no ve la calificación que recibió');
select is((public.fn_contract_reviews('00000000-0000-0000-0000-0000000007c2', (select v::uuid from t where k = 'k1')) -> 'theirs' ->> 'rating'), '5',
  'el trabajador sí ve la calificación que recibió (es pública)');
select is((public.fn_client_reputation('00000000-0000-0000-0000-0000000007c3', (select v::uuid from t where k = 'conv_otro')) ->> 'count'), '1',
  'otro trabajador ve la reputación del cliente en su conversación');
select throws_ok($$ select public.fn_client_reputation('00000000-0000-0000-0000-0000000007c1', (select v::uuid from t where k = 'conv')) $$,
  'P0002', null, 'el cliente no consulta su propia reputación');
select throws_ok($$ select public.fn_client_reputation('00000000-0000-0000-0000-0000000007c3', (select v::uuid from t where k = 'conv')) $$,
  'P0002', null, 'un trabajador ajeno a la conversación no la consulta');
update public.user_roles set revoked_at = now() where user_id = '00000000-0000-0000-0000-0000000007c3' and role_code = 'TRABAJADOR';
select throws_ok($$ select public.fn_client_reputation('00000000-0000-0000-0000-0000000007c3', (select v::uuid from t where k = 'conv_otro')) $$,
  '42501', null, 'sin rol TRABAJADOR activo no se ve');
update public.user_roles set revoked_at = null where user_id = '00000000-0000-0000-0000-0000000007c3' and role_code = 'TRABAJADOR';
select throws_ok($$ select public.fn_report_review('00000000-0000-0000-0000-0000000007c4',
  (select id from public.reviews where direction = 'TRABAJADOR_A_CLIENTE' and contract_id = (select v::uuid from t where k = 'k1')),
  'RESENA_OFENSIVA') $$, 'P0002', null, 'un cliente no puede ni denunciar (ni ver) la reseña a un cliente');

-- -----------------------------------------------------------------------------
-- Denuncia y moderación
-- -----------------------------------------------------------------------------
select throws_ok($$ select public.fn_report_review('00000000-0000-0000-0000-0000000007c1',
  (select id from public.reviews where direction = 'CLIENTE_A_TRABAJADOR' and contract_id = (select v::uuid from t where k = 'k1')),
  'RESENA_OFENSIVA') $$, '23514', null, 'no se denuncia la propia reseña');
select lives_ok($$ select public.fn_report_review('00000000-0000-0000-0000-0000000007c2',
  (select id from public.reviews where direction = 'CLIENTE_A_TRABAJADOR' and contract_id = (select v::uuid from t where k = 'k1')),
  'RESENA_FALSA', 'No hice ese trabajo') $$, 'el trabajador denuncia la reseña que recibió');
select throws_ok($$ select public.fn_report_review('00000000-0000-0000-0000-0000000007c2',
  (select id from public.reviews where direction = 'CLIENTE_A_TRABAJADOR' and contract_id = (select v::uuid from t where k = 'k1')),
  'RESENA_FALSA') $$, '23505', null, 'no se duplica una denuncia abierta (RN-16)');
select is((select open_reports from public.fn_admin_list_reviews('00000000-0000-0000-0000-0000000007c5', 'DENUNCIADAS')), 1::bigint,
  'el moderador ve la reseña denunciada');
select throws_ok($$ select * from public.fn_admin_list_reviews('00000000-0000-0000-0000-0000000007c3', 'TODAS') $$,
  '42501', null, 'moderar exige moderation.act');
select is(public.fn_admin_set_review_hidden('00000000-0000-0000-0000-0000000007c5',
  (select id from public.reviews where direction = 'CLIENTE_A_TRABAJADOR' and contract_id = (select v::uuid from t where k = 'k1')),
  true, 'Denuncia verificada con las partes')::text, 'OCULTA', 'el moderador oculta la reseña');
select ok((select rating_avg = 0 and rating_count = 0 from public.worker_profiles where id = '00000000-0000-0000-0000-0000000007a1'),
  'al ocultar se recalcula el promedio');
select throws_ok($$ select public.fn_review_save('00000000-0000-0000-0000-0000000007c1', (select v::uuid from t where k = 'k1'), 5, 'Otra vez') $$,
  '55000', null, 'el autor no edita una reseña oculta');
select is(public.fn_admin_set_review_hidden('00000000-0000-0000-0000-0000000007c5',
  (select id from public.reviews where direction = 'CLIENTE_A_TRABAJADOR' and contract_id = (select v::uuid from t where k = 'k1')),
  false, 'Revisión posterior: la reseña es legítima')::text, 'PUBLICADA', 'y la restaura');
select ok((select rating_avg = 5 and rating_count = 1 from public.worker_profiles where id = '00000000-0000-0000-0000-0000000007a1'),
  'al restaurar vuelve el promedio');
select is((select count(*)::int from public.audit_log where action in ('REVIEW_HIDDEN', 'REVIEW_RESTORED')
  and resource_id = (select id::text from public.reviews where direction = 'CLIENTE_A_TRABAJADOR'
                     and contract_id = (select v::uuid from t where k = 'k1'))), 2, 'ocultar y restaurar quedan auditados');

select * from finish();
rollback;
