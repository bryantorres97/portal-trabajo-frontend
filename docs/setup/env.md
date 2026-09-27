# Variables de entorno

La plantilla es `.env.example`. En local se copia a `.env.local`, que no se versiona (`.gitignore` ignora `.env*` excepto `.env.example`).

La validación está en `src/lib/env.ts` (servidor, `server-only`) y `src/lib/env.public.ts` (navegador). Cada grupo se valida de forma **perezosa**: el portal público arranca aunque Cognito o Supabase no estén configurados, y el error aparece con un mensaje claro solo al usar la función correspondiente.

| Variable | Grupo | Pública | local | development | staging | production |
|---|---|---|---|---|---|---|
| `APP_ENV` | App | No | `local` | `development` | `staging` | `production` (única que se indexa en `robots.txt`) |
| `NEXT_PUBLIC_APP_URL` | App | Sí | `http://localhost:3000` (o `:3300` si el 3000 está ocupado) | `https://dev.<dominio>` | `https://staging.<dominio>` | [PENDIENTE] P-02 |
| `LOG_LEVEL` | App | No | `debug` | `info` | `info` | `info` |
| `SESSION_SECRET` | Sesión | No | Aleatorio local | Secreto por ambiente | Secreto por ambiente | Secreto por ambiente (rotación: invalida sesiones) |
| `COGNITO_REGION` | Cognito | No | La de tu pool dev (hoy `us-east-1`) | Idem | Pool de staging propio (P-03) | `us-east-2` |
| `COGNITO_USER_POOL_ID` | Cognito | No | Pool dev personal | Pool dev personal | Pool de staging propio (el GAD no tiene pool no productivo) | `contribuyentes-externos` del GAD |
| `COGNITO_CLIENT_ID` | Cognito | No | Client del pool dev | Client dev (otro callback) | Client staging | **App client propio del portal** (P-02) |
| `COGNITO_CLIENT_SECRET` | Cognito | No | Del pool dev | Secreto | Secreto | Secreto |
| `COGNITO_DOMAIN` | Cognito | No | Dominio del pool dev | Idem | Dominio del pool de staging | `ambato-contribuyentes.auth.us-east-2.amazoncognito.com` |
| `COGNITO_SCOPES` | Cognito | No | `openid email profile` | Idem | Idem | Idem (el pool del GAD no soporta `phone`) |
| `COGNITO_IDENTITY_PROVIDERS` | Cognito | No | Vacío (o `Google` si el pool dev lo tiene) | Idem | Idem | `Google` (Facebook cuando el GAD lo confirme) |
| `COGNITO_EXTRA_CLIENT_IDS` | Cognito | No | Vacío | Vacío | Client móvil (Fase 11) | Client móvil |
| `ENTRA_TENANT_ID` | Entra ID | No | Tenant propio de prueba | Idem | Idem | Tenant del GAD |
| `ENTRA_CLIENT_ID` | Entra ID | No | App `acolita-admin-dev` | Idem (otro redirect URI) | Idem | App registration del GAD |
| `ENTRA_CLIENT_SECRET` | Entra ID | No | Secreto de la app de prueba | Secreto | Secreto | Secreto (o certificado) del GAD |
| `ENTRA_BOOTSTRAP_ADMIN_OIDS` | Entra ID | No | `oid` de tu usuario de prueba | Opcional | Opcional | `oid` del primer administrador; se retira después |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Sí | `http://127.0.0.1:54321` | Proyecto dev | Proyecto staging | Proyecto prod |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase | Sí | De `supabase start` | Publishable key | Idem | Idem |
| `SUPABASE_SECRET_KEY` | Supabase | No | De `supabase start` | Secret key | Idem | Idem (acceso restringido) |
| `REALTIME_JWT_PRIVATE_KEY` | Realtime | No | Objeto de `supabase/signing_keys.json` (`pnpm db:keys`) | Clave propia importada en el proyecto (`docs/setup/realtime.md`) | Idem | Idem |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | Push (opcional) | No | Cuenta de servicio del proyecto de pruebas (`docs/setup/firebase-dev.md`) | Proyecto Firebase de pruebas | Idem | Proyecto Firebase del GAD [PENDIENTE] |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `…_PROJECT_ID`, `…_MESSAGING_SENDER_ID`, `…_APP_ID` | Push web (opcional) | Sí (públicas) | App web del proyecto de pruebas | Idem | Idem | App web del proyecto del GAD |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Push web (opcional) | Sí (pública) | Vacío (Firebase usa su clave por defecto) | Par de claves propio | Idem | Idem |
| `CRON_SECRET` | Tareas programadas | No | Opcional | Aleatorio (≥ 32) | Idem | Idem |

Reglas:
- Solo las variables con prefijo `NEXT_PUBLIC_` llegan al navegador, y se incrustan **en tiempo de build**. Nunca se agregan secretos con ese prefijo.
- Los secretos de development, staging y production viven en el gestor de secretos del proveedor de despliegue (ADR-007, [PENDIENTE]).
- `COGNITO_DOMAIN` también se usa en `next.config.ts` (CSP `form-action`), así que debe estar definida en el momento del build.
- `ENTRA_BOOTSTRAP_ADMIN_OIDS` solo tiene efecto mientras **ninguna** cuenta del personal sea `ADMIN_SISTEMA` (ADR-012). Aun así, conviene retirarla después del primer ingreso.
- El client secret que aparece en `resources/cognito-data.md` **no se usa**: pertenece al pool institucional y debe rotarse (B3).
