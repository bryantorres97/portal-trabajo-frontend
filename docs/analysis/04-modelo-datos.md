# 04 — Modelo de datos

Entregable §37: 14 Modelo de datos (§27). Es un modelo **inicial**: cada fase lo concreta en migraciones (`supabase/migrations`). Convenciones:
- Tablas en `public`, en snake_case y plural.
- PK `id uuid default gen_random_uuid()`, excepto en tablas append-only de alto volumen, que usan `bigint identity`.
- Columnas `created_at` y `updated_at timestamptz`.
- Estados como tipos `enum` de Postgres cuando son estables, o como `text` + `CHECK` si se espera que evolucionen.
- RLS activada en todas las tablas.

## 1. Diagrama conceptual

```text
  user_identities N─1 ──►┌──────────┐ 1   N ┌────────────┐ N  1 ┌──────────┐
                         │  users   │───────│ user_roles │──────│  roles   │──N:M── permissions
                         └────┬─────┘       └────────────┘      └──────────┘
             1:0..1 ┌─────────┼──────────────┐ 1:0..1
                    ▼                        ▼
           ┌─────────────────┐     ┌──────────────────┐ 1   N ┌─────────────────────┐
           │ client_profiles │     │ worker_profiles  │───────│ worker_status_history│
           └─────────────────┘     └───┬───┬───┬──────┘       └─────────────────────┘
                                       │   │   │ 1:N
                         N:M services  │   │   └──────► worker_documents ──► (Storage)
          categories ◄─ services ◄─ worker_services     │
          (árbol)                          │ 1:N        ▼
                                           └────► training_enrollments ──N:1── trainings
 conversations 1─N conversation_participants N─1 users
      │ 1:N messages
      │ 1:N contracts 1─N contract_terms (versiones inmutables)
      │                 1─0..1 reviews
 reports N─1 users (denunciante) · objeto polimórfico (target_type, target_id) · 1─N report_evidence · 1─N moderation_actions
 notifications, notification_outbox, device_tokens, notification_preferences  N─1 users
 audit_log (append-only) · sensitive_access_log (append-only) · consents (append-only) · legal_documents
```

## 2. Entidades

Se muestran los campos clave, no todos.

### Identidad y roles

| Tabla | Campos importantes | Notas |
|---|---|---|
| `users` | `id`, `email`, `email_verified`, `display_name`, `status` (`ACTIVO`, `BLOQUEADO`, `ELIMINADO`), `blocked_reason`, `master_user_id` (unique, nullable; P-01), `last_login_at` | La persona dentro del portal. Se crea en el primer login (*just-in-time*). **Sin cédula ni teléfono** (ADR-008) |
| `user_identities` | `user_id`, `issuer`, `sub`, `provider` (`COGNITO`, `Google`, `Facebook`), `email`, `email_verified`, `last_login_at`; unique `(issuer, sub)` | Una persona puede tener varias identidades: el `sub` de Cognito cambia según el proveedor de login |
| `roles` | `code` (PK, text: `CLIENTE`, `TRABAJADOR`, `ADMIN_SISTEMA`…), `name`, `is_internal` | Catálogo con seed |
| `permissions` | `code` (PK: `worker.create`, `worker.enable`, `report.evidence.read`…), `description` | Catálogo con seed |
| `role_permissions` | `role_code`, `permission_code` | N:M |
| `user_roles` | `user_id`, `role_code`, `granted_by`, `granted_at`, `revoked_at` | Historial; rol activo = `revoked_at is null` |
| `consents` | `user_id`, `document_code` (`TERMINOS`, `PRIVACIDAD`), `document_version`, `accepted_at`, `ip`, `user_agent` | Append-only (§5, LOPDP) |
| `legal_documents` | `code`, `version`, `content_md`, `published_at` | Versionado de términos y política |

### Perfiles

| Tabla | Campos importantes | Notas |
|---|---|---|
| `client_profiles` | `user_id` (PK/FK), `full_name`, `sector`, `phone` (lo ingresa el usuario; el pool no lo entrega) | Privado |
| `worker_profiles` | `id`, `user_id` (nullable hasta la vinculación), `first_names`, `last_names`, `birth_date`, `phone`, `email`, `address`, `parish`/`sector`, `emergency_contact`, `status`, `status_changed_at`, `public_display_name`, `public_bio`, `photo_path`, `photo_status`, `years_experience`, `is_available`, `availability_note`, `enabled_at`, `suspended_until`, `rating_avg`, `rating_count`, `contracts_completed`, `registered_by`, `registration_point_id`, `search_vector` (tsvector) | Mezcla datos privados y públicos. **La exposición pública es solo por la vista `public_workers`** |
| `worker_status_history` | `worker_id`, `from_status`, `to_status`, `reason`, `actor_id`, `created_at` | Append-only |
| `worker_activation_codes` | `worker_id`, `code_hash`, `expires_at`, `used_at`, `created_by` | Vinculación con la cuenta Cognito |
| `registration_points` | `id`, `name`, `detail`, `active` | Puntos de atención (seed: Mercado Mayorista…) |

### Catálogo

> **Implementado en la Fase 3** (`20260925134749_catalogo_trabajadores_busqueda`): `categories` (grupos) → `services` (oficios, con tarifa referencial y unidad `JORNAL|HORA|OBRA|SERVICIO`), `worker_services`, `parishes` (27 parroquias del cantón, [INFERIDO] P-12) y `worker_profiles` con `search_text` y `search_vector` mantenidos por triggers. La lectura pública pasa solo por `fn_public_search_workers`, `fn_public_worker` y `fn_public_catalog`.

| Tabla | Campos importantes | Notas |
|---|---|---|
| `categories` | `id`, `parent_id` (nullable), `slug` (unique), `name`, `description`, `icon`, `color`, `image_path`, `sort_order`, `active` | Árbol de 2 niveles en el MVP (categoría → subcategoría) |
| `services` | `id`, `category_id`, `slug`, `name`, `description`, `reference_price_min`, `reference_price_max`, `price_unit` (`JORNAL`, `HORA`, `OBRA`, `SERVICIO`), `active` | "Tarifa referencial no vinculante" |
| `worker_services` | `worker_id`, `service_id`, `description`, `years_experience`, `price_min`, `price_max`, `price_unit`, `is_primary` | Especialidades del trabajador |

### Documentos y capacitación

> **Implementado en la Fase 4** (`20260926035024_gestion_trabajadores`): además, `worker_status_history`, `worker_activation_codes` (solo el HMAC del código) y las columnas de moderación de foto y descripción en `worker_profiles`. `trainings` agrega `required`; la evidencia de una inscripción es `evidence_document_id` (un documento del trabajador) en lugar de `evidence_path`. `registration_points` queda pendiente. Detalle en `docs/phases/fase-04-gestion-trabajadores.md`.

| Tabla | Campos importantes | Notas |
|---|---|---|
| `document_types` | `code` (`ANTECEDENTES_PENALES`, `CERT_CAPACITACION`, `CERT_OFICIO`, `OTRO`), `name`, `required`, `has_expiry` | Configurable [PENDIENTE] lista definitiva |
| `worker_documents` | `id`, `worker_id`, `type_code`, `storage_path`, `mime_type`, `size_bytes`, `sha256`, `status` (`PENDIENTE`, `VALIDADO`, `RECHAZADO`, `VENCIDO`, `REEMPLAZADO`), `issued_at`, `expires_at`, `reviewed_by`, `reviewed_at`, `review_note`, `uploaded_by`, `replaces_id` | El binario vive en Storage (§26) |
| `trainings` | `id`, `code`, `name`, `description`, `provider` (`INTERNO`/`EXTERNO`), `external_ref`, `validity_months`, `required_for_category_id` (nullable), `active` | Base evolutiva hacia cursos, módulos y evaluaciones |
| `training_enrollments` | `id`, `worker_id`, `training_id`, `status` (`INSCRITO`, `EN_PROCESO`, `APROBADO`, `REPROBADO`, `ABANDONADO`), `started_at`, `finished_at`, `score`, `result_note`, `valid_until`, `validated_by`, `evidence_path`, `observations` | Cubre todos los campos de §7 |

Evolución futura (no en el MVP): `training_modules`, `assessments`, `attempts`, `certificates`, o bien una integración con un LMS mediante `external_ref`.

### Chat

> **Implementado en la Fase 5** (`20260926144442_chat_notificaciones`) con un cambio: **no hay `conversation_participants`**. Como siempre hay exactamente dos partes, `conversations` guarda por parte el último leído y el bloqueo (`client_/worker_last_read_id`, `client_/worker_blocked_at`), y el trabajador participa con `worker_profiles.user_id`. También se crearon `notifications`, `device_tokens`, `notification_outbox` y una versión mínima de `reports` y `report_reasons`. Detalle en `docs/phases/fase-05-chat.md`.

| Tabla | Campos importantes | Notas |
|---|---|---|
| `conversations` | `id`, `client_user_id`, `worker_id`, `status` (`ACTIVA`, `BLOQUEADA`, `CERRADA`), `last_message_at`, `created_at` | Unique `(client_user_id, worker_id)`: una conversación por par |
| `conversation_participants` | `conversation_id`, `user_id`, `role` (`CLIENTE`/`TRABAJADOR`), `last_read_message_id`, `last_read_at`, `blocked_at`, `muted` | Soporte de lectura y bloqueo por parte |
| `messages` | `id` (bigint), `conversation_id`, `sender_id`, `kind` (`TEXT`, `SYSTEM`), `body` (≤2000), `contract_terms_id` (nullable), `client_message_id` (idempotencia), `hidden_at`, `hidden_by`, `created_at` | Sin UPDATE de `body`. Moderar = ocultar, no borrar |

### Contratación

| Tabla | Campos importantes | Notas |
|---|---|---|
| `contracts` | `id`, `conversation_id`, `client_user_id`, `worker_id`, `service_id`, `status`, `current_terms_id`, `agreed_terms_id`, `agreed_at`, `started_at`, `completed_at`, `cancelled_at`, `cancelled_by`, `cancel_reason`, `expires_at` | Sustituye a `HiringRequest` + `Contract` (simplificación) |
| `contract_terms` | `id`, `contract_id`, `version` (unique por contrato), `proposed_by`, `description`, `scheduled_start`, `scheduled_end`, `location_sector`, `location_detail` (privado entre las partes), `price_amount` numeric(10,2), `price_unit`, `conditions`, `observations`, `content_hash`, `client_accepted_at`, `worker_accepted_at`, `rejected_at`, `created_at` | **Inmutable**: un trigger impide UPDATE salvo en las columnas de aceptación o rechazo, y solo si son NULL |
| `contract_events` | `contract_id`, `event`, `actor_id`, `data jsonb`, `created_at` | Historial de estados, append-only |

### Calificaciones

| Tabla | Campos importantes | Notas |
|---|---|---|
| `reviews` | `id`, `contract_id` (unique), `worker_id`, `author_user_id`, `rating` smallint 1–5, `comment`, `status` (`PUBLICADA`, `OCULTA`), `edited_at`, `hidden_by`, `hidden_reason` | `CHECK (array_length(regexp_split_to_array(trim(comment), '\s+'),1) <= 200)`. Se funden `Rating` y `Review` |

**[CONFIRMADO, GAD 2026-09-24]** El trabajador califica al cliente (RN-20, ADR-011). `reviews` tendrá `direction` (`CLIENTE_A_TRABAJADOR` / `TRABAJADOR_A_CLIENTE`) y unique `(contract_id, direction)`. Las calificaciones `TRABAJADOR_A_CLIENTE` **nunca** se exponen en vistas públicas: solo las leen usuarios con rol `TRABAJADOR` activo y el personal del GAD. Se aplica en el dominio y con RLS.

**[RECOMENDACIÓN]** En lugar de los 6 parámetros del prototipo (`EvaluacionFlow`), el MVP usa una sola escala general de 1 a 5. Los sub-criterios pueden llegar después como `review_scores (review_id, criterion, score)`.

### Denuncias y moderación

| Tabla | Campos importantes | Notas |
|---|---|---|
| `report_reasons` | `code`, `target_type`, `label`, `severity` | Configurable |
| `reports` | `id`, `reporter_id`, `target_type` (`WORKER`, `CLIENT`, `REVIEW`, `MESSAGE`, `CONVERSATION`, `CONTRACT`), `target_id`, `reported_user_id`, `reason_code`, `description`, `status`, `priority`, `assigned_to`, `resolution`, `resolution_note`, `parent_report_id`, `created_at`, `resolved_at` | Objeto polimórfico validado en el dominio |
| `report_evidence` | `report_id`, `kind` (`FILE`, `MESSAGE_REF`, `NOTE`), `storage_path`, `message_id`, `note`, `added_by` | |
| `report_events` | `report_id`, `from_status`, `to_status`, `actor_id`, `note` | Append-only |
| `moderation_actions` | `id`, `report_id` (nullable), `target_type`, `target_id`, `action` (`ADVERTENCIA`, `OCULTAR_CONTENIDO`, `RESTAURAR_CONTENIDO`, `SUSPENSION_TEMPORAL`, `DESHABILITAR_TRABAJADOR`, `BLOQUEAR_USUARIO`, `DESBLOQUEAR`), `reason`, `starts_at`, `ends_at`, `actor_id` | |
| `user_blocks` | `blocker_id`, `blocked_id`, `created_at` | Bloqueo entre usuarios |

### Notificaciones

| Tabla | Campos importantes |
|---|---|
| `notification_outbox` | `id`, `event`, `recipient_id`, `payload jsonb`, `status` (`PENDIENTE`, `ENVIADA`, `FALLIDA`), `attempts`, `next_attempt_at`, `last_error` |
| `notifications` | `id`, `user_id`, `type`, `title`, `body`, `link`, `read_at`, `created_at` |
| `device_tokens` | `id`, `user_id`, `platform` (`WEB`, `ANDROID`, `IOS`), `token` (unique), `last_seen_at`, `disabled_at` |
| `notification_preferences` | `user_id`, `channel`, `event`, `enabled` |

### Auditoría

| Tabla | Campos importantes | Notas |
|---|---|---|
| `audit_log` | `id` bigint, `occurred_at`, `actor_id`, `actor_roles text[]`, `action` (p. ej. `WORKER_ENABLED`), `resource_type`, `resource_id`, `result` (`SUCCESS`, `DENIED`, `ERROR`), `ip inet`, `user_agent`, `request_id`, `metadata jsonb` | **Append-only**: REVOKE UPDATE/DELETE y trigger que lanza una excepción. Particionar por mes cuando pase de ~10M filas |
| `sensitive_access_log` | `id`, `occurred_at`, `actor_id`, `resource_type`, `resource_id`, `report_id`, `justification` (not null), `request_id` | Acceso a conversaciones y documentos |

## 3. Cardinalidades clave

- `users` 1 — 0..1 `client_profiles`; `users` 1 — 0..1 `worker_profiles`.
- `worker_profiles` N — M `services` (vía `worker_services`); `services` N — 1 `categories`; `categories` 1 — N `categories` (hijos).
- `conversations`: exactamente 1 cliente y 1 trabajador. Cardinalidad 1 — N con `messages` y 1 — N con `contracts` (puede haber varias contrataciones con el mismo trabajador a lo largo del tiempo).
- `contracts` 1 — N `contract_terms` (versiones); `contracts` 1 — 0..1 `reviews`.
- `reports` N — 1 `users` (denunciante); `reports` 1 — N `report_evidence`, `moderation_actions`.

## 4. Estados

Definidos en `01-negocio.md` §6. En la base se implementan como enums: `worker_status`, `contract_status`, `report_status`, `document_status` y `enrollment_status`. Las transiciones válidas se imponen en el dominio (TypeScript) y se refuerzan con triggers en las transiciones críticas: por ejemplo, habilitar exige una inscripción `APROBADO` vigente.

## 5. Índices recomendados

| Tabla | Índice | Motivo |
|---|---|---|
| `user_identities` | unique `(issuer, sub)`; `(user_id)` | Resolución del usuario en cada request |
| `worker_profiles` | parcial `(status) where status='HABILITADO'`; GIN `(search_vector)`; GIN trigram `(public_display_name)`; `(sector)`; `(rating_avg desc)` | Búsqueda pública |
| `worker_services` | `(service_id, worker_id)` | Filtro por servicio |
| `services` | `(category_id)` | |
| `categories` | `(parent_id)`, unique `(slug)` | |
| `conversations` | unique `(client_user_id, worker_id)`; `(worker_id, last_message_at desc)` | Bandeja |
| `conversation_participants` | `(user_id)` | Bandeja del usuario, RLS |
| `messages` | `(conversation_id, id desc)`; unique `(sender_id, client_message_id)` | Historial paginado, idempotencia |
| `contracts` | `(client_user_id, status)`, `(worker_id, status)`, parcial `(expires_at) where status in ('PROPUESTA_ENVIADA','ACEPTADA_PARCIAL')` | Paneles y expiración |
| `contract_terms` | unique `(contract_id, version)` | |
| `reviews` | unique `(contract_id)`; `(worker_id, created_at desc) where status='PUBLICADA'` | |
| `reports` | `(status, priority, created_at)`, `(assigned_to)`, `(target_type, target_id)` | Bandeja admin |
| `notifications` | `(user_id, read_at, created_at desc)` | |
| `notification_outbox` | parcial `(next_attempt_at) where status='PENDIENTE'` | Dispatcher |
| `audit_log` | `(occurred_at desc)`, `(actor_id, occurred_at desc)`, `(resource_type, resource_id)` | Consulta y exportación |
| Todas las FK | Índice en la columna FK | Joins y RLS |

## 6. Restricciones

- `reviews.rating between 1 and 5`; el comentario tiene como máximo 200 palabras (CHECK) y 2 000 caracteres.
- `messages.body` tiene entre 1 y 2 000 caracteres cuando `kind='TEXT'`.
- `contract_terms.price_amount >= 0`; `scheduled_end >= scheduled_start`.
- Las cuentas **no almacenan cédula** (ADR-008). El documento de identidad (cédula o pasaporte) solo está en `worker_profiles`, como dato privado y único (ADR-019). Lo verifica un test pgTAP.
- `conversations`: `client_user_id` distinto del `user_id` del trabajador (no se permite conversar consigo mismo).
- `reports`: `reporter_id` distinto de `reported_user_id`; unique parcial `(reporter_id, target_type, target_id) where status in ('ABIERTA','EN_REVISION','EN_ESPERA_DE_INFORMACION','ESCALADA')`.
- Triggers de inmutabilidad en `contract_terms`, `audit_log`, `sensitive_access_log`, `consents`, `worker_status_history` y `contract_events`.
- `reviews` solo se puede insertar si el contrato está `FINALIZADA` y el autor es su cliente. Se verifica en el dominio y con un trigger.

## 7. Consideraciones de privacidad

| Dato | Clasificación | Visible para |
|---|---|---|
| Nombre público, foto aprobada, bio, servicios, sector o parroquia (aproximado), años de experiencia, calificación, número de contrataciones, reseñas publicadas, insignia de habilitado | **Público** | Todos (vista `public_workers`) |
| Fecha de nacimiento, dirección exacta, teléfono, email, contacto de emergencia | **Personal** | El propio titular y el personal GAD con permiso `worker.read.private` (auditado) |
| Documentos (certificados, antecedentes si se exigen, P-06) | **Sensible** | Titular, `ADMIN_TRABAJADORES`, `OPERADOR_PUNTO` (solo los que subió) · URL firmada de 5 min · cada acceso se audita |
| Mensajes de chat | **Confidencial** | Solo los participantes. El GAD solo con denuncia + justificación (`sensitive_access_log`) |
| Ubicación exacta del trabajo (`contract_terms.location_detail`) | **Personal** | Solo las partes del contrato |
| Nombre del autor de una reseña | **Público parcial** | Se muestra como "María G." (inicial del apellido) |

- **[CONFIRMADO, RN-19]** El teléfono y el WhatsApp del trabajador **no** se muestran nunca a clientes. El contacto se hace solo por el chat interno, que mantiene la trazabilidad.
- Retención [PENDIENTE jurídico]: mensajes (N años tras la última actividad), documentos (mientras el trabajador esté activo + N años), auditoría (≥5 años). Tras la eliminación de una cuenta, se anonimizan los datos personales y se conserva el registro de auditoría con un ID seudónimo.
