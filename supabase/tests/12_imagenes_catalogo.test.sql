-- pgTAP: imágenes de los oficios (bucket público, rutas válidas y cambio auditado).
-- Ejecutar: supabase test db
begin;
select plan(10);

select is((select public from storage.buckets where id = 'catalog-images'), true, 'el bucket catalog-images es público');
select is((select file_size_limit from storage.buckets where id = 'catalog-images'), 4194304::bigint,
  'límite de 4 MB por imagen');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and qual ilike '%catalog-images%'), 0,
  'sin políticas de Storage: solo el servidor sube y borra');

insert into public.users (id, display_name, email) values
  ('00000000-0000-0000-0000-0000000012c1', 'Admin catálogo', 'admin-catalogo@gad.test'),
  ('00000000-0000-0000-0000-0000000012c2', 'Moderador GAD', 'moderador-catalogo@gad.test');
insert into public.user_roles (user_id, role_code) values
  ('00000000-0000-0000-0000-0000000012c1', 'ADMIN_SISTEMA'),
  ('00000000-0000-0000-0000-0000000012c2', 'MODERADOR');

insert into public.categories (id, slug, name, color, sort_order)
values ('00000000-0000-0000-0000-0000000012a1', 'categoria-imagen-prueba', 'Categoría de prueba', 'azul', 0);
insert into public.services (id, category_id, slug, name, color)
values ('00000000-0000-0000-0000-0000000012b1', '00000000-0000-0000-0000-0000000012a1', 'oficio-imagen-prueba',
        'Oficio de prueba', 'azul');

select throws_ok($$ select public.fn_admin_set_service_image('00000000-0000-0000-0000-0000000012c2',
  '00000000-0000-0000-0000-0000000012b1', 'services/11111111-2222-4333-8444-555555555555.webp') $$,
  '42501', null, 'sin catalog.manage no se cambia la imagen');

select lives_ok($$ select public.fn_admin_set_service_image('00000000-0000-0000-0000-0000000012c1',
  '00000000-0000-0000-0000-0000000012b1', 'services/11111111-2222-4333-8444-555555555555.webp') $$,
  'el administrador sube la imagen de un oficio');
select is((select image_path from public.services where id = '00000000-0000-0000-0000-0000000012b1'),
  'services/11111111-2222-4333-8444-555555555555.webp', 'el oficio guarda la ruta del bucket');
select is(public.fn_admin_set_service_image('00000000-0000-0000-0000-0000000012c1',
    '00000000-0000-0000-0000-0000000012b1', null),
  'services/11111111-2222-4333-8444-555555555555.webp', 'quitar la imagen devuelve la ruta anterior');

select throws_ok($$ select public.fn_admin_set_service_image('00000000-0000-0000-0000-0000000012c1',
  '00000000-0000-0000-0000-0000000012b1', 'https://evil.example/x.png') $$,
  '23514', null, 'no se aceptan URL externas ni rutas arbitrarias');
select throws_ok($$ select public.fn_admin_set_service_image('00000000-0000-0000-0000-0000000012c1',
  '00000000-0000-0000-0000-0000000012b1', 'categories/11111111-2222-4333-8444-555555555555.png') $$,
  '23514', null, 'solo se admite la carpeta de oficios');

select is((select count(*)::int from public.audit_log
           where actor_id = '00000000-0000-0000-0000-0000000012c1'
             and action in ('SERVICE_IMAGE_UPDATED', 'SERVICE_IMAGE_REMOVED')),
  2, 'cada cambio queda auditado');

select * from finish();
rollback;
