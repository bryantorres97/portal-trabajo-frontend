-- pgTAP: Fase 2B — acceso del personal con Microsoft Entra ID (ADR-012). Ejecutar: supabase test db
begin;
select plan(12);

-- Origen de la sesión
select has_column('public', 'auth_sessions', 'auth_source', 'auth_sessions registra el origen de la sesión');
select col_default_is('public', 'auth_sessions', 'auth_source', 'COGNITO', 'las sesiones existentes quedan como COGNITO');

-- Privilegios: solo el servidor
select ok(not has_function_privilege('anon', 'public.fn_staff_login(text, text, text, text, boolean, inet, text, text)', 'EXECUTE'),
  'anon no ejecuta fn_staff_login');
select ok(not has_function_privilege('authenticated', 'public.fn_staff_login(text, text, text, text, boolean, inet, text, text)', 'EXECUTE'),
  'authenticated no ejecuta fn_staff_login');
select ok(has_function_privilege('service_role', 'public.fn_staff_login(text, text, text, text, boolean, inet, text, text)', 'EXECUTE'),
  'service_role ejecuta fn_staff_login');

-- Alta just-in-time sin roles
select is((select count(*)::int from public.fn_staff_login('https://login.microsoftonline.com/t/v2.0', 'oid-1',
  'ana@gad.test', 'Ana', false) where created), 1, 'el primer ingreso crea la cuenta del personal');
select is((select count(*)::int from public.user_roles ur join public.user_identities i on i.user_id = ur.user_id
  where i.sub = 'oid-1'), 0, 'la cuenta del personal no recibe roles (ni CLIENTE)');
select is((select provider from public.user_identities where sub = 'oid-1'), 'ENTRA', 'la identidad queda como ENTRA');

-- Roles internos solo para cuentas del personal
insert into public.users (id) values ('00000000-0000-0000-0000-0000000002b1'), ('00000000-0000-0000-0000-0000000002b2');
insert into public.user_roles (user_id, role_code) values ('00000000-0000-0000-0000-0000000002b1', 'ADMIN_SISTEMA');
select throws_ok($$ select public.fn_admin_grant_role('00000000-0000-0000-0000-0000000002b1',
  '00000000-0000-0000-0000-0000000002b2', 'MODERADOR') $$, '23514', null,
  'fn_admin_grant_role rechaza cuentas sin identidad de Entra');
select lives_ok($$ select public.fn_admin_grant_role('00000000-0000-0000-0000-0000000002b1',
  (select user_id from public.user_identities where sub = 'oid-1'), 'MODERADOR') $$,
  'fn_admin_grant_role asigna roles internos a cuentas del personal');

-- Vinculación: las cuentas del personal quedan fuera
select throws_ok($$ select public.fn_link_identity((select user_id from public.user_identities where sub = 'oid-1'),
  'https://cognito-idp.us-east-2.amazonaws.com/x', 'sub-c', 'COGNITO') $$, '23514', null,
  'una cuenta del personal no vincula identidades de Cognito');
select throws_ok($$ select public.fn_link_identity('00000000-0000-0000-0000-0000000002b2',
  'https://login.microsoftonline.com/t/v2.0', 'oid-2', 'ENTRA') $$, '23514', null,
  'una identidad de Entra no se vincula a una cuenta ciudadana');

select * from finish();
rollback;
