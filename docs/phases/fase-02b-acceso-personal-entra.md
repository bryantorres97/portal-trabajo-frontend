# Fase 2B — Acceso del personal del GAD con Microsoft Entra ID (checklist)

Decisión: **ADR-012** (P-21, opción b). **Estado: COMPLETADA (2026-09-25)**, prueba manual OK. Tenant de desarrollo propio con la app `acolita-admin-dev` (ver `docs/setup/entra-dev.md`).

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
| Variables | `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_BOOTSTRAP_ADMIN_OIDS` (opcional). ~~`ADMIN_REQUIRE_ENTRA`~~ descartada (ver ADR-012) |
| Verificación de JWT | `jose` con `createRemoteJWKSet` (aws-jwt-verify es solo para Cognito) |

## Checklist
- [x] Migración `20260925180000_acceso_personal_entra.sql`: `auth_sessions.auth_source` (`COGNITO` | `ENTRA`), `fn_staff_login` (alta sin roles + bootstrap atómico y auditado), `fn_link_identity` sin cuentas del personal, `fn_admin_grant_role` solo para cuentas del personal
- [x] `src/server/auth/entra.ts`: URLs, canje de código, refresh (verifica que siga siendo el mismo `oid`), verificación del ID token con `jose` (tenant, invitados, nonce)
- [x] Refactor: la sesión guarda su origen y su identidad; `resolveSession` renueva con el proveedor correcto; la revocación de refresh tokens solo aplica a Cognito
- [x] Permisos según el origen: `loadUser(id, { source })` (internos con Entra, ciudadanos con Cognito, también en Bearer)
- [x] Rutas `/api/auth/staff/{login,callback}` y página `/admin/ingresar`; el proxy envía `/admin/*` sin sesión a `/admin/ingresar`
- [x] `requirePagePermission` exige sesión de Entra (sesión ciudadana → aviso `cuenta_ciudadana`; personal sin roles → `sin_permisos`)
- [x] Logout según el origen (Cognito o Entra, que vuelve a `/admin/ingresar`); botón de cierre en el panel
- [x] CSP: `form-action` incluye `login.microsoftonline.com`
- [x] `/cuenta` con sesión de Entra → `/admin`; vinculación desde una sesión de Entra → `vinculo_no_permitido`; `/admin/usuarios/[id]` solo ofrece roles internos a cuentas institucionales
- [x] Tests: unit (URLs, claims, invitados, tenant, nonce, firma), integración (alta sin roles, bootstrap, permisos por origen, sesiones ENTRA, separación de cuentas), pgTAP (privilegios, alta, reglas de roles y vinculación), E2E (redirecciones, pantalla de ingreso, CSP, a11y)
- [x] Guías: `docs/setup/entra-dev.md`, `docs/setup/env.md`, `.env.example`, ADR-012
- [x] Prueba manual con el tenant de desarrollo (`docs/setup/entra-dev.md` §3b)
- [ ] Pedido formal al GAD (texto listo en `docs/setup/entra-dev.md` §4)

## Notas
- Datos previos: si una cuenta ciudadana tenía roles internos (asignados antes de la Fase 2B), esos roles ya no tienen efecto. Para dar acceso, la persona ingresa en `/admin/ingresar` y se le asignan los roles a su cuenta institucional.
- Entra no emite `email_verified`: el correo del personal se guarda como no verificado y nunca se usa para vincular cuentas.
