-- pgTAP: seguridad de la migración base (Fase 1). Ejecutar: supabase test db
begin;
select plan(15);

-- RLS activado en todas las tablas de negocio
select ok((select bool_and(relrowsecurity) from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r'), 'RLS activado en todas las tablas de public');

-- anon no tiene privilegios sobre tablas sensibles
select ok(not has_table_privilege('anon', 'public.users', 'SELECT'), 'anon no lee users');
select ok(not has_table_privilege('anon', 'public.audit_log', 'SELECT'), 'anon no lee audit_log');
select ok(not has_table_privilege('authenticated', 'public.auth_sessions', 'SELECT'), 'authenticated no lee auth_sessions');
select ok(not has_table_privilege('authenticated', 'public.audit_log', 'INSERT'), 'authenticated no escribe audit_log');

-- service_role: auditoría solo INSERT/SELECT
select ok(has_table_privilege('service_role', 'public.audit_log', 'INSERT'), 'service_role inserta auditoría');
select ok(not has_table_privilege('service_role', 'public.audit_log', 'UPDATE'), 'service_role no actualiza auditoría');
select ok(not has_table_privilege('service_role', 'public.audit_log', 'DELETE'), 'service_role no borra auditoría');

-- Inmutabilidad (incluso para el dueño de la tabla, vía trigger)
insert into public.audit_log (action) values ('TEST_ACTION');
select throws_ok($$ update public.audit_log set action = 'HACK' $$, '42501', null, 'UPDATE en audit_log bloqueado');
select throws_ok($$ delete from public.audit_log $$, '42501', null, 'DELETE en audit_log bloqueado');

-- Seed de roles y permisos
select is((select count(*)::int from public.roles), 9, '9 roles sembrados');
select ok(exists (select 1 from public.role_permissions where role_code = 'ADMIN_TRABAJADORES' and permission_code = 'worker.enable'),
  'ADMIN_TRABAJADORES puede habilitar trabajadores');

-- Identidades (ADR-008): (issuer, sub) único. El documento de identidad solo está en la ficha del
-- trabajador (ADR-019), nunca en las cuentas ni en las identidades.
insert into public.users (id) values ('00000000-0000-0000-0000-000000000001');
insert into public.user_identities (user_id, issuer, sub)
  values ('00000000-0000-0000-0000-000000000001', 'https://iss', 'sub-1');
select throws_ok($$ insert into public.user_identities (user_id, issuer, sub)
  values ('00000000-0000-0000-0000-000000000001', 'https://iss', 'sub-1') $$,
  '23505', null, '(issuer, sub) es único');
select ok(not has_table_privilege('anon', 'public.user_identities', 'SELECT'), 'anon no lee user_identities');
select is((select count(*)::int from information_schema.columns
  where table_schema = 'public' and (column_name ilike '%cedula%' or column_name ilike '%id_document%')
    and table_name <> 'worker_profiles'), 0, 'el documento de identidad solo se guarda en la ficha del trabajador');

select * from finish();
rollback;
