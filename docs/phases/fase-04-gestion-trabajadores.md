# Fase 4 — Gestión de trabajadores (checklist)

Objetivo, criterios y riesgos en `docs/analysis/08-roadmap.md`. **Estado: IMPLEMENTADA (2026-09-26)**, migración aplicada en la nube; validación manual pendiente.

## Decisiones de diseño

| Tema | Decisión | Motivo |
|---|---|---|
| Máquina de estados | Definida en `src/server/domain/workers/state-machine.ts` y **repetida en SQL** (`private.worker_transition_*`). Un test pgTAP compara la matriz de la base con la del dominio | La base impone las reglas aunque el servidor falle. La matriz es la de `01-negocio.md` §6.1 |
| Reglas de negocio en la base | `private.apply_worker_status` valida transición, motivo y condiciones: aprobar documentación exige **cero documentos pendientes** y los obligatorios validados; **habilitar exige capacitación APROBADA y vigente**, documentos obligatorios vigentes y al menos un oficio activo | Criterio de la fase: "habilitar sin capacitación aprobada → error" |
| Permisos por transición | Enviar a revisión/devolver: `worker.update` · aprobar documentación: `document.review` · capacitación: `training.record` / `training.approve` · habilitar y reactivar: `worker.enable` · suspender, rechazar, dar de baja: `worker.suspend` | Usa el catálogo de permisos existente; sin separación de funciones (P-11) |
| Motivo obligatorio | Rechazar, suspender, dar de baja, devolver por documentación y reactivar | Trazabilidad en historial y auditoría |
| Transiciones automáticas | Inscribir en un curso → `CAPACITACION_EN_PROCESO`; aprobar → `CAPACITACION_APROBADA`; reprobar o abandonar (sin otra inscripción abierta) → `CAPACITACION_PENDIENTE`. Todo en la misma transacción | El personal registra hechos, no estados |
| Suspensión con fecha fin | Se guarda `suspended_until` (informativo). La reactivación es **manual** | Una reactivación automática necesita un job (pg_cron o Vercel Cron): se evalúa en la Fase 8 |
| Documentos (P-06) | `document_types` configurable (`ANTECEDENTES_PENALES`, `CERT_CAPACITACION`, `CERT_OFICIO`, `OTRO`), **ninguno obligatorio** hasta que el GAD confirme | Recomendación de `09-riesgos-preguntas.md` |
| Almacenamiento | Bucket **privado** `worker-files` creado por migración, 4 MB, PDF/JPG/PNG/WEBP, **sin políticas de Storage**: solo el servidor sube y firma. Rutas `workers/{id}/documents/{uuid}.ext` (nunca el nombre original) | Datos sensibles (RT-08) |
| Validación de archivos | Por **firma binaria** (magic bytes); el tipo declarado por el navegador debe coincidir. SHA-256 para evitar cargas duplicadas | Criterio: "subida con MIME falso → rechazo" |
| Acceso a documentos | `document.read`, o `document.upload` solo para lo que subió uno mismo (operador). URL firmada de **5 min** (redirección 303). Cada acceso se audita (`DOCUMENT_ACCESSED`), también los denegados | `04-modelo-datos.md` §7 |
| Documentos nunca se borran | Se reemplazan (`REEMPLAZADO`). `VENCIDO` se calcula por fecha | Política de retención pendiente (P-15) |
| Capacitación (P-13) | Curso `GENERAL` obligatorio, sin vencimiento, sembrado por migración. CRUD de cursos en `/admin/capacitacion`. Evidencia = un documento cargado del trabajador | Modelo mínimo; admite cursos externos (RF-01) |
| Alta presencial | Asistente de 4 pasos: datos personales → contacto → oficios y perfil → resumen. Los **documentos, la foto y el código** se cargan en la ficha, recién creado el trabajador | Los archivos necesitan el id del trabajador y cada request está limitado a ~4,5 MB en Vercel |
| Duplicados | Por celular, correo o nombres sin tildes. Si hay candidatos, no se crea hasta que el operador confirme; la confirmación queda auditada | `01-negocio.md` §7.1 |
| Datos personales | Solo con `worker.read.private`; cada consulta de la ficha con datos personales se audita (`WORKER_PRIVATE_DATA_VIEWED`). Buscar por celular o correo también exige ese permiso. La auditoría nunca guarda datos personales | RN-19 |
| Código de activación | `XXXX-XXXX` sin caracteres ambiguos, vigencia 7 días, **un solo código vigente** por trabajador, se guarda solo su **HMAC-SHA256** (clave derivada de `SESSION_SECRET`). Canje: vincula la ficha y asigna el rol `TRABAJADOR`. **5 intentos fallidos en 15 min → 429** (los fallos quedan auditados) | Único mecanismo de vinculación (ADR-008) |
| Edición por el trabajador | `/cuenta/trabajador`: disponibilidad (directa), descripción y nota de horario (**propuesta**), foto (**propuesta**). El GAD aprueba o rechaza con motivo (`worker.update`). La foto que toma el personal en la atención queda aprobada | "Aprobación de foto y bio pública" |
| Fotos públicas | Se sirven por el servidor en `/api/v1/workers/{id}/photo` **solo si el trabajador está HABILITADO** (caché 5 min). Las funciones públicas devuelven `has_photo` | El bucket sigue privado y la CSP no cambia |
| Puntos de atención | `registration_points` **no** se implementa aún | Sin catálogo oficial del GAD; se agrega cuando lo entreguen |

## Checklist

### Base de datos (`20260926035024_gestion_trabajadores`)
- [x] `worker_status_history` (append-only), `document_types`, `worker_documents`, `trainings`, `training_enrollments`, `worker_activation_codes`
- [x] Columnas de moderación en `worker_profiles` (foto pendiente, propuesta de descripción) e índices de duplicados
- [x] Máquina de estados, reglas de habilitación y funciones `fn_*` con auditoría atómica
- [x] Bucket privado `worker-files`
- [x] `fn_public_*` con `has_photo` y `fn_public_worker_photo_path`
- [x] Seed dev: historial inicial y capacitación aprobada de los trabajadores ficticios habilitados
- [x] pgTAP `04_fase4_trabajadores.test.sql` (41 pruebas)

### Servidor
- [x] `src/server/domain/workers/` (máquina de estados, esquemas, código de activación) y `domain/documents/files.ts`
- [x] `src/server/storage/files.ts`
- [x] `src/server/workers/` (`admin`, `documents`, `training`, `activation`, `public-profile`)
- [x] API `GET/PATCH /api/v1/me/worker`, `POST /api/v1/me/worker/link`, `GET /api/v1/workers/{id}/photo`

### Web
- [x] `/admin/trabajadores` (búsqueda, filtro por estado), `/nuevo` (asistente), `/[id]` (ficha), `/[id]/editar`
- [x] `/admin/trabajadores/[id]/documentos/[docId]` (URL firmada) y `/[id]/foto`
- [x] `/admin/capacitacion` (bandeja y cursos)
- [x] `/cuenta/trabajador` (canje del código, estado, disponibilidad, propuestas)
- [x] Fotos en tarjetas y perfil público

### Pruebas
- [x] Unit: las 100 combinaciones de estados, permisos y motivos; firma binaria y MIME falso; código de activación; esquemas
- [x] Integración (Storage real): duplicados, datos privados auditados, subida y MIME falso, **URL firmada que expira**, bucket no público, permisos de acceso a documentos, habilitar sin capacitación → error, suspendido desaparece de la búsqueda de inmediato, código de un solo uso y límite de intentos, foto pendiente no pública
- [x] E2E: control de acceso de las rutas nuevas y de la API
- [ ] **Validación manual** con sesión real (personal de Entra + trabajador de Cognito). Lista abajo

## Resultados
- Pruebas: unit 219 · integración 61 · pgTAP 89 · E2E 108 (escritorio y móvil).
- `supabase db lint` y `db advisors` sin observaciones.
- CI: `supabase start` ahora incluye Storage (lo usan las pruebas de documentos).

## Validación manual pendiente
1. Con `admin.dev` (asignarle `ADMIN_TRABAJADORES` y `RESP_CAPACITACION`): registrar un trabajador en menos de 10 minutos (criterio de aceptación) y provocar el aviso de duplicado.
2. Cargar un PDF y una imagen, abrirlos (la URL vence a los 5 min), validar uno y rechazar otro.
3. Aprobar documentación → inscribir → aprobar → habilitar. Comprobar que aparece en `/buscar`; suspender y comprobar que desaparece.
4. Emitir el código, iniciar sesión con una cuenta ciudadana y canjearlo en `/cuenta/trabajador`. Proponer foto y descripción; aprobarlas desde la ficha.
5. Con `personal.dev` con rol `OPERADOR_PUNTO`: comprobar que no puede validar documentos ni habilitar.

## Notas
- Migración **aplicada en Supabase dev (nube)** el 2026-09-26: bucket privado de 4 MB, RLS, historial inicial de los 17 trabajadores ficticios, curso `GENERAL`; advisors sin observaciones. El primer intento falló sin dejar cambios: en la nube, `SET pg_trgm.word_similarity_threshold` en una función exige que la librería de pg_trgm esté cargada en la sesión; la migración ahora la carga antes (`select extensions.similarity(...)`).
- Las inscripciones aprobadas de los trabajadores ficticios están solo en `seed.sql` (local). En la nube, reactivar a un ficticio suspendido pedirá antes registrarle la capacitación.
- La ficha registra `WORKER_PRIVATE_DATA_VIEWED` en cada visualización (también tras cada acción, porque la página se vuelve a renderizar). Si resulta ruidoso, se puede agrupar por sesión en la Fase 9.
