-- =============================================================================
-- App móvil (Fase 11): «cerrar sesión en todos los dispositivos» también para los clientes con Bearer.
--
-- La app no tiene sesión en `auth_sessions`: guarda sus propios tokens de Cognito y el servidor no
-- conoce su refresh token. Por eso el cierre global deja una marca de tiempo en el usuario y el
-- servidor rechaza cualquier access token cuya autenticación original (`auth_time`, que Cognito
-- conserva al renovar) sea anterior. La app debe volver a iniciar sesión.
-- =============================================================================

alter table public.users add column tokens_valid_after timestamptz;

comment on column public.users.tokens_valid_after is
  'Cierre de sesión global: los access tokens de Cognito con auth_time anterior dejan de valer (app móvil).';
