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
  ('data.export',              'Exportar información')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
select r.role_code, r.permission_code
from (values
  ('ADMIN_SISTEMA', 'admin.access'), ('ADMIN_SISTEMA', 'user.read'), ('ADMIN_SISTEMA', 'user.block'),
  ('ADMIN_SISTEMA', 'role.manage'), ('ADMIN_SISTEMA', 'catalog.manage'), ('ADMIN_SISTEMA', 'worker.read'),
  ('ADMIN_SISTEMA', 'training.manage'), ('ADMIN_SISTEMA', 'audit.read'), ('ADMIN_SISTEMA', 'metrics.read'),
  ('ADMIN_SISTEMA', 'data.export'),

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

1. Acolita.App es una plataforma municipal de intermediación entre ciudadanos y trabajadores de oficio habilitados por el GAD Municipalidad de Ambato.
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
