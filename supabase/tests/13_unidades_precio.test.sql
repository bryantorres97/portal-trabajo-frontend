-- pgTAP: la unidad de precio JORNADA ya no existe (se usa JORNAL, «por día»).
-- Ejecutar: supabase test db
begin;
select plan(4);

select is((select count(*)::int from public.services where price_unit = 'JORNADA'), 0, 'ningún oficio usa JORNADA');
select is((select count(*)::int from public.worker_services where price_unit = 'JORNADA'), 0,
  'ningún trabajador usa JORNADA');
select throws_ok($$ update public.services set price_unit = 'JORNADA' where slug = 'albanileria' $$,
  '23514', null, 'el catálogo rechaza JORNADA');
select lives_ok($$ update public.services set price_unit = 'JORNAL' where slug = 'albanileria' $$,
  'JORNAL sigue admitido');

select * from finish();
rollback;
