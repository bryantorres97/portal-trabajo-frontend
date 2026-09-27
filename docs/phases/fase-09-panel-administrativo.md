# Fase 9 — Panel administrativo (checklist)

Objetivo, criterios y riesgos en `docs/analysis/08-roadmap.md`. **Estado: IMPLEMENTADA (2026-09-27)**. Migración validada en Supabase dev dentro de una transacción revertida (pgTAP 37/37; Fases 0, 2 y 8 sin regresiones); **aplicada en la nube** (2026-09-27; advisors sin observaciones, 6 preguntas publicadas, `content.manage` asignado). Falta la validación manual.

Criterio de aceptación: *un supervisor obtiene los reportes sin tener que hacer consultas SQL.*

## Decisiones de diseño

| Tema | Decisión | Motivo |
|---|---|---|
| Indicadores (`/admin/indicadores`, `metrics.read`) | Cifras del periodo (registros, habilitaciones, ciudadanos nuevos, conversaciones, mensajes, propuestas, acordadas, conversión, finalizadas, reseñas y promedio, denuncias, cerradas, sanciones), atención de denuncias (abiertas, vencidas, tiempo medio, % dentro del plazo), distribuciones actuales (trabajadores por estado, habilitados por categoría, contrataciones por estado, denuncias por tipo) y 12 semanas de actividad | KPI de la hoja de ruta |
| Cálculo | Una función SQL (`fn_admin_metrics`) con fechas como **días de Ecuador** inclusivos; rango máximo de dos años | Exactitud (probada con datos controlados, incluido el borde del día en UTC−5) |
| Gráficos | Barras de una sola serie y un solo tono (magnitud), valor escrito junto a cada barra, detalle al pasar el cursor y tabla equivalente; sin ejes dobles ni leyendas innecesarias | Guía de visualización |
| Reportes (`/admin/reportes`) | Trabajadores, contrataciones y denuncias filtrables por periodo y estado, paginados. **Sin datos personales de ciudadanos**; de trabajadores, solo datos públicos | Minimización (LOPDP) |
| CSV | `data.export`; hasta 10 000 filas; `;` + BOM UTF-8 (Excel en español); protección contra inyección de fórmulas; **cada descarga se audita** (`DATA_EXPORTED` con filtros y filas) | «Auditoría de las exportaciones» |
| Auditoría (`/admin/auditoria`, `audit.read`) | Acciones filtrables por periodo, prefijo de acción, persona y recurso, con detalle; pestaña de **accesos a información confidencial** (`sensitive_access_log`) con enlace a la denuncia; CSV auditado | Visor de auditoría |
| Contenido (`/admin/contenido`, nuevo permiso `content.manage` para ADMIN_SISTEMA) | Preguntas frecuentes (crear, editar, publicar, ordenar, eliminar; página pública `/preguntas-frecuentes` con JSON-LD `FAQPage`). Documentos legales: borrador → vista previa → **publicar** (con confirmación); una versión publicada es inmutable (trigger) y obliga a aceptar la nueva (RN-18). `/privacidad` muestra ahora la versión vigente | «Páginas FAQ y legales administrables» |
| Comunicados | No incluidos | POST-MVP en la hoja de ruta |

## Checklist

### Base de datos (`20260927180000_panel_metricas_contenido`)
- [x] `fn_admin_metrics`, `fn_admin_weekly_activity`, reportes (`fn_admin_report_*`), `fn_admin_audit_search`, `fn_admin_sensitive_access_search`
- [x] `faq_items` (+ 6 preguntas de ejemplo), funciones públicas y de administración
- [x] Documentos legales: guardia de inmutabilidad, un borrador por documento, guardar, publicar y descartar
- [x] Permiso `content.manage` (migración y seed)
- [x] pgTAP `09_fase9_panel.test.sql` (37 pruebas)
- [x] Aplicada en la nube; `/preguntas-frecuentes` y `/privacidad` responden 200 con el contenido de la base

### Web
- [x] Módulos del panel: Indicadores, Reportes, Auditoría y Contenido (todos los módulos tienen página)
- [x] Descargas `/admin/reportes/exportar` y `/admin/auditoria/exportar`
- [x] `/preguntas-frecuentes` (menú y sitemap) y `/privacidad` desde la base

### Pruebas
- [x] Unit (15 nuevas): CSV (formato, escape, inyección), rango de fechas en Ecuador y tope de dos años, columnas de reportes sin datos personales, esquemas de contenido, módulos por permiso, arquitectura (toda exportación exige `data.export` y se audita)
- [x] pgTAP (37): **exactitud de las métricas con datos controlados** (incluido el borde de día en Ecuador), diferencias en contrataciones del día, permisos por rol, rangos inválidos, reportes y paginación, auditoría filtrada, preguntas frecuentes, documentos legales (borrador, inmutabilidad, publicación auditada)
- [x] Integración (CI): métricas con el seed, exportaciones auditadas, permisos, publicación de preguntas
- [x] E2E: acceso del panel, descargas protegidas, preguntas frecuentes y privacidad
- [ ] Validación manual

## Resultados
- Unit 430; lint, formato, tipos y build OK.
- Validación en la nube con transacción revertida: Fase 9 37/37; Fases 0, 2 y 8: 15/15, 11/11 y 55/55.

## Validación manual
1. Con un SUPERVISOR: «Indicadores» → cambiar entre 7, 30, 90 días y un rango propio; revisar las cifras con los datos conocidos.
2. «Reportes» → cada tipo, filtrar por estado, paginar y «Descargar CSV»; abrirlo en Excel (acentos y columnas correctas).
3. «Auditoría» → ver la descarga anterior (`DATA_EXPORTED`) filtrando por acción; pestaña de accesos confidenciales.
4. Con un ADMIN_SISTEMA: «Contenido» → crear una pregunta sin publicar (no aparece en `/preguntas-frecuentes`), publicarla (aparece).
5. Documentos legales: editar un borrador de PRIVACIDAD, ver la vista previa, publicarlo y comprobar que una cuenta ciudadana debe aceptarlo al volver a entrar.
6. Con un MODERADOR: no aparecen Indicadores, Reportes, Auditoría ni Contenido.
