-- pgTAP: Fase 9 — indicadores exactos, reportes, auditoría, preguntas frecuentes y documentos legales.
-- Ejecutar: supabase test db
begin;
select plan(37);

-- -----------------------------------------------------------------------------
-- Personal: supervisor, moderador y administrador del sistema
-- -----------------------------------------------------------------------------
insert into public.users (id, display_name, email) values
  ('00000000-0000-0000-0000-0000000009c1', 'Supervisora GAD', 'supervisora@gad.test'),
  ('00000000-0000-0000-0000-0000000009c2', 'Moderador GAD', 'moderador@gad.test'),
  ('00000000-0000-0000-0000-0000000009c3', 'Admin Sistema', 'admin@gad.test'),
  ('00000000-0000-0000-0000-0000000009c4', 'Carla Mena', null),
  ('00000000-0000-0000-0000-0000000009c5', 'Walter Trabajador', null);
insert into public.user_identities (user_id, issuer, sub, provider) values
  ('00000000-0000-0000-0000-0000000009c1', 'https://login.microsoftonline.com/t/v2.0', 'oid-9c1', 'ENTRA'),
  ('00000000-0000-0000-0000-0000000009c2', 'https://login.microsoftonline.com/t/v2.0', 'oid-9c2', 'ENTRA'),
  ('00000000-0000-0000-0000-0000000009c3', 'https://login.microsoftonline.com/t/v2.0', 'oid-9c3', 'ENTRA');
insert into public.user_roles (user_id, role_code) values
  ('00000000-0000-0000-0000-0000000009c1', 'SUPERVISOR'),
  ('00000000-0000-0000-0000-0000000009c2', 'MODERADOR'),
  ('00000000-0000-0000-0000-0000000009c3', 'ADMIN_SISTEMA');

select ok(exists (select 1 from public.role_permissions where role_code = 'ADMIN_SISTEMA' and permission_code = 'content.manage'),
  'el administrador del sistema gestiona el contenido');

-- -----------------------------------------------------------------------------
-- Exactitud de las métricas: datos controlados en enero de 2020 (periodo sin otros datos)
-- -----------------------------------------------------------------------------
insert into public.worker_profiles (id, user_id, first_names, last_names, public_display_name, status, created_at) values
  ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009c5', 'Walter', 'Paz', 'Walter P.', 'HABILITADO', '2020-01-10 15:00+00'),
  ('00000000-0000-0000-0000-0000000009a2', null, 'Nora', 'Vaca', 'Nora V.', 'CAPACITACION_EN_PROCESO', '2020-01-12 15:00+00'),
  ('00000000-0000-0000-0000-0000000009a3', null, 'Luis', 'Mora', 'Luis M.', 'REGISTRADO', '2020-01-20 15:00+00');
insert into public.worker_status_history (worker_id, from_status, to_status, created_at) values
  ('00000000-0000-0000-0000-0000000009a1', 'CAPACITACION_APROBADA', 'HABILITADO', '2020-01-15 15:00+00');
-- Día límite en Ecuador: 2020-02-01 03:00 UTC es 31 de enero a las 22:00 en Ambato → dentro del periodo.
insert into public.worker_profiles (first_names, last_names, public_display_name, status, created_at)
values ('Borde', 'Mes', 'Borde M.', 'REGISTRADO', '2020-02-01 03:00+00');

insert into public.reports (id, reporter_id, target_type, target_id, reason_code, description, created_at) values
  ('00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-0000000009c4', 'WORKER', '00000000-0000-0000-0000-0000000009a1',
   'TRABAJADOR_OTRO', 'Prueba de métricas', '2020-01-10 12:00+00'),
  ('00000000-0000-0000-0000-0000000009d2', '00000000-0000-0000-0000-0000000009c4', 'WORKER', '00000000-0000-0000-0000-0000000009a2',
   'TRABAJADOR_OTRO', 'Prueba de métricas', '2020-01-11 12:00+00');
update public.reports set status = 'RESUELTA', resolution = 'SIN_INCUMPLIMIENTO', resolved_at = '2020-01-11 12:00+00',
  due_at = '2020-01-12 12:00+00' where id = '00000000-0000-0000-0000-0000000009d1';

create temp table m as select public.fn_admin_metrics('00000000-0000-0000-0000-0000000009c1', '2020-01-01', '2020-01-31') as j;
select is((select (j -> 'workers' ->> 'registered')::int from m), 4, 'trabajadores registrados en el periodo (incluye el último día en hora de Ecuador)');
select is((select (j -> 'workers' ->> 'enabled')::int from m), 1, 'trabajadores habilitados en el periodo');
select is((select (j -> 'reports' ->> 'created')::int from m), 2, 'denuncias creadas en el periodo');
select is((select (j -> 'reports' ->> 'resolved')::int from m), 1, 'denuncias resueltas en el periodo');
select is((select (j -> 'reports' ->> 'avgResolutionHours')::numeric from m), 24.0, 'tiempo medio de resolución en horas');
select is((select (j -> 'reports' ->> 'withinDeadlinePct')::numeric from m), 100.0, 'resueltas dentro del plazo');
select is((select (j -> 'reports' -> 'byTargetType' ->> 'WORKER')::int from m), 2, 'denuncias por tipo');
select is((select (j -> 'contracts' ->> 'proposed')::int from m), 0, 'sin contrataciones en el periodo');
select is((select (public.fn_admin_metrics('00000000-0000-0000-0000-0000000009c1', '2020-02-01', '2020-02-29') -> 'workers' ->> 'registered')::int), 0,
  'el día siguiente en Ecuador pertenece a otro periodo');

-- Contrataciones de hoy: se miden por diferencia (la base puede tener otros datos del día)
create temp table antes as select public.fn_admin_metrics('00000000-0000-0000-0000-0000000009c1',
  (now() at time zone 'America/Guayaquil')::date, (now() at time zone 'America/Guayaquil')::date) as j;
insert into public.worker_services (worker_id, service_id, is_primary)
  select '00000000-0000-0000-0000-0000000009a1', id, true from public.services order by sort_order limit 1;
create temp table t (k text primary key, v text) on commit drop;
insert into t select 'conv', conversation_id::text from public.fn_start_conversation('00000000-0000-0000-0000-0000000009c4',
  '00000000-0000-0000-0000-0000000009a1', 'Hola');
insert into t select 'k', public.fn_contract_propose('00000000-0000-0000-0000-0000000009c4', (select v::uuid from t where k = 'conv'),
  jsonb_build_object('description', 'Cambiar la tubería del baño', 'priceAmount', 40, 'priceUnit', 'OBRA',
    'scheduledStart', ((now() at time zone 'America/Guayaquil')::date + 2)::text))::text;
select lives_ok($$ select public.fn_contract_accept('00000000-0000-0000-0000-0000000009c5', (select v::uuid from t where k = 'k'), 1,
  (select content_hash from public.contract_terms where contract_id = (select v::uuid from t where k = 'k'))) $$, 'contratación aceptada');
create temp table despues as select public.fn_admin_metrics('00000000-0000-0000-0000-0000000009c1',
  (now() at time zone 'America/Guayaquil')::date, (now() at time zone 'America/Guayaquil')::date) as j;
select is((select (d.j -> 'contracts' ->> 'proposed')::int - (a.j -> 'contracts' ->> 'proposed')::int from antes a, despues d), 1,
  'propuestas del día');
select is((select (d.j -> 'contracts' ->> 'agreed')::int - (a.j -> 'contracts' ->> 'agreed')::int from antes a, despues d), 1,
  'contrataciones acordadas del día');
select is((select (d.j -> 'chat' ->> 'conversationsNew')::int - (a.j -> 'chat' ->> 'conversationsNew')::int from antes a, despues d), 1,
  'conversaciones nuevas del día');
select is((select count(*)::int from public.fn_admin_weekly_activity('00000000-0000-0000-0000-0000000009c1', 12)), 12,
  'actividad de las últimas 12 semanas');

-- -----------------------------------------------------------------------------
-- Permisos por rol
-- -----------------------------------------------------------------------------
select throws_ok($$ select public.fn_admin_metrics('00000000-0000-0000-0000-0000000009c2', '2020-01-01', '2020-01-31') $$,
  '42501', null, 'un moderador no ve indicadores');
select throws_ok($$ select * from public.fn_admin_audit_search('00000000-0000-0000-0000-0000000009c2', '2020-01-01', '2020-01-31') $$,
  '42501', null, 'un moderador no ve la auditoría');
select throws_ok($$ select public.fn_admin_metrics('00000000-0000-0000-0000-0000000009c1', '2020-02-01', '2020-01-01') $$,
  '23514', null, 'rango de fechas inválido');
select throws_ok($$ select public.fn_admin_metrics('00000000-0000-0000-0000-0000000009c1', '2020-01-01', '2023-01-01') $$,
  '23514', null, 'el rango admite hasta dos años');

-- -----------------------------------------------------------------------------
-- Reportes
-- -----------------------------------------------------------------------------
select is((select count(*)::int from public.fn_admin_report_workers('00000000-0000-0000-0000-0000000009c1', '2020-01-01', '2020-01-31')), 4,
  'reporte de trabajadores del periodo');
select is((select count(*)::int from public.fn_admin_report_workers('00000000-0000-0000-0000-0000000009c1', '2020-01-01', '2020-01-31', 'HABILITADO')), 1,
  'filtrado por estado');
select ok((select total = 4 from public.fn_admin_report_workers('00000000-0000-0000-0000-0000000009c1', '2020-01-01', '2020-01-31', null, 2) limit 1),
  'la paginación informa el total');
select is((select hours_to_resolve from public.fn_admin_report_reports('00000000-0000-0000-0000-0000000009c1', '2020-01-01', '2020-01-31')
  where report_id = '00000000-0000-0000-0000-0000000009d1'), 24.0, 'reporte de denuncias con horas de resolución');
select ok(exists (select 1 from public.fn_admin_report_contracts('00000000-0000-0000-0000-0000000009c1',
  (now() at time zone 'America/Guayaquil')::date, (now() at time zone 'America/Guayaquil')::date) where contract_id = (select v::uuid from t where k = 'k')),
  'reporte de contrataciones');

-- -----------------------------------------------------------------------------
-- Preguntas frecuentes
-- -----------------------------------------------------------------------------
select ok((select count(*) >= 6 from public.fn_public_faq()), 'preguntas frecuentes publicadas de ejemplo');
select throws_ok($$ select public.fn_admin_save_faq('00000000-0000-0000-0000-0000000009c1', null, 'GENERAL', '¿Pregunta?',
  'Respuesta de prueba', 1, true) $$, '42501', null, 'el supervisor no edita contenido');
insert into t select 'faq', public.fn_admin_save_faq('00000000-0000-0000-0000-0000000009c3', null, 'CLIENTES',
  '¿Pregunta en borrador?', 'Todavía no se publica', 50, false)::text;
select ok(not exists (select 1 from public.fn_public_faq() where id = (select v::uuid from t where k = 'faq')),
  'una pregunta sin publicar no aparece en el portal');
select is((select count(*)::int from public.fn_admin_audit_search('00000000-0000-0000-0000-0000000009c1',
  (now() at time zone 'America/Guayaquil')::date, (now() at time zone 'America/Guayaquil')::date, 'FAQ_', null, 'Admin')), 1,
  'el visor de auditoría filtra por acción y actor');

-- -----------------------------------------------------------------------------
-- Documentos legales versionados
-- -----------------------------------------------------------------------------
insert into t select 'vig', max(version)::text from public.legal_documents where code = 'TERMINOS' and published_at is not null;
insert into t select 'draft', public.fn_admin_save_legal_draft('00000000-0000-0000-0000-0000000009c3', 'TERMINOS',
  'Términos y condiciones (v nueva)', 'Nuevo texto de los términos y condiciones para revisión.')::text;
select is((select v::int from t where k = 'draft'), (select v::int + 1 from t where k = 'vig'), 'el borrador es la siguiente versión');
select is((select version from public.current_legal_documents where code = 'TERMINOS'), (select v::int from t where k = 'vig'),
  'el borrador no cambia la versión vigente');
select is(public.fn_admin_save_legal_draft('00000000-0000-0000-0000-0000000009c3', 'TERMINOS',
  'Términos y condiciones (v nueva)', 'Texto corregido de los términos y condiciones para revisión.'), (select v::int from t where k = 'draft'),
  'guardar de nuevo edita el mismo borrador');
select throws_ok($$ update public.legal_documents set content_md = 'Cambio encubierto en una versión publicada'
  where code = 'TERMINOS' and version = (select v::int from t where k = 'vig') $$, '42501', null, 'una versión publicada no se modifica');
select throws_ok($$ delete from public.legal_documents where code = 'TERMINOS' and version = (select v::int from t where k = 'vig') $$,
  '42501', null, 'una versión publicada no se elimina');
select lives_ok($$ select public.fn_admin_publish_legal('00000000-0000-0000-0000-0000000009c3', 'TERMINOS', (select v::int from t where k = 'draft')) $$,
  'el administrador publica la nueva versión');
select is((select version from public.current_legal_documents where code = 'TERMINOS'), (select v::int from t where k = 'draft'),
  'la nueva versión es la vigente (todos deberán aceptarla)');
select throws_ok($$ select public.fn_admin_save_legal_draft('00000000-0000-0000-0000-0000000009c3', 'TERMINOS', 'Corto', 'corto') $$,
  '23514', null, 'el contenido tiene un mínimo');
select is((select count(*)::int from public.audit_log where action = 'LEGAL_DOCUMENT_PUBLISHED'
  and resource_id = 'TERMINOS@' || (select v from t where k = 'draft')), 1, 'la publicación queda auditada');

select * from finish();
rollback;
