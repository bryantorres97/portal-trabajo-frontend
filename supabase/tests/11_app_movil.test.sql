-- pgTAP: soporte de la app móvil — marca de cierre de sesión global.
-- Ejecutar: supabase test db
begin;
select plan(3);

select ok(exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'users' and column_name = 'tokens_valid_after'
    and data_type = 'timestamp with time zone' and is_nullable = 'YES'),
  'users guarda la marca opcional de cierre global');
select is((select count(*)::int from public.users where tokens_valid_after is not null), 0,
  'ninguna cuenta existente queda cerrada por la migración');
select ok(not has_column_privilege('authenticated', 'public.users', 'tokens_valid_after', 'UPDATE'),
  'authenticated no puede mover la marca');

select * from finish();
rollback;
