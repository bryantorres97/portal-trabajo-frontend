# Firebase (push) — proyecto de desarrollo

Proyecto de pruebas: `acolita-3fa4a` (cuenta personal, como Cognito dev). Para producción el GAD crea el suyo y entrega los mismos datos.

## 1. Proyecto y API

1. <https://console.firebase.google.com> → **Crear un proyecto** (sin Google Analytics).
2. ⚙️ **Configuración del proyecto** → **Cloud Messaging**: «API de Firebase Cloud Messaging (V1): **Habilitada**». La API heredada queda apagada.

## 2. Cuenta de servicio (servidor)

1. **Configuración del proyecto** → **Cuentas de servicio** → **Generar nueva clave privada**. Guardar el JSON **fuera del repositorio**.
2. Cargar en `.env.local` `FCM_PROJECT_ID` (`project_id`), `FCM_CLIENT_EMAIL` (`client_email`) y `FCM_PRIVATE_KEY` (`private_key` en una línea, con `\n`).
3. Producción: en Google Cloud (IAM → Cuentas de servicio) crear una cuenta solo con el rol **Administrador de la API de Firebase Cloud Messaging**, en lugar de la `firebase-adminsdk-…` (que tiene más permisos).

## 3. App web (push en el navegador)

1. **Configuración del proyecto** → **General** → **Tus apps** → **Web** (`</>`), sin Firebase Hosting.
2. Del `firebaseConfig`: `NEXT_PUBLIC_FIREBASE_API_KEY`, `…_PROJECT_ID`, `…_MESSAGING_SENDER_ID`, `…_APP_ID` (son públicos).
3. **Cloud Messaging** → **Certificados de push web** → **Generar par de claves** → `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (opcional: sin ella Firebase usa su clave por defecto).

El navegador usa el service worker `public/sw-notificaciones.js` (sin el SDK de Firebase). La CSP permite `firebaseinstallations.googleapis.com` y `fcmregistrations.googleapis.com`.

## 4. App móvil (Fase 11)

- Android: registrar la app con su nombre de paquete y descargar `google-services.json`.
- iOS: subir la clave APNs (`.p8`) de Apple Developer en **Cloud Messaging**.
- La app registra su token con `POST /api/v1/devices` (con sesión, Bearer) o `POST /api/v1/devices/anonymous` (sin sesión). Al cerrar sesión: `DELETE /api/v1/devices` con `keepAnonymous: true`.

## 5. Tareas programadas

`CRON_SECRET` (≥ 32 caracteres) protege `/api/internal/outbox`. En Vercel, `vercel.json` lo llama cada minuto (plan Pro; ADR-015). En local no hay cron: los avisos «Enviar ahora» salen al crearlos y el panel tiene «Procesar envíos pendientes».

## Verificación sin enviar nada

Un envío `validate_only` a un token ficticio debe responder **400 INVALID_ARGUMENT** («The registration token is not a valid FCM registration token»): confirma la cuenta de servicio y el permiso sobre FCM. Un 401/403 indica la API deshabilitada o un rol insuficiente.
