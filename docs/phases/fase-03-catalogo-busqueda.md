# Fase 3 — Catálogo y búsqueda (checklist)

Objetivo, criterios y riesgos en `docs/analysis/08-roadmap.md`. **Estado: IMPLEMENTADA (2026-09-25).** Commit `8a3750b`.

## Decisiones de diseño

| Tema | Decisión | Motivo |
|---|---|---|
| Jerarquía del catálogo | `categories` (grupos: Construcción, Hogar, Cuidado) → `services` (oficios: Albañilería, Plomería…). `categories.parent_id` queda disponible para subcategorías futuras | Coincide con el ejemplo del requerimiento (§8) y con los "oficios" del prototipo. Evita un tercer nivel sin datos |
| Datos iniciales del catálogo | En una **migración** (no en el seed), editables después desde `/admin/catalogo` | Producción también los necesita. El GAD los valida y ajusta [PENDIENTE] |
| Ubicación | Tabla `parishes` con las **27 parroquias del cantón Ambato** (9 urbanas y 18 rurales). Cada trabajador tiene una parroquia (ubicación aproximada, nunca dirección) | P-12 sin respuesta: se adopta la recomendación. La lista es **[INFERIDO] — validar con el GAD** |
| Tabla de trabajadores | Se crea ahora `worker_profiles` **completa** (estados, datos públicos y privados) y `worker_services`. La Fase 4 agrega el registro presencial, el historial de estados, documentos y capacitación | La búsqueda necesita trabajadores reales en la base. Así se evita rehacer la tabla |
| Visibilidad pública | Solo `status = 'HABILITADO'` y sin suspensión vigente (RN-01). Los datos privados (teléfono, email, dirección, fecha de nacimiento) **nunca** salen en consultas públicas (RN-19) | Se aplica con una única función SQL de lectura pública con columnas explícitas |
| Búsqueda | `search_text` (sin tildes, en minúsculas) + `search_vector` (`tsvector` en `spanish`), mantenidos por triggers al cambiar el trabajador, sus servicios o el catálogo. Consulta: FTS (`websearch_to_tsquery('spanish')`) **o** similitud por trigramas (errores tipográficos). Orden por relevancia, calificación o experiencia | Requisito §11: sencillo para el MVP, con índices GIN, y sustituible después por un motor dedicado |
| Filtros | Texto, categoría, oficio, parroquia, solo disponibles, experiencia mínima y calificación mínima. Paginación por página (tamaño 12) | Resultados compartibles por URL (`/buscar?…`) |
| Páginas públicas | Dinámicas (SSR en cada request, con `connection()`) y respaldo si la base no responde | El build no depende de la base. Las consultas son baratas; el caché de datos se evalúa en la Fase 10 |
| Fotos de trabajadores | Aún no hay (llegan con la Fase 4, moderadas). Se muestra un **avatar con iniciales** | ADR-009: no se generan imágenes ni se inventan URLs |
| Seed de desarrollo | Trabajadores **ficticios** tomados del prototipo (solo `seed.sql`, nunca producción) | Probar la búsqueda. Las calificaciones sembradas son ficticias hasta la Fase 7 |
| Contacto | El perfil público no muestra teléfono. El botón "Contactar" queda preparado para el chat de la Fase 5 | RN-19, ADR-010 |
| SEO | `generateMetadata` por oficio y trabajador, JSON-LD (`Service`, `Person`), `sitemap.xml` dinámico (indexa solo producción) | Criterio de aceptación: Lighthouse SEO ≥ 95 |

## Checklist

### Base de datos
- [x] Migración `catalogo_trabajadores_busqueda`: extensiones `unaccent` y `pg_trgm`, `parishes`, `categories`, `services`, enum `worker_status`, `worker_profiles`, `worker_services`
- [x] Triggers de `search_text` y `search_vector`, e índices GIN
- [x] Funciones `fn_public_search_workers`, `fn_public_worker` y `fn_admin_*` del catálogo (con auditoría)
- [x] Datos iniciales: 27 parroquias, 3 categorías y 10 oficios (de `src/content/site.ts`)
- [x] Seed de desarrollo: trabajadores ficticios habilitados y algunos no habilitados (para probar que no aparecen)
- [x] pgTAP: privacidad de las funciones públicas, invisibilidad de los no habilitados

### Servidor
- [x] `src/server/catalog/`: categorías, servicios, parroquias (lectura pública y administración)
- [x] `src/server/search/`: esquema de filtros (Zod) y búsqueda de trabajadores
- [x] API `GET /api/v1/categories`, `/api/v1/services`, `/api/v1/parishes`, `/api/v1/workers`, `/api/v1/workers/{id}`

### Web
- [x] Inicio y `/oficios`, `/oficios/[slug]` desde la base
- [x] `/buscar` con filtros por URL (funciona sin JavaScript)
- [x] `/trabajadores/[id]`: perfil público sin datos privados, JSON-LD
- [x] `/admin/catalogo`: crear y editar categorías y oficios, activar y desactivar
- [x] `sitemap.ts`

### Pruebas
- [x] Unit: esquema de filtros, construcción de URLs, JSON-LD
- [x] Integración: búsqueda (acentos, errores tipográficos, filtros combinados), invisibilidad de los no habilitados, ausencia de datos privados, CRUD del catálogo con auditoría
- [x] Rendimiento: 5 000 trabajadores sintéticos en local, p95 < 300 ms
- [x] E2E: buscar, filtrar, abrir el perfil; la URL compartible reproduce el resultado
- [x] Accesibilidad y SEO **automatizados** con axe-core (WCAG 2.2 A/AA, sin violaciones graves ni críticas) + verificación de título, descripción, `lang` y `h1` único en 8 páginas, en escritorio y móvil. Sustituye a la revisión manual con Lighthouse.

## Resultados
- Búsqueda: tildes y mayúsculas ignoradas, raíces en español ("plomero" → plomería), errores de tipeo ("electrisista"), filtros combinables y URL compartible.
- Rendimiento (`scripts/perf-busqueda.sql`, 5 020 trabajadores): **p50 55 ms · p95 134 ms · máx. 136 ms** (umbral 300 ms). En CI el paso falla si `PERF_FALLO`.
- Pruebas: unit 80 · integración 34 · pgTAP 36 · E2E 72 (escritorio y móvil, incluye axe).
- Contraste: el verde de marca no alcanzaba AA como texto (3,4:1). Se agregó el token `verde-fuerte` (≥ 4,5:1) para texto; el verde de marca queda para íconos y fondos.
- Migración aplicada en Supabase dev (nube). Los 17 trabajadores ficticios del seed también se cargaron en la nube dev a pedido del usuario (nunca en producción).

## Notas
- `pnpm test:e2e:local` compila y corre los E2E contra Supabase **local** (datos del seed). `--serve` levanta el build en http://localhost:3210 para revisión manual.
- La navegación marca "Trabajadores" solo en `/trabajadores` (la página de registro), no en los perfiles `/trabajadores/[id]`.
- En móvil, los filtros de `/buscar` quedan plegados y muestran cuántos hay activos, para que los resultados se vean de inmediato.

