-- =============================================================================
-- Fotos de los oficios: nuevas imágenes provisionales de Unsplash (ADR-009), a pedido del usuario.
-- Nombres nuevos (`*-unsplash.jpg`) para que ninguna caché siga sirviendo las anteriores.
-- Solo se cambian las rutas que aún apuntan a la foto original: si el GAD ya cargó otra, se respeta.
-- Créditos: public/images/oficios/CREDITOS.md
-- =============================================================================

update public.services s
set image_path = '/images/oficios/' || v.archivo
from (values
  ('/images/oficios/albanileria.jpg', 'albanileria-unsplash.jpg'),
  ('/images/oficios/plomeria.jpg', 'plomeria-unsplash.jpg'),
  ('/images/oficios/electricidad.jpg', 'electricidad-unsplash.jpg'),
  ('/images/oficios/carpinteria.jpg', 'carpinteria-unsplash.jpg'),
  ('/images/oficios/pintura.jpg', 'pintura-unsplash.jpg'),
  ('/images/oficios/cerrajeria.jpg', 'cerrajeria-unsplash.jpg'),
  ('/images/oficios/limpieza.jpg', 'limpieza-unsplash.jpg'),
  ('/images/oficios/jardineria.jpg', 'jardineria-unsplash.jpg'),
  ('/images/oficios/mudanzas.jpg', 'mudanzas-unsplash.jpg'),
  ('/images/oficios/cuidado.jpg', 'cuidado-unsplash.jpg')
) as v(anterior, archivo)
where s.image_path = v.anterior;
