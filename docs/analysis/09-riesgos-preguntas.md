# 09 — Riesgos, preguntas pendientes y recomendaciones

Entregables §37: 25 Riesgos técnicos · 26 Riesgos funcionales · 27 Preguntas pendientes · 28 Recomendaciones finales. Cubre también §39.

## 25. Riesgos técnicos

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| RT-01 | Integración de Realtime de Supabase con Cognito: requiere una Lambda Pre-Token en el pool compartido | Alta | Alta | ADR-004 fallback: JWT propio de corta vida emitido por el servidor |
| RT-02 | El pool de Cognito es compartido; cambios del GAD (atributos, políticas) pueden romper el portal | Media | Alta | App client propio, verificación estricta y tolerante a claims ausentes, pruebas en staging |
| RT-03 | Next 16 introduce APIs nuevas o cambiadas (proxy, caché) respecto a la documentación conocida | Media | Media | Consultar `node_modules/next/dist/docs` antes de cada módulo |
| RT-04 | Rate limiting en Postgres puede ser insuficiente con carga alta | Baja | Media | Interfaz desacoplada; migrar a Redis/Upstash si hace falta |
| RT-05 | Residencia de datos fuera de Ecuador (Supabase, Cognito, Firebase) | Media | Alta | Validación jurídica (P-15); elegir una región cercana (us-east / sa-east) |
| RT-06 | Dependencia de un proveedor SaaS | Baja | Media | Postgres estándar, migraciones versionadas, capa de repositorios |
| RT-07 | Web push poco confiable en iOS | Alta | Baja | Priorizar la notificación in-app; push nativo con la app móvil |
| RT-08 | Datos sensibles (antecedentes penales) almacenados | Media | Alta | Bucket privado, URLs firmadas, auditoría, retención mínima |
| RT-09 | Crecimiento de `audit_log` y `messages` | Baja | Media | Índices adecuados; particionado mensual cuando corresponda |

## 26. Riesgos funcionales

| # | Riesgo | Mitigación |
|---|---|---|
| RF-01 | El proceso de capacitación no está definido y retrasa la habilitación | Modelo mínimo (curso + inscripción + resultado) configurable; se puede habilitar con evidencia externa |
| RF-02 | Carga operativa del personal GAD (registro presencial, denuncias) | Formularios eficientes, bandejas priorizadas, métricas de tiempos |
| RF-03 | Adopción baja por parte de trabajadores con poca experiencia digital | UX simple, vinculación por código entregado en persona, app móvil futura |
| RF-04 | Conflictos entre partes (incumplimientos, pagos fuera de la plataforma) | Condiciones inmutables como evidencia, disputas, términos claros sobre el rol del GAD |
| RF-05 | Expectativa de responsabilidad institucional sobre la calidad del trabajo | Texto legal validado: "no constituye relación de dependencia", tarifas referenciales |
| RF-06 | Reseñas falsas o extorsión mediante reseñas | Solo con contratación finalizada, moderación, derecho a denunciar |
| RF-07 | Contacto fuera de la plataforma (WhatsApp) que evita la trazabilidad | Decisión P-08; el chat interno como canal principal |

## 27 / §39. Preguntas que deben responderse antes del desarrollo

Se priorizan las que bloquean decisiones técnicas. **Bloquea** indica la primera fase afectada.

| ID | Pregunta | Área | Bloquea | Recomendación si no hay respuesta |
|---|---|---|---|---|
| P-01 | ~~Claim de cédula~~ → **Reformulada:** el portal no maneja cédula (decisión del usuario) y el `sub` cambia según el proveedor (instructivo). ¿El GAD exigirá en el futuro usar el `userId` maestro del Identity & Onboarding Service (que requiere cédula)? | Identidad | F2 | No integrar en el MVP. `users.master_user_id` queda preparado (ADR-008) |
| P-02 | Solicitar al GAD el **App Client confidencial** del portal en `contribuyentes-externos` (tipo backend, callback `https://<dominio>/api/auth/callback`, logout `https://<dominio>/`, contacto técnico). ¿Qué dominio tendrá el portal? | Autenticación / infraestructura | F10 (prod) | Solicitarlo en cuanto se conozca el dominio |
| P-03 | ✅ **Respondida (GAD, 2026-09-24):** no hay pool de pruebas ni de staging en el GAD. Desarrollo y staging usan el **pool personal** del equipo | — | — | Staging con un app client aparte en el pool personal |
| P-04 | ✅ Respondida en parte: el personal del GAD usa **MFA corporativo de Microsoft 365**. **Nueva duda → P-21** | Seguridad / autenticación | F2 | Ver P-21 |
| P-05 | ✅ **Respondida:** el pool de ciudadanos tiene federación con **Google y Facebook** | — | — | `COGNITO_IDENTITY_PROVIDERS=Google,Facebook` en producción (Facebook cuando Meta lo apruebe) |
| P-06 | ¿Qué documentos son obligatorios para habilitar a un trabajador? ¿Se exige el certificado de antecedentes penales? ¿Tienen vigencia? | Datos / legal | F4 | Tipos configurables; ninguno bloqueante hasta que se confirme |
| P-07 | ¿La plataforma participa en pagos o solo registra el precio acordado como referencia? | Contratación / arquitectura | F6 | Solo referencia, sin pagos |
| P-08 | ✅ **Respondida:** **no** se muestra el teléfono ni el WhatsApp del trabajador. Todo contacto pasa por el chat interno | — | — | Regla RN-19 |
| P-09 | ~~Registro Civil~~ → **Descartada:** el portal no maneja cédula | — | — | — |
| P-10 | ✅ **Respondida:** el trabajador **sí** califica al cliente. Esa calificación la ven **solo otros trabajadores y el personal del GAD**, nunca los clientes | — | — | Regla RN-20, ADR-011 |
| P-11 | ✅ **Respondida:** no se segregan funciones. Habilita el personal autorizado del GAD (quien tenga `worker.enable`), aunque haya registrado al trabajador | — | — | — |
| P-12 | ¿Qué granularidad de ubicación usar: parroquias urbanas y rurales de Ambato, sectores o barrios? ¿Hay un catálogo oficial? | Búsqueda / datos | F3 | Catálogo de parroquias del cantón |
| P-13 | ¿Cómo es el proceso de capacitación: presencial, virtual, con evaluación, por oficio o general? ¿Tiene vigencia y requiere renovación? | Capacitación | F4 | Un curso general, resultado aprobado/reprobado, sin vencimiento |
| P-14 | ¿Qué sanciones aplica el GAD, cuáles son los plazos de atención de denuncias y a quién se escala? ¿Hay una ordenanza aplicable? | Moderación | F8 | Catálogo de acciones de §16 configurable |
| P-15 | Validación jurídica: base legal del tratamiento, transferencia internacional (AWS, Supabase, Firebase fuera de Ecuador), retención, textos legales | Legal / infraestructura | F2 (textos), F10 (prod) | Iniciar la consulta al área jurídica en paralelo |
| P-16 | ✅ **Respondida:** despliegue en **Vercel** | — | — | ADR-007: región `cle1` (Cleveland), junto a Supabase y Cognito en us-east-2 |
| P-17 | ✅ **Resuelta sin tocar el pool:** no se necesita el Pre Token Generation Lambda. El servidor emite tokens propios de corta vida para Realtime (ADR-004). El tier del pool solo importaría si se quisiera el Lambda | — | — | ADR-004 |
| P-18 | ¿El nombre "Acolita.App" y la identidad visual del prototipo están aprobados? ¿Pueden entregar los logotipos en alta resolución (SVG/PNG)? | UX / marca | F1 (visual) | Usar provisionalmente el nombre y un logotipo textual |
| P-19 | ¿Rotará el GAD el client secret que aparece en `cognito-data.md`? | Seguridad | Inmediato | Recomendado: sí |
| P-20 | ¿Conviene dar de alta el portal en el catálogo de roles del GAD (claims `app_roles` y `app_permissions` en el ID token, instructivo §6)? | Roles | F2 | No en el MVP: los roles viven en la base del portal (ADR-006). Reevaluar si el GAD lo exige |
| P-21 | ✅ **Decidida (usuario, 2026-09-24): opción (b).** El portal integra **Microsoft Entra ID** del tenant del GAD, solo para el personal (ADR-012). Queda **pedir al GAD**: app registration single-tenant (client ID, tenant ID, secreto), redirect `https://<dominio>/api/auth/staff/callback` y **acceso condicional con MFA** para la app | Seguridad / autenticación | F2B | — |

## 28. Recomendaciones finales

1. **Solicitar el App Client exclusivo** del portal (P-02) y pedir al GAD que rote el client secret de la otra aplicación que circula en `cognito-data.md` (P-19).
2. **Iniciar ya las consultas institucionales** (P-01, P-06, P-13, P-15, P-21), en paralelo a las Fases 1–3, que no dependen de ellas.
3. **Tratar el chat y los documentos como datos sensibles** desde el diseño: sin acceso administrativo libre y con auditoría de cada lectura.
4. **Mantener el MVP pequeño:** sin pagos, sin score de reputación, sin mapa, sin adjuntos. El valor diferencial es "trabajador habilitado por el GAD + acuerdo registrado".
5. **API-first real:** que la web use la misma capa de dominio que la API para que la app móvil no requiera reescrituras.
6. **Pruebas de autorización automatizadas** como puerta de calidad en CI desde la Fase 2.
7. **No publicar datos ficticios** del prototipo en producción; usarlos solo como seed de desarrollo.
