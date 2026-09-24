# 02 — Arquitectura, Supabase, API, chat y notificaciones

Entregables §37: 10 Arquitectura propuesta · 13 Análisis de Supabase · 15 API propuesta · 16 Estrategia de realtime/chat · 17 Sistema de notificaciones.

---

## 10. Arquitectura propuesta

```text
          Navegador (ciudadano, trabajador, GAD)            Futura app Flutter (trabajador)
                       │  HTTPS (cookie de sesión httpOnly)            │ HTTPS (Bearer access token)
                       ▼                                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                               Next.js 16 (un despliegue)                              │
│  ┌──────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │ Portal público (SSR/ │  │ Paneles /cuenta y /admin │  │ API REST /api/v1/*       │  │
│  │ SEO, cacheable)      │  │ Server Components +      │  │ Route Handlers (JSON)    │  │
│  │ src/app/(public)     │  │ Server Actions           │  │ src/app/api/v1           │  │
│  └──────────┬───────────┘  └────────────┬────────────┘  └────────────┬────────────┘  │
│             └──────────────────────────┬┴──────────────────────────────┘              │
│                                        ▼                                              │
│  ┌──────────────────────────── src/server (sin React) ─────────────────────────────┐ │
│  │ auth/ (verificación de JWT de Cognito, sesión, authorize)  domain/ (reglas,     │ │
│  │ máquinas de estado, validación Zod)  repositories/ (SQL vía supabase-js)         │ │
│  │ audit/ (logAudit)  notifications/ (outbox + adaptadores)  storage/ (firmas)      │ │
│  └───────────────┬──────────────────────────────┬───────────────────────────────────┘ │
│  proxy.ts: solo redirecciones optimistas (sesión presente o ausente)                 │
└──────────────────┼──────────────────────────────┼─────────────────────────────────────┘
                   │                              │
       ┌───────────▼─────────┐       ┌────────────▼──────────────────────────┐
       │ AWS Cognito         │       │ Supabase (por ambiente)                │
       │ Hosted/Managed Login│       │ Postgres + RLS · Storage (privado) ·   │
       │ JWKS, MFA, recupera-│       │ Realtime (chat) · pg_cron (expiraciones│
       │ ción                │       │ y outbox)                              │
       └─────────────────────┘       └────────────────────────────────────────┘
                                                  │ outbox
                                     ┌────────────▼──────────┐
                                     │ Firebase Cloud Msg.   │  (+ email/SMS/WhatsApp futuros)
                                     └───────────────────────┘
```

Principios:
1. **API-first.** Toda regla de negocio vive en `src/server/domain`. La web y la API HTTP son dos "adaptadores" de la misma capa.
2. **El servidor es el único cliente de la base de datos.** Usa la *secret key* de Supabase, que nunca llega al navegador. RLS se mantiene activada como defensa en profundidad.
3. **Identidad externa, autorización interna.** Cognito autentica y Postgres decide qué puede hacer cada usuario (ADR-006).
4. **Efectos secundarios desacoplados.** Notificaciones y tareas se encolan en la tabla `notification_outbox` dentro de la misma transacción que el cambio de negocio (patrón *transactional outbox*).
5. **Auditoría por diseño.** Cada caso de uso administrativo llama a `logAudit` y el registro no se puede modificar.

Estructura de carpetas objetivo:

```text
src/
├── app/
│   ├── (public)/            # inicio, oficios, trabajadores/[id], cómo funciona, privacidad…
│   ├── (auth)/              # páginas de login/consentimiento
│   ├── cuenta/              # panel cliente y trabajador (Fase 2+)
│   ├── admin/               # panel GAD (Fase 4+)
│   └── api/
│       ├── auth/            # login, callback, logout (OIDC)
│       └── v1/              # API pública versionada
├── components/{ui,site,dashboard,chat,…}
├── server/{auth,audit,db,domain,repositories,notifications,storage}
├── lib/                     # utilidades compartidas cliente/servidor (cn, env pública, formatos)
├── hooks/
└── content/                 # textos institucionales estáticos
```

## 13. Análisis de Supabase

| Capacidad | Uso | Justificación |
|---|---|---|
| **PostgreSQL** | Todos los datos de negocio | Relacional, transacciones, constraints, FTS, `pg_trgm` para búsqueda difusa |
| **RLS** | Activada en **todas** las tablas. Políticas de lectura pública solo en vistas públicas del catálogo | Defensa en profundidad; indispensable si en algún momento el cliente accede directamente (Realtime) |
| **Storage** | Buckets `worker-documents` (privado), `report-evidence` (privado), `profile-photos` (público solo con foto aprobada) y `training-evidence` (privado) | No se guardan binarios en la base (§26). URLs firmadas de vida corta |
| **Realtime** | Canal privado por conversación para mensajes nuevos, lectura y typing | Evita montar WebSockets propios |
| **pg_cron** | Expiración de propuestas, procesamiento del outbox, recálculo de métricas | Tareas internas sin infraestructura adicional |
| **Edge Functions** | No se usan en el MVP | La lógica vive en Next. Se reevalúa para webhooks o procesos largos |
| **Supabase Auth** | **No se usa** para identidad | Identidad centralizada en Cognito (§20). Solo se aprovecha *third-party auth* para validar JWT (ADR-004) |
| **GraphQL / Data API** | Deshabilitado o sin exposición de tablas de negocio | Reduce la superficie de ataque. Desde 2026-04 las tablas nuevas no se exponen por defecto |

Mapeo de responsabilidades (§20):

```text
Identidad            → AWS Cognito
Autorización negocio → Postgres (roles/permissions/user_roles) evaluada en src/server/auth
Datos de negocio     → Supabase Postgres
Archivos             → Supabase Storage (privado + URLs firmadas)
Tiempo real          → Supabase Realtime
Notificaciones push  → Firebase Cloud Messaging (vía outbox)
```

Riesgos: dependencia de un proveedor SaaS (mitigada porque es Postgres estándar y exportable) y residencia de datos (**[PENDIENTE]** confirmar si el GAD exige alojamiento en Ecuador; Supabase ofrece regiones en EE. UU., Europa y Brasil, entre otras).

## 15. API propuesta (`/api/v1`)

Convenciones:
- JSON y errores en formato RFC 9457 (`application/problem+json`).
- Paginación por cursor (`?cursor=&limit=`).
- Header `X-Request-Id`.
- Autenticación con cookie (web) o `Authorization: Bearer` (móvil).
- Idempotencia con `Idempotency-Key` en creaciones críticas: propuestas y aceptaciones.
- Contrato documentado con OpenAPI, generado desde los esquemas Zod en la Fase 10.

| Recurso | Endpoints principales | Acceso |
|---|---|---|
| Catálogo | `GET /categories`, `GET /services` | Público |
| Trabajadores (público) | `GET /workers?q=&category=&service=&sector=&available=&minRating=&sort=`, `GET /workers/{id}` | Público (solo `HABILITADO`) |
| Reseñas públicas | `GET /workers/{id}/reviews` | Público |
| Mi cuenta | `GET/PATCH /me`, `POST /me/consents`, `GET/PATCH /me/worker-profile`, `PUT /me/availability`, `POST /me/devices` (token FCM) | Autenticado |
| Vinculación trabajador | `POST /me/worker-link` (código de activación) | Autenticado |
| Conversaciones | `GET/POST /conversations`, `GET /conversations/{id}/messages`, `POST /conversations/{id}/messages`, `POST /conversations/{id}/read`, `POST /conversations/{id}/block` | Participantes |
| Contratos | `POST /conversations/{id}/contracts`, `GET /contracts`, `GET /contracts/{id}`, `POST /contracts/{id}/terms` (nueva versión), `POST /contracts/{id}/accept`, `/reject`, `/cancel`, `/start`, `/complete`, `/dispute` | Partes |
| Reseñas | `POST /contracts/{id}/review`, `PATCH /reviews/{id}` | Cliente del contrato |
| Denuncias | `POST /reports`, `GET /reports` (propias), `GET /reports/{id}` | Autenticado |
| Notificaciones | `GET /notifications`, `POST /notifications/read` | Autenticado |
| Realtime | `POST /realtime/token` (token de corta vida para Realtime; ADR-004) | Autenticado |
| **Admin** (`/api/v1/admin/*`) | `workers` (CRUD, `/transitions`, `/documents`, `/activation-code`), `trainings`, `enrollments`, `reports` (bandeja, `/assign`, `/evidence-access`, `/actions`, `/resolve`), `moderation`, `categories`, `services`, `users/{id}/roles`, `audit`, `metrics`, `exports` | Según permiso |

Autorización por endpoint: `authorize(user, "worker.enable")`. Permiso granular, nunca comparación directa con nombres de rol.

## 16. Estrategia de realtime y chat

- **Persistencia primero.** El mensaje se envía con `POST /conversations/{id}/messages`, pasando por la API: se valida, se aplica rate limiting, se sanitiza y se inserta en `messages`. Nunca se inserta desde el navegador.
- **Difusión.** Opciones:
  - A: Realtime *Postgres Changes* sobre `messages`, filtrado por `conversation_id`.
  - B **[RECOMENDACIÓN]**: el servidor publica en un canal *Broadcast* privado `conversation:{id}` después de insertar. Es más escalable y no depende de replicación por fila.
  - En ambos casos la autorización del canal se hace con políticas RLS sobre `realtime.messages`, que verifican que el `sub` del JWT sea participante.
- **Token para Realtime:** ver ADR-004. El navegador obtiene el token por `POST /api/v1/realtime/token` y lo renueva antes de que expire.
- **Estado de lectura:** `conversation_participants.last_read_message_id` y `last_read_at`, más un evento broadcast `read`.
- **Anti-abuso:**
  - Límite de mensajes por minuto por usuario y de conversaciones nuevas por día (tabla `rate_limits` o `upstash/ratelimit` si se despliega en serverless).
  - Longitud máxima de 2 000 caracteres.
  - Solo texto en el MVP, sin adjuntos.
  - Detección de enlaces (se muestran como texto no clicable si el emisor no es verificado).
- **Bloqueo:** `conversation_participants.blocked_at`. El envío se rechaza en la API si alguna de las partes bloqueó.
- **Privacidad:** el personal del GAD no tiene políticas de lectura sobre `messages`. El acceso por denuncia pasa por un endpoint admin que registra en `sensitive_access_log` y devuelve solo los mensajes del rango relevante.
- **Mensajes del sistema:** eventos de contrato (propuesta, aceptación) se insertan como `messages.kind = 'system'` con referencia a `contract_terms_id`, para que el chat muestre las tarjetas de propuesta.
- **Pruebas de concurrencia:** dos clientes que envían simultáneamente mantienen el orden por `(created_at, id)`, sin duplicados gracias a `client_message_id` único por emisor (idempotencia).

## 17. Sistema de notificaciones

```text
Caso de uso ──(misma transacción)──► notification_outbox (evento, destinatario, payload, estado)
                                            │ pg_cron / worker cada N s
                                            ▼
                               NotificationDispatcher (src/server/notifications)
                               ├── InAppChannel     → tabla notifications (siempre)
                               ├── PushChannel      → FCM HTTP v1 (tokens en device_tokens)
                               ├── EmailChannel     → futuro (SES)
                               └── SmsChannel/WhatsApp → futuro
```

- Eventos del MVP: `CONVERSATION_STARTED`, `MESSAGE_RECEIVED` (con agrupación para no enviar un push por mensaje), `TERMS_PROPOSED`, `CONTRACT_ACCEPTED`, `CONTRACT_REJECTED`, `CONTRACT_UPDATED`, `CONTRACT_CANCELLED`, `WORKER_TRAINING_UPDATED`, `WORKER_ENABLED`, `WORKER_SUSPENDED`, `REPORT_CREATED` (para el equipo GAD), `REPORT_RESOLVED` y `ANNOUNCEMENT` (post-MVP).
- Preferencias por usuario y canal (`notification_preferences`). La notificación in-app no se puede desactivar.
- Reintentos con backoff exponencial. Los tokens FCM inválidos se desactivan automáticamente.
- Plantillas de texto en código, en español, sin datos sensibles en el payload push: "Tienes un nuevo mensaje", no el contenido.
- Web push con FCM requiere service worker y permiso del navegador. **[RECOMENDACIÓN]** En el MVP se prioriza la notificación in-app en tiempo real y el push web se activa en la Fase 5, al final. El push móvil llega con la app (Fase 11).
- Cada ambiente usa un proyecto Firebase propio.
