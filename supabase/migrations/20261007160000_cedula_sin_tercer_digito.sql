-- =============================================================================
-- Cédula: se deja de exigir que el tercer dígito sea menor que 6 (ADR-019, decisión del usuario
-- 2026-10-07). Esa regla viene del RUC (6 entidad pública, 9 sociedad) y podría rechazar cédulas
-- reales de personas. Se mantienen los 10 dígitos, la provincia (01–24 o 30) y el dígito
-- verificador (módulo 10). Solo afloja la restricción: las filas existentes siguen siendo válidas.
-- =============================================================================

create or replace function private.cedula_valida(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_suma int := 0;
  v_d int;
  v_provincia int;
begin
  if p is null or p !~ '^\d{10}$' then
    return false;
  end if;
  v_provincia := substr(p, 1, 2)::int;
  if not (v_provincia between 1 and 24 or v_provincia = 30) then
    return false;
  end if;
  for i in 1..9 loop
    v_d := substr(p, i, 1)::int * case when i % 2 = 1 then 2 else 1 end;
    v_suma := v_suma + case when v_d > 9 then v_d - 9 else v_d end;
  end loop;
  return (10 - v_suma % 10) % 10 = substr(p, 10, 1)::int;
end;
$$;
