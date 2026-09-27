# Fase 6 — Contrataciones (checklist)

Objetivo, criterios y riesgos en `docs/analysis/08-roadmap.md`. **Estado: IMPLEMENTADA (2026-09-26)**. Migración validada en Supabase dev dentro de una transacción revertida (pgTAP 73/73 y chat 37/37) y **aplicada en la nube** (2026-09-26; advisors sin observaciones, tarea pg_cron creada). Falta la validación manual.

## Decisiones de diseño

| Tema | Decisión | Motivo |
|---|---|---|
| Modelo (ADR-014) | `contracts` + `contract_terms` (versiones) + `contract_events` (historial). La propuesta cuenta como aceptación de quien la envía; `CONTRATADA` solo con ambas aceptaciones en la misma versión | RN-04 sin pasos vacíos |
| Estados | `PROPUESTA_ENVIADA`, `CONTRATADA`, `EN_CURSO`, `FINALIZACION_PENDIENTE`, `EN_DISPUTA`, `FINALIZADA`, `CANCELADA`, `RECHAZADA`, `EXPIRADA`. Transiciones en `src/server/domain/contracts/state-machine.ts` y en `private.contract_transition_allowed` (un test compara ambas); un trigger rechaza las demás | Defensa en profundidad |
| Inmutabilidad (RN-05) | Trigger en `contract_terms`: solo se registran aceptación, rechazo o retiro, una vez. Sin DELETE en versiones, contratos ni historial | Criterio de la fase |
| Hash | SHA-256 del contenido canónico (jsonb) calculado por la base al insertar. Aceptar exige versión + hash; si no coinciden, **409** | «Aceptar una versión obsoleta → 409» |
| Concurrencia | Cada acción bloquea el contrato (`SELECT … FOR UPDATE`); la primera propuesta bloquea la conversación. Una sola propuesta abierta por conversación (índice único parcial) | Aceptaciones y contrapropuestas simultáneas |
| Modificaciones | Tras contratar, cualquiera propone una versión nueva; lo acordado sigue vigente hasta que la otra parte la acepte. Si la rechaza, se retira o vence, no cambia nada | Nunca queda un acuerdo a medias |
| Ejecución | El trabajador marca inicio y fin; el cliente confirma (también desde `EN_CURSO`). Sin respuesta en 7 días, se confirma sola. Se suma a `worker_profiles.contracts_completed` | `01-negocio.md` §6.2 |
| Cancelación | Solo en `CONTRATADA` (antes de iniciar), con motivo obligatorio. En negociación: rechazar (contraparte) o retirar (quien propuso) | La cancelación tardía queda registrada con su motivo |
| Disputa | Desde `CONTRATADA`, `EN_CURSO` o `FINALIZACION_PENDIENTE`, con motivo y descripción. Crea una denuncia `CONTRACT` (Fase 8) y pausa la confirmación automática. Quien la abrió la retira; el GAD la resuelve con `report.manage` | Enganche de la Fase 8 |
| Plazos (RN-12) | `app_settings`: `contracts.proposal_ttl_days` = 7, `contracts.auto_confirm_days` = 7. Se aplican **al leer o actuar** (siempre correctos) y con **pg_cron** cada 15 min (avisos). Respaldo: `GET /api/internal/contracts` con `CRON_SECRET` | La corrección no depende del programador |
| Reglas | RN-14: trabajador no habilitado no recibe ni acepta propuestas nuevas (sus contrataciones en curso siguen). Trabajador sin cuenta vinculada: no se le propone. Conversación bloqueada: no se propone ni acepta. Límites: 20 versiones por contratación, 10 propuestas nuevas por usuario y día | RN-11, RN-13, RN-14 |
| Chat | Cada evento publica un mensaje `SYSTEM` con `contract_id` (tarjeta «Ver condiciones», en tiempo real por el canal de la conversación). Barra con las contrataciones activas bajo la cabecera | Tarjetas de sistema en el chat |
| Notificaciones | `CONTRACT_UPDATE`: una no leída por contratación para la contraparte (+ push si hay dispositivos). Se marca al abrir el detalle | Igual que el chat |
| Privacidad | Dirección exacta solo para las partes. Auditoría con versión y hash, sin el contenido. El personal del GAD no ve contrataciones (solo resuelve disputas) | `04-modelo-datos.md` §7 |
| Pagos (P-07) | Sin pagos: el precio es referencial y así se indica en el formulario | Recomendación vigente |

## Checklist

### Base de datos (`20260926210000_contrataciones`)
- [x] `app_settings`, `contracts`, `contract_terms`, `contract_events`; `messages.contract_id`/`contract_terms_id` y `sender_id` nulo solo en mensajes de sistema
- [x] Funciones: proponer, contraproponer/modificar, aceptar, rechazar/retirar, cancelar, iniciar/terminar/confirmar, disputa y su retiro, resolución por el GAD, listado, detalle, opciones del formulario, mantenimiento
- [x] pg_cron `acolita-contratos-plazos` (cada 15 min), creado solo si la extensión está disponible
- [x] Motivos de disputa (`report_reasons` con `target_type = CONTRACT`)
- [x] pgTAP `06_fase6_contrataciones.test.sql` (73 pruebas)
- [x] Aplicada en la nube: 13 funciones `fn_*contract*`, tarea pg_cron `acolita-contratos-plazos`, advisors sin observaciones

### Servidor y API
- [x] `src/server/domain/contracts/{state-machine,schemas}.ts`, `src/server/contracts/contracts.ts`
- [x] `GET/POST /api/v1/contracts`, `GET /api/v1/contracts/{id}`, `POST /api/v1/contracts/{id}/{terms|accept|reject|withdraw|cancel|start|complete|confirm|dispute}`, `DELETE …/dispute`
- [x] `GET /api/internal/contracts` (respaldo del programador); `src/server/http/cron.ts` compartido con el outbox
- [x] 409 para `55000` (versión obsoleta o estado que no admite la acción)

### Web
- [x] Chat: «Proponer condiciones», tarjetas de sistema y barra de contrataciones activas
- [x] `/contrataciones` (activas e historial, «Te toca a ti») y `/contrataciones/[id]` («Qué sigue», versión pendiente con cambios resaltados, condiciones acordadas con código de verificación, historial y versiones, diálogos de aceptar, rechazar, retirar, cancelar y disputa, actualización en vivo)
- [x] `/cuenta`: acceso «Mis contrataciones» con pendientes

### Pruebas
- [x] Unit (32 nuevas): estados y transiciones idénticos a la migración, acciones por parte, esquemas (zona horaria de Ecuador), 409, detalle y cambios resaltados, tarjetas del chat, arquitectura (solo `server/contracts` usa las tablas)
- [x] pgTAP (73): RLS y privilegios, solo las partes (404), versión obsoleta y hash distinto (409), inmutabilidad, transiciones en la base, modificación, disputa, confirmación automática, expiración, RN-13/RN-14, resolución del GAD, historial reconstruible
- [x] Integración (CI): aceptaciones y contrapropuestas concurrentes (una gana, 409 las demás), dos propuestas simultáneas, acceso de terceros
- [x] E2E: control de acceso de páginas y API, CSRF, tarea interna protegida
- [ ] Validación manual

## Resultados
- Pruebas locales: unit 362; lint, formato, tipos y build OK.
- Validación en la nube, transacción revertida (`scripts/validar-nube.mjs`): pgTAP Fase 6 73/73 y Fase 5 37/37 con la migración nueva.
- Integración y E2E: se ejecutan en el CI (el repositorio aún no tiene remoto, así que no se han corrido).

## Validación manual
1. Cliente y trabajador vinculado (Fase 4) con una conversación. El cliente pulsa «Proponer condiciones» y envía la propuesta: aparece la tarjeta en el chat de ambos y la barra «En negociación».
2. El trabajador abre la propuesta, pulsa «Proponer cambios» y sube el precio: el cliente ve «Cambió» en el precio.
3. Con la contratación abierta en dos ventanas, aceptar en una y contraproponer en la otra: la segunda recibe «Las condiciones cambiaron…».
4. El cliente acepta: «Contratación confirmada». El trabajador marca el inicio y luego el fin; el cliente confirma.
5. Nueva propuesta → «Retirar»; otra → la contraparte «Rechaza»; otra aceptada → «Cancelar contratación» con motivo.
6. Contratación en curso → «Reportar un problema»: queda «En disputa»; quien la abrió la retira.
7. En `/contrataciones`, revisar activas, historial y el acceso desde Mi cuenta.
