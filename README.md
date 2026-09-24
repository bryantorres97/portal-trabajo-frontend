# Acolita.App — Portal de Empleo y Servicios del GAD Municipalidad de Ambato

Plataforma municipal que conecta a ciudadanos con trabajadores de oficio **registrados, capacitados y habilitados** por el GAD. Incluye chat, contratación con condiciones inmutables, calificaciones, denuncias, moderación y auditoría.

> **Estado y plan de trabajo:** [`docs/PROGRESS.md`](docs/PROGRESS.md) (fase actual, bloqueos, siguiente paso) · Índice de la documentación: [`docs/README.md`](docs/README.md)

## Stack

| Pieza | Tecnología |
|---|---|
| Web pública, paneles y API (`/api/v1`) | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| Identidad | AWS Cognito, pool de ciudadanos del GAD (OIDC authorization code + PKCE) |
| Datos, archivos y tiempo real | Supabase (Postgres con RLS, Storage, Realtime) |
| Notificaciones | Firebase Cloud Messaging (desde la Fase 5) |
| Calidad | Vitest, pgTAP, Playwright, ESLint, Prettier, GitHub Actions |

## Puesta en marcha

Requisitos: Node 24, pnpm 12, Docker y Supabase CLI.

```bash
pnpm install
cp .env.example .env.local      # completar: docs/setup/env.md
pnpm db:start                   # Supabase local (copiar URL y claves a .env.local)
pnpm dev                        # http://localhost:3000
```

- Cognito de desarrollo (pool propio, **nunca** el del GAD): [`docs/setup/cognito-dev.md`](docs/setup/cognito-dev.md)
- Supabase local y migraciones: [`docs/setup/supabase-local.md`](docs/setup/supabase-local.md)

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm lint` / `pnpm format:check` / `pnpm typecheck` | Calidad estática |
| `pnpm test` | Tests unitarios (Vitest) |
| `pnpm test:integration` | Integración contra Supabase local (requiere `pnpm db:start`) |
| `pnpm test:db` | Tests SQL (pgTAP) de seguridad de la base |
| `pnpm test:e2e` | Smoke tests con Playwright (requiere `pnpm build`) |
| `pnpm db:reset` | Recrea la base local con migraciones y seed |

## Estructura

```text
src/
├── app/            # (public) portal · (privado) cuenta/admin · api/auth · api/v1
├── components/     # ui (shadcn) · site (shell, navegación)
├── server/         # lógica de servidor sin React: auth, audit, db, http
├── lib/            # utilidades compartidas, env, logger
└── content/        # contenido institucional estático
supabase/           # migraciones, seed y tests pgTAP
docs/               # análisis, decisiones (ADR), fases y guías de setup
resources/          # prototipo de referencia (no versionado)
```

## Convenciones

- Este proyecto usa **Next.js 16**, que tiene cambios incompatibles con versiones anteriores. Antes de programar, consultar `node_modules/next/dist/docs/` (ver `AGENTS.md`).
- Toda regla de negocio vive en `src/server`. La autorización se decide por **permiso** en el servidor; `proxy.ts` solo hace redirecciones optimistas.
- Las acciones administrativas se auditan. `audit_log` no se puede modificar.
- El portal **no almacena cédula** y **no usa el `sub` de Cognito como identificador de negocio** (ADR-008).
- Imágenes provisionales: Unsplash o material del prototipo, nunca imágenes generadas (ADR-009).
