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
| P-03 | ✅ Respondida en parte: el GAD **no tiene** pool ni cuenta no productiva. Queda por decidir en qué cuenta vive el pool de staging del proyecto | Infraestructura | F10 | Una cuenta institucional separada, o la del proyecto |
| P-04 | El pool de personal del GAD (Azure AD) **no admite terceros**. ¿Cómo se autentica el personal que administra el portal? ¿Con cuentas del pool de ciudadanos y roles internos del portal? ¿Se exige MFA (hoy apagado en ese pool)? | Seguridad / autenticación | F2 | Cuentas del pool de ciudadanos + roles en el portal + sesiones cortas (12 h); MFA a solicitar al GAD |
| P-05 | ✅ Respondida: usuario y contraseña, Google y Facebook (este último pendiente de aprobación de Meta). Solo falta confirmar cuándo habilitar el botón de Facebook | Autenticación / UX | F2 | Mostrar Google; Facebook cuando el GAD lo confirme |
| P-06 | ¿Qué documentos son obligatorios para habilitar a un trabajador? ¿Se exige el certificado de antecedentes penales? ¿Tienen vigencia? | Datos / legal | F4 | Tipos configurables; ninguno bloqueante hasta que se confirme |
| P-07 | ¿La plataforma participa en pagos o solo registra el precio acordado como referencia? | Contratación / arquitectura | F6 | Solo referencia, sin pagos |
| P-08 | ¿Se permite mostrar el teléfono o WhatsApp del trabajador, o todo contacto debe pasar por el chat interno? | Privacidad / UX | F3 | Solo chat interno (trazabilidad) |
| P-09 | ~~Registro Civil~~ → **Descartada:** el portal no maneja cédula | — | — | — |
| P-10 | ¿El trabajador califica al cliente? ¿Esa calificación es pública? | Calificaciones | F7 | Post-MVP y privada |
| P-11 | ¿Quién puede habilitar? ¿Se exige que quien habilita sea distinto de quien registró (separación de funciones)? | Roles | F4 | Sí, separación configurable, activa por defecto |
| P-12 | ¿Qué granularidad de ubicación usar: parroquias urbanas y rurales de Ambato, sectores o barrios? ¿Hay un catálogo oficial? | Búsqueda / datos | F3 | Catálogo de parroquias del cantón |
| P-13 | ¿Cómo es el proceso de capacitación: presencial, virtual, con evaluación, por oficio o general? ¿Tiene vigencia y requiere renovación? | Capacitación | F4 | Un curso general, resultado aprobado/reprobado, sin vencimiento |
| P-14 | ¿Qué sanciones aplica el GAD, cuáles son los plazos de atención de denuncias y a quién se escala? ¿Hay una ordenanza aplicable? | Moderación | F8 | Catálogo de acciones de §16 configurable |
| P-15 | Validación jurídica: base legal del tratamiento, transferencia internacional (AWS, Supabase, Firebase fuera de Ecuador), retención, textos legales | Legal / infraestructura | F2 (textos), F10 (prod) | Iniciar la consulta al área jurídica en paralelo |
| P-16 | ¿Dónde se desplegará: Vercel, AWS o infraestructura propia del GAD? ¿Hay restricciones de proveedor o de región? | Infraestructura | F10 | Vercel + Supabase en us-east (latencia baja a Ecuador) |
| P-17 | ¿Se puede agregar un Pre Token Generation Lambda al pool institucional (claim `role`)? ¿En qué plan (tier) está el pool? | Chat / realtime | F5 | Fallback: JWT propio para Realtime (ADR-004) |
| P-18 | ¿El nombre "Acolita.App" y la identidad visual del prototipo están aprobados? ¿Pueden entregar los logotipos en alta resolución (SVG/PNG)? | UX / marca | F1 (visual) | Usar provisionalmente el nombre y un logotipo textual |
| P-19 | ¿Rotará el GAD el client secret que aparece en `cognito-data.md`? | Seguridad | Inmediato | Recomendado: sí |
| P-20 | ¿Conviene dar de alta el portal en el catálogo de roles del GAD (claims `app_roles` y `app_permissions` en el ID token, instructivo §6)? | Roles | F2 | No en el MVP: los roles viven en la base del portal (ADR-006). Reevaluar si el GAD lo exige |

## 28. Recomendaciones finales

1. **Solicitar el App Client exclusivo** del portal (P-02) y pedir al GAD que rote el client secret de la otra aplicación que circula en `cognito-data.md` (P-19).
2. **Iniciar ya las consultas institucionales** (P-01, P-06, P-13, P-15, P-17), en paralelo a las Fases 1–3, que no dependen de ellas.
3. **Tratar el chat y los documentos como datos sensibles** desde el diseño: sin acceso administrativo libre y con auditoría de cada lectura.
4. **Mantener el MVP pequeño:** sin pagos, sin score de reputación, sin mapa, sin adjuntos. El valor diferencial es "trabajador habilitado por el GAD + acuerdo registrado".
5. **API-first real:** que la web use la misma capa de dominio que la API para que la app móvil no requiera reescrituras.
6. **Pruebas de autorización automatizadas** como puerta de calidad en CI desde la Fase 2.
7. **No publicar datos ficticios** del prototipo en producción; usarlos solo como seed de desarrollo.
