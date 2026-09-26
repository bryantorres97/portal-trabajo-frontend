# Fase 5 — Chat (checklist)

Objetivo, criterios y riesgos en `docs/analysis/08-roadmap.md`. **Estado: IMPLEMENTADA (2026-09-26)**. Migración aplicada y Realtime verificado en Supabase dev (nube); validación manual pendiente.

## Decisiones de diseño

| Tema | Decisión | Motivo |
|---|---|---|
| Modelo de conversación | `conversations` con **un cliente y un trabajador** y columnas por parte (`client_/worker_last_read_id`, `client_/worker_blocked_at`). Sin tabla `conversation_participants` | Siempre son exactamente dos partes. El trabajador participa con `worker_profiles.user_id`, así que si vincula su cuenta después **ve las conversaciones previas** sin migrar datos |
| Quién inicia | Solo un cliente, solo con trabajadores `HABILITADO` (RN-10). Una conversación por par (se retoma). Nadie conversa consigo mismo; el personal del GAD no participa (RN-09) | `01-negocio.md` §7.2 |
| Trabajador sin cuenta vinculada | Se puede escribir. El cliente ve un aviso: «verá tus mensajes cuando active su cuenta» | La mayoría de los trabajadores se registra antes de vincular su cuenta |
| Acceso | Todo pasa por funciones `fn_*` que verifican que el usuario sea parte; un tercero recibe **404** (no se revela que existe) | Defensa en profundidad |
| Tiempo real (ADR-004) | Broadcast **privado**: el servidor emite un JWT ES256 de 10 min (`iss = acolita`, `sub = users.id`). RLS en `realtime.messages`: `conversation:{id}` para sus dos partes y `user:{id}` para su dueño. **Sin política INSERT**: los eventos los emite la base con triggers | Verificado con Realtime real (`docs/setup/realtime.md`) |
| Eventos | `message` (nuevo mensaje), `read` (lectura de la otra parte), `status` (bloqueo), `inbox` (canal personal: refrescar bandeja) | — |
| Sin Realtime | El chat funciona igual, con consulta cada 5 s (conversación) y 15 s (bandeja). Al reconectar se recupera lo perdido | Degradación elegante y reconexión |
| Envío | Optimista en la interfaz. **Idempotente** por `clientMessageId` (único por emisor); el bloqueo de la conversación serializa los envíos (orden estable, reintentos concurrentes seguros) | Criterio: concurrencia e idempotencia |
| Mensajes | Texto de 1 a 2000 caracteres, **inmutables** (trigger): no se editan ni se borran. Moderar = ocultar (`hidden_at`, Fase 8) | `04-modelo-datos.md` |
| Límites (RN-11) | 20 mensajes por minuto por usuario; 10 conversaciones nuevas por cliente y día. Responden **429** | Anti-abuso; en Postgres (RT-04) |
| Bloqueo (RN-13) | Cualquiera de las partes bloquea; mientras dure, **ninguna** puede escribir. Se desbloquea desde la misma conversación. Auditado | Más simple y seguro que un bloqueo unidireccional |
| Estado de lectura | Último id leído por parte; la otra parte ve «Visto» | RF-CH-03 |
| Notificaciones in-app | Una **no leída por conversación** (se actualiza con cada mensaje, no se acumula). Se marca al leer la conversación. Lista en `/cuenta` | Evita inundar al usuario |
| Push (FCM) | Outbox transaccional (solo si el destinatario registró dispositivos), despachador FCM HTTP v1 sin SDK, reintentos exponenciales (5), tokens inválidos se desactivan. **Desactivado mientras no haya credenciales de Firebase**. API `POST/DELETE /api/v1/devices` para la app móvil | El registro del token en el navegador (service worker de Firebase) queda para cuando exista el proyecto Firebase |
| Programación del despachador | `GET /api/internal/outbox` con `Authorization: Bearer CRON_SECRET`. La frecuencia se configura al desplegar (Fase 10) | Vercel Cron por minuto requiere plan Pro; alternativa: pg_cron + pg_net |
| Denuncia de mensajes | Tabla `reports` mínima + `report_reasons` (motivos de mensajes). Solo mensajes recibidos; una denuncia abierta por mensaje y denunciante (RN-16). **El personal todavía no ve el contenido**: la bandeja y el acceso con justificación llegan en la Fase 8 | Punto de enganche |
| Nombre de la contraparte | El trabajador ve al cliente como «Nombre A.» (nombre e inicial del apellido); el cliente ve el nombre público del trabajador | Minimización de datos |

## Checklist

### Base de datos (`20260926144442_chat_notificaciones`)
- [x] `conversations`, `messages` (inmutables), `notifications`, `device_tokens`, `notification_outbox`, `report_reasons`, `reports`
- [x] Funciones: iniciar, enviar, listar (bandeja e historial paginado), marcar leído, bloquear, denunciar, notificaciones, dispositivos, outbox
- [x] Trigger de difusión en Realtime y política RLS de `realtime.messages`
- [x] pgTAP `05_fase5_chat.test.sql` (37 pruebas)

### Servidor
- [x] `src/server/realtime/token.ts`, `src/server/chat/chat.ts`, `src/server/domain/chat/schemas.ts`
- [x] `src/server/notifications/` (in-app, dispositivos, despachador, FCM)
- [x] API: `/api/v1/realtime/token`, `/api/v1/conversations[/{id}[/messages|/read|/block]]`, `/api/v1/messages/{id}/report`, `/api/v1/notifications`, `/api/v1/devices`, `/api/internal/outbox`

### Web
- [x] «Escribir por el chat» en el perfil público → `/mensajes/nuevo`
- [x] `/mensajes` (bandeja con no leídos, en vivo) y `/mensajes/[id]` (hilo, envío optimista, reintento, «Visto», historial anterior, bloqueo, denuncia)
- [x] `/cuenta`: acceso a mensajes y notificaciones

### Pruebas
- [x] Unit: esquemas, 429, token de Realtime (firma, claims, 10 min), mensaje FCM, componente del hilo (envío optimista, reintento idempotente, bloqueo), **arquitectura: el panel del GAD no accede al chat**
- [x] Integración con **Realtime real**: suscripción de las partes, tercero y token inválido rechazados, **entrega p95 < 1 s**, aviso de lectura, bandeja, concurrencia de 2 emisores, idempotencia en paralelo, bloqueo, límites, notificaciones y outbox
- [x] E2E: control de acceso de páginas y API, CSRF, botón de contacto sin teléfono
- [ ] Validación manual con dos cuentas ciudadanas (una vinculada a un trabajador)

## Resultados
- Pruebas: unit 253 · integración 74 · pgTAP 126 · E2E 122.
- `supabase db lint` y `db advisors` sin observaciones.
- CI: genera la clave local y levanta Realtime y Storage.

## Nube (Supabase dev)
- [x] Migración aplicada (advisors sin observaciones).
- [x] Clave ES256 importada en el proyecto (kid `1cae2b7c…`) y `REALTIME_JWT_PRIVATE_KEY` en `.env.local`. Verificado contra Realtime de la nube: canal propio `SUBSCRIBED`, ajeno `Unauthorized`, otra clave `JwtSignatureError`.
- [ ] Push: crear el proyecto Firebase y configurar `FCM_*`; falta el registro del token en el navegador (service worker).

## Validación manual
1. Cliente A abre el perfil de un trabajador habilitado y vinculado (Fase 4) → «Escribir por el chat» → envía el primer mensaje.
2. El trabajador (otra sesión o ventana privada) ve la conversación en `/mensajes` sin recargar, con el contador de no leídos; responde.
3. El cliente ve la respuesta al instante y, al leerla el trabajador, su mensaje pasa a «Visto».
4. Cortar la red unos segundos y enviar desde la otra parte: al volver, el mensaje aparece.
5. Bloquear desde una parte: ninguna puede escribir; desbloquear.
6. Denunciar un mensaje recibido; repetir la denuncia → aviso de que ya está en revisión.
7. Enviar más de 20 mensajes en un minuto → aviso de límite.
