-- Adaptador mínimo de pgTAP (plan, ok, is, set_eq, throws_ok, lives_ok, finish) para validar migraciones
-- y pruebas en Supabase dev de la nube, donde pgTAP no está disponible (ADR-013).
-- Lo usa scripts/validar-nube.mjs: todo corre en UNA transacción que termina siempre en una
-- excepción (finish), así que nada queda guardado en la nube.

create schema tap_shim;

create table tap_shim.resultados (
  n            integer generated always as identity,
  ok           boolean not null,
  descripcion  text,
  detalle      text
);

create table tap_shim.plan (total integer);

create function tap_shim.plan(p_total integer) returns text language sql as $$
  insert into tap_shim.plan values (p_total);
  select '1..' || p_total;
$$;

create function tap_shim.ok(p_ok boolean, p_descripcion text default null, p_detalle text default null)
returns text language sql as $$
  insert into tap_shim.resultados (ok, descripcion, detalle) values (coalesce(p_ok, false), p_descripcion, p_detalle);
  select case when coalesce(p_ok, false) then 'ok' else 'not ok' end || ' - ' || coalesce(p_descripcion, '');
$$;

create function tap_shim.is(p_obtenido anyelement, p_esperado anyelement, p_descripcion text default null)
returns text language sql as $$
  select tap_shim.ok(p_obtenido is not distinct from p_esperado, p_descripcion,
    'obtenido: ' || coalesce(p_obtenido::text, 'NULL') || ' · esperado: ' || coalesce(p_esperado::text, 'NULL'));
$$;

-- set_eq(consulta, arreglo): la consulta devuelve exactamente ese conjunto (sin orden ni repetidos).
create function tap_shim.set_eq(p_sql text, p_esperado anyarray, p_descripcion text default null)
returns text language plpgsql as $$
declare
  v_obtenido text[];
  v_esperado text[] := (select coalesce(array_agg(distinct x::text order by x::text), '{}') from unnest(p_esperado) x);
begin
  execute format('select coalesce(array_agg(distinct x::text order by x::text), ''{}'') from (%s) as q(x)', p_sql)
    into v_obtenido;
  return tap_shim.ok(v_obtenido = v_esperado, p_descripcion,
    'sobran: ' || coalesce((select string_agg(x, ', ') from unnest(v_obtenido) x where x <> all (v_esperado)), '—')
    || ' · faltan: ' || coalesce((select string_agg(x, ', ') from unnest(v_esperado) x where x <> all (v_obtenido)), '—'));
end;
$$;

create function tap_shim.lives_ok(p_sql text, p_descripcion text default null)
returns text language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return tap_shim.ok(false, p_descripcion, sqlstate || ': ' || sqlerrm);
  end;
  return tap_shim.ok(true, p_descripcion);
end;
$$;

create function tap_shim.throws_ok(p_sql text, p_errcode char(5), p_mensaje text, p_descripcion text)
returns text language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return tap_shim.ok(sqlstate = p_errcode and (p_mensaje is null or sqlerrm = p_mensaje), p_descripcion,
      'obtenido: ' || sqlstate || ' ' || sqlerrm || ' · esperado: ' || p_errcode);
  end;
  return tap_shim.ok(false, p_descripcion, 'no lanzó error (esperado ' || p_errcode || ')');
end;
$$;

-- Termina SIEMPRE con una excepción: revierte la transacción e informa el resultado.
create function tap_shim.finish() returns setof text language plpgsql as $$
declare
  v_total integer := (select count(*) from tap_shim.resultados);
  v_plan integer := (select max(total) from tap_shim.plan);
  v_fallas text := (select string_agg('#' || n || ' ' || coalesce(descripcion, '') || coalesce(' → ' || detalle, ''), E'\n' order by n)
                    from tap_shim.resultados where not ok);
begin
  if v_fallas is null and v_total = v_plan then
    raise exception 'TAP_OK %/% pruebas (transacción revertida)', v_total, v_plan;
  end if;
  raise exception 'TAP_FALLA plan % · ejecutadas % · fallas:%', v_plan, v_total, E'\n' || coalesce(v_fallas, '(ninguna; revisar el plan)');
end;
$$;
