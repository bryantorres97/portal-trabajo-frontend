# Supabase local

Requisitos: Docker en ejecución y Supabase CLI ≥ 2.81 (probado con 2.116).

## Arranque

```bash
pnpm db:start          # supabase start: levanta Postgres, API, Studio, Storage, Realtime
```

La salida incluye `API_URL`, `PUBLISHABLE_KEY` y `SECRET_KEY`. Cópialos a `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

- Studio: http://127.0.0.1:54323
- Base de datos: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Flujo de migraciones (imperativo)

Este proyecto usa migraciones escritas a mano en `supabase/migrations/`, no esquemas declarativos.

1. Crear el archivo **con la CLI** (nunca inventar el nombre): `supabase migration new <nombre_descriptivo>`.
2. Escribir el SQL. Antes, cargar las skills `supabase` y `supabase-postgres-best-practices`.
3. Aplicar: `supabase migration up --local`, o `pnpm db:reset` para reconstruir desde cero con el seed.
4. Verificar: `supabase db lint --local`, `supabase db advisors --local` y `pnpm test:db` (pgTAP en `supabase/tests/`).

## Convenciones de seguridad (resumen de ADR-001 y `04-modelo-datos.md`)

- `config.toml` tiene `auto_expose_new_tables = false`: ninguna tabla es accesible por la Data API sin un `GRANT` explícito.
- **RLS activado en todas las tablas** (lo verifica el test pgTAP `00_base_seguridad`).
- El servidor usa `service_role` (secret key), con `GRANT` explícitos por tabla y el mínimo necesario. Por ejemplo, `audit_log` solo admite `INSERT` y `SELECT`.
- Las funciones auxiliares van en el schema `private` (no expuesto), con `set search_path = ''`.
- Las tablas append-only (`audit_log`, historiales) usan el trigger `private.prevent_mutation()`.

## Rendimiento y E2E con la base local

- `supabase db query -f scripts/perf-busqueda.sql`: inserta 5 000 trabajadores sintéticos, mide la búsqueda y **revierte todo** (no deja datos). Imprime `PERF_OK` o `PERF_FALLO` con p50 y p95.
- `pnpm test:e2e:local`: compila con las claves de `supabase status` y ejecuta Playwright contra la base local (`--serve` solo levanta el build en el puerto 3210).

## Seed

`supabase/seed.sql` carga los roles y permisos propuestos (`docs/analysis/01-negocio.md` §3). El catálogo (categorías, oficios) y las parroquias van en la **migración** de la Fase 3, porque también se necesitan en producción. El seed agrega **17 trabajadores ficticios** del prototipo (15 habilitados y 2 no habilitados), con UUID fijos `00000000-0000-4000-a000-0000000000NN`. Están en local y, a pedido del usuario (2026-09-25), también en el proyecto **dev** de la nube, cargados con el mismo bloque del seed (idempotente). **Nunca** en staging ni en producción.

## Asignar un rol interno a tu usuario de prueba

Después de tu primer login (crea la fila en `users` con el rol `CLIENTE`):

```sql
insert into public.user_roles (user_id, role_code)
select id, 'ADMIN_SISTEMA' from public.users where email = 'tu-correo@ejemplo.com';
```

## Ambientes remotos

**Development (nube):** proyecto `Portal Empleo` (ref `qmvyuzmitjwfdtvxzrok`, us-east-2), enlazado con `supabase link`.

```bash
supabase migration list --linked          # comparar historial local y remoto
supabase db push --linked --dry-run       # revisar antes de aplicar
supabase db push --linked                 # aplicar migraciones nuevas
supabase db advisors --linked             # revisión de seguridad y rendimiento
```

- El seed (`--include-seed`) solo se aplicó en la carga inicial. Los cambios de roles y permisos posteriores van en migraciones.
- pgTAP no está instalado en la nube: `pnpm test:db` y `pnpm test:integration` corren **solo en local** (y en CI), para no escribir datos de prueba en el proyecto remoto.

Cada ambiente (dev, staging, prod) es un proyecto Supabase distinto. Las migraciones se aplican solo por CI con `supabase db push`, usando un token de acceso con alcance limitado (`SUPABASE_ACCESS_TOKEN`). Nunca se aplican a mano en producción.
