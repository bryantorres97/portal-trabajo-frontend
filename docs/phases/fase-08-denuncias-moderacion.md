# Fase 8 — Denuncias y moderación (checklist)

Objetivo, criterios y riesgos en `docs/analysis/08-roadmap.md`. **Estado: IMPLEMENTADA (2026-09-27)**. Migración validada en Supabase dev dentro de una transacción revertida (pgTAP 55/55; Fases 5, 6 y 7 sin regresiones); **aplicada en la nube** (2026-09-27; advisors sin observaciones, pg_cron y bucket creados). Falta la validación manual.

## Decisiones de diseño

| Tema | Decisión | Motivo |
|---|---|---|
| Qué se denuncia | Perfil de trabajador, cliente (solo su trabajador), conversación, mensaje (Fase 5), reseña (Fase 7) y contratación (disputa, Fase 6). Todas pasan por los mismos triggers de `reports` | CU-10 |
| Prioridad y plazo (P-14) | La gravedad del motivo fija la prioridad (alta/media/baja) y el plazo (24 h / 72 h / 7 días, en `app_settings`). El GAD puede cambiar la prioridad. Vencidas resaltadas | P-14 abierta: valores recomendados configurables |
| Anti-abuso | 10 denuncias por persona y día (trigger), una abierta por objeto y denunciante (RN-16), sin auto-denuncia | `05-seguridad-auditoria.md` |
| Estados | `ABIERTA → EN_REVISION → (EN_ESPERA_DE_INFORMACION ↔ EN_REVISION) → ESCALADA → RESUELTA / DESCARTADA`; terminales. Transiciones en TS y en `private.report_transition_allowed` (un test compara ambas) | `01-negocio.md` §6.3 |
| Historial | `report_events` append-only; cada cambio de estado lo registra un trigger (con el actor de la transacción) y avisa al denunciante con un mensaje genérico | Trazabilidad |
| Seguimiento | «Mis denuncias» (`/denuncias`): estado, historial visible, pedidos de información y aportes (nota o archivo). Al responder, vuelve a revisión | CU-10 |
| Evidencia | Archivos del denunciante en bucket privado `report-evidence` (PDF/JPG/PNG/WEBP, 4 MB, firma binaria, hasta 5). Notas de texto | «Crear denuncia con evidencia» |
| RN-09 | Conversación, contratación y evidencia solo con `report.evidence.read` y **justificación** (20+ caracteres) desde una denuncia. Cada acceso: `sensitive_access_log` (inmutable) + auditoría `MESSAGE_REVIEWED` + evento en el historial. Los archivos se abren durante 30 min tras el acceso; cada apertura se registra | Criterio de la fase |
| Sanciones | `moderation_actions`: advertencia, ocultar mensaje o reseña (`moderation.act`); suspender trabajador o cuenta con fecha de fin, dar de baja al trabajador, bloquear cuenta (`report.manage`). Suspender o bloquear una cuenta revoca sus sesiones y sus tokens en Cognito. Las acciones son inmutables; se levantan una vez (revocación con motivo) | «Acciones de moderación con vigencia» |
| Vigencia | pg_cron `acolita-moderacion-vigencias` cada 15 min (y `GET /api/internal/moderation`): levanta suspensiones vencidas (el trabajador vuelve a `HABILITADO`, la cuenta a `ACTIVO`). También cubre las suspensiones con fecha hechas desde la ficha (Fase 4) | «La suspensión temporal expira» |
| Disputas | La denuncia de una disputa se cierra resolviendo la contratación (finalizar o cancelar) desde la misma denuncia | Coherencia con la Fase 6 |
| Escalamiento | Estado `ESCALADA` con motivo; vista «Escaladas» en la bandeja (el SUPERVISOR la consulta con `report.read`) | P-14: a quién se escala, pendiente |
| Panel | `/admin/denuncias`: vistas (por atender, mías, sin asignar, esperando información, escaladas, vencidas, cerradas) con contadores; detalle con gestión, evidencia, sanciones e historial. La portada «Por atender» muestra denuncias y vencidas | CU-16 |

## Checklist

### Base de datos (`20260927120000_denuncias_moderacion`)
- [x] `reports` + prioridad, asignación, plazo, resolución; `report_events`, `report_evidence`, `sensitive_access_log`, `moderation_actions`; bucket `report-evidence`
- [x] Motivos `WORKER`, `CLIENT`, `CONVERSATION`
- [x] Funciones: crear, mis denuncias, aportar, bandeja, resumen, detalle, gestionar, acceso a evidencia, archivo, sancionar, levantar, vigencias; pg_cron
- [x] pgTAP `08_fase8_denuncias.test.sql` (55 pruebas)
- [x] Aplicada en la nube: tareas pg_cron `acolita-*` (2), bucket `report-evidence`, caché de PostgREST recargada, perfil público 200

### Servidor, API y web
- [x] `src/server/domain/reports/*`, `src/server/reports/{reports,admin}.ts`; `storage/files.ts` con bucket configurable
- [x] API: `GET/POST /api/v1/reports`, `GET /api/v1/reports/{id}`, `POST /api/v1/reports/{id}/evidence` (JSON o multipart), `GET /api/internal/moderation`
- [x] Ciudadano: «Denunciar este perfil», «Denunciar conversación» y «Denunciar al cliente» en el chat, `/denuncias` y su detalle, acceso en Mi cuenta
- [x] Panel: `/admin/denuncias` y detalle; archivo de evidencia con URL firmada; módulo habilitado; portada con pendientes

### Pruebas
- [x] Unit (21 nuevas): estados y transiciones idénticos a la base, acciones por permiso y objeto, fin de suspensión en hora de Ecuador, esquemas, diálogo de denuncia (sin sesión y con éxito), arquitectura (solo `server/reports` abre evidencia)
- [x] pgTAP (55): RLS, registro inmutable, prioridad y plazo, RN-16, auto-denuncia, límite diario, RN-09 (moderador sin permiso, justificación, registro de cada acceso), flujo con pedido de información, sanciones con permisos, **la suspensión temporal expira**, suspensión de cuenta con revocación de sesiones y su levantamiento, resolución y aviso genérico, disputa
- [x] Integración (CI): Storage real para la evidencia, archivo falso rechazado, RN-09, asignación concurrente
- [x] E2E: acceso sin sesión, «Denunciar este perfil», CSRF, panel protegido, tarea interna
- [ ] Validación manual

## Resultados
- Unit 400; lint, formato, tipos y build OK.
- Validación en la nube con transacción revertida: Fase 8 55/55; Fases 5, 6 y 7: 37/37, 73/73 y 47/47.

## Validación manual
1. Con una cuenta ciudadana, denunciar un perfil desde `/trabajadores/…`, una conversación y un mensaje; ver «Mis denuncias».
2. En el panel, con un RESP_DENUNCIAS: «Denuncias» → abrir la de mayor prioridad → «Asignármela».
3. «Acceder a la evidencia» sin justificación (error) y con justificación: ver la conversación y el mensaje resaltado; el acceso aparece en «Accesos a la evidencia».
4. «Pedir información»: el ciudadano ve el pedido, responde y adjunta una captura; la denuncia vuelve a revisión y el archivo se abre desde el panel.
5. Sanciones: ocultar el mensaje (MODERADOR), suspender al trabajador unos días (RESP_DENUNCIAS) y comprobar que desaparece de la búsqueda; revocar la suspensión.
6. Resolver con «Se aplicaron medidas»: el ciudadano recibe el resultado genérico.
7. Una disputa (Fase 6): resolverla desde su denuncia (finalizar o cancelar).
