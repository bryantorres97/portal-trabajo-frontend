-- =============================================================================
-- Fase 1 — Sesiones web del servidor (ADR-005).
-- La cookie del navegador solo contiene un identificador aleatorio; aquí se guarda
-- su hash y los tokens de Cognito CIFRADOS por la aplicación (JWE). Solo el
-- servidor (service_role) accede a esta tabla.
-- =============================================================================

create table public.auth_sessions (
  id                 uuid primary key default gen_random_uuid(),
  token_hash         text not null,
  user_id            uuid not null references public.users (id) on delete cascade,
  tokens_enc         text not null,
  access_expires_at  timestamptz not null,
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  revoked_at         timestamptz,
  ip                 inet,
  user_agent         text,
  constraint auth_sessions_token_hash_key unique (token_hash),
  constraint auth_sessions_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint auth_sessions_user_agent_len check (user_agent is null or char_length(user_agent) <= 512),
  constraint auth_sessions_expiry_order check (expires_at > created_at)
);

comment on table public.auth_sessions is 'Sesiones web opacas. tokens_enc = tokens de Cognito cifrados por la app (nunca en claro).';

create index auth_sessions_user_active_idx on public.auth_sessions (user_id) where revoked_at is null;
create index auth_sessions_expires_idx on public.auth_sessions (expires_at) where revoked_at is null;

alter table public.auth_sessions enable row level security;
-- Sin políticas: inaccesible para anon/authenticated.

revoke all on public.auth_sessions from anon, authenticated;
grant select, insert, update on public.auth_sessions to service_role;
