# 08 — Roadmap por fases, dependencias y testing

Entregables §37: 23 Roadmap · 24 Dependencias entre fases. Cubre también §33, §34 y §40.

Cada fase indica objetivo, funcionalidades, componentes, dependencias, decisiones, entregables, pruebas, criterios de aceptación y riesgos. Al iniciar una fase se crea `docs/phases/fase-XX-*.md` con el checklist de tareas.

---

## Fase 0 — Descubrimiento y definición ✅ (documentación)

- **Objetivo:** entender el negocio y el prototipo, y definir arquitectura, modelo, estados y roadmap.
- **Entregables:** `docs/analysis/01..09`, `DECISIONS.md` y `PROGRESS.md`.
- **Criterio de aceptación:** revisión del usuario y respuestas del GAD a las preguntas bloqueantes (`09-riesgos-preguntas.md`).
- **Riesgo:** que las respuestas del GAD cambien las reglas de negocio. Mitigación: las reglas se diseñaron configurables (estados, tipos de documento, plazos).

## Fase 1 — Fundación técnica

- **Objetivo:** tener un proyecto Next.js listo para construir funcionalidades con seguridad desde el primer commit.
- **Funcionalidades:**
  - estructura `src/`;
  - sistema de diseño portado;
  - shell público y páginas institucionales;
  - validación de entorno;
  - Supabase local con migración base (users, roles, permisos, auditoría);
  - login, callback y logout con Cognito;
  - `proxy.ts`;
  - logger;
  - tests y CI.
- **Componentes:** `src/app/(public)`, `src/app/api/auth`, `src/server/{auth,audit,db}`, `src/lib/env.ts`, `supabase/`, `.github/workflows/ci.yml`.
- **Dependencias:** Fase 0. Pool dev de Cognito (B2) para probar el login real.
- **Decisiones:** ADR-001, 002, 005, 006, 007.
- **Entregables:** app que compila, páginas públicas, migraciones, guías de setup.
- **Pruebas:**
  - unit de `env`, `verify` (JWT firmado con JWKS de prueba), `authorize`, utilidades;
  - test SQL de inmutabilidad de `audit_log`;
  - smoke con Playwright de las páginas públicas.
- **Criterios de aceptación:**
  - lint, typecheck, test y build en verde;
  - `supabase db reset` sin errores;
  - login contra el pool dev (si existe).
- **Riesgos:** cambios de API en Next 16 (se mitiga consultando los docs incluidos en el paquete) y ausencia del pool dev.

## Fase 2 — Usuarios y perfiles

- **Objetivo:** que las identidades de Cognito se conviertan en usuarios del portal con roles y perfiles.
- **Funcionalidades:**
  - alta *just-in-time* de `users` en el primer login;
  - consentimiento versionado (`legal_documents`, `consents`);
  - perfil de cliente;
  - panel `/cuenta`;
  - vinculación del trabajador por código de activación;
  - gestión de roles internos (`/admin/usuarios`, solo `ADMIN_SISTEMA`);
  - bloqueo de usuario;
  - cierre global de sesión.
- **Componentes:** `src/server/domain/users`, `repositories/users`, `app/cuenta`, `app/admin/usuarios`, `/api/v1/me`.
- **Dependencias:** Fase 1.
- **Decisiones:** P-04 (acceso y MFA del personal GAD), P-20 (catálogo de roles del GAD). Vinculación de identidades entre proveedores con confirmación explícita (ADR-008).
- **Pruebas:**
  - autorización: un cliente no accede a `/admin`;
  - consentimiento obligatorio antes de acciones transaccionales;
  - código de activación de un solo uso y con expiración.
- **Criterios de aceptación:**
  - el primer login crea el usuario con rol `CLIENTE`;
  - el admin asigna roles y queda auditado;
  - un usuario bloqueado recibe 403.
- **Riesgos:** pool compartido con atributos desconocidos.

## Fase 3 — Catálogo y búsqueda

- **Objetivo:** descubrir trabajadores habilitados.
- **Funcionalidades:**
  - categorías jerárquicas y servicios, con CRUD admin;
  - vista `public_workers`;
  - búsqueda con FTS en español + `pg_trgm` + filtros (categoría, servicio, sector, disponibilidad, experiencia, calificación) + orden + paginación;
  - páginas `/oficios`, `/oficios/[slug]`, `/buscar`, `/trabajadores/[id]` con SSR, metadata, JSON-LD y sitemap.
- **Componentes:** `domain/catalog`, `domain/search`, `app/(public)/…`, `/api/v1/categories|services|workers`.
- **Dependencias:** Fase 2 (roles admin) y un seed de trabajadores habilitados para desarrollo.
- **Decisiones:** configuración de texto en español (`unaccent` + `spanish`); lista de sectores y parroquias de Ambato [PENDIENTE P-12].
- **Pruebas:**
  - búsqueda (acentos, errores tipográficos);
  - un no habilitado **nunca** aparece;
  - rendimiento: p95 < 300 ms con 5k trabajadores de seed.
- **Criterios de aceptación:**
  - Lighthouse SEO ≥ 95 y Accesibilidad ≥ 95 en las páginas públicas;
  - filtros combinables y URL compartible.
- **Riesgos:** calidad de la búsqueda con pocos datos.

## Fase 4 — Gestión de trabajadores

- **Objetivo:** ciclo de vida administrativo completo, desde el registro hasta la habilitación.
- **Funcionalidades:**
  - alta presencial (wizard: datos personales → contacto → servicios → documentos → resumen);
  - detección de posibles duplicados (teléfono, email, nombres);
  - documentos con Storage privado y URL firmada;
  - cursos e inscripciones de capacitación;
  - máquina de estados del trabajador con historial;
  - habilitar, suspender, rechazar, inactivar;
  - emisión del código de activación;
  - aprobación de foto y bio pública;
  - edición limitada del perfil por el propio trabajador.
- **Componentes:** `domain/workers` (state-machine), `domain/documents`, `domain/training`, `server/storage`, `app/admin/trabajadores/**`.
- **Dependencias:** Fases 2 y 3.
- **Decisiones:** P-06 (documentos), P-11 (quién habilita, separación de funciones), P-13 (proceso de capacitación).
- **Pruebas:**
  - todas las transiciones válidas e inválidas;
  - habilitar sin capacitación aprobada → error;
  - subida con MIME falso → rechazo;
  - URL firmada que expira;
  - auditoría de cada acción.
- **Criterios de aceptación:**
  - un operador registra un trabajador en menos de 10 min;
  - el trabajador habilitado aparece en la búsqueda y el suspendido desaparece de inmediato.
- **Riesgos:** requisitos documentales cambiantes. Mitigación: `document_types` configurable.

## Fase 5 — Chat

- **Objetivo:** comunicación segura en tiempo real entre cliente y trabajador.
- **Funcionalidades:**
  - crear conversación;
  - enviar y listar mensajes (paginados);
  - tiempo real (Broadcast privado);
  - estado de lectura;
  - bloqueo;
  - denunciar mensaje (punto de enganche para la Fase 8);
  - rate limiting;
  - notificaciones in-app y outbox;
  - push web con FCM.
- **Componentes:** `domain/chat`, `domain/notifications`, `/api/v1/conversations`, `/api/v1/realtime/token`, `components/chat`, pg_cron para el outbox.
- **Dependencias:** Fases 2–3 (usuarios y trabajadores habilitados); ADR-004 resuelto (Lambda o JWT propio).
- **Pruebas:**
  - un tercero no puede leer ni suscribirse (RLS de Realtime);
  - concurrencia: orden e idempotencia con 2 emisores simultáneos;
  - el bloqueo impide el envío;
  - se aplican los límites;
  - reconexión.
- **Criterios de aceptación:**
  - entrega p95 < 1 s;
  - ningún endpoint admin expone mensajes sin denuncia.
- **Riesgos:** complejidad del token de Realtime con Cognito y costo de las conexiones concurrentes.

## Fase 6 — Contrataciones

- **Objetivo:** formalizar acuerdos con condiciones inmutables.
- **Funcionalidades:**
  - propuesta y contrapropuesta versionada desde el chat;
  - aceptación bilateral con hash;
  - rechazo, cancelación y expiración (pg_cron);
  - inicio y finalización con confirmación;
  - disputa;
  - "Mis contrataciones" para ambas partes;
  - tarjetas de sistema en el chat;
  - notificaciones.
- **Componentes:** `domain/contracts` (state-machine), `/api/v1/contracts`, `components/contracts`.
- **Dependencias:** Fase 5.
- **Decisiones:** P-07 (pagos), plazos de expiración y auto-confirmación.
- **Pruebas:**
  - aceptar una versión obsoleta → 409;
  - aceptaciones concurrentes (bloqueo `SELECT … FOR UPDATE`);
  - los términos no se pueden modificar (trigger);
  - expiración;
  - solo las partes acceden.
- **Criterios de aceptación:**
  - la contratación solo existe con doble aceptación de la misma versión;
  - el historial completo es reconstruible.
- **Riesgos:** reglas ambiguas de cancelación tardía.

## Fase 7 — Calificaciones

- **Objetivo:** reputación basada en contrataciones reales.
- **Funcionalidades:**
  - reseña 1–5 + comentario ≤200 palabras (frontend, backend y base);
  - edición durante 7 días;
  - promedio y conteo desnormalizados en `worker_profiles`;
  - lista pública;
  - denunciar reseña;
  - ocultar y restaurar (moderador).
- **Dependencias:** Fase 6.
- **Pruebas:**
  - 201 palabras → rechazo en los 3 niveles;
  - doble reseña → rechazo;
  - reseña sin contrato finalizado → rechazo;
  - recálculo del promedio al ocultar.
- **Criterios de aceptación:** es imposible reseñar sin una contratación finalizada.
- **Riesgos:** reseñas coordinadas entre conocidos (se mitiga con denuncias y métricas de anomalías después).

## Fase 8 — Denuncias y moderación

- **Objetivo:** gestión de casos con acceso auditado a la evidencia.
- **Funcionalidades:**
  - crear denuncia (todos los tipos) con evidencia;
  - seguimiento por parte del denunciante;
  - bandeja admin con asignación, prioridad y estados;
  - acceso a la conversación con justificación (`sensitive_access_log`);
  - acciones de moderación con vigencia;
  - notificaciones;
  - escalamiento.
- **Dependencias:** Fases 5–7.
- **Decisiones:** P-14 (catálogo de acciones y sanciones, plazos de respuesta).
- **Pruebas:**
  - un moderador sin denuncia no puede leer mensajes;
  - cada acceso queda registrado;
  - la suspensión temporal expira;
  - no se permite la auto-denuncia ni la denuncia duplicada.
- **Criterios de aceptación:** cada decisión es trazable en la auditoría.
- **Riesgos:** carga operativa del equipo del GAD.

## Fase 9 — Panel administrativo

- **Objetivo:** gestión y visibilidad para el GAD.
- **Funcionalidades:**
  - dashboard con KPI (trabajadores por estado, habilitados por categoría, conversaciones, contrataciones, denuncias abiertas y tiempos de resolución);
  - reportes filtrables y CSV;
  - visor de auditoría;
  - páginas FAQ y legales administrables;
  - comunicados [POST-MVP].
- **Dependencias:** Fases 4–8.
- **Pruebas:** exactitud de las métricas con datos de seed, permisos por rol y auditoría de las exportaciones.
- **Criterio de aceptación:** un supervisor obtiene los reportes sin tener que hacer consultas SQL.

## Fase 10 — Calidad y producción

- **Objetivo:** dejar el sistema listo para operar en producción.
- **Funcionalidades:**
  - E2E completos;
  - pruebas de seguridad (OWASP ZAP baseline, revisión de RLS con `supabase db advisors`);
  - pruebas de carga (k6) en búsqueda y chat;
  - auditoría de accesibilidad (axe + revisión manual);
  - CSP estricta;
  - backups y PITR;
  - monitoreo (Sentry u OpenTelemetry) y alertas;
  - runbooks;
  - OpenAPI;
  - staging → producción;
  - capacitación de usuarios GAD.
- **Dependencias:** todas. Pool institucional y dominio (P-02, P-03).
- **Criterios de aceptación:**
  - 0 vulnerabilidades altas;
  - RPO ≤ 24 h (PITR ≤ 5 min con plan Pro);
  - checklist de producción de Next completo.

## Fase 11 — Aplicación móvil futura (arquitectura)

- **Objetivo:** documentar cómo la app Flutter (`../portal_empleo_mobile_app`) consume la plataforma.
- **Entregables:**
  - OpenAPI de `/api/v1`;
  - app client público de Cognito con PKCE y deep links;
  - registro de `device_tokens`;
  - suscripción a Realtime con token corto;
  - lista de endpoints necesarios (perfil, disponibilidad, conversaciones, contratos, historial, notificaciones);
  - estrategia de versionado de la API (`/v2` solo con cambios incompatibles).
- **Sin desarrollo móvil** en esta fase.

---

## 24. Dependencias entre fases

```text
F0 ─► F1 ─► F2 ─┬─► F3 ─┬─► F4 ─────────────┐
                │       └─► F5 ─► F6 ─► F7 ─┤
                │                           ▼
                └──────────────────────────► F8 ─► F9 ─► F10 ─► (F11 doc)
```

- Las Fases 4 y 5 pueden avanzar en paralelo tras la Fase 3 si hay más de un desarrollador.
- La Fase 8 necesita que existan los objetos denunciables (5–7). El enganche "Denunciar" se deja preparado desde la Fase 5.

## Estrategia de testing (§34)

| Tipo | Herramienta | Alcance |
|---|---|---|
| Unit | Vitest | Dominio: máquinas de estado, validaciones (200 palabras, formatos), autorización, utilidades |
| Integración | Vitest + Supabase local | Repositorios y funciones SQL, RLS, triggers de inmutabilidad, transacciones con auditoría |
| API | Vitest (invocando los handlers) o supertest contra `next start` | Contratos de `/api/v1`, errores RFC 9457, rate limits |
| Autorización | Matriz generada (rol × permiso × endpoint) | Cada endpoint admin rechaza a los roles sin permiso; IDOR: un usuario A no accede a recursos de un usuario B |
| E2E | Playwright | Flujos críticos (abajo), en móvil y escritorio |
| Seguridad | ZAP baseline, `pnpm audit`, gitleaks, CodeQL, `supabase db advisors` | CI + antes de producción |
| Concurrencia (chat y contratos) | Scripts Vitest con clientes paralelos, k6 | Orden, idempotencia, doble aceptación |
| Notificaciones | Unit del dispatcher con adaptador FCM falso; integración del outbox | Reintentos y desactivación de tokens |
| Accesibilidad | axe-core en Playwright + revisión manual | Páginas públicas y formularios |

**Flujos críticos con pruebas automatizadas obligatorias:**
1. Login → alta just-in-time → consentimiento.
2. Registro → documentos → capacitación → habilitación → aparece en la búsqueda.
3. Búsqueda → perfil → conversación → mensajes en tiempo real.
4. Propuesta → contrapropuesta → doble aceptación → finalización → reseña.
5. Denuncia de un mensaje → revisión con acceso auditado → acción → resolución.
6. Suspensión → desaparece de la búsqueda y no puede aceptar contratos.
