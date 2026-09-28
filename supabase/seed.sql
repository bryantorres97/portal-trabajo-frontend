-- =============================================================================
-- Seed de desarrollo (se ejecuta con `supabase db reset`).
-- Roles y permisos: docs/analysis/01-negocio.md §3 (propuesta, [PENDIENTE] validar con el GAD).
-- En staging/producción, los catálogos de roles y permisos se cargan por migración
-- cuando se aprueben definitivamente.
-- =============================================================================

insert into public.roles (code, name, description, is_internal) values
  ('CLIENTE',            'Cliente',                    'Ciudadano que contrata servicios',                         false),
  ('TRABAJADOR',         'Trabajador',                 'Trabajador de oficio habilitado por el GAD',                false),
  ('ADMIN_SISTEMA',      'Administrador del sistema',  'Configuración global, usuarios internos y catálogos',      true),
  ('ADMIN_TRABAJADORES', 'Administrador de trabajadores', 'Ciclo de vida del trabajador: validación y habilitación', true),
  ('OPERADOR_PUNTO',     'Operador de punto de atención', 'Registro presencial de trabajadores',                    true),
  ('RESP_CAPACITACION',  'Responsable de capacitación', 'Registro y aprobación de capacitaciones',                  true),
  ('MODERADOR',          'Moderador',                  'Moderación de contenido denunciado',                       true),
  ('RESP_DENUNCIAS',     'Responsable de denuncias',   'Gestión de denuncias y sanciones',                         true),
  ('SUPERVISOR',         'Supervisor',                 'Consulta de reportes, métricas y auditoría',               true)
on conflict (code) do nothing;

insert into public.permissions (code, description) values
  ('admin.access',             'Acceder al panel administrativo'),
  ('user.read',                'Consultar usuarios del portal'),
  ('user.block',               'Bloquear o desbloquear usuarios'),
  ('role.manage',              'Asignar y revocar roles'),
  ('catalog.manage',           'Mantener categorías y servicios'),
  ('worker.create',            'Registrar trabajadores'),
  ('worker.read',              'Consultar trabajadores (datos administrativos)'),
  ('worker.read.private',      'Consultar datos personales del trabajador'),
  ('worker.update',            'Modificar información administrativa del trabajador'),
  ('worker.enable',            'Habilitar trabajadores'),
  ('worker.suspend',           'Suspender, rechazar o inactivar trabajadores'),
  ('worker.activation_code',   'Emitir códigos de activación de cuenta'),
  ('document.upload',          'Cargar documentos de trabajadores'),
  ('document.read',            'Consultar documentos de trabajadores'),
  ('document.review',          'Validar o rechazar documentos'),
  ('training.manage',          'Administrar cursos de capacitación'),
  ('training.record',          'Registrar inscripciones y resultados de capacitación'),
  ('training.approve',         'Aprobar capacitaciones'),
  ('report.read',              'Consultar denuncias'),
  ('report.manage',            'Gestionar y resolver denuncias'),
  ('report.evidence.read',     'Acceder a evidencia sensible de una denuncia (auditado)'),
  ('moderation.act',           'Aplicar acciones de moderación'),
  ('audit.read',               'Consultar la auditoría'),
  ('metrics.read',             'Consultar métricas y reportes'),
  ('data.export',              'Exportar información'),
  ('content.manage',           'Administrar preguntas frecuentes y documentos legales'),
  ('notifications.broadcast',  'Enviar avisos push a todos, por segmento o a destinatarios elegidos')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
select r.role_code, r.permission_code
from (values
  ('ADMIN_SISTEMA', 'admin.access'), ('ADMIN_SISTEMA', 'user.read'), ('ADMIN_SISTEMA', 'user.block'),
  ('ADMIN_SISTEMA', 'role.manage'), ('ADMIN_SISTEMA', 'catalog.manage'), ('ADMIN_SISTEMA', 'worker.read'),
  ('ADMIN_SISTEMA', 'training.manage'), ('ADMIN_SISTEMA', 'audit.read'), ('ADMIN_SISTEMA', 'metrics.read'),
  ('ADMIN_SISTEMA', 'data.export'), ('ADMIN_SISTEMA', 'content.manage'), ('ADMIN_SISTEMA', 'notifications.broadcast'),

  ('ADMIN_TRABAJADORES', 'admin.access'), ('ADMIN_TRABAJADORES', 'worker.create'), ('ADMIN_TRABAJADORES', 'worker.read'),
  ('ADMIN_TRABAJADORES', 'worker.read.private'), ('ADMIN_TRABAJADORES', 'worker.update'), ('ADMIN_TRABAJADORES', 'worker.enable'),
  ('ADMIN_TRABAJADORES', 'worker.suspend'), ('ADMIN_TRABAJADORES', 'worker.activation_code'),
  ('ADMIN_TRABAJADORES', 'document.upload'), ('ADMIN_TRABAJADORES', 'document.read'), ('ADMIN_TRABAJADORES', 'document.review'),

  ('OPERADOR_PUNTO', 'admin.access'), ('OPERADOR_PUNTO', 'worker.create'), ('OPERADOR_PUNTO', 'worker.read'),
  ('OPERADOR_PUNTO', 'worker.read.private'), ('OPERADOR_PUNTO', 'worker.update'), ('OPERADOR_PUNTO', 'worker.activation_code'),
  ('OPERADOR_PUNTO', 'document.upload'),

  ('RESP_CAPACITACION', 'admin.access'), ('RESP_CAPACITACION', 'worker.read'), ('RESP_CAPACITACION', 'training.manage'),
  ('RESP_CAPACITACION', 'training.record'), ('RESP_CAPACITACION', 'training.approve'),

  ('MODERADOR', 'admin.access'), ('MODERADOR', 'report.read'), ('MODERADOR', 'moderation.act'),

  ('RESP_DENUNCIAS', 'admin.access'), ('RESP_DENUNCIAS', 'report.read'), ('RESP_DENUNCIAS', 'report.manage'),
  ('RESP_DENUNCIAS', 'report.evidence.read'), ('RESP_DENUNCIAS', 'moderation.act'), ('RESP_DENUNCIAS', 'worker.read'),
  ('RESP_DENUNCIAS', 'worker.suspend'), ('RESP_DENUNCIAS', 'user.block'),

  ('SUPERVISOR', 'admin.access'), ('SUPERVISOR', 'worker.read'), ('SUPERVISOR', 'report.read'),
  ('SUPERVISOR', 'audit.read'), ('SUPERVISOR', 'metrics.read'), ('SUPERVISOR', 'data.export')
) as r(role_code, permission_code)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Documentos legales PROVISIONALES (v1). Pendientes de validación jurídica (P-15).
-- Una nueva versión publicada obliga a los usuarios a aceptarla de nuevo (RN-18).
-- -----------------------------------------------------------------------------
insert into public.legal_documents (code, version, title, content_md, published_at) values
('TERMINOS', 1, 'Términos y condiciones de uso (versión preliminar)',
$md$
**Versión preliminar sujeta a validación jurídica del GAD Municipalidad de Ambato.**

1. Llankana es una plataforma municipal de intermediación entre ciudadanos y trabajadores de oficio habilitados por el GAD Municipalidad de Ambato.
2. La plataforma no constituye relación de dependencia laboral entre las partes ni con el GAD.
3. Las tarifas publicadas son referenciales y no vinculantes. El precio y las condiciones se acuerdan entre las partes dentro de la plataforma.
4. Las condiciones aceptadas por ambas partes quedan registradas y no pueden modificarse; cualquier cambio requiere una nueva aceptación.
5. Las conversaciones pueden ser revisadas por personal autorizado del GAD únicamente cuando exista una denuncia relacionada, y cada acceso queda registrado.
6. El uso indebido de la plataforma puede dar lugar a advertencias, suspensión o bloqueo de la cuenta.
$md$, now()),
('PRIVACIDAD', 1, 'Aviso de privacidad (versión preliminar)',
$md$
**Versión preliminar sujeta a validación jurídica del GAD Municipalidad de Ambato.**

El GAD Municipalidad de Ambato trata tus datos personales conforme a la Ley Orgánica de Protección de Datos Personales para registrar y habilitar trabajadores, facilitar el contacto y los acuerdos entre ciudadanos y trabajadores, atender denuncias y generar estadísticas institucionales. Consulta el detalle en la página de Privacidad y datos del portal.
$md$, now())
on conflict (code, version) do nothing;


-- -----------------------------------------------------------------------------
-- Trabajadores FICTICIOS de desarrollo (datos del prototipo). NUNCA en producción.
-- UUID fijos 00000000-0000-4000-a000-0000000000NN. Calificaciones ficticias hasta la Fase 7.
-- 2 trabajadores no habilitados para comprobar que no aparecen en búsquedas públicas.
-- -----------------------------------------------------------------------------
insert into public.worker_profiles (id, first_names, last_names, phone, public_display_name, specialty, public_bio, years_experience, is_available, parish_id, status, enabled_at, rating_avg, rating_count, contracts_completed) values
  ($q$00000000-0000-4000-a000-000000000001$q$, $q$Manuel$q$, $q$Yánez$q$, $q$0990000001$q$, $q$Manuel Y.$q$, $q$Enlucidos y contrapisos$q$, $q$Maestro albañil con más de 15 años construyendo y reparando hogares en Ambato. Especialista en acabados impecables, contrapisos y enlucidos.$q$, 15, true, (select id from public.parishes where code = $q$huachi-chico$q$), $q$HABILITADO$q$, now() - interval $q$20 days$q$, 5.00, 77, 128),
  ($q$00000000-0000-4000-a000-000000000002$q$, $q$Segundo$q$, $q$Pilco$q$, $q$0990000002$q$, $q$Segundo P.$q$, $q$Mampostería y acabados$q$, $q$Maestro de mampostería y pintura. Combina fuerza en la estructura con buen gusto en los acabados de color.$q$, 10, true, (select id from public.parishes where code = $q$atocha-ficoa$q$), $q$HABILITADO$q$, now() - interval $q$40 days$q$, 3.65, 38, 64),
  ($q$00000000-0000-4000-a000-000000000003$q$, $q$Rosa$q$, $q$Chicaiza$q$, $q$0990000003$q$, $q$Rosa C.$q$, $q$Limpieza profunda de hogares$q$, $q$Experiencia en limpieza profunda de hogares y cuidado de personas. Usa productos seguros y respeta los espacios de cada cliente.$q$, 12, false, (select id from public.parishes where code = $q$la-merced$q$), $q$HABILITADO$q$, now() - interval $q$60 days$q$, 3.80, 55, 91),
  ($q$00000000-0000-4000-a000-000000000004$q$, $q$Luis$q$, $q$Naranjo$q$, $q$0990000004$q$, $q$Luis N.$q$, $q$Fugas y sanitarios$q$, $q$Plomero especializado en fugas difíciles, instalación de sanitarios y mantenimiento de tuberías residenciales.$q$, 11, true, (select id from public.parishes where code = $q$atocha-ficoa$q$), $q$HABILITADO$q$, now() - interval $q$80 days$q$, 3.95, 44, 73),
  ($q$00000000-0000-4000-a000-000000000005$q$, $q$Wilson$q$, $q$Guamán$q$, $q$0990000005$q$, $q$Wilson G.$q$, $q$Gasfitería y grifería$q$, $q$Técnico en gasfitería y grifería. Apoya también en aperturas de cerrajería básicas. En constante capacitación.$q$, 4, true, (select id from public.parishes where code = $q$izamba$q$), $q$HABILITADO$q$, now() - interval $q$100 days$q$, 2.60, 13, 21),
  ($q$00000000-0000-4000-a000-000000000006$q$, $q$Édison$q$, $q$Chango$q$, $q$0990000006$q$, $q$Édison C.$q$, $q$Tableros y puntos de luz$q$, $q$Electricista certificado para instalaciones residenciales e industriales. Experto en tableros, puntos de luz y revisiones eléctricas.$q$, 14, true, (select id from public.parishes where code = $q$la-matriz$q$), $q$HABILITADO$q$, now() - interval $q$120 days$q$, 4.75, 67, 112),
  ($q$00000000-0000-4000-a000-000000000007$q$, $q$Ana Lucía$q$, $q$Vega$q$, $q$0990000007$q$, $q$Ana Lucía V.$q$, $q$Instalaciones residenciales$q$, $q$Electricista joven en crecimiento. Instala puntos de luz, tomacorrientes y lámparas con buena disposición.$q$, 2, false, (select id from public.parishes where code = $q$la-merced$q$), $q$HABILITADO$q$, now() - interval $q$140 days$q$, 1.90, 7, 12),
  ($q$00000000-0000-4000-a000-000000000008$q$, $q$Carlos$q$, $q$Freire$q$, $q$0990000008$q$, $q$Carlos F.$q$, $q$Muebles a medida y closets$q$, $q$Carpintero artesanal. Diseña y fabrica muebles a medida, closets y puertas con madera de calidad.$q$, 13, true, (select id from public.parishes where code = $q$izamba$q$), $q$HABILITADO$q$, now() - interval $q$160 days$q$, 3.55, 35, 58),
  ($q$00000000-0000-4000-a000-000000000009$q$, $q$Jorge$q$, $q$Llerena$q$, $q$0990000009$q$, $q$Jorge L.$q$, $q$Puertas y cerraduras$q$, $q$Nuevo en la plataforma. Combina carpintería básica con servicios de cerrajería para puertas y cerraduras.$q$, 1, true, (select id from public.parishes where code = $q$huachi-loreto$q$), $q$CAPACITACION_EN_PROCESO$q$, null, 1.70, 2, 4),
  ($q$00000000-0000-4000-a000-000000000010$q$, $q$María$q$, $q$Pérez$q$, $q$0990000010$q$, $q$María P.$q$, $q$Poda y mantenimiento de césped$q$, $q$Jardinera con experiencia en poda, corte de césped y mantenimiento de jardines residenciales.$q$, 6, true, (select id from public.parishes where code = $q$san-bartolome-de-pinllo$q$), $q$HABILITADO$q$, now() - interval $q$200 days$q$, 2.85, 23, 39),
  ($q$00000000-0000-4000-a000-000000000011$q$, $q$Fabián$q$, $q$Sailema$q$, $q$0990000011$q$, $q$Fabián S.$q$, $q$Jardines y fletes menores$q$, $q$Recién inicia en Llankana. Ofrece jardinería y apoyo en fletes menores dentro de Ambato.$q$, 1, false, (select id from public.parishes where code = $q$totoras$q$), $q$SUSPENDIDO$q$, null, 1.00, 2, 3),
  ($q$00000000-0000-4000-a000-000000000012$q$, $q$Diana$q$, $q$Moposita$q$, $q$0990000012$q$, $q$Diana M.$q$, $q$Oficinas y locales comerciales$q$, $q$Especialista en limpieza de oficinas y locales comerciales. Rápida, organizada y con buena referencia.$q$, 5, true, (select id from public.parishes where code = $q$celiano-monge$q$), $q$HABILITADO$q$, now() - interval $q$240 days$q$, 2.65, 20, 34),
  ($q$00000000-0000-4000-a000-000000000013$q$, $q$Patricio$q$, $q$Bonilla$q$, $q$0990000013$q$, $q$Patricio B.$q$, $q$Fachadas y empaste$q$, $q$Pintor experto en fachadas, empaste y acabados exteriores. Conocido por la durabilidad de su trabajo.$q$, 12, true, (select id from public.parishes where code = $q$san-bartolome-de-pinllo$q$), $q$HABILITADO$q$, now() - interval $q$260 days$q$, 3.80, 31, 52),
  ($q$00000000-0000-4000-a000-000000000014$q$, $q$Nelson$q$, $q$Toapanta$q$, $q$0990000014$q$, $q$Nelson T.$q$, $q$Camión de 3 toneladas y embalaje$q$, $q$Ofrece mudanzas locales con camión de 3 toneladas y servicio de embalaje. Cuidadoso con los muebles.$q$, 9, true, (select id from public.parishes where code = $q$cunchibamba$q$), $q$HABILITADO$q$, now() - interval $q$280 days$q$, 3.95, 28, 47),
  ($q$00000000-0000-4000-a000-000000000015$q$, $q$Blanca$q$, $q$Sisa$q$, $q$0990000015$q$, $q$Blanca S.$q$, $q$Adultos mayores con experiencia$q$, $q$Cuidadora de adultos mayores con amplia experiencia. Paciente, cariñosa y certificada en primeros auxilios.$q$, 15, true, (select id from public.parishes where code = $q$atocha-ficoa$q$), $q$HABILITADO$q$, now() - interval $q$300 days$q$, 4.60, 52, 87),
  ($q$00000000-0000-4000-a000-000000000016$q$, $q$Iván$q$, $q$Zurita$q$, $q$0990000016$q$, $q$Iván Z.$q$, $q$Apertura de puertas 24/7$q$, $q$Cerrajero disponible las 24 horas para aperturas de puertas, cambio de cerraduras y llaves.$q$, 7, true, (select id from public.parishes where code = $q$la-matriz$q$), $q$HABILITADO$q$, now() - interval $q$320 days$q$, 2.75, 25, 41),
  ($q$00000000-0000-4000-a000-000000000017$q$, $q$Hugo$q$, $q$Paredes$q$, $q$0990000017$q$, $q$Hugo P.$q$, $q$Reparaciones menores$q$, $q$Trabajador verificado en reparaciones menores de albañilería. Ideal para arreglos pequeños y rápidos.$q$, 3, true, (select id from public.parishes where code = $q$picaigua$q$), $q$HABILITADO$q$, now() - interval $q$340 days$q$, 1.90, 6, 10)
on conflict (id) do nothing;

insert into public.worker_services (worker_id, service_id, is_primary)
select v.worker_id::uuid, s.id, v.is_primary
from (values
  ($q$00000000-0000-4000-a000-000000000001$q$, $q$albanileria$q$, true),
  ($q$00000000-0000-4000-a000-000000000002$q$, $q$albanileria$q$, true),
  ($q$00000000-0000-4000-a000-000000000002$q$, $q$pintura$q$, false),
  ($q$00000000-0000-4000-a000-000000000003$q$, $q$limpieza$q$, true),
  ($q$00000000-0000-4000-a000-000000000003$q$, $q$cuidado$q$, false),
  ($q$00000000-0000-4000-a000-000000000004$q$, $q$plomeria$q$, true),
  ($q$00000000-0000-4000-a000-000000000005$q$, $q$plomeria$q$, true),
  ($q$00000000-0000-4000-a000-000000000005$q$, $q$cerrajeria$q$, false),
  ($q$00000000-0000-4000-a000-000000000006$q$, $q$electricidad$q$, true),
  ($q$00000000-0000-4000-a000-000000000007$q$, $q$electricidad$q$, true),
  ($q$00000000-0000-4000-a000-000000000008$q$, $q$carpinteria$q$, true),
  ($q$00000000-0000-4000-a000-000000000009$q$, $q$carpinteria$q$, true),
  ($q$00000000-0000-4000-a000-000000000009$q$, $q$cerrajeria$q$, false),
  ($q$00000000-0000-4000-a000-000000000010$q$, $q$jardineria$q$, true),
  ($q$00000000-0000-4000-a000-000000000011$q$, $q$jardineria$q$, true),
  ($q$00000000-0000-4000-a000-000000000011$q$, $q$mudanzas$q$, false),
  ($q$00000000-0000-4000-a000-000000000012$q$, $q$limpieza$q$, true),
  ($q$00000000-0000-4000-a000-000000000013$q$, $q$pintura$q$, true),
  ($q$00000000-0000-4000-a000-000000000014$q$, $q$mudanzas$q$, true),
  ($q$00000000-0000-4000-a000-000000000015$q$, $q$cuidado$q$, true),
  ($q$00000000-0000-4000-a000-000000000016$q$, $q$cerrajeria$q$, true),
  ($q$00000000-0000-4000-a000-000000000017$q$, $q$albanileria$q$, true)
) as v(worker_id, service_slug, is_primary)
join public.services s on s.slug = v.service_slug
on conflict do nothing;

-- Fase 4: historial inicial y capacitación aprobada de los trabajadores ficticios habilitados
-- (para que en desarrollo se puedan suspender y reactivar respetando las reglas de habilitación).
insert into public.worker_status_history (worker_id, from_status, to_status, reason, created_at)
select w.id, null, w.status, 'Estado inicial (seed de desarrollo)', w.created_at
from public.worker_profiles w
where w.id::text like '00000000-0000-4000-a000-%'
  and not exists (select 1 from public.worker_status_history h where h.worker_id = w.id);

insert into public.training_enrollments (worker_id, training_id, status, started_at, finished_at, result_note)
select w.id, t.id, 'APROBADO', w.created_at, w.created_at, 'Aprobada (seed de desarrollo)'
from public.worker_profiles w
cross join public.trainings t
where t.code = 'GENERAL' and w.status = 'HABILITADO' and w.id::text like '00000000-0000-4000-a000-%'
  and not exists (select 1 from public.training_enrollments e where e.worker_id = w.id and e.training_id = t.id);
