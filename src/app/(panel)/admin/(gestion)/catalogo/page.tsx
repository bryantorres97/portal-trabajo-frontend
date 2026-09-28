import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { ChevronDown, ImageOff, Plus } from "lucide-react";

import { AdminHeader, Bloque, Insignia } from "@/components/admin/AdminHeader";
import { formatearTarifa } from "@/lib/busqueda";
import { requirePagePermission } from "@/server/auth/current-user";
import { listCatalogForAdmin } from "@/server/catalog/catalog";

import { cambiarImagen, guardarCategoria, guardarOficio } from "./actions";
import { CategoryForm, ImagenOficioForm, ServiceForm } from "./CatalogForms";

export const metadata: Metadata = { title: "Catálogo · Panel GAD" };

function Oculto() {
  return <Insignia className="bg-muted text-muted-foreground">Oculto</Insignia>;
}

/** Fila desplegable del catálogo: resumen arriba y formulario de edición al abrir. */
function Editable({
  titulo,
  detalle,
  imagen,
  children,
}: {
  titulo: ReactNode;
  detalle?: ReactNode;
  /** Miniatura del oficio; las categorías no llevan imagen (`undefined`). */
  imagen?: string | null;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-xl open:bg-secondary/40">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-3 hover:bg-secondary/50 [&::-webkit-details-marker]:hidden">
        {imagen !== undefined && (
          <span className="grid h-10 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
            {imagen ? (
              <Image src={imagen} alt="" width={48} height={40} sizes="48px" className="h-full w-full object-cover" />
            ) : (
              <ImageOff className="h-4 w-4 text-muted-foreground" aria-label="Sin imagen" />
            )}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 font-bold">{titulo}</span>
          {detalle && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detalle}</span>}
        </span>
        <span className="hidden text-sm font-semibold text-primary group-open:hidden sm:inline">Editar</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="px-3 pt-1 pb-4">{children}</div>
    </details>
  );
}

function Nuevo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl open:bg-secondary/40">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 font-bold text-primary hover:bg-secondary/50 [&::-webkit-details-marker]:hidden">
        <Plus className="h-4 w-4" aria-hidden /> {etiqueta}
      </summary>
      <div className="px-3 pt-2 pb-4">{children}</div>
    </details>
  );
}

/** Mantenimiento de categorías y oficios (catalog.manage). Cada cambio queda auditado. */
export default async function CatalogoAdminPage() {
  const actor = await requirePagePermission("catalog.manage", "/admin/catalogo");
  const { categorias, servicios } = await listCatalogForAdmin(actor);
  const opcionesCategoria = categorias.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <AdminHeader
        titulo="Catálogo de oficios"
        descripcion="Categorías y oficios que aparecen en el portal. Ocultar un elemento lo retira de la búsqueda sin borrar la información de los trabajadores. La imagen de un oficio se agrega después de crearlo."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Bloque titulo="Categorías" descripcion={`${categorias.length} en el portal`} cuerpo="p-3">
          <ul className="space-y-1">
            {categorias.map((c) => (
              <li key={c.id}>
                <Editable
                  titulo={
                    <>
                      {c.name} {!c.active && <Oculto />}
                    </>
                  }
                  detalle={`${servicios.filter((s) => s.categoryId === c.id).length} oficios`}
                >
                  <CategoryForm action={guardarCategoria} valores={c} pre={`cat-${c.id}`} />
                </Editable>
              </li>
            ))}
            <li>
              <Nuevo etiqueta="Nueva categoría">
                <CategoryForm action={guardarCategoria} pre="cat-nueva" />
              </Nuevo>
            </li>
          </ul>
        </Bloque>

        <Bloque titulo="Oficios" descripcion={`${servicios.length} en total, agrupados por categoría`} cuerpo="p-3">
          <div className="space-y-5">
            {categorias.map((c) => (
              <div key={c.id}>
                <h3 className="px-3 pt-2 pb-1 font-sans text-sm font-bold tracking-normal text-muted-foreground">
                  {c.name}
                </h3>
                <ul className="space-y-1">
                  {servicios
                    .filter((s) => s.categoryId === c.id)
                    .map((s) => (
                      <li key={s.id}>
                        <Editable
                          titulo={
                            <>
                              {s.name} {!s.active && <Oculto />}
                            </>
                          }
                          detalle={`/oficios/${s.slug} · ${formatearTarifa(s.priceMin, s.priceMax, s.priceUnit) ?? "sin tarifa"}`}
                          imagen={s.imagePath}
                        >
                          <ImagenOficioForm
                            action={cambiarImagen}
                            id={s.id}
                            imagen={s.imagePath}
                            pre={`img-srv-${s.id}`}
                          />
                          <ServiceForm
                            action={guardarOficio}
                            valores={s}
                            categorias={opcionesCategoria}
                            pre={`srv-${s.id}`}
                          />
                        </Editable>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            <Nuevo etiqueta="Nuevo oficio">
              <ServiceForm action={guardarOficio} categorias={opcionesCategoria} pre="srv-nuevo" />
            </Nuevo>
          </div>
        </Bloque>
      </div>
    </>
  );
}
