-- Se retira la unidad de precio JORNADA («Por jornada»): se confundía con JORNAL, que en la
-- interfaz se muestra como «por día». Los oficios y trabajadores que la usaban pasan a JORNAL.
-- No hay contrataciones con JORNADA; la restricción de contract_terms la bloquea en adelante
-- (la validación de fn_contract_propose y fn_contract_counter la sigue listando, pero el INSERT falla con check_violation → 422).

update public.services set price_unit = 'JORNAL', updated_at = now() where price_unit = 'JORNADA';
update public.worker_services set price_unit = 'JORNAL' where price_unit = 'JORNADA';

alter table public.services drop constraint services_price_unit;
alter table public.services
  add constraint services_price_unit check (price_unit in ('JORNAL', 'HORA', 'OBRA', 'SERVICIO'));

alter table public.worker_services drop constraint worker_services_price_unit;
alter table public.worker_services
  add constraint worker_services_price_unit check (price_unit is null or price_unit in ('JORNAL', 'HORA', 'OBRA', 'SERVICIO'));

alter table public.contract_terms drop constraint contract_terms_price_unit;
alter table public.contract_terms
  add constraint contract_terms_price_unit check (price_unit in ('JORNAL', 'HORA', 'OBRA', 'SERVICIO'));
