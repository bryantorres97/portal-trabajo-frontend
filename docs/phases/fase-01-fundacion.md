# Fase 1 — Fundación técnica (checklist)

Objetivo, criterios y riesgos en `docs/analysis/08-roadmap.md`. **Estado: COMPLETADA (2026-09-24)**, salvo la prueba de login real, bloqueada por B2.

## 1. Estructura
- [x] Mover `app/` → `src/app/`; alias `@/*` → `./src/*`
- [x] Carpetas `src/{components/{ui,site},server/{auth,audit,db,http},lib,hooks,content}`
- [x] `.gitignore`: permitir `.env.example`; ignorar `test-results/` y `playwright-report/`
- [x] `resources/` excluido de `tsconfig` y ESLint

## 2. Sistema de diseño (desde `resources/`)
- [x] `src/app/globals.css` con los tokens de `resources/src/styles.css` + `tw-animate-css`
- [x] Outfit y Figtree con `next/font/google`; `lang="es-EC"`; metadata institucional con plantilla de título
- [x] `components.json` (shadcn, `rsc: true`)
- [x] `lib/utils.ts` (`cn`) y `hooks/use-mobile.ts` (reescrito con `useSyncExternalStore`)
- [x] 16 componentes `ui/*` base (button, badge, card, input, label, textarea, separator, sheet, dialog, dropdown-menu, avatar, skeleton, tooltip, alert, table, sonner)
- [x] Imágenes de oficios en `public/images/oficios` (provisionales, ADR-009); fotos ficticias de personas **no** versionadas; favicon en `src/app/icon.png`; Unsplash habilitado en `next/image` y la CSP

## 3. Shell público
- [x] `SiteShell` (skip-link, header con Sheet accesible, footer, `BottomNav` móvil), `PageHeader`, `Section`, `Estrellas`, `Logo` temporal (B1)
- [x] `(public)/page.tsx`: inicio con buscador de oficios (cliente) y pasos
- [x] `/como-funciona`, `/contratantes`, `/trabajadores`, `/contacto`, `/privacidad`
- [x] `/oficios` y `/oficios/[slug]` (SSG con `generateStaticParams`) con datos estáticos
- [x] `not-found.tsx` y `error.tsx` en español; `robots.ts` (solo indexa con `APP_ENV=production`)
- [x] Textos del prototipo **no confirmados** retirados o marcados: Registro Civil, antecedentes, QR, SOS, Score, datos bancarios, asignación municipal (ver `06-frontend-existente.md`)

## 4. Configuración
- [x] `src/lib/env.ts` (Zod, por grupos y validación perezosa, `server-only`) y `src/lib/env.public.ts`
- [x] `.env.example` y `docs/setup/env.md`
- [x] Headers de seguridad en `next.config.ts`: CSP sin nonce, HSTS en producción, nosniff, `frame-ancestors`, Permissions-Policy; `poweredByHeader: false`

## 5. Supabase
- [x] `supabase init`; `project_id = "acolita"` (hoy `llankana`, ADR-017); `auto_expose_new_tables = false`; bloque Cognito third-party documentado (desactivado, ADR-004)
- [x] Migración `base_identidad_roles_auditoria`: `users` + `user_identities` (ADR-008, sin cédula), `roles`, `permissions`, `role_permissions`, `user_roles`, `audit_log` (append-only con triggers y sin UPDATE/DELETE/TRUNCATE), schema `private` con helpers
- [x] Migración `sesiones_auth`: `auth_sessions` (sesiones opacas, ADR-005)
- [x] `seed.sql`: 9 roles, 25 permisos, 50 asignaciones. *Las categorías se siembran en la Fase 3, cuando exista la tabla `categories`.*
- [x] `src/server/db/admin.ts` (secret key, server-only)
- [x] `docs/setup/supabase-local.md`
- [x] `db lint`: sin errores · `db advisors`: sin issues

## 6. Autenticación
- [x] `src/server/auth/{cognito,crypto,verify,session,session-cookie,users,current-user,authorize}.ts` + `src/server/http/request-info.ts`
- [x] `/api/auth/login` (PKCE S256 + state + nonce en cookie JWE de 10 min; `?proveedor=Google|Facebook` según `COGNITO_IDENTITY_PROVIDERS`)
- [x] `/api/auth/callback` (canje, verificación ID y access token, nonce, alta just-in-time por identidad `(iss, sub)` con rol CLIENTE, sesión opaca, auditoría con proveedor)
- [x] `/api/auth/logout` (solo POST, verificación de Origin, revocación local y en Cognito, redirección al logout de Cognito)
- [x] `src/proxy.ts` (redirección optimista de `/admin/*` y `/cuenta/*` + `x-request-id`)
- [x] `/cuenta` (ingreso, errores de login, datos, cierre de sesión) y `/admin` (requiere `admin.access`)
- [!] Prueba de login real contra el pool dev → **bloqueada por B2**

## 7. Auditoría
- [x] `src/server/audit/log.ts` (`logAudit`, `toAuditRow`); acciones `USER_FIRST_LOGIN`, `USER_LOGIN`, `USER_LOGOUT`, `USER_LOGIN_FAILED`

## 8. Calidad
- [x] Vitest: 47 tests unitarios (texto, safeReturnTo, PKCE/JWE, autorización, auditoría/logger, verificación JWT con JWKS de prueba, claims de identidad, URLs de Cognito)
- [x] Integración (`pnpm test:integration`, Supabase local): 8 tests (alta JIT por identidad, sin vinculación automática por email, issuers separados, permisos vía PostgREST, sesiones cifradas y revocables, auditoría inmutable)
- [x] pgTAP (`pnpm test:db`): 15 tests (RLS, privilegios, inmutabilidad, seed, unicidad de identidades, ninguna columna de cédula)
- [x] Playwright: 24 smoke tests (escritorio y móvil) contra el build de producción
- [x] Prettier (+ plugin Tailwind); scripts `typecheck`, `test`, `test:integration`, `test:db`, `test:e2e`, `format`, `db:*`
- [x] `.github/workflows/ci.yml` (app, base de datos + integración, gitleaks)

## 9. Observabilidad
- [x] `src/lib/logger.ts` (JSON, redacción de claves sensibles) y `src/instrumentation.ts` (`onRequestError` con request-id)

## 10. Cierre
- [x] lint, format, typecheck, test y build en verde
- [x] `supabase db reset` / `migration up` OK
- [x] Verificación visual (escritorio en Chrome; móvil y menú con Playwright)
- [x] `PROGRESS.md` actualizado

## Notas para la siguiente sesión
- En esta máquina **los puertos 3000 y 3100 están ocupados** por Docker. La revisión visual se hizo en el puerto 3300 y el E2E usa el 3210. Si el pool dev de Cognito registra el callback en `localhost:3000`, liberar ese puerto o registrar también `http://localhost:3300/api/auth/callback`, y ajustar `NEXT_PUBLIC_APP_URL`.
- `.env.local` todavía no tiene `SUPABASE_SECRET_KEY`, `SESSION_SECRET` ni las variables de Cognito. Los tests de integración toman las credenciales de `supabase status`.
- Revisión previa al commit (2026-09-24): se incorporó `resources/instructivo-integracion-cognito.md`. Ver la bitácora de `PROGRESS.md` y los ADR-008 y ADR-009.
