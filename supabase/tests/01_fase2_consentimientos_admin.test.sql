-- pgTAP: Fase 2 — consentimientos, perfiles y funciones administrativas. Ejecutar: supabase test db
begin;
select plan(11);

-- Documentos vigentes sembrados
select ok((select count(*) from public.current_legal_documents where code in ('TERMINOS', 'PRIVACIDAD')) = 2,
  'TERMINOS y PRIVACIDAD tienen versión vigente');

-- Consentimientos: append-only
insert into public.users (id) values ('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$ select public.fn_accept_current_consents('00000000-0000-0000-0000-0000000000a1') $$,
  'fn_accept_current_consents registra la aceptación');
select throws_ok($$ delete from public.consents where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'consents no admite DELETE');
select is((select count(*)::int from public.audit_log where action = 'CONSENT_ACCEPTED'
  and resource_id = '00000000-0000-0000-0000-0000000000a1'), 1, 'la aceptación queda auditada en la misma transacción');

-- Perfil: formato de celular
select throws_ok($$ insert into public.client_profiles (user_id, full_name, phone)
  values ('00000000-0000-0000-0000-0000000000a1', 'Ana Pérez', '12345') $$,
  '23514', null, 'client_profiles valida el celular');

-- Privilegios: funciones administrativas solo para service_role
select ok(not has_function_privilege('anon', 'public.fn_admin_grant_role(uuid, uuid, text, inet, text, text)', 'EXECUTE'),
  'anon no ejecuta fn_admin_grant_role');
select ok(not has_function_privilege('authenticated', 'public.fn_admin_set_user_status(uuid, uuid, public.user_status, text, inet, text, text)', 'EXECUTE'),
  'authenticated no ejecuta fn_admin_set_user_status');
select ok(not has_function_privilege('authenticated', 'public.fn_link_identity(uuid, text, text, text, text, boolean, inet, text, text)', 'EXECUTE'),
  'authenticated no ejecuta fn_link_identity');
select ok(has_function_privilege('service_role', 'public.fn_accept_current_consents(uuid, inet, text, text)', 'EXECUTE'),
  'service_role ejecuta las funciones');

-- Defensa en profundidad: un actor sin permiso no puede asignar roles aunque llame a la función
select throws_ok($$ select public.fn_admin_grant_role('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a1', 'ADMIN_SISTEMA') $$, '42501', null,
  'fn_admin_grant_role verifica el permiso del actor');

-- La vista de documentos vigentes respeta los permisos del invocador
select ok((select reloptions::text from pg_class where oid = 'public.current_legal_documents'::regclass) like '%security_invoker=true%',
  'current_legal_documents usa security_invoker');

select * from finish();
rollback;
