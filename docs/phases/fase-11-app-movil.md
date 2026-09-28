# Fase 11 — Soporte de la API para la app móvil (checklist)

Pedido del usuario (2026-09-28): antes de construir la app (`../portal_empleo_mobile_app`), cubrir los huecos de `/api/v1` que detectó su análisis (`../portal_empleo_mobile_app/docs/analysis/03-contrato-api.md` §4, H1–H7). Decisión en ADR-016. **Estado: IMPLEMENTADA (2026-09-28)**. Migración validada en Supabase dev dentro de una transacción revertida (pgTAP 3/3; bases de seguridad y Fase 2 sin regresiones). **Aplicada en la nube** (2026-09-28, con confirmación del usuario; advisors sin observaciones). Falta la validación manual con la app.

## Huecos resueltos

| # | Hueco | Solución |
|---|---|---|
| H1 | Un usuario nuevo por Bearer recibía 401 (solo se creaba en el callback web) | `POST /api/v1/me/bootstrap` (Bearer + `{ idToken }`), `src/server/auth/mobile.ts`, `verifyMobileIdToken` |
| H2 | `GET /me/unread` solo leía la cookie | Acepta Bearer (`getRequestUser`); cuentas bloqueadas → `chat: false` |
| H3 | Foto y descripción del trabajador solo como server actions | `POST /api/v1/me/worker/photo` (multipart `file`) y `POST /api/v1/me/worker/proposal` (`{ publicBio?, availabilityNote? }`), con la lógica existente de `public-profile.ts` |
| H4 | Sin endpoint de motivos de denuncia | `GET /api/v1/report-reasons?targetType=` (público, caché 5 min) |
| H5 | FAQ y legales sin API pública | `GET /api/v1/content/faq` y `GET /api/v1/content/legal/{code}` (`TERMINOS` o `PRIVACIDAD`) |
| H6 | "Cerrar en todos los dispositivos" no alcanzaba a la app | `users.tokens_valid_after` + rechazo de Bearer con `auth_time` anterior (ADR-016). `DELETE /me/sessions` y el botón de «Mi cuenta» lo aplican |
| H7 | Sin OpenAPI | `GET /api/v1/openapi.json` (OpenAPI 3.1): entradas desde los esquemas Zod del servidor; respuestas en `src/server/http/openapi/responses.ts`, alineadas con los tipos del servidor por el typecheck |

## Checklist

### Base de datos (`20260928120000_app_movil`)
- [x] `users.tokens_valid_after`
- [x] pgTAP `11_app_movil.test.sql` (3)
- [x] Aplicada en la nube (advisors sin observaciones, caché de PostgREST recargada)

### Servidor y API
- [x] `verifyMobileIdToken` (solo client IDs adicionales)
- [x] `findIdentityOwner`, `findBearerUserId`, `isAuthTimeRevoked`; `getRequestUser` usa la marca
- [x] `revokeUserSessions` sin sesión concreta marca el cierre global
- [x] `buildMe` compartido entre `GET /me` y `/me/bootstrap`
- [x] Rutas nuevas: `me/bootstrap`, `me/worker/photo`, `me/worker/proposal`, `report-reasons`, `content/faq`, `content/legal/[code]`, `openapi.json`
- [x] `me/unread` con Bearer

### Pruebas
- [x] Unit `app-movil.test.ts` (17): bootstrap (alta, idempotencia, tokens inválidos o cruzados, cierre global, cuenta bloqueada, validación), `isAuthTimeRevoked`, no leídos con Bearer, foto y propuesta, motivos, legales
- [x] Unit `openapi.test.ts` (6): cada método de cada Route Handler está documentado y viceversa, referencias válidas, `required` según la entrada, seguridad por ruta
- [x] Unit `verify.test.ts` (+3): ID token móvil
- [x] Integración `app-movil.test.ts` (CI): cierre global contra la base
- [ ] Validación manual con la app (Fase M2 de la app)

## Resultados
- Unit 474; lint, formato, tipos y build OK.
- Validación en la nube con transacción revertida: 3/3; `00_base_seguridad` y `01_fase2` sin regresiones.

## Validación manual (con la app o con curl)
1. ✅ (2026-09-28: `llankana-movil`, `24s2147dtdmuant46jk29q8rmk`; guía en `../portal_empleo_mobile_app/docs/setup/cognito-movil.md`) Crear en el pool dev un app client **público** (sin secret) con callback `ec.gob.ambato.llankana://auth` (logout `ec.gob.ambato.llankana://logout`) y agregarlo a `COGNITO_EXTRA_CLIENT_IDS`.
2. Obtener tokens con ese client (Managed Login + PKCE) y llamar `POST /api/v1/me/bootstrap` con Bearer y `{ idToken }` → 201 la primera vez, 200 después.
3. `GET /api/v1/me/unread` con Bearer → conteo real.
4. Desde el web, «Cerrar sesión en todos los dispositivos» → la app recibe 401 con su token hasta volver a ingresar.
5. `GET /api/v1/openapi.json` abre en un visor OpenAPI (p. ej. Swagger Editor) sin errores.
