-- =============================================================================
-- El administrador del sistema consulta las denuncias (report.read): bandeja y detalle en
-- /admin/denuncias, solo lectura. Gestionarlas, ver la evidencia y sancionar sigue siendo de
-- RESP_DENUNCIAS y MODERADOR. Pedido del usuario (2026-10-07).
-- =============================================================================

insert into public.role_permissions (role_code, permission_code)
select v.role_code, v.permission_code
from (values ('ADMIN_SISTEMA', 'report.read')) as v(role_code, permission_code)
where exists (select 1 from public.roles r where r.code = v.role_code)
  and exists (select 1 from public.permissions p where p.code = v.permission_code)
on conflict do nothing;
