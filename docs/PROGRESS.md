# PROGRESS — Estado del desarrollo

> **Leer este archivo al inicio de cada sesión.** Es la fuente de verdad sobre en qué punto está el proyecto.
> Actualizarlo al terminar cada tarea relevante y siempre al cerrar una fase.

## Estado actual

| Campo | Valor |
|---|---|
| Fase actual | **Pausa de revisión** tras Fase 0 + Fase 1 (ADR-003) |
| Siguiente fase | Fase 2 — Usuarios y perfiles |
| Rama de trabajo | `development` · último commit `b208b58` (Fase 0 + 1). Se commitea solo con confirmación del usuario |
| Última actualización | 2026-09-24 |

## Siguiente paso concreto

1. ~~Commit de Fase 0 + 1~~ ✅ `b208b58`.
2. **Probar el login real con el pool dev** (B2). Todo está listo: `.env.local` completo, migraciones aplicadas en el proyecto Supabase dev en la nube (`Portal Empleo`), callback `http://localhost:3000/api/auth/callback` aceptado por Cognito. Solo falta que el usuario inicie sesión en el navegador (`pnpm dev` → `/cuenta`). Checklist en `docs/setup/cognito-dev.md`.
3. Solicitar al GAD el App Client del portal (P-02) y enviar las preguntas bloqueantes (`docs/analysis/09-riesgos-preguntas.md`): P-02, P-04, P-06, P-13, P-15, P-17 y P-20.
4. Iniciar la Fase 2: crear `docs/phases/fase-02-usuarios-perfiles.md` a partir de `08-roadmap.md`. Incluye la **vinculación de identidades entre proveedores** (ADR-008).

## Bloqueos y dependencias externas

| # | Bloqueo | Responsable | Impacto |
|---|---|---|---|
| B1 | Logos reales (`acolita-logo-nuevo.png`, `ambato-logo.png`): en `resources` solo hay punteros al CDN de Lovable | Usuario / GAD | Se usa un logotipo temporal en texto (`src/components/site/Logo.tsx`) |
| B2 | Prueba del login real con el pool dev (pool us-east-1 + Supabase dev en la nube listos) | Usuario | Solo falta iniciar sesión en el navegador. El flujo está cubierto por tests y la redirección a Cognito está verificada |
| B3 | Rotar el client secret de otra aplicación que aparece en `resources/cognito-data.md` | GAD | Riesgo de seguridad sobre el pool productivo (el portal no lo usa) |
| B5 | App Client propio del portal en el pool de ciudadanos del GAD (P-02) | GAD | Necesario para staging y producción, no para desarrollo |
| B4 | Preguntas de negocio pendientes (`docs/analysis/09-riesgos-preguntas.md`) | GAD | Pueden cambiar reglas en las Fases 4–8 |

## Checklist por fase

Leyenda: `[ ]` pendiente · `[~]` en curso · `[x]` hecho · `[!]` bloqueado

### Fase 0 — Descubrimiento y definición ✅
- [x] Leer `IMPLEMENTATION_PLAN.md` y analizar `resources/`
- [x] Decisiones iniciales con el usuario (ver `DECISIONS.md` ADR-001..003)
- [x] Documentos de análisis `docs/analysis/01..09`
- [x] Guías de setup `docs/setup/{cognito-dev,supabase-local,env}.md`

### Fase 1 — Fundación técnica ✅ (login real pendiente de B2)
Detalle en `docs/phases/fase-01-fundacion.md`.
- [x] Estructura `src/` y alias
- [x] Sistema de diseño portado desde `resources`
- [x] Shell público y páginas institucionales
- [x] Configuración y validación de entorno + headers de seguridad
- [x] Supabase local, migraciones base (identidad, roles, auditoría, sesiones), seed
- [x] Autenticación Cognito (OIDC + PKCE, sesiones opacas cifradas)
- [!] Prueba de login contra un pool real (B2)
- [x] Auditoría base
- [x] Testing (unit 47, integración 8, pgTAP 15, E2E 24) + CI
- [x] Observabilidad mínima

### Fases 2–11
Ver `docs/analysis/08-roadmap.md`. Cada fase crea `docs/phases/fase-XX-*.md` al iniciarse.
- [ ] Fase 2 — Usuarios y perfiles
- [ ] Fase 3 — Catálogo y búsqueda (incluye el seed de categorías desde `src/content/site.ts`)
- [ ] Fase 4 — Gestión de trabajadores
- [ ] Fase 5 — Chat
- [ ] Fase 6 — Contrataciones
- [ ] Fase 7 — Calificaciones
- [ ] Fase 8 — Denuncias y moderación
- [ ] Fase 9 — Panel administrativo
- [ ] Fase 10 — Calidad y producción
- [ ] Fase 11 — Aplicación móvil (arquitectura)

## Comandos de verificación

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
pnpm db:start && pnpm test:db && pnpm test:integration   # requiere Docker
pnpm test:e2e                                           # requiere build previo
```

## Bitácora de sesiones

| Fecha | Resumen |
|---|---|
| 2026-09-24 | Análisis inicial de requisitos y `resources`. Plan aprobado. Decisiones: API en Next.js + Supabase, Cognito dev en cuenta personal, ejecutar Fase 0 + 1. Se crea `docs/`. |
| 2026-09-24 | **Fase 0 documentada** (9 documentos de análisis, 7 ADR). **Fase 1 implementada**: diseño y páginas públicas portadas, Supabase con RLS y auditoría inmutable, auth OIDC con sesiones opacas (ADR-005 ajustado: los tokens superan 4 KB en cookie), tests y CI. Hallazgos: Supabase third-party auth con Cognito requiere una Lambda Pre-Token (ADR-004, P-17); `cedula-claim=sub` es inconsistente (P-01). |
| 2026-09-24 | **Revisión pre-commit** con `resources/instructivo-integracion-cognito.md` y decisiones del usuario: **sin cédula**; el `sub` no es estable entre proveedores → modelo `users` + `user_identities` (ADR-008); scopes `openid email profile` (el pool del GAD no tiene `phone`); login social configurable (`COGNITO_IDENTITY_PROVIDERS`); multimedia provisional desde Unsplash (ADR-009); fotos ficticias de personas retiradas; el GAD no tiene ambiente de pruebas. Tests: unit 47, integración 8, pgTAP 15, E2E 24. |
| 2026-09-24 | Commit `b208b58` (Fase 0 + 1). **Supabase dev en la nube** (`Portal Empleo`, us-east-2, enlazado con la CLI): migraciones y seed aplicados con `supabase db push --include-seed`. Verificado en remoto: historial de migraciones sincronizado, advisors sin issues, 9 roles, 25 permisos y 50 asignaciones, RLS en todas las tablas, privilegios correctos, `audit_log` inmutable, acceso de la app vía API con la secret key y la publishable key bloqueada en `users`. pgTAP no corre en la nube (sin extensión `pgtap`): los tests SQL se ejecutan en local y en CI. Scope `phone` quitado de `.env.local`. Puerto 3000 libre: `/api/auth/login` redirige al pool dev y Cognito acepta el callback y los scopes. |
