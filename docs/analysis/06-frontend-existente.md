# 06 — Análisis del frontend existente (`resources/`)

Entregable §37: 20. Cubre §29.

## Resumen

| Aspecto | Hallazgo |
|---|---|
| Framework | **TanStack Start** (React 19 + Vite 8 + Nitro), generado con **Lovable**. No es Next.js |
| Routing | Basado en archivos (`src/routes`), con `routeTree.gen.ts` autogenerado |
| UI | Tailwind CSS 4 + **shadcn/ui** (estilo new-york, Radix, lucide-react), unos 45 componentes en `components/ui` |
| Estado y datos | Solo datos estáticos en `src/content/*.ts`. No hay backend, autenticación ni persistencia. TanStack Query está instalado pero no se usa |
| Formularios | react-hook-form + zod instalados. Las pantallas usan `useState` con validación manual |
| Estilo visual | Identidad propia "Acolita.App": paleta verde/azul/magenta/naranja/amarillo en oklch, gradiente de marca, fuentes Outfit (display) y Figtree (texto), tarjetas con radio grande, enfoque *mobile-first* con barra de navegación inferior |
| Accesibilidad | Aceptable: `aria-label` en botones de ícono, `sr-only`, combobox de búsqueda con roles ARIA, objetivos táctiles de 44 px o más. Problemas: `lang="en"` en el `<html>`, textos de error en inglés, algunos contrastes sin verificar (amarillo sobre blanco) |
| SEO | `head()` por ruta con title, description y OG. Con Next.js se reemplaza por `generateMetadata` |

## Páginas existentes

| Ruta | Contenido | Destino en Next |
|---|---|---|
| `/` | Hero "¿Qué servicio necesitas hoy?", buscador de oficios con sugerencias, grilla de oficios, pasos, insignias | `(public)/page.tsx`: se porta en la Fase 1 con datos estáticos; en la Fase 3 se conecta a la base |
| `/oficios`, `/oficios/$slug` | Catálogo y detalle del oficio con la lista de trabajadores de ese oficio | `(public)/oficios/[slug]`: Fase 3 |
| `/trabajadores` (index) | **Página de reclutamiento** de trabajadores: requisitos, puntos de acopio, niveles de "Score", formulario de pre-registro con **banco y número de cuenta** | `(public)/trabajadores`: se porta como información (requisitos y puntos). El formulario de datos bancarios **no se porta** (ver problemas) |
| `/trabajadores/$id` | Perfil público: foto, bio, certificados, reseñas, trabajos realizados | `(public)/trabajadores/[id]`: Fase 3 |
| `/como-funciona`, `/contratantes`, `/privacidad`, `/contacto` | Páginas informativas. Contacto abre WhatsApp o correo (`mailto`) sin almacenar nada | Se portan en la Fase 1 |

## Funcionalidades simuladas (solo demo)

- `SolicitarFlow`: login ficticio con Facebook, Google o Microsoft 365 → datos (cédula, WhatsApp, dirección) → OTP → chat. **Sustituido por** Cognito (Fase 1–2).
- `PanelNegociacion`: chat simulado con respuestas automáticas y propuestas de precio o visita. **Referencia de UX** para chat y propuestas (Fases 5–6).
- `EvaluacionFlow`: calificación con 6 criterios + "¿recomendarías?" + reseña. **Referencia de UX** para la Fase 7 (simplificado, ver `04-modelo-datos.md`).

## Afirmaciones del prototipo que NO están en los requisitos (no asumir)

| Afirmación | Dónde | Estado |
|---|---|---|
| Validación de cédula en línea con el Registro Civil | `content/site.ts` | **Descartada**: el portal no maneja cédula (ADR-008) |
| Revisión de antecedentes penales | `site.ts`, garantías | [PENDIENTE] P-06: ¿es requisito? Es un dato sensible |
| Credencial digital con código QR | `pasos` | [FUTURO] |
| "Score Acolita" con 4 niveles de insignia | `badges` | [POST-MVP]: requiere definir la fórmula. El MVP solo muestra la insignia "Habilitado por el GAD" y el promedio de calificación |
| "Modo jornada segura" con botón SOS | `garantias` | [FUTURO / NO RECOMENDADO en el MVP]: implica responsabilidad institucional y un protocolo de respuesta |
| Registro de trabajador desde la app | `pasos` | [FUTURO] (app móvil) |
| Pre-registro con cuenta bancaria | `/trabajadores` | [NO RECOMENDADO]: recoge datos financieros sin finalidad definida (la plataforma no procesa pagos) |
| Login social (Facebook, Google, M365) | `SolicitarFlow` | ✅ Google y Facebook sí (P-05). Microsoft 365 no aplica a ciudadanos |
| Contacto por WhatsApp directo con el trabajador | varios | ❌ **No permitido** (P-08, RN-19): solo chat interno. El WhatsApp **institucional** del GAD en la página de contacto sí se mantiene |
| "Pedir que el municipio seleccione" un trabajador (intermediación asistida) | `/oficios/$slug` | [PENDIENTE]: no está en los requisitos. Implicaría una bandeja de solicitudes para el GAD. Candidato POST-MVP |
| "No constituye relación de dependencia", Ordenanza RC-025-2019 | footer | [PENDIENTE] validación jurídica |

## Problemas técnicos y deuda

1. Hay que migrar el framework completo (TanStack → Next App Router). Las rutas, `Link` e `img` se adaptan a `next/link` y `next/image`.
2. Los logos son **punteros `.asset.json` al CDN de Lovable** y no hay archivos locales → bloqueo B1.
3. Hay dependencias de Lovable (`@lovable.dev/vite-tanstack-config`, `lovable-error-reporting`) que se eliminan.
4. Todo es Client Component con `useState`. En Next, las páginas informativas pasan a ser Server Components y solo quedan como cliente las partes interactivas (buscador, menú móvil).
5. La fuente de Google se carga con `<link>`; se cambia a `next/font` para evitar el salto de diseño y los bloqueos de CSP.
6. El manejo de `document.body.style.overflow` en modales caseros se reemplaza por `Dialog`/`Sheet` de Radix, que ya gestionan el foco y el scroll.
7. Hay textos de error y 404 en inglés, y `lang="en"`.
8. Los datos de trabajadores ficticios, con nombres reales plausibles y fotos, **no** deben publicarse en producción. Solo se usan como seed de desarrollo.

## Qué se reutiliza

| Recurso | Uso |
|---|---|
| `styles.css` (tokens oklch, `@theme`, utilidades `tarjeta`, `barra-marca`, `texto-marca`) | `src/app/globals.css` |
| `components/ui/*` (shadcn) | Se copian bajo demanda, con `"use client"` en los que usan Radix |
| `SiteShell`, `PageHeader`, `Section`, `Estrellas` | Se adaptan a Next |
| `lib/utils.ts` (`cn`), `hooks/use-mobile.tsx` | Directo |
| Imágenes `oficio-*.jpg` y `persona-*.jpg` (1.1 MB) | `public/images/`. Las de personas solo para seed y demo |
| `content/site.ts` (institución, oficios, pasos, requisitos, puntos de acopio) | Contenido estático + seed de categorías y puntos de atención |
| `favicon.png`, `robots.txt` | `src/app/icon.png` / `public/robots.txt` (o `app/robots.ts`) |

## Oportunidades de mejora

- El portal público se sirve con SSR/ISR y metadata dinámica, JSON-LD (`LocalBusiness`/`Person`) en los perfiles y un sitemap generado.
- Verificar el contraste AA de la paleta de marca (en especial amarillo y naranja con texto blanco). Si no alcanza, se agregan variantes `-foreground` oscuras.
- Agregar una versión de escritorio más completa: el prototipo está pensado casi solo para móvil (contenedor `max-w-5xl`).
- Dar coherencia a los estados vacíos, de carga (skeleton) y de error en todas las vistas.
