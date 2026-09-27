# PROGRESS — Estado del desarrollo

> **Leer este archivo al inicio de cada sesión.** Es la fuente de verdad sobre en qué punto está el proyecto.
> Actualizarlo al terminar cada tarea relevante y siempre al cerrar una fase.

## Estado actual

| Campo | Valor |
|---|---|
| Fase actual | **Fase 9 implementada** (commit y migración en la nube; validación manual pendiente). **Fase 8 implementada** (commit y migración en la nube; validación manual pendiente). **Fase 7 implementada** (commit y migración en la nube; validación manual pendiente). **Fase 6 implementada** (commit y migración en la nube; validación manual pendiente). Fase 5 completada técnicamente; validación manual pendiente. Fase 4: validación manual pendiente. Desde 2026-09-26 se trabaja solo con Supabase en la nube (ADR-013). Fases 2B y 3 completadas. Fase 2: validación manual pendiente |
| Siguiente fase | Fase 10 — Calidad y producción |
| Rama de trabajo | `development` · último commit: Fase 9. Se commitea solo con confirmación del usuario |
| Última actualización | 2026-09-26 |

## Siguiente paso concreto

1. ~~Commit de Fase 0 + 1~~ ✅ `b208b58`.
2. **Probar el login real con el pool dev** (B2). Todo está listo: `.env.local` completo, migraciones aplicadas en el proyecto Supabase dev en la nube (`Portal Empleo`), callback `http://localhost:3000/api/auth/callback` aceptado por Cognito. Solo falta que el usuario inicie sesión en el navegador (`pnpm dev` → `/cuenta`). Checklist en `docs/setup/cognito-dev.md`.
3. Solicitar al GAD el App Client del portal (P-02). Preguntas abiertas: P-02, P-06, P-13, P-15, P-20 (P-21 decidida: Entra ID para el personal, ADR-012). Pedir al GAD el app registration de Entra (texto listo en `docs/setup/entra-dev.md` §4).
4. ~~Fase 2B: prueba manual y commit~~ ✅. Queda el pedido formal al GAD del app registration.
5. **Fase 9**: commit y migración en la nube ✅; falta la validación manual (`docs/phases/fase-09-panel-administrativo.md`).
6. **Fase 8**: commit y migración en la nube ✅; falta la validación manual (`docs/phases/fase-08-denuncias-moderacion.md`). Preguntar al GAD P-14 (sanciones, plazos y a quién se escala): hoy se usan valores recomendados.
7. **Fase 7**: commit y migración en la nube ✅; falta la validación manual (`docs/phases/fase-07-calificaciones.md`).
8. **Fase 6**: commit y migración en la nube ✅. Validación manual en curso: propuesta, contrapropuesta y aceptación OK; faltan ejecución (inicio, fin, confirmación), retiro, rechazo, cancelación y disputa (`docs/phases/fase-06-contrataciones.md`). El repositorio no tiene remoto: las pruebas de integración y E2E con base no se han ejecutado en un CI.
9. **Fase 5**: validar manualmente (`docs/phases/fase-05-chat.md`), con un trabajador vinculado de la Fase 4. Push: falta el proyecto Firebase.
10. **Fase 4 implementada** (commit y migración en la nube hechos): validar manualmente (lista en `docs/phases/fase-04-gestion-trabajadores.md`). Preguntar al GAD P-06 (documentos obligatorios) y P-13 (capacitación): hoy se usan los valores recomendados.
11. **Fase 2 implementada**: validar manualmente con login real (lista en `docs/phases/fase-02-usuarios-perfiles.md`) (commit `3d9ca0d`). Después, Fase 3.

## Bloqueos y dependencias externas

| # | Bloqueo | Responsable | Impacto |
|---|---|---|---|
| B1 | Logos reales (`acolita-logo-nuevo.png`, `ambato-logo.png`): en `resources` solo hay punteros al CDN de Lovable | Usuario / GAD | Se usa un logotipo temporal en texto (`src/components/site/Logo.tsx`) |
| B2 | Prueba del login real con el pool dev (pool us-east-1 + Supabase dev en la nube listos) | Usuario | Solo falta iniciar sesión en el navegador. El flujo está cubierto por tests y la redirección a Cognito está verificada |
| B3 | Rotar el client secret de otra aplicación que aparece en `resources/cognito-data.md` | GAD | Riesgo de seguridad sobre el pool productivo (el portal no lo usa) |
| B5 | App Client propio del portal en el pool de ciudadanos del GAD (P-02) | GAD | Necesario para staging y producción, no para desarrollo |
| B4 | Preguntas de negocio pendientes (`docs/analysis/09-riesgos-preguntas.md`) | GAD | Pueden cambiar reglas en las Fases 4–8 |

## Checklist por fase

Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado

### Fase 0 — Descubrimiento y definición ✅
- [x] Leer `IMPLEMENTATION_PLAN.md` y analizar `resources/`
- [x] Decisiones iniciales con el usuario (ver `DECISIONS.md` ADR-001..003)
- [x] Documentos de análisis `docs/analysis/01..09`
- [x] Guías de setup `docs/setup/{cognito-dev,supabase-local,env}.md`

### Fase 1 — Fundación técnica ✅ (login real pendiente de B2)
Detalle en `docs/phases/fase-01-fundacion.md`.
- [x] Estructura `src/` y alias
- [x] Sistema de diseño portado desde `resources`
- [x] Shell público y páginas institucionales
- [x] Configuración y validación de entorno + headers de seguridad
- [x] Supabase local, migraciones base (identidad, roles, auditoría, sesiones), seed
- [x] Autenticación Cognito (OIDC + PKCE, sesiones opacas cifradas)
- [!] Prueba de login contra un pool real (B2)
- [x] Auditoría base
- [x] Testing (unit 47, integración 8, pgTAP 15, E2E 24) + CI
- [x] Observabilidad mínima

### Fases 2–11
Ver `docs/analysis/08-roadmap.md`. Cada fase crea `docs/phases/fase-XX-*.md` al iniciarse.
- [x] Fase 2 — Usuarios y perfiles → `docs/phases/fase-02-usuarios-perfiles.md` (el código de activación pasa a la Fase 4) · validación manual pendiente
- [x] Fase 2B — Acceso del personal con Microsoft Entra ID → `docs/phases/fase-02b-acceso-personal-entra.md` · prueba manual OK
- [x] Fase 3 — Catálogo y búsqueda → `docs/phases/fase-03-catalogo-busqueda.md` (incluye el seed de categorías desde `src/content/site.ts`)
- [x] Fase 4 — Gestión de trabajadores → `docs/phases/fase-04-gestion-trabajadores.md` (incluye el código de activación) · validación manual pendiente
- [x] Fase 5 — Chat → `docs/phases/fase-05-chat.md` · validación manual pendiente
- [x] Fase 6 — Contrataciones → `docs/phases/fase-06-contrataciones.md` (ADR-014) · migración en la nube · validación manual pendiente
- [x] Fase 7 — Calificaciones → `docs/phases/fase-07-calificaciones.md` · migración en la nube · validación manual pendiente
- [x] Fase 8 — Denuncias y moderación → `docs/phases/fase-08-denuncias-moderacion.md` · migración en la nube · validación manual pendiente
- [x] Fase 9 — Panel administrativo → `docs/phases/fase-09-panel-administrativo.md` · migración en la nube · validación manual pendiente
- [ ] Fase 10 — Calidad y producción
- [ ] Fase 11 — Aplicación móvil (arquitectura)

## Comandos de verificación

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build   # en la máquina de desarrollo
supabase db push --dry-run && supabase db push                                # esquema → Supabase dev (nube), con confirmación
```

pgTAP, integración y E2E con datos corren en el **CI** (base efímera). Para validar una migración y sus pruebas pgTAP en la nube sin guardar nada: `node scripts/validar-nube.mjs supabase/migrations/<nueva>.sql supabase/tests/<prueba>.test.sql`. Desde 2026-09-26 no se usa Supabase local en la máquina de desarrollo (ADR-013).

## Bitácora de sesiones

| Fecha | Resumen |
|---|---|
| 2026-09-24 | Análisis inicial de requisitos y `resources`. Plan aprobado. Decisiones: API en Next.js + Supabase, Cognito dev en cuenta personal, ejecutar Fase 0 + 1. Se crea `docs/`. |
| 2026-09-24 | **Fase 0 documentada** (9 documentos de análisis, 7 ADR). **Fase 1 implementada**: diseño y páginas públicas portadas, Supabase con RLS y auditoría inmutable, auth OIDC con sesiones opacas (ADR-005 ajustado: los tokens superan 4 KB en cookie), tests y CI. Hallazgos: Supabase third-party auth con Cognito requiere una Lambda Pre-Token (ADR-004, P-17); `cedula-claim=sub` es inconsistente (P-01). |
| 2026-09-24 | **Revisión pre-commit** con `resources/instructivo-integracion-cognito.md` y decisiones del usuario: **sin cédula**; el `sub` no es estable entre proveedores → modelo `users` + `user_identities` (ADR-008); scopes `openid email profile` (el pool del GAD no tiene `phone`); login social configurable (`COGNITO_IDENTITY_PROVIDERS`); multimedia provisional desde Unsplash (ADR-009); fotos ficticias de personas retiradas; el GAD no tiene ambiente de pruebas. Tests: unit 47, integración 8, pgTAP 15, E2E 24. |
| 2026-09-24 | Commit `b208b58` (Fase 0 + 1). **Supabase dev en la nube** (`Portal Empleo`, us-east-2, enlazado con la CLI): migraciones y seed aplicados con `supabase db push --include-seed`. Verificado en remoto: historial de migraciones sincronizado, advisors sin issues, 9 roles, 25 permisos y 50 asignaciones, RLS en todas las tablas, privilegios correctos, `audit_log` inmutable, acceso de la app vía API con la secret key y la publishable key bloqueada en `users`. pgTAP no corre en la nube (sin extensión `pgtap`): los tests SQL se ejecutan en local y en CI. Scope `phone` quitado de `.env.local`. Puerto 3000 libre: `/api/auth/login` redirige al pool dev y Cognito acepta el callback y los scopes. |
| 2026-09-24 | Commit de docs `dcc3267`. **Fase 2 implementada**: consentimiento versionado obligatorio (TERMINOS y PRIVACIDAD v1 provisionales, página `/terminos`), perfil de cliente, panel `/cuenta` (perfil, formas de ingreso con vinculación y fusión segura (ADR-008), sesiones activas, cierre en todos los dispositivos), `/admin/usuarios` (búsqueda, roles internos, bloqueo con revocación de sesiones), API `/api/v1/me`, `/me/consents` y `/me/sessions` (RFC 9457, CSRF por origen, Bearer para la app móvil). Cambios administrativos con auditoría atómica en funciones SQL. Tests: unit 72, integración 24, pgTAP 26, E2E 40. Migración aplicada en la nube. El código de activación pasa a la Fase 4. |
| 2026-09-24 | **Respuestas del GAD** incorporadas: sin pool de staging (se usa el personal), personal con MFA de Microsoft 365 (nueva P-21), federación Google + Facebook, contacto solo por chat (ADR-010), calificación bidireccional con visibilidad restringida (ADR-011), sin separación de funciones, despliegue en Vercel región `cle1` (ADR-007, `vercel.json`). ADR-004 decidido: **sin Pre Token Generation Lambda**; Realtime usará tokens propios del servidor. |
| 2026-09-24 | **P-21 decidida (opción b)**: el personal del GAD ingresa con Microsoft Entra ID (ADR-012). Nueva Fase 2B planificada, con guía `docs/setup/entra-dev.md` y el texto del pedido al GAD. Verificado en la documentación de Microsoft: identidad por `oid`; el ID token v2 no trae `amr`, así que el MFA se exige con acceso condicional del GAD. |
| 2026-09-25 | **Fase 3 implementada**: catálogo en BD (3 categorías, 10 oficios) con CRUD en `/admin/catalogo`, 27 parroquias (P-12, a validar), `worker_profiles` y `worker_services` con separación de datos públicos y privados, búsqueda FTS en español + trigramas (p95 134 ms con 5 000 trabajadores), páginas `/buscar` y `/trabajadores/[id]` y oficios desde BD, JSON-LD, sitemap, API pública `/api/v1/{categories,parishes,workers}`, accesibilidad automatizada con axe. CI corregido (`supabase start` con la API, E2E en el job de base de datos). Migración aplicada en la nube. |
| 2026-09-25 | Commit `8a3750b` (Fase 3). Trabajadores ficticios del seed cargados en Supabase dev de la nube (15 habilitados y 2 no habilitados), verificados con el servidor del usuario: búsqueda sin datos privados, 404 para los no habilitados. |
| 2026-09-25 | **Fase 2B implementada**: tenant de Entra propio (`acolita-admin-dev`, usuarios nativos `admin.dev` y `personal.dev`, credenciales verificadas contra Microsoft). Ingreso OIDC + PKCE del personal en `/admin/ingresar`, rechazo de cuentas externas, sesiones con origen (`COGNITO`/`ENTRA`) y permisos según el origen, roles internos solo en cuentas institucionales, sin vinculación con cuentas ciudadanas, bootstrap atómico del primer `ADMIN_SISTEMA`, logout por proveedor. Se descartó `ADMIN_REQUIRE_ENTRA`. Tests: unit 95, integración 46, pgTAP 48, E2E 88. Migración aplicada en la nube. Puertos de Supabase local bloqueados por WinNAT: se resolvió con `net stop/start winnat`. **Prueba manual OK** (usuario): bootstrap de `admin.dev`, `personal.dev` sin roles y luego con rol asignado, logout por Microsoft, rechazo de cuenta externa. |
| 2026-09-26 | **Fase 4 implementada**: alta presencial con asistente y detección de duplicados, máquina de estados en TS y en SQL (historial append-only, reglas de habilitación en la base), documentos en bucket privado `worker-files` (firma binaria, URL firmada de 5 min, acceso auditado), capacitación (curso `GENERAL`, inscripciones y resultados con avance automático del estado), código de activación (HMAC, un solo uso, 5 intentos/15 min), `/cuenta/trabajador` con edición limitada y moderación de foto y descripción, fotos públicas servidas por el servidor. Tests: unit 219, integración 61, pgTAP 89, E2E 108. CI levanta Storage. Migración aplicada en la nube (primer intento revertido por `pg_trgm`, corregido). |
| 2026-09-26 | **Fase 5 implementada**: chat cliente ↔ trabajador (conversación 1:1 con lectura y bloqueo por parte, mensajes inmutables, envío idempotente, límites 20/min y 10 conversaciones/día), Realtime privado con JWT ES256 propio (ADR-004 verificado con Realtime real: p95 < 1 s), degradación a consulta periódica, notificaciones in-app (una por conversación), outbox y despachador FCM (desactivado sin credenciales), denuncia de mensajes (enganche de la Fase 8). Tests: unit 253, integración 74, pgTAP 126, E2E 122. CI genera la clave local y levanta Realtime. |
| 2026-09-26 | Decisión del usuario: **solo Supabase en la nube** (ADR-013). Commit de la Fase 5 y migración `chat_notificaciones` aplicada en la nube (advisors sin observaciones). Clave ES256 importada por el usuario en Supabase dev y `REALTIME_JWT_PRIVATE_KEY` agregada a `.env.local`; verificado contra Realtime de la nube: canal propio `SUBSCRIBED`, ajeno `Unauthorized`, otra clave `JwtSignatureError`. |
| 2026-09-26 | **Rediseño UI/UX** en etapas: 1 (base visual y portal público, `0f36d01`), 2 (Mi cuenta y espacio del trabajador, `d73b8bf`) y 3 (panel del GAD con marco propio: grupo de rutas `(panel)`, barra lateral por permisos, portada «Por atender» con conteos por estado, listados y ficha del trabajador reorganizados, ingreso del personal a pantalla completa con el logo del GAD). Tests: unit 330, E2E 122. |
| 2026-09-26 | **Fase 6 implementada**: contrataciones con versiones inmutables y hash SHA-256, aceptación bilateral de la misma versión (la propuesta cuenta como aceptación de quien la envía, ADR-014), 409 ante versión obsoleta, modificaciones sin perder lo acordado, inicio, fin y confirmación (automática a los 7 días), cancelación con motivo, expiración a los 7 días (al leer y con pg_cron), disputa como denuncia `CONTRACT`, tarjetas en el chat, `/contrataciones` y notificaciones. Nuevo `scripts/validar-nube.mjs`: migración + pgTAP en la nube dentro de una transacción revertida (Fase 6 73/73, Fase 5 37/37). Unit 362. |
| 2026-09-26 | Error en `/cuenta` y en las conversaciones (`fn_list_contracts` no existía): el código de la Fase 6 corría sin su migración. Con la confirmación del usuario se aplicó `contrataciones` en la nube (advisors sin observaciones, pg_cron creado, caché de PostgREST recargada). |
| 2026-09-26 | **P-07 respondida por el GAD**: la plataforma no maneja pagos; el precio es solo una referencia (RN-17 confirmada). Validación manual de la Fase 6 (usuario): propuesta, contrapropuesta y aceptación OK. |
| 2026-09-26 | **Fase 7 implementada**: calificación 1–5 con comentario ≤200 palabras (web, API y base), en ambos sentidos (ADR-011), solo con contratación finalizada y una por parte, edición durante 7 días, promedio desnormalizado, reseñas en el perfil público, reputación del cliente solo para su trabajador (RN-20), denuncia de reseñas, moderación en `/admin/resenas` e invitación a calificar al finalizar. Validación en la nube con transacción revertida: Fase 7 47/47 (Fases 5 y 6 sin regresiones). Unit 379. |
| 2026-09-27 | Migración `calificaciones` aplicada en la nube con confirmación del usuario (advisors sin observaciones, caché de PostgREST recargada, perfil público 200). |
| 2026-09-27 | **Fase 8 implementada**: denuncias de todos los tipos con prioridad y plazo por gravedad, límite diario, seguimiento del denunciante con pedidos de información y evidencia en bucket privado, bandeja del GAD con asignación, vistas, vencidas y escalamiento, acceso a la conversación solo con denuncia y justificación (`sensitive_access_log`, RN-09), sanciones con vigencia (advertir, ocultar, suspender trabajador o cuenta, dar de baja, bloquear) que vencen solas con pg_cron, y resolución de disputas desde su denuncia. P-14 con valores recomendados. Validación en la nube con transacción revertida: Fase 8 55/55 sin regresiones. Unit 400. |
| 2026-09-27 | Migración `denuncias_moderacion` aplicada en la nube con confirmación del usuario (advisors sin observaciones, 2 tareas pg_cron, bucket `report-evidence`). Commit de la Fase 8. |
| 2026-09-27 | **Fase 9 implementada**: indicadores del periodo con días de Ecuador (trabajadores, ciudadanos, chat, contrataciones, reseñas, denuncias y su atención) y 12 semanas de actividad; reportes de trabajadores, contrataciones y denuncias filtrables y paginados, sin datos personales de ciudadanos, con CSV auditado (`DATA_EXPORTED`); visor de auditoría y de accesos confidenciales; contenido administrable: preguntas frecuentes (`/preguntas-frecuentes`) y documentos legales versionados con borrador, vista previa y publicación inmutable (nuevo permiso `content.manage`). Validación en la nube con transacción revertida: 37/37 sin regresiones. Unit 430. |
| 2026-09-27 | Migración `panel_metricas_contenido` aplicada en la nube con confirmación del usuario (advisors sin observaciones; `/preguntas-frecuentes` y `/privacidad` desde la base). Commit de la Fase 9. |
| 2026-09-27 | A pedido del usuario, las 10 fotos de oficios se reemplazan por fotos de Unsplash (1200×900, con créditos) y la migración `fotos_oficios_unsplash` actualiza las rutas del catálogo (validada en la nube con transacción revertida). |
| 2026-09-27 | Migración `fotos_oficios_unsplash` aplicada en la nube con confirmación del usuario: las 10 rutas del catálogo apuntan a las fotos nuevas (verificado en `/`, `/oficios` y el detalle); se retiran las fotos anteriores. |
