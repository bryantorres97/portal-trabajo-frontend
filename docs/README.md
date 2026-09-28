# Documentación — Portal de Empleo y Servicios GAD Ambato (Llankana)

## Cómo retomar el trabajo

1. Leer **`PROGRESS.md`**: fase actual, siguiente paso, bloqueos.
2. Si la fase actual tiene archivo en `phases/`, seguir su checklist.
3. Antes de escribir código de Next.js, consultar `node_modules/next/dist/docs/` (Next 16 tiene cambios incompatibles con versiones anteriores; por ejemplo, `middleware` ahora es `proxy.ts`).
4. Antes de escribir SQL o migraciones, cargar las skills `supabase` y `supabase-postgres-best-practices`.
5. Al terminar una tarea, marcarla en `PROGRESS.md` y en el archivo de fase. Si surge una decisión, registrarla en `DECISIONS.md`.

## Índice

| Documento | Contenido |
|---|---|
| `PROGRESS.md` | Estado, checklist por fase, bitácora |
| `DECISIONS.md` | Decisiones de arquitectura (ADR) |
| `analysis/01-negocio.md` | Resumen ejecutivo, negocio, actores, casos de uso, reglas, estados, flujos, requisitos |
| `analysis/02-arquitectura.md` | Arquitectura, Supabase, API, chat/realtime, notificaciones |
| `analysis/03-identidad-ambientes.md` | Cognito, autenticación/autorización, ambientes, CI/CD |
| `analysis/04-modelo-datos.md` | Modelo relacional, estados, índices, restricciones, privacidad |
| `analysis/05-seguridad-auditoria.md` | Seguridad, auditoría, documentos, privacidad y LOPDP |
| `analysis/06-frontend-existente.md` | Evaluación del prototipo en `resources/` |
| `analysis/07-alcance-mvp.md` | MVP, clasificación de funcionalidades, futuro |
| `analysis/08-roadmap.md` | Roadmap por fases y dependencias, estrategia de testing |
| `analysis/09-riesgos-preguntas.md` | Riesgos, preguntas pendientes, recomendaciones |
| `phases/` | Checklist detallado de cada fase en ejecución |
| `setup/` | Guías de configuración: Cognito dev, Supabase local, variables de entorno |

## Convenciones de etiquetado

Según §38 del `IMPLEMENTATION_PLAN.md`, cada afirmación relevante se marca como:

- **[CONFIRMADO]**: requisito explícito del GAD o del `IMPLEMENTATION_PLAN.md`.
- **[INFERIDO]**: se deduce razonablemente de lo anterior, pero no fue dicho.
- **[RECOMENDACIÓN]**: propuesta técnica del equipo.
- **[PENDIENTE]**: requiere una decisión de la institución. Se incluyen alternativas y la opción recomendada.
