# Registro de decisiones de arquitectura (ADR)

Formato: cada decisión indica estado, contexto, decisión, alternativas consideradas y consecuencias.
Estados posibles: `ACEPTADA`, `PROPUESTA` (pendiente de validar), `REEMPLAZADA`.

---

## ADR-001 — La lógica de negocio vive en una API dentro de Next.js

- **Estado:** ACEPTADA (usuario, 2026-09-24)
- **Contexto:** El sistema debe ser API-first porque habrá una futura app móvil para trabajadores (Flutter, `../portal_empleo_mobile_app`). Se ha establecido el uso de Supabase y de Cognito.
- **Decisión:**
  - Next.js expone Route Handlers versionados en `/api/v1/*`.
  - La lógica de negocio está en `src/server/` (dominio, repositorios, auth, auditoría, notificaciones) y es independiente de la UI.
  - Los Server Components y Server Actions de la web llaman a esa misma capa de dominio, no a la API HTTP.
  - Supabase solo se usa desde el servidor, con la secret key. El navegador **no** consulta tablas de negocio directamente, salvo las suscripciones de Realtime del chat (ver ADR-004).
- **Alternativas:**
  - Backend separado (NestJS): más aislamiento, pero dos despliegues y dos repositorios.
  - Supabase directo + RLS + Edge Functions: menos código, pero reglas y auditoría dispersas.
- **Consecuencias:**
  - Un solo despliegue.
  - La capa `src/server` debe mantenerse libre de dependencias de React para poder extraerla a un servicio aparte si fuera necesario.

## ADR-002 — Cognito de desarrollo en una cuenta AWS personal

- **Estado:** ACEPTADA (usuario, 2026-09-24)
- **Contexto:** `resources/cognito-data.md` y `resources/instructivo-integracion-cognito.md` describen el pool de ciudadanos del GAD (`contribuyentes-externos`, `us-east-2`). Según el instructivo **no existe ambiente de pruebas**: todo corre sobre el entorno real.
- **Decisión:**
  - Los ambientes local y development usan un User Pool propio en la cuenta AWS personal del desarrollador (creado el 2026-09-24, región `us-east-1`). Replica lo relevante del pool del GAD: client confidencial, authorization code, scopes `openid email profile` y, si se prueba, Google como proveedor federado.
  - Producción usa un **App Client propio** del portal en el pool de ciudadanos del GAD (lo solicita el equipo al GAD, instructivo Paso 1).
  - Staging: **confirmado por el GAD (2026-09-24)**, no existe pool de pruebas ni de staging institucional. Staging usa el **pool personal**, con un app client aparte y callbacks del dominio de staging. Antes del paso a producción se hace una única prueba controlada, coordinada con el GAD, contra el pool real.
- **Alternativas:** ver `docs/analysis/03-identidad-ambientes.md` §2 (opciones A–D y mock local).
- **Consecuencias:**
  - Ningún desarrollo toca recursos productivos.
  - Hay que documentar las diferencias de configuración entre pools para evitar sorpresas al pasar a staging.

## ADR-003 — Primera ejecución: Fase 0 + Fase 1

- **Estado:** ACEPTADA (usuario, 2026-09-24)
- **Decisión:** Se entrega el análisis completo y la fundación técnica. Después se pausa para que el usuario revise y el GAD responda las preguntas bloqueantes.

## ADR-004 — Autorización de Realtime con tokens propios del servidor (sin Lambda en Cognito)

- **Estado:** ACEPTADA (2026-09-24). Reemplaza la propuesta inicial de usar Cognito como *third-party auth* de Supabase.
- **Contexto:** El chat (Fase 5) necesita tiempo real. Supabase Realtime autoriza los canales privados con RLS sobre `realtime.messages` usando el JWT que presenta el navegador.
- **Opción descartada — Cognito como third-party auth:**
  - Requiere un **Pre Token Generation Lambda** en el pool que agregue `"role": "authenticated"` (Cognito no lo emite). Personalizar el *access token* exige el evento V2, disponible solo en los planes Essentials/Plus.
  - En producción el pool es **del GAD y compartido**: el Lambda afectaría a todas sus aplicaciones y dependería de su equipo y de su plan.
  - Además, el `sub` de Cognito no es estable por persona (ADR-008): RLS igual tendría que traducir identidades.
- **Decisión:**
  - Se importa en Supabase una **clave de firma propia** (JWT signing key, verificado en la documentación de Supabase 2026-09).
  - El servidor emite un JWT de **corta vida (≤ 10 min)** con `sub = users.id`, `role = authenticated` y `iss` propio. Solo lo entrega a usuarios con sesión válida, mediante `POST /api/v1/realtime/token`, y el cliente lo renueva antes de que venza.
  - RLS en `realtime.messages` verifica que `sub` sea participante de la conversación del canal.
  - La clave privada vive solo en el servidor (variable de entorno), y cada ambiente tiene la suya.
- **Consecuencias:**
  - **No se modifica el pool de Cognito** (ni el personal ni el del GAD). El tier del pool deja de importar.
  - Hay que ajustar `private.current_user_id()` en la Fase 5 para aceptar el `iss` propio (`sub` = `users.id`).
  - Desde abril de 2026 Supabase **no expone automáticamente** las tablas nuevas a la Data API, lo que encaja con el acceso solo desde el servidor (ADR-001).
- **Implementación (Fase 5, 2026-09-26):**
  - Clave **ES256**. Local: `supabase/signing_keys.json` + `signing_keys_path` en `config.toml`. Nube: importar la clave en Settings → JWT Keys (`docs/setup/realtime.md`).
  - Token: `iss = llankana` (hasta el ADR-017, `acolita`), `sub = users.id`, `aud`/`role = authenticated`, 10 minutos.
  - En lugar de ajustar `private.current_user_id()`, la política de `realtime.messages` usa una función propia (`private.can_read_realtime_topic`) que solo acepta `iss = llankana`. Las tablas de negocio siguen sin políticas para `authenticated`.
  - Verificado con Realtime real en local: topic permitido → `SUBSCRIBED`; ajeno → `Unauthorized`; otra clave → `JwtSignatureError`.

## ADR-005 — Sesión web con cookie httpOnly cifrada y OIDC authorization code + PKCE

- **Estado:** ACEPTADA (propuesta técnica del plan aprobado)
- **Decisión:**
  - El login se hace con Hosted UI / Managed Login de Cognito.
  - El intercambio de código ocurre en el servidor, con un client secret que solo existe en el servidor.
  - **Sesión opaca en el servidor (ajuste en la Fase 1):**
    - La cookie `llankana_session` (antes `acolita_session`, ADR-017) (httpOnly, Secure, SameSite=Lax) solo contiene un identificador aleatorio de 256 bits.
    - La tabla `auth_sessions` guarda el hash SHA-256 de ese identificador y los tokens de Cognito **cifrados** (JWE A256GCM con una clave derivada de `SESSION_SECRET`).
    - Motivos: access + refresh token de Cognito superan los 4 KB de una cookie; así se puede revocar cada sesión y cerrar todas las sesiones; y una fuga de la base sola no expone los tokens.
  - La API acepta también `Authorization: Bearer <access_token>` para clientes móviles.
  - Los JWT se validan con `aws-jwt-verify` (JWKS del pool).
- **Consecuencias:**
  - No hay tokens en `localStorage`.
  - Se usa `proxy.ts` (Next 16) solo para redirecciones optimistas. La autorización real ocurre en la capa de datos (`src/server/auth`).

## ADR-006 — Autorización de negocio en Postgres, no solo en grupos de Cognito

- **Estado:** PROPUESTA
- **Contexto:** El pool de Cognito se comparte con otras aplicaciones institucionales. Los grupos de Cognito son globales al pool y los administra el GAD. El instructivo (§6) ofrece además un catálogo compartido de roles del GAD que agrega los claims `app_roles` y `app_permissions` al ID token.
- **Decisión:**
  - Cognito responde a la pregunta "¿quién es?" (autenticación).
  - Las tablas `roles`, `permissions` y `user_roles` en Postgres responden a "¿qué puede hacer en este portal?".
  - Si más adelante el GAD da de alta el portal en su catálogo de roles (`app_roles`/`app_permissions`), esos claims se sincronizan como fuente adicional, no como la única. Queda **[PENDIENTE]** P-20.
- **Consecuencias:** El portal no depende de que el GAD cree grupos en el pool compartido. Los cambios de rol quedan auditados en la base.

## ADR-007 — CI con GitHub Actions y despliegue en Vercel

- **Estado:** ACEPTADA (despliegue confirmado por el GAD, 2026-09-24)
- **Decisión:**
  - CI con **GitHub Actions**: lint, formato, tipos, tests, build, lint y pruebas de la base, detección de secretos.
  - Despliegue en **Vercel**, con la región de funciones **`cle1` (Cleveland)**, junto a Supabase (`us-east-2`) y al pool de Cognito del GAD (`us-east-2`), para minimizar la latencia servidor↔base.
  - Ambientes: *Preview* (ramas y PR) → development; rama `main` → production. Las variables de entorno se definen por ambiente en Vercel. `COGNITO_DOMAIN` también se necesita en el build (CSP).
  - Las migraciones **no** las aplica Vercel: se aplican por CI con `supabase db push` antes de promover el despliegue (patrón *expand/contract*).
- **Consecuencias:**
  - Las funciones son serverless y sin estado. El rate limiting de la Fase 5 usará un almacén compartido (Upstash Redis vía la integración de Vercel, o una tabla en Postgres).
  - Las tareas programadas (expiración de propuestas, outbox de notificaciones) siguen en `pg_cron` dentro de Supabase, no en Vercel Cron, para no depender de la invocación HTTP.
  - Rollback: *Instant Rollback* de Vercel sobre el despliegue anterior. Las migraciones son compatibles hacia atrás.

## ADR-008 — Modelo de identidad: un usuario, varias identidades; sin cédula

- **Estado:** ACEPTADA (2026-09-24). La ficha del trabajador registra cédula o pasaporte desde el 2026-10-07 (ADR-019); las cuentas siguen sin cédula.
- **Contexto:**
  - El usuario confirmó que **el portal no manejará cédula**.
  - El instructivo del GAD indica que el `sub` de Cognito **cambia según el método de login** (nativo, Google, Facebook). Además, la cédula nunca viaja en los tokens: solo se obtiene del *Identity & Onboarding Service* del GAD (`GET /identity/me`), que es quien entrega el `userId` maestro estable.
- **Decisión:**
  - `users` es la persona dentro del portal. `user_identities (issuer, sub, provider)` guarda cada identidad de Cognito vinculada; `(issuer, sub)` es única, y el `issuer` separa los pools dev, staging y prod.
  - Alta just-in-time: una identidad nueva crea un usuario nuevo con rol `CLIENTE`.
  - **No se vinculan identidades automáticamente por email.** La vinculación entre proveedores se diseña en la Fase 2 con confirmación explícita del usuario, con el mismo criterio que usa el servicio del GAD ("¿sos vos?").
  - No se integra el Identity & Onboarding Service en el MVP, porque exige cédula. `users.master_user_id` queda disponible si el GAD lo requiere más adelante (P-01).
  - Trabajadores: el registro presencial no usa cédula. La cuenta se vincula con un **código de activación** de un solo uso. La detección de duplicados usa teléfono, email y nombres, con revisión del operador.
- **Consecuencias:**
  - Una persona que entra primero con usuario y contraseña y luego con Google tendrá, hasta la Fase 2, dos cuentas en el portal.
  - Ningún dato del portal depende de `sub` como identificador de negocio.
  - La verificación del token comprueba que su `(iss, sub)` pertenezca al usuario de la sesión.

## ADR-009 — Multimedia provisional desde Unsplash

- **Estado:** ACEPTADA (usuario, 2026-09-24)
- **Decisión:**
  - No se generan imágenes.
  - Mientras el GAD no entregue material oficial, las imágenes nuevas se toman de Unsplash (`images.unsplash.com`, permitido en `next.config.ts` y en la CSP).
  - Los logotipos son de texto (`src/components/site/Logo.tsx`) hasta recibir los oficiales (B1).
  - ~~Las fotos de oficios que ya vienen del prototipo (`public/images/oficios`) se mantienen como provisionales.~~ **Actualizado (usuario, 2026-09-27):** las 10 fotos de oficios se reemplazaron por imágenes de Unsplash descargadas en `public/images/oficios/*-unsplash.jpg` (1200×900), con créditos en `public/images/oficios/CREDITOS.md` y la migración `fotos_oficios_unsplash` que actualiza las rutas del catálogo. El logo del GAD no se cambia (es institucional).
  - Las fotos de personas del prototipo (ficticias) **no** se versionan.
- **Consecuencias:** Toda imagen provisional queda identificada en código con un comentario `// Provisional (ADR-009)` o en el propio contenido, para reemplazarla fácilmente.

## ADR-010 — Contacto con el trabajador solo por el chat interno

- **Estado:** ACEPTADA (GAD, 2026-09-24)
- **Decisión:** el teléfono y el WhatsApp del trabajador **nunca** se muestran a los clientes (RN-19). Todo contacto pasa por el chat interno, que queda registrado. El canal institucional del GAD (página de contacto) no cambia.
- **Consecuencias:** `worker_profiles.phone` es un dato privado (solo lo ve el personal del GAD con `worker.read.private`). Las vistas públicas no lo incluyen. En la Fase 5 se evaluará detectar números en los mensajes para desalentar el contacto por fuera.

## ADR-011 — Calificación bidireccional con visibilidad restringida

- **Estado:** ACEPTADA (GAD, 2026-09-24)
- **Decisión:**
  - Al finalizar una contratación, el cliente califica al trabajador y el trabajador califica al cliente (RN-06), una vez cada uno.
  - La calificación del **cliente al trabajador** es pública, en el perfil del trabajador.
  - La calificación del **trabajador al cliente** solo la ven usuarios con rol `TRABAJADOR` activo y el personal del GAD (RN-20). Nunca aparece en páginas públicas ni ante otros clientes.
- **Consecuencias:** `reviews.direction` con unique `(contract_id, direction)`. La visibilidad se aplica en el dominio, en las vistas y en RLS, y tiene tests de autorización específicos en la Fase 7.

## ADR-012 — Acceso del personal del GAD con Microsoft Entra ID (Microsoft 365)

- **Estado:** ACEPTADA (usuario, 2026-09-24) — opción (b) de P-21
- **Contexto:** El personal del GAD usa Microsoft 365 con MFA corporativo. El pool de personal del GAD (federado con Azure AD) no admite aplicaciones de terceros. El pool de ciudadanos no tiene MFA.
- **Decisión:**
  - Dos puertas de entrada:
    - **Ciudadanos y trabajadores** → Cognito (pool de ciudadanos del GAD).
    - **Personal del GAD** → **Microsoft Entra ID** del tenant del GAD, integrado directamente por el portal (OIDC authorization code + PKCE, cliente confidencial, endpoint v2.0).
  - La aplicación es **single-tenant**: solo se aceptan tokens cuyo `iss` sea `https://login.microsoftonline.com/{TENANT_GAD}/v2.0` y cuyo `tid` coincida. Se rechazan cuentas invitadas de otros tenants (claim `idp` distinto del emisor).
  - Identidad del personal en `user_identities`: `issuer` = emisor del tenant, `sub` = **`oid`** (inmutable y el mismo en todas las apps del tenant; verificado en la documentación de Microsoft). Proveedor `ENTRA`.
  - **MFA:** el ID token v2 de Entra **no incluye `amr`**, así que el portal no puede verificarlo por sí mismo. El GAD debe aplicar **acceso condicional con MFA obligatorio** a la aplicación del portal. Es un requisito a pedir junto con el app registration.
  - **Los permisos internos solo se ejercen en sesiones abiertas con Entra ID.** Una sesión de Cognito nunca accede a `/admin` ni a APIs administrativas, aunque la cuenta tenga roles internos. `auth_sessions` registra el origen de la sesión.
  - Las cuentas del personal **no** reciben el rol `CLIENTE` en el alta just-in-time: entran sin roles hasta que un `ADMIN_SISTEMA` se los asigne. El primer `ADMIN_SISTEMA` se crea con un comando de *bootstrap* (lista de `oid` en una variable de entorno de un solo uso, o SQL).
  - Los roles internos siguen en Postgres (ADR-006). Opcional a futuro: mapear *app roles* de Entra.
  - **Implementación (Fase 2B, 2026-09-25):**
    - Los permisos efectivos dependen del origen de la sesión: en una sesión ENTRA solo cuentan los roles internos; en una de Cognito (cookie o Bearer), solo los ciudadanos. Así, todas las verificaciones por permiso existentes quedan protegidas sin cambios.
    - Los roles internos solo se asignan a cuentas con identidad `ENTRA` (verificado en `fn_admin_grant_role`). Las cuentas del personal no se vinculan ni se fusionan con cuentas ciudadanas (`fn_link_identity`).
    - El bootstrap (`ENTRA_BOOTSTRAP_ADMIN_OIDS`) se aplica en `fn_staff_login` solo mientras ninguna cuenta del personal tenga `ADMIN_SISTEMA` vigente, en la misma transacción que el alta y con auditoría (`ROLE_GRANTED`, `metadata.bootstrap`).
    - El personal no acepta los términos ciudadanos (RN-18 aplica a sesiones de Cognito). Con sesión ENTRA, `/cuenta` redirige a `/admin`.
    - Se descartó la variable `ADMIN_REQUIRE_ENTRA` prevista en el plan: con un tenant de desarrollo propio no hace falta un modo sin Entra, y quitarla elimina una forma de desactivar el control por error.
    - Entra no tiene revocación de refresh tokens por token: al cerrar sesión se revoca la sesión local y se redirige al logout de Entra (`post_logout_redirect_uri` = `/admin/ingresar`, registrado como redirect URI).
- **Ambientes:** en desarrollo, un tenant de Entra propio (gratuito) con un app registration de prueba. En producción, el app registration lo crea el equipo de TI del GAD en su tenant.
- **Consecuencias:**
  - El personal usa su cuenta corporativa con MFA real. Si deja el GAD y TI deshabilita su cuenta, pierde el acceso al renovar la sesión.
  - La sesión del personal dura como máximo 12 h y se renueva con el refresh token de Entra.
  - Hay que solicitar al GAD: app registration (client ID, tenant ID, secreto o certificado), redirect URIs `https://<dominio>/api/auth/staff/callback` y `https://<dominio>/admin/ingresar` y acceso condicional con MFA.

## ADR-013 — Desarrollo solo contra Supabase dev en la nube

- **Estado:** ACEPTADA (usuario, 2026-09-26)
- **Contexto:** Supabase local (Docker) exigía mantener otro entorno en la máquina de desarrollo (puertos bloqueados por WinNAT, claves y datos distintos a los de la nube).
- **Decisión:**
  - El desarrollo y las pruebas manuales usan el proyecto **Supabase dev en la nube** (`Portal Empleo`). `.env.local` apunta a él.
  - Los cambios de esquema se aplican con `supabase db push`: primero `--dry-run` y siempre con confirmación del usuario.
  - Las pruebas que necesitan base de datos (pgTAP, integración, E2E con datos) **siguen en el CI** de GitHub, con una base efímera que se crea en cada ejecución. No se corren contra la nube: pgTAP no está disponible allí y los datos de prueba ensuciarían el ambiente dev.
- **Consecuencias:**
  - En la máquina de desarrollo solo se ejecutan lint, formato, tipos, pruebas unitarias y build.
  - Las migraciones deben probarse en el CI antes de aplicarlas en la nube; un error en la nube se revierte solo (cada migración es una transacción), como ocurrió con `pg_trgm` en la Fase 4.
  - **Validación sin CI (2026-09-26):** `node scripts/validar-nube.mjs <migración> [pruebas.test.sql…]` ejecuta la migración y las pruebas pgTAP en Supabase dev dentro de UNA transacción que termina siempre en excepción (adaptador mínimo `scripts/tap-shim.sql`): la nube queda intacta. Sirve para validar antes del `db push` mientras el repositorio no tenga remoto con CI.

## ADR-014 — Modelo de contratación: la propuesta cuenta como aceptación de quien la envía

- **Estado:** ACEPTADA (2026-09-26, Fase 6). P-07 confirmada por el GAD (2026-09-26): sin pagos, el precio es solo una referencia.
- **Contexto:** `01-negocio.md` §6.2 prevé `SOLICITUD`, `NEGOCIACION` y `ACEPTADA_PARCIAL`. En la práctica, quien envía una versión ya está de acuerdo con ella; pedirle que la acepte aparte es un paso vacío.
- **Decisión:**
  - Enviar una versión registra la aceptación de quien la envía. La contraparte la acepta, la rechaza o contrapropone. La contratación existe (`CONTRATADA`) solo cuando **ambas** aceptaciones están en la **misma** versión (RN-04); un trigger lo impone.
  - Estados: `PROPUESTA_ENVIADA → CONTRATADA → EN_CURSO → FINALIZACION_PENDIENTE → FINALIZADA`, más `EN_DISPUTA`, `CANCELADA`, `RECHAZADA` y `EXPIRADA`. No hay `SOLICITUD`, `NEGOCIACION` ni `ACEPTADA_PARCIAL`.
  - Tras `CONTRATADA`, una modificación es una versión pendiente: lo acordado sigue vigente hasta que la otra parte la acepte (no se vuelve a un estado intermedio).
  - Aceptar exige la versión y su hash SHA-256 (calculado por la base): si cambió, 409.
  - El cliente puede confirmar la finalización desde `EN_CURSO` aunque el trabajador no haya marcado el fin.
  - La disputa crea una denuncia `CONTRACT` (bandeja de la Fase 8); quien la abrió puede retirarla y la contratación vuelve a su estado anterior. El GAD la resuelve con `report.manage` (`fn_admin_resolve_contract_dispute`; la interfaz llega en la Fase 8).
  - Plazos en `app_settings`: 7 días para responder una propuesta y 7 días para confirmar la finalización (luego se confirma sola). Se aplican al leer y con pg_cron cada 15 minutos.
- **Consecuencias:** menos pasos para el usuario y un modelo más simple; el historial (`contract_events`) y las versiones permiten reconstruir cada acuerdo.

## ADR-015 — Avisos push del GAD: entrega por dispositivo, segmentos y despacho

- **Estado:** ACEPTADA (2026-09-27), salvo el mecanismo del cron: **PENDIENTE** hasta que el GAD confirme si habrá plan Pro de Vercel (bloqueo B6). Pedido del usuario: enviar a todos los dispositivos, a los usuarios, solo a clientes, solo a trabajadores o a dispositivos elegidos.
- **Contexto:** FCM HTTP v1 envía un mensaje por token (ya no hay envío por lotes). Los temas de FCM evitan recorrer los tokens, pero obligan a mantener suscripciones sincronizadas con los roles y no dan resultado por dispositivo.
- **Decisión:**
  - Una campaña (`push_campaigns`) fija su audiencia **al iniciar** y crea una entrega por dispositivo (`push_deliveries`) con reintentos (3) y estado propio; sin temas de FCM.
  - Segmentos: `TODOS` (incluye la app sin sesión), `USUARIOS` (con dueño), `CLIENTES` (rol CLIENTE **sin** TRABAJADOR), `TRABAJADORES`, `SELECCION` (personas y/o dispositivos elegidos). Nunca cuentas bloqueadas ni personal del GAD. Filtro por plataforma.
  - Preferencia `users.push_announcements`: apaga los avisos del GAD por push, no los del chat ni de contrataciones. En la bandeja del portal los avisos (opcionales) se ven siempre.
  - Dispositivos anónimos (`device_tokens.user_id` NULL) solo desde la app móvil: FCM valida el token (`validate_only`) y hay un límite de 30 por IP y hora (se guarda un HMAC de la IP, no la IP).
  - Los tokens web se ligan a la sesión: al cerrarla o vencer, el navegador deja de recibir push.
  - Despacho: al responder (`after()`) tras cada acción que genera push y con Vercel Cron cada minuto (`/api/internal/outbox`) para reintentos y avisos programados. **Requiere el plan Pro de Vercel** (Hobby solo admite tareas diarias); la alternativa es pg_cron + pg_net llamando al mismo endpoint.
  - **Desactivado temporalmente (2026-09-28)**: el primer despliegue será en Vercel Hobby. `vercel.json` no declara crons y `PUSH_SCHEDULER_ENABLED` (por defecto apagada) oculta y rechaza los avisos programados. Los push salen con `after()`; los reintentos y lo que no alcance a enviarse se procesan en el siguiente despacho o con «Procesar envíos pendientes» del panel. Para reactivarlo: volver a agregar `"crons": [{ "path": "/api/internal/outbox", "schedule": "* * * * *" }]` (Pro) o crear la tarea pg_cron + pg_net, y poner `PUSH_SCHEDULER_ENABLED=true`.
  - Permiso nuevo `notifications.broadcast` (ADMIN_SISTEMA); crear y cancelar se auditan. Máximo 20 avisos por hora por funcionario.
- **Consecuencias:** conteos exactos (entregados, fallidos, descartados) y tokens inválidos desactivados; con cientos de miles de dispositivos habrá que evaluar temas de FCM o más concurrencia.

## ADR-016 — Soporte de la app móvil: primer ingreso por API y cierre global por `auth_time`

- **Estado:** ACEPTADA (2026-09-28). Parte de la Fase 11; la app vive en `../portal_empleo_mobile_app` (sus decisiones: ADR-M01…M06 en su `docs/DECISIONS.md`).
- **Contexto:** la app usa un app client **público** de Cognito con PKCE y guarda sus propios tokens (ADR-M02 de la app). El servidor no los conoce: no hay fila en `auth_sessions`. Faltaban el alta del usuario (solo ocurría en `/api/auth/callback`) y una forma de "cerrar en todos los dispositivos" que alcance a la app.
- **Decisión:**
  - `POST /api/v1/me/bootstrap` con `Authorization: Bearer <access token>` + `{ idToken }`. El ID token se verifica con un verificador aparte que **solo** acepta los client IDs de `COGNITO_EXTRA_CLIENT_IDS` (el verificador del web sigue aceptando solo `COGNITO_CLIENT_ID`); ambos tokens deben tener el mismo `sub` y el ID token debe estar emitido para el `client_id` del access token. Reutiliza `upsertUserFromLogin` y audita `USER_FIRST_LOGIN`/`USER_LOGIN` con `channel: "APP"`. Idempotente.
  - Cierre global: `revokeUserSessions(userId)` (sin sesión concreta) marca `users.tokens_valid_after = now()`. Un Bearer cuyo `auth_time` (Cognito lo conserva al renovar con el refresh token) sea anterior a la marca no resuelve usuario (401). La app debe volver a iniciar sesión. Se descartó `GlobalSignOut` de Cognito: exige el scope `aws.cognito.signin.user.admin`, que el portal no pide, y no invalida los access tokens ya emitidos.
- **Consecuencias:** un access token robado deja de servir tras el cierre global aunque no haya vencido. Cerrar una sola sesión web no afecta a la app.

## ADR-017 — Cambio de nombre: Acolita.App pasa a llamarse Llankana

- **Estado:** ACEPTADA (2026-09-28, pedido del usuario). Responde P-18 y cierra el bloqueo B1 para el logotipo de la plataforma.
- **Contexto:** «Acolita.App» era el nombre de trabajo del prototipo. La plataforma pasa a llamarse **Llankana**. El usuario entregó dos logotipos en PNG (horizontal y vertical), que se redibujaron en vectores.
- **Decisión:**
  - Marca en vectores (`public/images/marca`, guía en `docs/marca/README.md`): símbolo de dos personas (azul `#136CC6` y verde `#31A286`) unidas por un rombo magenta (`#D92564`) y la palabra «Llankana» en azul marino (`#0D2A52`), trazada con Outfit Black. `Logo` y `LogoSimbolo` (`src/components/site/Logo.tsx`) dibujan el SVG en línea.
  - Íconos de Next (`favicon.ico`, `icon.svg`, `apple-icon.png`, `opengraph-image.png`) y `manifest.ts`. Las notificaciones push usan `icono-192.png` e `insignia-96.png`.
  - Los tokens `--azul`, `--verde`, `--magenta` y `--primary` toman los colores exactos de la marca y se agrega `--marino`. `--verde-fuerte` se recalcula para mantener el contraste AA. La franja `barra-marca` pasa a azul, magenta y verde.
  - Se renombran los identificadores internos: cookies `llankana_session` y `llankana_oauth`, sal HKDF `llankana`, emisor de Realtime `iss = llankana` (y su política), variable `llankana.actor`, tareas pg_cron `llankana-*`, `x-application-name: llankana-web`, clave local `llankana.push.token` y `project_id` de la CLI. Los datos se corrigen con la migración `marca_llankana`: pregunta frecuente, nombre de la capacitación general y reseña del trabajador ficticio.
  - **No se renombran los recursos externos ya creados:** proyecto de Firebase `acolita-3fa4a` (su ID no se puede cambiar), app client de Cognito `acolita-web-dev` y app de Entra `acolita-admin-dev`. Tampoco se editan las migraciones ya aplicadas.
  - Los documentos legales publicados son inmutables (RN-18). El nombre nuevo llega en la próxima versión que publique el GAD desde `/admin/contenido`, y se pide a los usuarios aceptarla de nuevo.
- **Consecuencias:**
  - Al desplegar, **todas las sesiones web se cierran una vez**, porque cambian la cookie y la sal. La app móvil no se ve afectada, porque usa Bearer.
  - Entre la migración y el despliegue del web, Realtime rechaza los tokens del servidor anterior y el chat pasa a la consulta periódica hasta que termine el despliegue.
  - El navegador vuelve a registrar el token de push web.
  - El correo `llankana@ambato.gob.ec` (`src/content/site.ts`) es provisional hasta que el GAD lo confirme.

## ADR-018 — Eliminación de cuenta por el titular

- **Estado:** ACEPTADA (2026-09-29, decisiones del usuario). Falta la validación jurídica del GAD sobre plazos de retención (LOPDP, modelo de datos §7).
- **Contexto:** Google Play exige que las apps que permiten crear cuenta ofrezcan eliminarla dentro de la app y en una página web accesible sin la app. La LOPDP reconoce el derecho de supresión. El modelo de datos preveía anonimizar al eliminar, pero no había flujo.
- **Decisión:**
  - **Inmediata e irreversible**, sin período de gracia: `fn_delete_account` anonimiza todo en una transacción.
  - **Se impide con contrataciones en marcha** (`CONTRATADA`, `EN_CURSO`, `FINALIZACION_PENDIENTE`, `EN_DISPUTA`), para proteger a la otra parte. Las propuestas sin aceptar se cancelan (evento `CUENTA_ELIMINADA`) y se avisa a la otra parte. `GET /api/v1/me/deletion` dice qué lo impide antes de confirmar.
  - **Se borra:** identidades, perfil de cliente, sesiones web (sus refresh tokens se revocan en Cognito), notificaciones, dispositivos, envíos pendientes y roles (se revocan). La fila de `users` queda como seudónimo: `ELIMINADO`, sin correo, con el nombre «Cuenta eliminada» y `tokens_valid_after` para invalidar los tokens de la app.
  - **Trabajador vinculado:** la ficha pasa a `INACTIVO`, se desvincula y se anonimiza (`deleted_at`); se borran foto, documentos (también del bucket), oficios y códigos. Se conservan calificación y contrataciones completadas. Un trigger congela la ficha: el GAD no puede reactivarla ni agregarle datos.
  - **Se conserva:** mensajes y reseñas (el autor aparece como «Cuenta eliminada»; `private.short_name` no lo abrevia), contrataciones, denuncias, consentimientos y auditoría, sin datos personales. Las conversaciones quedan `CERRADA`.
  - **La cuenta ciudadana de Cognito no se borra:** es del GAD y la usan otros servicios municipales. Al borrar las identidades, un nuevo ingreso crea una cuenta nueva y vacía.
  - `fn_delete_account` es `SECURITY DEFINER` (el servidor no tiene `DELETE` en varias de esas tablas y no conviene dárselo en general); solo `service_role` la ejecuta.
  - Superficies: `DELETE /api/v1/me` (Bearer o cookie con mismo origen), `/cuenta/eliminar` (web, con confirmación) y la página pública `/eliminar-cuenta` para Google Play, que también indica el correo del delegado de protección de datos para quien no puede ingresar.
- **Consecuencias:**
  - Las cuentas institucionales (Entra ID) no se eliminan por este flujo.
  - Si falla la revocación en Cognito o el borrado de archivos, la cuenta queda eliminada igual y se registra un aviso (`account.delete.*`).
  - La política de privacidad del GAD debería mencionar este procedimiento en su próxima versión.

## ADR-019 — Documento de identidad del trabajador (cédula o pasaporte)

- **Estado:** ACEPTADA (2026-10-07, pedido y decisiones del usuario). Revisa ADR-008 solo para la ficha del trabajador.
- **Contexto:** el GAD quiere identificar a cada trabajador por su documento en el registro presencial. ADR-008 había descartado la cédula porque no viaja en los tokens de Cognito ni sirve para vincular cuentas; eso no cambia.
- **Decisión:**
  - `worker_profiles` guarda `id_document_type` (`CEDULA` o `PASAPORTE`) e `id_document_number`, sin espacios ni guiones y en mayúsculas.
  - **Obligatorio** en el alta presencial y al editar la ficha (Zod y `fn_admin_create_worker`/`fn_admin_update_worker`). Los trabajadores registrados antes quedan sin documento hasta que el personal edite su ficha; por eso la columna admite nulos.
  - La **cédula** se valida con provincia (01–24 o 30) y dígito verificador (módulo 10), en TS (`cedulaValida`) y en la base (`private.cedula_valida`, en una restricción de la tabla). El **pasaporte**, por formato: 5 a 20 letras o números.
  - **No se exige tercer dígito menor que 6** (decisión del usuario, 2026-10-07): esa regla viene del RUC (6 entidad pública, 9 sociedad) y no se pudo confirmar que el Registro Civil nunca emita cédulas de personas con un tercer dígito mayor; rechazar a una persona real es peor que aceptar un formato poco común. Migración `cedula_sin_tercer_digito`.
  - **Único por tipo**: un documento no puede pertenecer a dos trabajadores (índice único y error 409 con mensaje claro). La detección de duplicados lo informa como «mismo documento de identidad» y el operador no puede confirmarlo.
  - **Dato privado:** solo lo lee el servidor; se muestra en la ficha y se busca en el listado con `worker.read.private`. Nunca se publica ni va en la auditoría (solo el nombre del campo cambiado) ni en los registros (`logger` lo redacta).
  - Al eliminar la cuenta (ADR-018) el documento se borra con el resto de datos personales (trigger sobre `deleted_at`).
- **Consecuencias:**
  - La vinculación de la cuenta sigue siendo con el código de activación; el documento no se compara con datos de Cognito.
  - Las cuentas (`users`, `user_identities`) siguen sin cédula: la prueba pgTAP lo verifica.
  - Es un dato personal adicional: la política de privacidad del GAD debería mencionarlo en su próxima versión (P-15).
