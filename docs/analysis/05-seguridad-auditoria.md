# 05 — Seguridad, auditoría, documentos y privacidad

Entregables §37: 18 Seguridad · 19 Auditoría. Cubre también §24, §25 y §26.

---

## 18. Seguridad

### OWASP Top 10 (2021) → controles

| Riesgo | Control en este sistema |
|---|---|
| A01 Control de acceso roto | Autorización en la capa de datos (`src/server/auth/authorize.ts`) con permisos granulares y verificación de propiedad o participación en cada caso de uso. RLS como segunda barrera. `proxy.ts` **no** se usa como control de acceso. Tests de autorización por endpoint (matriz rol × acción) |
| A02 Fallas criptográficas | TLS en todos los tramos. Cookie de sesión cifrada (JWE, `SESSION_SECRET` ≥ 32 bytes). Códigos de activación con hash. Storage privado con URLs firmadas de vida corta |
| A03 Inyección | Consultas parametrizadas (supabase-js / PostgREST, funciones SQL con parámetros). Sin SQL dinámico concatenado. Validación Zod de toda entrada |
| A04 Diseño inseguro | Máquinas de estado explícitas. Condiciones inmutables. Rate limiting. Separación de funciones en habilitación |
| A05 Configuración insegura | Headers de seguridad (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors 'none'). Data API sin exposición de tablas. Variables validadas al arrancar |
| A06 Componentes vulnerables | `pnpm audit`, Dependabot/Renovate, lockfile versionado, versiones fijas de paquetes Supabase |
| A07 Fallas de autenticación | Delegadas a Cognito (MFA, bloqueo por intentos, política de contraseñas). Verificación estricta de JWT (`iss`, `aud`/`client_id`, `token_use`, `exp`). `state` + `nonce` + PKCE |
| A08 Integridad de datos/software | Hash de las condiciones contratadas. CI con acciones fijadas por SHA. Migraciones revisadas |
| A09 Fallas de logging | `audit_log` inmutable, logs estructurados con `request_id`, alertas ante picos de `DENIED` |
| A10 SSRF | El servidor no descarga URLs proporcionadas por usuarios. Los enlaces del chat no se previsualizan en el MVP |

### Controles específicos

- **Validación de entradas:** los esquemas Zod compartidos entre cliente y servidor. El servidor **siempre** vuelve a validar, incluido el límite de 200 palabras.
- **XSS:** React escapa por defecto. Prohibido `dangerouslySetInnerHTML` con contenido de usuario (regla de ESLint). Los textos legales en Markdown se renderizan con un sanitizador. CSP con nonce para scripts.
- **CSRF:** SameSite=Lax. Las Server Actions verifican el Origin. Los Route Handlers mutables validan `Origin`/`Sec-Fetch-Site` o requieren Bearer.
- **Rate limiting:** por IP y por usuario.
  - Login y callback: 10/min por IP.
  - Nuevas conversaciones: 10/día por cliente.
  - Mensajes: 20/min por usuario.
  - Denuncias: 10/día.
  - Subidas: 30/h.
  - Implementación: tabla `rate_limits` con ventana deslizante en Postgres para el MVP. Upstash/Redis si el despliegue es serverless con mucho tráfico.
- **Anti-spam:** límite de conversaciones nuevas, detección de mensajes repetidos, bloqueo entre usuarios y denuncia rápida. [FUTURO] Filtro de palabras o de datos de contacto.
- **Archivos:**
  - Lista blanca de MIME types: `image/jpeg`, `image/png`, `image/webp` y `application/pdf`. Se verifica por *magic bytes*, no solo por extensión.
  - Tamaño máximo: 5 MB para documentos y 2 MB para fotos.
  - Nombre aleatorio (UUID) y sin rutas controladas por el usuario.
  - Las imágenes se re-codifican (se eliminan los metadatos EXIF y GPS).
  - [POST-MVP] Antivirus (ClamAV o servicio gestionado).
- **Secretos:**
  - Solo en variables de entorno del servidor. `server-only` en los módulos que los usan.
  - Detección de secretos en CI (gitleaks).
  - Nunca con el prefijo `NEXT_PUBLIC_`, salvo la URL y la publishable key de Supabase.
- **Logs:** estructurados en JSON, sin tokens, contraseñas, datos personales innecesarios ni contenido de mensajes. Las claves sensibles se redactan automáticamente (`src/lib/logger.ts`).
- **Sesiones:**
  - Expiración absoluta de 12 h para el personal GAD y 30 días para ciudadanos (con renovación).
  - Revalidación del estado del usuario (`BLOQUEADO`) en cada request.

## 19. Auditoría

### Qué se registra (catálogo inicial de `action`)

| Dominio | Acciones |
|---|---|
| Identidad | `USER_FIRST_LOGIN`, `USER_LOGIN`, `USER_LOGOUT`, `USER_BLOCKED`, `USER_UNBLOCKED`, `ROLE_GRANTED`, `ROLE_REVOKED`, `CONSENT_ACCEPTED` |
| Trabajadores | `WORKER_CREATED`, `WORKER_UPDATED`, `WORKER_PRIVATE_DATA_VIEWED`, `WORKER_STATUS_CHANGED`, `WORKER_ENABLED`, `WORKER_SUSPENDED`, `WORKER_REJECTED`, `WORKER_ACCOUNT_LINKED`, `ACTIVATION_CODE_ISSUED` |
| Documentos | `DOCUMENT_UPLOADED`, `DOCUMENT_VIEWED`, `DOCUMENT_VALIDATED`, `DOCUMENT_REJECTED`, `DOCUMENT_REPLACED` |
| Capacitación | `TRAINING_ENROLLED`, `TRAINING_APPROVED`, `TRAINING_FAILED` |
| Contratos | `CONTRACT_CREATED`, `TERMS_PROPOSED`, `CONTRACT_ACCEPTED`, `CONTRACT_REJECTED`, `CONTRACT_CANCELLED`, `CONTRACT_COMPLETED`, `CONTRACT_DISPUTED` |
| Reseñas | `REVIEW_CREATED`, `REVIEW_EDITED`, `REVIEW_HIDDEN`, `REVIEW_RESTORED` |
| Denuncias | `REPORT_CREATED`, `REPORT_ASSIGNED`, `REPORT_REVIEWED`, `REPORT_STATUS_CHANGED`, `REPORT_RESOLVED`, `MESSAGE_REVIEWED` (acceso a conversación) |
| Moderación | `MODERATION_ACTION_APPLIED` (con `metadata.action`) |
| Catálogo y configuración | `CATEGORY_*`, `SERVICE_*`, `LEGAL_DOCUMENT_PUBLISHED` |
| Exportaciones | `DATA_EXPORTED` (qué reporte, qué filtros) |
| Seguridad | `ACCESS_DENIED` (intentos sobre recursos administrativos) |

### Cómo se registra

- La función `logAudit()` (`src/server/audit/log.ts`) se llama desde cada caso de uso. En las acciones críticas corre dentro de la **misma transacción** que el cambio, mediante una función SQL que hace las dos cosas; así un cambio sin auditoría no puede persistir.
- Campos: usuario (`actor_id`), roles, acción, recurso, identificador, fecha, IP, user agent, resultado, `request_id` y `metadata` (diff de campos cambiados sin valores sensibles).
- **Inmutabilidad:** `REVOKE UPDATE, DELETE` a todos los roles de la aplicación, más un trigger `BEFORE UPDATE OR DELETE` que lanza una excepción.
- **Consulta:** `/admin/auditoria` para `SUPERVISOR` y `ADMIN_SISTEMA`, con filtros y exportación CSV (que también se audita).
- **Retención:** mínimo 5 años [PENDIENTE jurídico]. Archivado mensual a almacenamiento frío después de N meses.

## 26. Documentos del trabajador

| Aspecto | Propuesta |
|---|---|
| Qué documentos | Certificado de antecedentes penales (si se exige), certificado de capacitación (lo genera la plataforma o se sube), certificados de oficio (opcional), foto de perfil. **[PENDIENTE]** P-06: lista oficial del GAD y cuáles son obligatorios |
| Quién carga | `OPERADOR_PUNTO` y `ADMIN_TRABAJADORES`. **[POST-MVP]** El trabajador desde la app, quedando en estado `PENDIENTE` |
| Quién consulta | `ADMIN_TRABAJADORES`, el `OPERADOR_PUNTO` que lo subió y el titular. `RESP_DENUNCIAS` solo si hay una denuncia vinculada (auditado) |
| Quién reemplaza | Los mismos que cargan. El anterior pasa a `REEMPLAZADO` y no se borra |
| Vencimiento | `expires_at` según el tipo (p. ej. antecedentes: 6 meses [PENDIENTE]). Un job diario marca los `VENCIDO` y notifica. Si un documento obligatorio vence → alerta al admin (la suspensión automática es [PENDIENTE]) |
| Estados | `PENDIENTE → VALIDADO / RECHAZADO → VENCIDO / REEMPLAZADO` |
| Almacenamiento | Bucket privado `worker-documents/{worker_id}/{uuid}.{ext}`. En la base solo la ruta, el hash y los metadatos |
| Control de acceso | Sin políticas de lectura para `anon` ni `authenticated`. El servidor genera una URL firmada de 5 min tras autorizar |
| Auditoría | `DOCUMENT_UPLOADED/VIEWED/VALIDATED/REJECTED/REPLACED` |

## 24. Privacidad y marco legal (Ecuador)

- **[CONFIRMADO en el prototipo, a validar]** Tanto el prototipo como el plan hacen referencia a la **Ley Orgánica de Protección de Datos Personales (LOPDP, 2021)**, los derechos del titular ("ARCO+") y un correo de delegado de protección de datos.
- **Aspectos que el área jurídica del GAD debe validar** (no se inventan requisitos):
  1. Base legal del tratamiento para cada finalidad: consentimiento, o competencia pública y ordenanza.
  2. Texto del aviso de privacidad y de los términos y condiciones, con su versionado.
  3. Tratamiento de **datos sensibles**: antecedentes penales, y salud si aplica al cuidado de personas.
  4. Plazos de retención por tipo de dato: mensajes, documentos, auditoría.
  5. Transferencia internacional de datos (Supabase, Cognito y Firebase alojan fuera de Ecuador).
  6. Designación del delegado de protección de datos y el procedimiento de atención de derechos.
  7. Procedimiento ante vulneraciones de seguridad (notificación y plazos).
  8. Si se requiere una evaluación de impacto.
  9. Validez de la aceptación electrónica de condiciones entre particulares y el rol del GAD como intermediario.
- **Controles técnicos que se implementan en cualquier caso:** consentimiento versionado, minimización, cifrado, control de acceso, auditoría de accesos sensibles, exportación de datos del titular [POST-MVP] y anonimización al eliminar la cuenta.
