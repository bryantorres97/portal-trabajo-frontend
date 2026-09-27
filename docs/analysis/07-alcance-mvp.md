# 07 — Alcance del MVP y funcionalidades futuras

Entregables §37: 21 MVP · 22 Funcionalidades futuras. Cubre también §31 y §32.

## 21. MVP

El alcance de §32 se mantiene, con los siguientes ajustes:

```text
Cliente
 ├── Registro/Login (Cognito) + consentimiento versionado
 ├── Perfil básico
 ├── Buscar trabajadores (texto + categoría/servicio + sector + disponibilidad + calificación)
 ├── Consultar perfil público
 ├── Iniciar conversación + chat en tiempo real (solo texto)
 ├── Proponer / aceptar condiciones (versionadas, inmutables)
 ├── Contratar, cancelar, confirmar finalización
 ├── Consultar contrataciones
 ├── Calificar (1–5 + comentario ≤200 palabras)
 ├── Denunciar (perfil, mensaje, reseña, contrato) y ver estado
 └── Notificaciones in-app (push web al cierre de la Fase 5)

Trabajador (web, responsive)
 ├── Registro administrativo (presencial, por el GAD)
 ├── Vinculación de cuenta por código de activación
 ├── Capacitación / validación (registrada por el GAD)
 ├── Habilitación
 ├── Perfil (edición limitada: bio, foto sujeta a aprobación, disponibilidad)
 ├── Servicios (definidos por el GAD; el trabajador puede solicitar cambios [POST-MVP])
 ├── Chat
 ├── Contrataciones (proponer, aceptar, rechazar, iniciar, finalizar)
 └── Notificaciones in-app

GAD
 ├── Login administrativo (Cognito + MFA) + roles internos
 ├── Gestión de trabajadores (alta, datos, documentos, estados)
 ├── Capacitación (cursos simples + inscripciones + resultado + evidencia)
 ├── Habilitación / suspensión / rechazo
 ├── Denuncias (bandeja, asignación, acceso auditado, resolución)
 ├── Moderación (ocultar/restaurar, advertir, suspender, bloquear)
 ├── Auditoría (consulta + CSV)
 ├── Mantenimiento de categorías y servicios
 └── Reportes básicos (conteos por estado, por categoría, contrataciones, denuncias) + CSV
```

Ajustes respecto a §32 y su justificación:
- **Web push:** se entrega al final de la Fase 5 y no bloquea el MVP, porque el push depende de permisos del navegador y la notificación in-app cubre la necesidad.
- **Calificación en una sola escala**, en lugar de los 6 criterios del prototipo. Es más simple y más fácil de moderar.
- **Sin pagos** (P-07 confirmada por el GAD, 2026-09-26): el precio acordado es solo una referencia.

## Clasificación de funcionalidades de §31

| Funcionalidad | Clasificación | Justificación |
|---|---|---|
| Favoritos | POST-MVP | Útil pero no crítico; tabla simple `favorites` |
| Trabajadores vistos recientemente | POST-MVP | Se puede hacer en el cliente (localStorage) sin backend |
| Historial de búsquedas | NO RECOMENDADO | Poco valor y datos personales innecesarios. Se prefieren analíticas agregadas y anónimas |
| Disponibilidad | **MVP** (simple) | Booleano + nota. Un calendario detallado es FUTURO |
| Ubicación aproximada | **MVP** | Sector o parroquia; necesaria para buscar |
| Búsqueda por mapa | FUTURO | Requiere geocodificación y consentimiento de ubicación; riesgo de privacidad |
| Perfiles verificados / insignia de habilitado | **MVP** | Es el diferencial institucional (solo se muestran los habilitados) |
| Historial de contrataciones | **MVP** | Parte del flujo de contratación |
| Cancelación | **MVP** | Imprescindible en la máquina de estados |
| Reprogramación | MVP (vía nueva versión de condiciones) | No requiere un módulo aparte: se modifica la fecha con una nueva versión aceptada por ambos |
| Bloqueo entre usuarios | **MVP** | Protección básica contra el acoso |
| Sistema anti-spam / límites de mensajes | **MVP** | Riesgo de abuso desde el primer día |
| Reportes / métricas / estadísticas básicas | **MVP** | Requerido por el GAD (§4) |
| Dashboards avanzados | POST-MVP | |
| Exportación de información | **MVP** (CSV básico) | Auditable |
| Panel administrativo | **MVP** | |
| Comunicados institucionales | POST-MVP | Se reutiliza el módulo de notificaciones (`ANNOUNCEMENT`) |
| Centro de ayuda / FAQ | MVP (estático) / POST-MVP (administrable) | Páginas estáticas bastan al inicio |
| Términos y condiciones, política de privacidad, consentimiento | **MVP** | Obligatorio (LOPDP) |
| Sistema de banners | FUTURO | No aporta al flujo principal |
| Mantenimiento de categorías y servicios | **MVP** | El catálogo cambia sin necesidad de despliegues |
| Score de reputación con niveles (prototipo) | POST-MVP | Requiere definir la fórmula con el GAD |
| Credencial QR (prototipo) | FUTURO | |
| Botón SOS / jornada segura (prototipo) | NO RECOMENDADO para el MVP | Implica protocolos de respuesta y responsabilidad institucional |
| Adjuntos en el chat | POST-MVP | Riesgos de malware y privacidad; requiere moderación |
| Calificación del trabajador al cliente | **MVP** (Fase 7) | Confirmado por el GAD. Visible solo para trabajadores y GAD (RN-20) |
| Pre-registro online de trabajadores | FUTURO | El requisito dice registro presencial |

## 22. Funcionalidades futuras (post-MVP y futuro)

1. App móvil para trabajadores (Fase 11): disponibilidad, chat, contratos, push nativo.
2. LMS o integración con un sistema de capacitación externo: módulos, evaluaciones, certificados y vencimientos.
3. Score de reputación y niveles de insignia.
4. Búsqueda avanzada: motor dedicado o `pgvector` para búsqueda semántica y mapa.
5. Notificaciones por email, SMS y WhatsApp Business.
6. Comunicados institucionales segmentados.
7. Portal de derechos del titular (exportar y eliminar datos) automatizado.
8. Integración con el Identity & Onboarding Service del GAD (`userId` maestro), si el GAD lo exige (P-01).
9. Credencial digital QR verificable.
10. Métricas avanzadas y tableros de política pública (empleo por parroquia, oficio, género).
