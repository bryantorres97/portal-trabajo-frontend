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
  - Staging: como el GAD no tiene pool no productivo, se usa un pool de staging propio del proyecto (idealmente en una cuenta institucional) y solo una prueba controlada, coordinada con el GAD, contra el pool real antes del paso a producción.
- **Alternativas:** ver `docs/analysis/03-identidad-ambientes.md` §2 (opciones A–D y mock local).
- **Consecuencias:**
  - Ningún desarrollo toca recursos productivos.
  - Hay que documentar las diferencias de configuración entre pools para evitar sorpresas al pasar a staging.

## ADR-003 — Primera ejecución: Fase 0 + Fase 1

- **Estado:** ACEPTADA (usuario, 2026-09-24)
- **Decisión:** Se entrega el análisis completo y la fundación técnica. Después se pausa para que el usuario revise y el GAD responda las preguntas bloqueantes.

## ADR-004 — Cognito como "third-party auth" de Supabase

- **Estado:** PROPUESTA (se valida en la Fase 1 y se usa desde la Fase 5)
- **Contexto:** El chat necesita tiempo real. Supabase Realtime autoriza con RLS usando el JWT del cliente.
- **Decisión:**
  - Se registra el User Pool de Cognito como proveedor third-party en Supabase. Así `auth.jwt()` contiene los claims del token de Cognito y RLS puede resolver al usuario mediante `sub`.
  - Supabase Auth **no** se usa para gestionar usuarios.
- **Requisito verificado (docs de Supabase, 2026-09):**
  - Cognito no emite el claim `role`. Se necesita un **Pre Token Generation Lambda trigger** que agregue `"role": "authenticated"`. Sin él, Supabase trata el token como `anon`.
  - Agregar claims al *access token* requiere el trigger V2, disponible solo en los planes Essentials/Plus de Cognito.
- **Riesgo:** en el pool institucional compartido, esa Lambda afecta a todas las aplicaciones del GAD. → **[PENDIENTE]** confirmar con TI del GAD.
- **Alternativa (fallback):** el servidor emite un JWT de corta vida (≤10 min) para Realtime, firmado con una clave registrada en Supabase y con `role=authenticated` y `sub` = id interno del usuario. Solo se entrega a usuarios con una sesión Cognito válida. Así no se toca el pool.
- **Consecuencias:**
  - El navegador necesita un token válido para suscribirse. Se entrega mediante un endpoint controlado, con vida corta.
  - RLS sigue siendo una defensa en profundidad incluso para el acceso desde el servidor.
  - Desde abril de 2026 Supabase **no expone automáticamente** las tablas nuevas a la Data API, lo que encaja con el acceso solo desde el servidor (ADR-001).

## ADR-005 — Sesión web con cookie httpOnly cifrada y OIDC authorization code + PKCE

- **Estado:** ACEPTADA (propuesta técnica del plan aprobado)
- **Decisión:**
  - El login se hace con Hosted UI / Managed Login de Cognito.
  - El intercambio de código ocurre en el servidor, con un client secret que solo existe en el servidor.
  - **Sesión opaca en el servidor (ajuste en la Fase 1):**
    - La cookie `acolita_session` (httpOnly, Secure, SameSite=Lax) solo contiene un identificador aleatorio de 256 bits.
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

## ADR-007 — Proveedor de CI: GitHub Actions; proveedor de despliegue pendiente

- **Estado:** PROPUESTA
- **Contexto:** El repositorio es git. No hay un remoto ni un proveedor de hosting confirmado.
- **Decisión:**
  - Se usa GitHub Actions para CI (lint, typecheck, test, build, lint de migraciones), por ser el estándar y gratuito para repositorios privados pequeños.
  - El despliegue (Vercel, AWS Amplify, contenedor en la infraestructura del GAD) queda **[PENDIENTE]** hasta conocer las restricciones institucionales.
- **Consecuencias:** El workflow es portable. Si el GAD usa GitLab o Azure DevOps, los pasos se traducen uno a uno.

## ADR-008 — Modelo de identidad: un usuario, varias identidades; sin cédula

- **Estado:** ACEPTADA (2026-09-24)
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
  - Las fotos de oficios que ya vienen del prototipo (`public/images/oficios`) se mantienen como provisionales.
  - Las fotos de personas del prototipo (ficticias) **no** se versionan.
- **Consecuencias:** Toda imagen provisional queda identificada en código con un comentario `// Provisional (ADR-009)` o en el propio contenido, para reemplazarla fácilmente.

