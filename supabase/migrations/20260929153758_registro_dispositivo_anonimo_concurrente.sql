-- fn_register_anonymous_device toleraba mal las altas simultáneas del mismo token: las dos
-- solicitudes hacían SELECT … FOR UPDATE, ninguna encontraba la fila (no hay qué bloquear) y la
-- segunda fallaba en el INSERT con device_tokens_token_key (409 en POST /api/v1/devices/anonymous).
-- Pasa en la app al arrancar: el token llega a la vez por token() y onTokenRefresh.
--
-- Ahora el INSERT usa ON CONFLICT (token) DO NOTHING; si otra solicitud lo insertó antes, se
-- bloquea esa fila y se aplica la misma lógica que a un token existente. Mismo contrato: devuelve
-- 'OK' o 'RATE_LIMITED'. La firma no cambia, así que se conservan los permisos de la función.
-- fn_register_device ya usaba ON CONFLICT (token) DO UPDATE.

create or replace function public.fn_register_anonymous_device(p_platform text, p_token text, p_ip_hash text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_row public.device_tokens;
begin
  if p_platform not in ('ANDROID', 'IOS') then
    raise exception 'Solo la app móvil registra dispositivos sin sesión' using errcode = 'check_violation';
  end if;

  select * into v_row from public.device_tokens where token = p_token for update;
  if not found then
    if (select count(*) from public.device_tokens
        where registered_ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 30 then
      return 'RATE_LIMITED';
    end if;
    insert into public.device_tokens (user_id, platform, token, registered_ip_hash)
    values (null, p_platform, p_token, p_ip_hash)
    on conflict (token) do nothing;
    if found then
      return 'OK';
    end if;
    -- Otra solicitud lo insertó al mismo tiempo (ON CONFLICT esperó a que confirmara): se trata
    -- como un token existente.
    select * into v_row from public.device_tokens where token = p_token for update;
  end if;

  -- Si el token ya pertenece a un usuario y está activo, no se desvincula.
  if v_row.user_id is not null and v_row.disabled_at is null then
    update public.device_tokens set last_seen_at = now() where id = v_row.id;
  else
    update public.device_tokens
      set user_id = null, session_id = null, platform = p_platform, last_seen_at = now(), disabled_at = null
      where id = v_row.id;
  end if;
  return 'OK';
end;
$$;
