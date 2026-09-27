# Fase 9B — Notificaciones push (checklist)

Pedido del usuario (2026-09-27): completar el módulo de Firebase para la futura app móvil y poder enviar **a todos los dispositivos, a los usuarios, solo a clientes, solo a trabajadores o a dispositivos elegidos**. Decisiones en ADR-015; configuración en `docs/setup/firebase-dev.md`. **Estado: IMPLEMENTADA (2026-09-27)**. Migración validada en Supabase dev dentro de una transacción revertida (pgTAP 46/46; Fases 5, 6 y 8 sin regresiones). **Aplicada en la nube** (2026-09-27, con confirmación del usuario; advisors sin observaciones). Verificado contra el servidor local: despachador con `CRON_SECRET` (200) y sin él (401), token anónimo falso rechazado por FCM (422), CSP con Firebase. Falta la validación manual.

## Punto de partida (Fase 5)

Existían `device_tokens`, `POST/DELETE /api/v1/devices`, el cliente FCM HTTP v1 y la cola `notification_outbox` (chat y contrataciones), pero nada despachaba la cola, no había envíos del GAD ni push en el navegador.

## Decisiones de diseño

| Tema | Decisión |
|---|---|
| Segmentos | `TODOS` (incluye la app sin sesión) · `USUARIOS` (con cuenta) · `CLIENTES` (rol CLIENTE sin TRABAJADOR) · `TRABAJADORES` · `SELECCION` (personas y/o dispositivos buscados por nombre o correo). Filtro por plataforma (navegador, Android, iPhone) |
| Entrega | Una fila por dispositivo (`push_deliveries`), audiencia fijada al iniciar, 3 intentos con espera, tokens inválidos desactivados, conteos por campaña |
| Programación | «Enviar ahora» o fecha y hora de Ecuador (hasta 90 días); se puede cancelar mientras está programada o enviando |
| Bandeja | Opción «dejarlo también en la bandeja del portal» (`notifications` tipo `AVISO_GAD`) para todas las personas del grupo, tengan o no push |
| Preferencia | `users.push_announcements` (en «Mi cuenta» y `PUT /api/v1/me/preferences`): apaga los avisos del GAD por push; los del chat y las contrataciones llegan siempre |
| Dispositivos anónimos | `POST /api/v1/devices/anonymous` (solo ANDROID/IOS): FCM valida el token; 30 nuevos por IP y hora (HMAC de la IP) |
| Sesión web | El token del navegador se liga a la sesión: al cerrarla (o «cerrar en todos los dispositivos», o bloqueo) se desactiva |
| Despacho | `after()` al crear un aviso, enviar un mensaje o cambiar una contratación; Vercel Cron cada minuto para reintentos y programados; botón «Procesar envíos pendientes» |
| Seguridad | Permiso `notifications.broadcast` (ADMIN_SISTEMA); creación y cancelación auditadas (`PUSH_CAMPAIGN_CREATED`, `PUSH_CAMPAIGN_CANCELLED`); 20 avisos por hora por funcionario; enlaces solo a rutas internas |
| Corrección | FCM exige HTTPS en `fcm_options.link`: en local se omite (antes el mensaje se rechazaba y **se desactivaban los dispositivos**). Solo se desactiva un token por 404/UNREGISTERED o un INVALID_ARGUMENT que menciona el token |

## Checklist

### Base de datos (`20260927220000_notificaciones_push`)
- [x] `push_campaigns`, `push_deliveries` (RLS, sin acceso de `anon`/`authenticated`)
- [x] `device_tokens`: `user_id` opcional, `session_id`, `registered_ip_hash`; trigger al revocar la sesión
- [x] `users.push_announcements`
- [x] Funciones: audiencia, estimación, crear, cancelar, listar, buscar destinatarios, tomar y completar entregas; `fn_claim_outbox` solo a dispositivos entregables
- [x] Permiso `notifications.broadcast` (migración y seed)
- [x] pgTAP `10_notificaciones_push.test.sql` (46)
- [x] Aplicada en la nube (advisors sin observaciones, caché de PostgREST recargada)

### Servidor y API
- [x] `src/server/notifications/{campaigns,dispatcher}.ts`; `fcm.ts` con validación de tokens
- [x] `POST /api/v1/devices` liga el token a la sesión web; `DELETE` con `keepAnonymous`
- [x] `POST /api/v1/devices/anonymous`, `GET/PUT /api/v1/me/preferences`
- [x] `/api/internal/outbox` despacha cola y avisos (`maxDuration` 60); `vercel.json` con cron cada minuto

### Web
- [x] Panel: módulo «Notificaciones» (`/admin/notificaciones`): redacción con vista previa, destinatarios estimados en vivo, buscador para la selección, programación, confirmación, historial con avance y cancelación
- [x] «Mi cuenta»: activar o desactivar el push en este navegador y la preferencia de avisos del GAD
- [x] Service worker `public/sw-notificaciones.js`; CSP ampliada para Firebase

### Pruebas
- [x] Unit (14): validación del aviso (segmentos, enlaces, hora de Ecuador, límites), errores de FCM que desactivan o no un token, mensaje sin HTTPS, despacho con FCM falso, anónimos (HMAC, validación, límite), módulo por permiso
- [x] pgTAP (46): segmentos, preferencia, bloqueados, personal, plataformas, anónimos y límite, sesión web, selección, bandeja, auditoría, reintentos, cancelación, programados, permisos
- [x] Integración (CI): selección con preferencia y bandeja, programado y cancelado, permisos
- [ ] Validación manual

## Resultados
- Unit 448; lint, formato, tipos y build OK.
- Validación en la nube con transacción revertida: 46/46; Fases 5, 6 y 8: 37/37, 73/73 y 55/55.

## Validación manual
1. `pnpm dev` → con una cuenta ciudadana, «Mi cuenta» → «Activar en este navegador» (aceptar el permiso).
2. Con ADMIN_SISTEMA: «Notificaciones» → «Personas o dispositivos elegidos», buscar esa cuenta, marcar el navegador, enviar: debe llegar la notificación y al tocarla abrir el enlace.
3. Repetir con «Solo clientes» y con la opción de bandeja: el aviso aparece en «Mi cuenta».
4. Desmarcar «Recibir avisos del GAD»: la estimación baja y el siguiente aviso no llega por push (sí a la bandeja).
5. Escribirle a esa cuenta desde otra por el chat: llega el push del mensaje aunque los avisos del GAD estén apagados.
6. Programar un aviso para dentro de unos minutos y cancelarlo; programar otro y usar «Procesar envíos pendientes» después de la hora.
7. Cerrar sesión: el navegador deja de recibir push; al volver a ingresar, «Mi cuenta» lo reactiva solo.
8. Con un MODERADOR: el módulo «Notificaciones» no aparece.

## Pendiente
- Plan de Vercel: el cron por minuto requiere Pro (o usar pg_cron + pg_net).
- Proyecto Firebase y cuenta de servicio del GAD para producción (rol mínimo).
- App móvil (Fase 11): registrar tokens y manejar `data.link` / `data.event`.
