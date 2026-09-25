# Fase 2 — Usuarios y perfiles (checklist)

Objetivo, criterios y riesgos en `docs/analysis/08-roadmap.md`. **Estado: IMPLEMENTADA (2026-09-24)**. Pendiente: validación manual con login real (B2) y commit con confirmación del usuario.

## Decisiones de alcance (al iniciar la fase)

| Tema | Decisión | Motivo |
|---|---|---|
| Código de activación del trabajador | **Pasa a la Fase 4** | Requiere `worker_profiles`, que se crea con el registro presencial (Fase 4) |
| Cierre global de sesión | Revocar **todas las sesiones del portal** y sus refresh tokens (`/oauth2/revoke`) | `GlobalSignOut` requiere el scope `aws.cognito.signin.user.admin`, que el pool del GAD no ofrece |
| Vinculación de identidades (ADR-008) | Iniciada por el usuario desde `/cuenta`: vuelve a autenticarse con el otro proveedor (prueba de titularidad) y confirma | Criterio equivalente al "¿sos vos?" del servicio del GAD. Sin vinculación automática por email |
| Fusión de cuentas | Solo si la cuenta de la otra identidad **no tiene perfil ni roles internos**. Si no, se informa y se deriva al GAD | Evita perder datos. La fusión administrativa queda para la Fase 9 |
| Consentimiento | `TERMINOS` y `PRIVACIDAD` versionados. Aceptación obligatoria antes de usar `/cuenta` (salvo la propia página de consentimiento) | RN-18. Los textos son **provisionales** hasta la validación jurídica (P-15) |
| Teléfono del cliente | Lo ingresa el usuario en su perfil (formato celular de Ecuador), opcional | El pool del GAD no entrega teléfono |
| Sector | Texto libre corto y opcional | El catálogo de parroquias está pendiente (P-12). Se normaliza en la Fase 3 |
| Cambios administrativos | Funciones SQL que hacen el cambio **y** la auditoría en la misma transacción | `05-seguridad-auditoria.md` §19 |

## Checklist

### Base de datos
- [x] Migración `20260924214120_consentimientos_perfiles_admin`: `legal_documents`, vista `current_legal_documents` (security_invoker), `consents` (append-only), `client_profiles`
- [x] Funciones transaccionales con auditoría (`public.fn_*`, solo service_role, verifican el permiso del actor): `fn_accept_current_consents`, `fn_admin_grant_role`, `fn_admin_revoke_role`, `fn_admin_set_user_status` (revoca sesiones), `fn_link_identity` (LINKED/ALREADY_LINKED/MERGED/CONFLICT), `fn_unlink_identity`
- [x] Ajuste de la matriz de permisos: `user.read` para `RESP_DENUNCIAS` y `SUPERVISOR`
- [x] Seed de documentos legales provisionales (TERMINOS v1, PRIVACIDAD v1)
- [x] pgTAP `01_fase2_consentimientos_admin`: 11 tests (total 26)

### Dominio y servidor
- [x] `src/server/domain/users/`: esquemas Zod (perfil, roles, bloqueo), reglas (no auto-bloqueo, no quitarse el último `ADMIN_SISTEMA`)
- [x] Consentimiento: versiones vigentes, estado del usuario, registrar aceptación
- [x] Sesiones: listar las del usuario, cerrar una, cerrar todas (con revocación en Cognito)
- [x] Vinculación de identidades: intención `link` en el flujo OAuth, reglas de fusión
- [x] Helper de errores API (RFC 9457) y protección de origen para mutaciones con cookie

### Web
- [x] `/cuenta`: resumen, perfil editable, identidades vinculadas, sesiones activas, cerrar todas
- [x] `/cuenta/consentimiento`: aceptación de documentos vigentes (bloquea el resto de `/cuenta`)
- [x] `/terminos`: página pública de términos (provisional)
- [x] `/admin/usuarios`: búsqueda, detalle, asignar y revocar roles, bloquear y desbloquear (según permiso)

### API `/api/v1`
- [x] `GET/PATCH /me`, `GET/POST /me/consents`, `GET /me/sessions`, `DELETE /me/sessions`

### Pruebas
- [x] Unit: esquemas, errores Postgres→dominio, RFC 9457, origen/CSRF, Markdown seguro, formatos (total 72)
- [x] Integración `users-fase2`: 16 tests (total 24)
- [x] E2E `fase2.spec`: `/terminos`, enlaces, redirecciones sin sesión, API 401/403 (total 40 en escritorio + móvil)

### Cierre
- [x] Migración aplicada en Supabase dev (nube). Advisors sin issues. Documentos legales v1 insertados con el bloque del seed (el CLI no reejecuta un seed ya aplicado)
- [x] `PROGRESS.md` y este archivo actualizados

## Criterios de aceptación (de `08-roadmap.md`)
- El primer login crea el usuario con rol `CLIENTE` (hecho en la Fase 1).
- El admin asigna roles y queda auditado.
- Un usuario bloqueado recibe 403 y sus sesiones se revocan.
- Sin consentimiento vigente no se puede operar en `/cuenta`.

## Pendiente de validación manual (con login real)
1. Primer ingreso → redirige a `/cuenta/consentimiento` → aceptar → `/cuenta`. Queda `CONSENT_ACCEPTED` en `audit_log`.
2. Guardar perfil con celular inválido (mensaje de error) y luego válido. Queda `PROFILE_UPDATED`.
3. Con `ADMIN_SISTEMA` asignado por SQL: `/admin` → Usuarios → asignar y revocar un rol a otra cuenta; bloquearla (se cierran sus sesiones) y desbloquearla.
4. "Sesiones activas": abrir sesión en otro navegador, cerrarla desde el primero y luego "Cerrar sesión en todos los dispositivos".
5. Si el pool dev tiene Google (`COGNITO_IDENTITY_PROVIDERS=Google`): "Vincular Google" desde `/cuenta`.

## Notas
- `/terminos` es dinámica (`connection()`): el build no depende de la base y, si la base no responde, muestra un mensaje de respaldo.
- Los tests de integración crean versiones nuevas de TERMINOS en la base **local** (prueba de re-consentimiento). Tras correrlos, `pnpm db:reset` deja la base local limpia.

