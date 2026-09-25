# Fase 2B — Acceso del personal del GAD con Microsoft Entra ID (checklist)

Decisión: **ADR-012** (P-21, opción b). **Estado: PLANIFICADA.** Necesita un app registration de desarrollo (ver `docs/setup/entra-dev.md`).

## Objetivo
El personal del GAD ingresa a `/admin` con su cuenta de Microsoft 365, con el MFA corporativo, y los permisos internos solo funcionan en esas sesiones.

## Diseño

| Aspecto | Decisión |
|---|---|
| Protocolo | OIDC authorization code + PKCE + `state` + `nonce`, cliente confidencial, endpoint v2.0 |
| Endpoints | `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/{authorize,token,logout}` · JWKS por discovery |
| Scopes | `openid profile email offline_access` |
| Validación del ID token | Firma (JWKS del tenant), `iss` = `https://login.microsoftonline.com/{tenant}/v2.0`, `aud` = client ID, `tid` = tenant del GAD, `exp`, `nonce`. Se rechazan invitados (`idp` presente y distinto de `iss`) |
| Identidad | `user_identities(issuer = iss del tenant, sub = oid, provider = 'ENTRA')` |
| Alta del personal | Just-in-time **sin roles** (no recibe `CLIENTE`). Bootstrap del primer `ADMIN_SISTEMA` con `ENTRA_BOOTSTRAP_ADMIN_OIDS` (lista de `oid`, se retira después) |
| Sesión | `auth_sessions.auth_source = 'ENTRA'`. Duración máxima de 12 h. Renovación con el refresh token de Entra |
| Autorización | `requirePagePermission` y la API admin exigen `auth_source = 'ENTRA'`. Una sesión de Cognito con roles internos → 403 en `/admin` |
| MFA | Lo impone el GAD con **acceso condicional** sobre la app (el ID token v2 no trae `amr`) |
| Rutas | `/api/auth/staff/login`, `/api/auth/staff/callback`, `/admin/ingresar` (pantalla de ingreso del personal). El logout existente detecta el origen y redirige al logout de Entra |
| Variables | `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_BOOTSTRAP_ADMIN_OIDS` (opcional). `ADMIN_REQUIRE_ENTRA` (por defecto `true`; `false` solo en desarrollo sin tenant) |
| Verificación de JWT | `jose` con `createRemoteJWKSet` (aws-jwt-verify es solo para Cognito) |

## Checklist
- [ ] Migración: `auth_sessions.auth_source` (`COGNITO` | `ENTRA`), ajuste de `fn_link_identity` (no fusionar cuentas de personal con cuentas ciudadanas)
- [ ] `src/server/auth/entra.ts`: URLs, canje de código, refresh, verificación de ID token (tenant, invitados, nonce)
- [ ] Refactor: el proveedor de la sesión se registra al crearla; `resolveSession` renueva con el proveedor correcto
- [ ] Alta just-in-time del personal sin roles + bootstrap del primer admin (auditado: `STAFF_FIRST_LOGIN`, `ROLE_GRANTED` con `metadata.bootstrap`)
- [ ] Rutas `/api/auth/staff/*` y página `/admin/ingresar`
- [ ] `requirePagePermission` y la API admin exigen una sesión de Entra (403 en caso contrario)
- [ ] Logout según el origen (Cognito o Entra)
- [ ] CSP: `form-action` incluye `login.microsoftonline.com`
- [ ] Tests: unit (validación de claims, tenant, invitados), integración (alta sin roles, bootstrap, sesión Cognito sin acceso admin), E2E (redirecciones)
- [ ] Guías: `docs/setup/entra-dev.md`, `docs/setup/env.md`
- [ ] Pedido formal al GAD (texto listo en `docs/setup/entra-dev.md` §4)
