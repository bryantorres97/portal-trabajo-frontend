# 01 — Negocio, actores, reglas y requisitos

Entregables §37: 1 Resumen ejecutivo · 2 Comprensión del negocio · 3 Actores · 4 Casos de uso · 5 Reglas de negocio · 6 Estados · 7 Flujos · 8 Requisitos funcionales · 9 Requisitos no funcionales.

---

## 1. Resumen ejecutivo

El GAD Municipal de Ambato necesita una plataforma web institucional (nombre **Llankana**; hasta el 2026-09-28 se llamó Acolita.App, ADR-017) que conecte a ciudadanos que necesitan servicios de oficio con trabajadores **registrados presencialmente, capacitados y habilitados por el GAD**. La plataforma permite descubrir trabajadores, conversar por chat, acordar condiciones que quedan registradas de forma inmutable, formalizar la contratación, calificar, denunciar y moderar. Todo con auditoría estricta.

Pilares técnicos:

| Pieza | Responsable |
|---|---|
| Identidad (login, MFA, recuperación) | AWS Cognito, centralizado en el GAD |
| Datos de negocio y reglas | Supabase Postgres, a través de la API de Next.js |
| Archivos (fotos, documentos, evidencias) | Supabase Storage, en buckets privados |
| Tiempo real del chat | Supabase Realtime |
| Notificaciones push | Firebase Cloud Messaging, detrás de un módulo desacoplado |
| Web pública y paneles | Next.js 16, con SSR y SEO |
| Futura app móvil de trabajadores | Consume la misma API `/api/v1` |

El MVP cubre el ciclo completo: registrar al trabajador → habilitarlo → que un cliente lo encuentre → chat → contrato → calificación → denuncia y moderación. El roadmap tiene 12 fases (0–11). Hay decisiones institucionales pendientes que pueden alterar las reglas de capacitación, moderación y datos personales; se listan en `09-riesgos-preguntas.md`.

## 2. Comprensión del negocio

- **[CONFIRMADO]** La plataforma es administrada institucionalmente por el GAD. Su objetivo es la intermediación laboral de oficios, no la intermediación financiera.
- **[INFERIDO, del prototipo]** El pago se hace directo entre cliente y trabajador. La plataforma no cobra comisiones ni retiene dinero (`contratantes.tsx`: "La plataforma no cobra comisiones ni retiene dinero"). → **[CONFIRMADO, GAD 2026-09-26]** El MVP **no** incluye pagos (P-07).
- **[INFERIDO, del prototipo]** Existe un marco normativo local ("Ordenanza RC-025-2019, Art. 12") y la plataforma "no constituye relación de dependencia laboral". → **[PENDIENTE]** validar el texto con el área jurídica.
- **[CONFIRMADO]** El trabajador no se auto-registra. Lo registra personal del GAD en puntos de atención.
- **[CONFIRMADO]** Tener un registro no significa ser visible. Solo los trabajadores **HABILITADOS** aparecen en el portal.
- **[CONFIRMADO]** El proceso de capacitación todavía no está definido y debe poder evolucionar.
- Valor para cada actor:
  - Ciudadano: confianza, porque el trabajador está verificado y los acuerdos quedan escritos.
  - Trabajador: visibilidad y reputación.
  - GAD: política pública de empleo, trazabilidad y métricas.

## 3. Actores

| Actor | Tipo | Alta | Canal MVP |
|---|---|---|---|
| Visitante anónimo | Externo | — | Web pública (solo lectura) |
| Cliente | Externo | Auto-registro vía Cognito | Web |
| Trabajador | Externo | Registro presencial por el GAD, y luego vinculación con su cuenta Cognito | Web (móvil en el futuro) |
| Personal GAD | Interno | Asignación de rol por un `ADMIN_SISTEMA` | Web `/admin` |
| Sistema | Técnico | — | Tareas programadas (expiraciones, outbox de notificaciones) |

**[CONFIRMADO]** Una misma persona puede ser cliente y trabajador; por ejemplo, un albañil que contrata a un electricista. **[RECOMENDACIÓN]** Hay una sola identidad (`users`) con perfiles independientes (`client_profiles`, `worker_profiles`) y roles múltiples.

### Roles del GAD propuestos [RECOMENDACIÓN]

| Rol | Responsabilidad | Permisos clave |
|---|---|---|
| `ADMIN_SISTEMA` | Configuración global, usuarios internos, catálogos | Todo excepto leer conversaciones sin una denuncia asociada |
| `ADMIN_TRABAJADORES` | Ciclo de vida del trabajador | Crear y editar trabajadores, validar documentos, habilitar, suspender |
| `OPERADOR_PUNTO` | Registro presencial | Crear trabajadores, cargar documentos, editar datos antes de la habilitación |
| `RESP_CAPACITACION` | Capacitación | Registrar inscripciones, resultados y evidencias; aprobar capacitación |
| `MODERADOR` | Contenido | Ocultar reseñas y mensajes denunciados, advertir |
| `RESP_DENUNCIAS` | Casos | Gestionar denuncias, acceso auditado a la evidencia, aplicar sanciones |
| `SUPERVISOR` | Control | Lectura de reportes, métricas y auditoría; escalar casos |

Principios: mínimo privilegio. **[CONFIRMADO, GAD 2026-09-24]** No se exige separación de funciones: el personal del GAD con permiso de habilitación puede habilitar aunque haya registrado al trabajador.

## 4. Casos de uso principales

| ID | Actor | Caso de uso | Fase |
|---|---|---|---|
| CU-01 | Visitante | Explorar categorías y buscar trabajadores habilitados | 3 |
| CU-02 | Visitante | Ver el perfil público de un trabajador | 3 |
| CU-03 | Cliente | Registrarse, verificar su correo o teléfono e iniciar sesión (Cognito) | 1–2 |
| CU-04 | Cliente | Completar su perfil y aceptar términos y consentimiento | 2 |
| CU-05 | Cliente | Iniciar una conversación con un trabajador | 5 |
| CU-06 | Cliente/Trabajador | Intercambiar mensajes, marcar como leído, bloquear | 5 |
| CU-07 | Cliente/Trabajador | Proponer, contraproponer y aceptar condiciones | 6 |
| CU-08 | Cliente/Trabajador | Cancelar, marcar como finalizada o abrir una disputa | 6 |
| CU-09 | Cliente | Calificar y comentar una contratación finalizada | 7 |
| CU-09b | Trabajador | Calificar al cliente de una contratación finalizada (visible solo para trabajadores y GAD) | 7 |
| CU-10 | Cliente/Trabajador | Denunciar un perfil, mensaje, reseña o contratación; consultar su estado | 8 |
| CU-11 | Trabajador | Vincular su cuenta Cognito al registro presencial (código de activación) | 2/4 |
| CU-12 | Trabajador | Editar la parte autorizada de su perfil y su disponibilidad | 2/4 |
| CU-13 | Operador | Registrar a un trabajador, sus datos, servicios y documentos | 4 |
| CU-14 | Resp. capacitación | Registrar la inscripción y el resultado de la capacitación | 4 |
| CU-15 | Admin trabajadores | Habilitar, suspender, rechazar o inactivar a un trabajador | 4 |
| CU-16 | Resp. denuncias | Revisar una denuncia, acceder a la evidencia de forma auditada, resolver, sancionar | 8 |
| CU-17 | Moderador | Ocultar o restaurar contenido | 7–8 |
| CU-18 | Supervisor | Consultar métricas, reportes y auditoría; exportar | 9 |
| CU-19 | Admin sistema | Mantener categorías y servicios, gestionar roles internos | 3/9 |
| CU-20 | Sistema | Enviar notificaciones y expirar propuestas | 5–6 |

## 5. Reglas de negocio

| ID | Regla | Etiqueta |
|---|---|---|
| RN-01 | Solo aparecen en búsquedas y perfiles públicos los trabajadores con estado `HABILITADO` y sin suspensión vigente | CONFIRMADO |
| RN-02 | Un trabajador no puede pasar a `HABILITADO` sin capacitación aprobada y documentos obligatorios validados | CONFIRMADO / INFERIDO |
| RN-03 | La habilitación la ejecuta un rol autorizado y queda auditada (`WORKER_ENABLED`) | CONFIRMADO |
| RN-04 | Una conversación no implica contratación. La contratación existe solo cuando **ambas partes aceptaron la misma versión** de condiciones | CONFIRMADO |
| RN-05 | Las condiciones aceptadas son inmutables. Cualquier cambio genera una nueva versión que requiere una nueva aceptación de ambas partes | CONFIRMADO |
| RN-06 | En una contratación `FINALIZADA`, el cliente califica al trabajador y el trabajador califica al cliente, **una vez cada uno** | CONFIRMADO |
| RN-07 | El comentario de una reseña tiene un máximo de **200 palabras**, validado en frontend, backend y base de datos | CONFIRMADO |
| RN-08 | La reseña puede editarse durante 7 días y no puede eliminarla su autor (sí ocultarla un moderador) | RECOMENDACIÓN / PENDIENTE |
| RN-09 | El personal del GAD solo accede al contenido de una conversación si existe una denuncia que la involucre; cada acceso registra la justificación en auditoría | CONFIRMADO |
| RN-10 | Solo un cliente puede iniciar conversaciones, y solo con trabajadores habilitados | INFERIDO |
| RN-11 | Hay límites anti-abuso: número de conversaciones nuevas por cliente y día, y de mensajes por minuto | RECOMENDACIÓN |
| RN-12 | Una propuesta de condiciones expira si no se responde en N días (N=7, configurable) | RECOMENDACIÓN / PENDIENTE |
| RN-13 | Un usuario bloqueado no puede enviar mensajes al usuario que lo bloqueó | RECOMENDACIÓN |
| RN-14 | Un trabajador suspendido no aparece en búsquedas. Sus contrataciones activas siguen visibles para las partes, pero no puede aceptar nuevas | RECOMENDACIÓN |
| RN-15 | Toda acción administrativa relevante genera un registro de auditoría inmutable | CONFIRMADO |
| RN-16 | No se permite la auto-denuncia ni denunciar dos veces el mismo objeto mientras exista una denuncia abierta del mismo denunciante | RECOMENDACIÓN |
| RN-17 | El precio acordado es informativo. La plataforma no procesa pagos | CONFIRMADO (GAD) |
| RN-18 | El cliente debe aceptar los términos y dar su consentimiento de tratamiento de datos antes de usar funciones transaccionales; se guarda la versión aceptada | CONFIRMADO (consentimiento) / RECOMENDACIÓN (versionado) |
| RN-19 | El teléfono y el WhatsApp del trabajador **nunca** se muestran a clientes. Todo contacto pasa por el chat interno | CONFIRMADO (GAD) |
| RN-20 | La calificación que el trabajador hace del cliente es visible **solo para trabajadores y personal del GAD**, nunca para otros clientes ni en páginas públicas | CONFIRMADO (GAD) |

## 6. Estados de cada proceso

### 6.1 Trabajador [RECOMENDACIÓN, a partir de §6]

```text
                ┌──────────────┐
                │  REGISTRADO  │  (alta presencial)
                └──────┬───────┘
                       ▼
          ┌──────────────────────────┐
          │ DOCUMENTACION_PENDIENTE  │◄──────────────┐
          └──────────┬───────────────┘               │ (faltan / rechazados)
                     ▼                               │
          ┌──────────────────────────┐               │
          │   PENDIENTE_REVISION     │───────────────┘
          └──────────┬───────────────┘
                     ▼ (documentos validados)
          ┌──────────────────────────┐
          │  CAPACITACION_PENDIENTE  │
          └──────────┬───────────────┘
                     ▼
          ┌──────────────────────────┐
          │ CAPACITACION_EN_PROCESO  │──► (reprobada) vuelve a CAPACITACION_PENDIENTE
          └──────────┬───────────────┘
                     ▼
          ┌──────────────────────────┐
          │  CAPACITACION_APROBADA   │
          └──────────┬───────────────┘
                     ▼ (acción explícita de habilitación)
          ┌──────────────────────────┐
          │       HABILITADO         │◄──► SUSPENDIDO (temporal, con fecha fin opcional)
          └──────────┬───────────────┘
                     ▼
                  INACTIVO (baja voluntaria o administrativa; reactivable)

   RECHAZADO: estado terminal alcanzable desde cualquier estado previo a HABILITADO (motivo obligatorio).
```

- Cambios respecto a la propuesta original de §6:
  - `PENDIENTE_REVISION` queda entre documentación y capacitación. Es el momento en que el GAD valida los documentos.
  - Se agrega `CAPACITACION_PENDIENTE` como estado propio.
- Cada transición se registra en `worker_status_history` (desde, hasta, actor, motivo, fecha) y en auditoría.
- Las transiciones permitidas se definen en código: `src/server/domain/workers/state-machine.ts`, con tests exhaustivos.

### 6.2 Contratación [RECOMENDACIÓN, a partir de §13]

```text
SOLICITUD ──► NEGOCIACION ──► PROPUESTA_ENVIADA ──► ACEPTADA_PARCIAL ──► CONTRATADA ──► EN_CURSO ──► FINALIZADA
                  ▲                  │                     │                 │              │
                  └── contrapropuesta┘                     │                 │              └──► EN_DISPUTA ──► FINALIZADA / CANCELADA
                                                           │                 │
     RECHAZADA ◄───────────────────────────────────────────┘                 └──► CANCELADA (con motivo; antes de EN_CURSO)
     EXPIRADA  ◄─── propuesta sin respuesta dentro del plazo
```

- `SOLICITUD`: se abre al iniciar la conversación con intención de contratar. En la práctica se crea al enviar la primera propuesta; ver 6.2.1.
- `ACEPTADA_PARCIAL`: una de las dos partes ya aceptó la versión vigente.
- `CONTRATADA`: ambas aceptaron la **misma** `terms_version`. Se genera un hash (SHA-256) del contenido aceptado.
- `EN_CURSO` y `FINALIZADA`:
  - El trabajador marca el inicio y el fin.
  - El cliente confirma la finalización. Si no responde en N días, la finalización se confirma automáticamente. **[PENDIENTE]**
- Una modificación después de `CONTRATADA` crea una nueva versión de condiciones. El contrato vuelve a `ACEPTADA_PARCIAL` hasta que ambos acepten; la versión anterior se conserva.

#### 6.2.1 Simplificación recomendada para el MVP

- No se separa `HiringRequest` de `Contract`. Un `contract` nace en `NEGOCIACION` cuando alguna de las partes propone condiciones desde la conversación.
- La etapa `CONTACTO_INICIADO` corresponde a la conversación misma.

### 6.3 Denuncia [a partir de §15]

```text
ABIERTA ──► EN_REVISION ──► RESUELTA
   │            │   ▲
   │            ▼   │
   │   EN_ESPERA_DE_INFORMACION
   │            │
   │            ▼
   │        ESCALADA ──► RESUELTA / DESCARTADA
   └──────────► DESCARTADA
```

- **[RECOMENDACIÓN]** `RESUELTA` y `DESCARTADA` son terminales. Una reapertura crea una nueva denuncia vinculada (`parent_report_id`), para preservar la trazabilidad.

### 6.4 Documento del trabajador

`PENDIENTE → VALIDADO | RECHAZADO → (VENCIDO por fecha)`. Un documento reemplazado queda como `REEMPLAZADO` y nunca se borra físicamente mientras rija la política de retención.

### 6.5 Inscripción de capacitación

`INSCRITO → EN_PROCESO → APROBADO | REPROBADO | ABANDONADO`. `APROBADO` puede tener `vigente_hasta`, lo que permite el vencimiento de la certificación en el futuro.

## 7. Flujos principales

### 7.1 Alta y habilitación del trabajador

1. El operador inicia sesión en `/admin` y crea el trabajador con nombres, contacto, sector, servicios y categorías. Registra la **cédula o el pasaporte** como dato privado y obligatorio (ADR-019; las cuentas siguen sin cédula, ADR-008). El sistema advierte posibles duplicados por documento, teléfono, email y nombres, y el operador decide.
2. Carga los documentos, que se guardan en un bucket privado. Estado → `DOCUMENTACION_PENDIENTE` o `PENDIENTE_REVISION`.
3. El admin de trabajadores valida los documentos. Estado → `CAPACITACION_PENDIENTE`.
4. El responsable de capacitación registra la inscripción y luego el resultado con evidencia. Estado → `CAPACITACION_APROBADA`.
5. El admin de trabajadores revisa el perfil público (foto, descripción) y **habilita**. Se registra `WORKER_ENABLED` y se notifica al trabajador.
6. Vinculación de la cuenta **[RECOMENDACIÓN]**:
   - El trabajador crea o usa su cuenta Cognito.
   - Ingresa el **código de activación de un solo uso** que le entregó el operador. Es el único mecanismo de vinculación: los tokens del GAD no traen cédula y el `sub` cambia según el proveedor de login (ver `03-identidad-ambientes.md`).

### 7.2 Descubrimiento y contacto

Visitante → busca por texto, categoría o sector → ve la lista de habilitados → abre el perfil público → "Contactar". Si no tiene sesión, se le pide login con Cognito → consentimiento, si falta → se crea la conversación con el primer mensaje → se notifica al trabajador.

### 7.3 Negociación y contratación

1. Cualquiera de las partes presiona "Proponer condiciones" en el chat. El formulario incluye descripción, fecha o rango, lugar (sector o dirección, visible solo para las partes), precio y modalidad (por día, obra, hora) y observaciones.
2. Se crea `contract_terms` v1 y el contrato queda en `PROPUESTA_ENVIADA`. En el chat aparece una tarjeta con la propuesta.
3. La contraparte acepta, rechaza o contrapropone (v2).
4. Cuando ambos aceptaron la misma versión → `CONTRATADA` → se notifica a ambos → queda visible en "Mis contrataciones".
5. Ejecución: `EN_CURSO` → `FINALIZADA` → se habilita la calificación para el cliente.

### 7.4 Denuncia y moderación

1. El usuario denuncia un objeto (perfil, mensaje, reseña, conversación o contrato), indicando el motivo de una lista, una descripción y evidencia opcional.
2. La denuncia queda `ABIERTA`. Se notifica al equipo y aparece en la bandeja `/admin/denuncias`.
3. El responsable la toma (`EN_REVISION`). Si necesita ver la conversación, pulsa "Acceder a evidencia", escribe una justificación y queda un registro en `sensitive_access_log` y en la auditoría (`MESSAGE_REVIEWED`).
4. Aplica acciones: advertencia, ocultar contenido, suspender, deshabilitar, bloquear o escalar.
5. Resuelve la denuncia y el denunciante recibe una notificación con el resultado genérico.

## 8. Requisitos funcionales (resumen por módulo)

| Módulo | RF | Fase |
|---|---|---|
| Identidad | RF-ID-01 Login, registro, recuperación, MFA vía Cognito · RF-ID-02 Cierre de sesión global · RF-ID-03 Registro de consentimiento versionado | 1–2 |
| Perfiles | RF-PF-01 Perfil de cliente · RF-PF-02 Perfil de trabajador (público y privado) · RF-PF-03 Foto moderada · RF-PF-04 Disponibilidad | 2, 4 |
| Catálogo | RF-CT-01 Categorías jerárquicas · RF-CT-02 Servicios · RF-CT-03 Mantenimiento desde el admin | 3 |
| Búsqueda | RF-BS-01 Texto libre · RF-BS-02 Filtros por categoría, servicio, sector, disponibilidad, experiencia y calificación · RF-BS-03 Orden · RF-BS-04 Paginación | 3 |
| Trabajadores (admin) | RF-TR-01 Alta presencial · RF-TR-02 Documentos · RF-TR-03 Capacitación · RF-TR-04 Transiciones de estado · RF-TR-05 Historial | 4 |
| Chat | RF-CH-01 Conversación 1:1 · RF-CH-02 Mensajes de texto con hora · RF-CH-03 Estado de lectura · RF-CH-04 Tiempo real · RF-CH-05 Bloqueo · RF-CH-06 Denunciar mensaje | 5 |
| Contratación | RF-CO-01 Propuesta versionada · RF-CO-02 Aceptación bilateral · RF-CO-03 Cancelación, rechazo, expiración · RF-CO-04 Inicio y fin · RF-CO-05 Disputa | 6 |
| Calificaciones | RF-CA-01 Escala 1–5 · RF-CA-02 Comentario de ≤200 palabras · RF-CA-03 Promedio y conteo en el perfil · RF-CA-04 Moderación · RF-CA-05 Calificación del trabajador al cliente con visibilidad restringida | 7 |
| Denuncias | RF-DN-01 Crear denuncia con evidencia · RF-DN-02 Seguimiento · RF-DN-03 Bandeja admin · RF-DN-04 Acciones · RF-DN-05 Acceso auditado | 8 |
| Notificaciones | RF-NT-01 In-app · RF-NT-02 Push web con FCM · RF-NT-03 Preferencias | 5+ |
| Administración | RF-AD-01 Dashboard · RF-AD-02 Reportes básicos + CSV · RF-AD-03 Auditoría consultable · RF-AD-04 Gestión de roles internos | 9 |
| Contenido | RF-CN-01 Páginas institucionales (cómo funciona, privacidad, términos, FAQ, contacto) | 1, 9 |

## 9. Requisitos no funcionales

| Categoría | Requisito | Meta propuesta [RECOMENDACIÓN] |
|---|---|---|
| Seguridad | OWASP ASVS nivel 2 como referencia; ver `05-seguridad-auditoria.md` | Sin vulnerabilidades altas en el análisis antes de producción |
| Privacidad | Minimización de datos; datos sensibles fuera de la vista pública; cifrado en tránsito y en reposo | Revisión jurídica LOPDP [PENDIENTE] |
| Accesibilidad | WCAG 2.2 nivel AA | Lighthouse Accessibility ≥ 95; navegación completa por teclado |
| Rendimiento | Portal público SSR y cacheable | LCP < 2.5 s en 4G; TTFB < 600 ms |
| Disponibilidad | Servicio web | 99.5 % mensual (MVP) |
| Escalabilidad | Stateless en la web, Postgres con índices adecuados | 10k usuarios, 1k trabajadores y 100 chats concurrentes sin rediseño |
| Tiempo real | Entrega de mensajes | p95 < 1 s |
| Auditoría | Registros inmutables, consultables y exportables | Retención ≥ 5 años [PENDIENTE jurídico] |
| Mantenibilidad | TypeScript estricto, capas separadas, tests | Cobertura ≥ 80 % en `src/server/domain` |
| Portabilidad | API-first versionada | La app móvil usa la misma API |
| Idioma | Español (Ecuador) | i18n no requerido en el MVP |
| Compatibilidad | Navegadores modernos, móviles de gama media | Últimas 2 versiones de Chrome, Safari, Firefox y Edge; Android 10+ |
| Observabilidad | Logs estructurados, errores, métricas | Correlation ID por request |
