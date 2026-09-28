# Fase 7 — Calificaciones (checklist)

Objetivo, criterios y riesgos en `docs/analysis/08-roadmap.md`; visibilidad en ADR-011. **Estado: IMPLEMENTADA (2026-09-26)**. Migración validada en Supabase dev dentro de una transacción revertida (pgTAP 47/47; Fases 5 y 6 siguen 37/37 y 73/73); **aplicada en la nube** (2026-09-27; advisors sin observaciones). Falta la validación manual.

## Decisiones de diseño

| Tema | Decisión | Motivo |
|---|---|---|
| Modelo | `reviews` con `direction` (`CLIENTE_A_TRABAJADOR`, `TRABAJADOR_A_CLIENTE`) y unique `(contract_id, direction)`. Escala única 1–5 + comentario opcional | ADR-011, `07-alcance-mvp.md` |
| Cuándo (RN-06) | Solo con la contratación `FINALIZADA`, por la parte correcta (trigger). Plazo para calificar: 30 días desde la finalización (`reviews.window_days`) | Reseñas basadas en trabajos reales; limita reseñas tardías coordinadas |
| RN-07 | ≤200 palabras en la web (contador en vivo), en la API (zod) y en la base (`CHECK` con `private.word_count`); misma regla de palabras en TS y SQL | Criterio de la fase |
| Edición (RN-08) | El autor edita durante 7 días (`reviews.edit_days`) si no está oculta; nunca la borra (sin DELETE). La edición queda marcada | Recomendación de la fase |
| Promedio | `worker_profiles.rating_avg` y `rating_count` se recalculan por trigger solo con reseñas **publicadas** del cliente | Desnormalizado para la búsqueda |
| RN-20 | La reseña del trabajador al cliente nunca sale en páginas públicas ni la ve el cliente. La ven: el trabajador de la conversación con rol `TRABAJADOR` activo (cabecera del chat y detalle de la contratación) y el personal del GAD con `moderation.act` | ADR-011; mínima exposición (no hay búsqueda de clientes) |
| Nombre del autor | «María G.» (nombre e inicial del apellido) | `04-modelo-datos.md` §7 |
| Invitación | Al finalizar, notificación `REVIEW_REQUEST` a ambas partes; «Califica» en «Mis contrataciones» | Aumenta la tasa de reseñas |
| Denuncia | `fn_report_review` (motivos `RESENA_*`): solo reseñas que el usuario puede ver, no la propia, una abierta por persona (RN-16) | Enganche de la Fase 8 |
| Moderación | `/admin/resenas` (`moderation.act`): denunciadas, ocultas y todas; ocultar o restaurar con motivo (auditado). Ocultar resuelve sus denuncias abiertas y recalcula el promedio | «Ocultar y restaurar (moderador)» |
| Datos de ejemplo | Los trabajadores ficticios del seed conservan su promedio de ejemplo; se recalcula en cuanto reciben una reseña real. El JSON-LD solo publica `aggregateRating` si hay reseñas | Evita datos de SEO sin respaldo |

## Checklist

### Base de datos (`20260926230000_calificaciones`)
- [x] `reviews` (+ enums), `private.word_count`, triggers de integridad y de promedio
- [x] Funciones: guardar (crear/editar), calificaciones de una contratación, reseñas públicas, reputación del cliente (RN-20), denuncia, listado y ocultar/restaurar para moderación
- [x] `contract_finalize` invita a calificar; `fn_list_contracts` devuelve `review_pending`
- [x] pgTAP `07_fase7_calificaciones.test.sql` (47 pruebas)
- [x] Aplicada en la nube; caché de PostgREST recargada; perfil público verificado (200)

### Servidor y API
- [x] `src/server/domain/reviews/schemas.ts`, `src/server/reviews/reviews.ts`
- [x] `GET/POST /api/v1/contracts/{id}/review`, `GET /api/v1/workers/{id}/reviews` (pública), `POST /api/v1/reviews/{id}/report`, `GET /api/v1/conversations/{id}/client-reputation` (solo el trabajador)

### Web
- [x] Detalle de la contratación: «¿Cómo te fue?», formulario con estrellas accesibles y contador de palabras, edición, calificación recibida (si se puede ver) y reputación del cliente para el trabajador
- [x] Chat: reputación del cliente en la cabecera (solo trabajador)
- [x] Perfil público: reseñas con «Ver más» y denuncia; `aggregateRating` en JSON-LD
- [x] «Mis contrataciones»: insignia «Califica»
- [x] Panel del GAD: módulo «Reseñas»

### Pruebas
- [x] Unit (17 nuevas): conteo de palabras, 200/201, rango 1–5, motivo de moderación, selector de estrellas, avisos RN-20 y contador en la interfaz, arquitectura (solo `server/reviews` usa las funciones; ninguna página pública pide la reputación de un cliente), módulo del panel
- [x] pgTAP (47): 201 palabras en función y tabla, doble reseña, sin contratación finalizada, identidad inmutable, sin DELETE, promedio al publicar, ocultar y restaurar, visibilidad RN-20, denuncia, moderación con permiso y auditoría
- [x] Integración (CI): 200/201 palabras, promedio, RN-20 con dos trabajadores, envíos simultáneos
- [x] E2E: sección de reseñas del perfil, API pública sin datos de clientes, sesión y CSRF, panel protegido
- [ ] Validación manual

## Resultados
- Unit 379; lint, formato, tipos y build OK.
- Validación en la nube con transacción revertida: Fase 7 47/47, Fase 6 73/73, Fase 5 37/37.

## Validación manual
1. En una contratación finalizada, el cliente ve «¿Cómo te fue con…?», elige estrellas, escribe un comentario (probar pasar de 200 palabras) y envía. La reseña aparece en el perfil público del trabajador y el promedio cambia.
2. El cliente edita su reseña (dentro de 7 días): aparece «editada».
3. El trabajador califica al cliente. Comprobar que el cliente **no** la ve en la contratación, y que el trabajador ve la reputación del cliente en la cabecera del chat.
4. Desde el perfil público, denunciar una reseña (con sesión).
5. En el panel, con un usuario MODERADOR o RESP_DENUNCIAS: «Reseñas» → «Denunciadas» → ocultar con motivo; el promedio del perfil cambia; restaurar.
