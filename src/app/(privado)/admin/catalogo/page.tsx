import type { Metadata } from "next";
import { ChevronDown, EyeOff, Plus } from "lucide-react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { Section } from "@/components/site/SiteShell";
import { formatearTarifa } from "@/lib/busqueda";
import { requirePagePermission } from "@/server/auth/current-user";
import { listCatalogForAdmin } from "@/server/catalog/catalog";

import { guardarCategoria, guardarOficio } from "./actions";
import { CategoryForm, ServiceForm } from "./CatalogForms";

export const metadata: Metadata = { title: "Catálogo · Panel GAD" };

function Inactivo() {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
      <EyeOff className="h-3 w-3" aria-hidden /> Oculto
    </span>
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
        migas={[{ label: "Catálogo" }]}
        titulo="Catálogo de oficios"
        descripcion="Categorías y oficios que aparecen en el portal. Desactivar oculta el elemento sin borrar la información de los trabajadores."
      />

      <Section titulo="Categorías">
        <ul className="space-y-2">
          {categorias.map((c) => (
            <li key={c.id}>
              <details className="group tarjeta">
                <summary className="flex cursor-pointer items-center justify-between gap-3 p-4">
                  <span className="flex items-center gap-2 font-bold">
                    {c.name} {!c.active && <Inactivo />}
                  </span>
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="border-t border-border p-4">
                  <CategoryForm action={guardarCategoria} valores={c} pre={`cat-${c.id}`} />
                </div>
              </details>
            </li>
          ))}
          <li>
            <details className="tarjeta">
              <summary className="flex cursor-pointer items-center gap-2 p-4 font-bold text-primary">
                <Plus className="h-4 w-4" aria-hidden /> Nueva categoría
              </summary>
              <div className="border-t border-border p-4">
                <CategoryForm action={guardarCategoria} pre="cat-nueva" />
              </div>
            </details>
          </li>
        </ul>
      </Section>

      <Section titulo="Oficios">
        {categorias.map((c) => (
          <div key={c.id} className="mb-6">
            <h3 className="mb-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">{c.name}</h3>
            <ul className="space-y-2">
              {servicios
                .filter((s) => s.categoryId === c.id)
                .map((s) => (
                  <li key={s.id}>
                    <details className="group tarjeta">
                      <summary className="flex cursor-pointer items-center justify-between gap-3 p-4">
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 font-bold">
                            {s.name} {!s.active && <Inactivo />}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            /oficios/{s.slug} · {formatearTarifa(s.priceMin, s.priceMax, s.priceUnit) ?? "sin tarifa"}
                          </span>
                        </span>
                        <ChevronDown
                          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
                          aria-hidden
                        />
                      </summary>
                      <div className="border-t border-border p-4">
                        <ServiceForm
                          action={guardarOficio}
                          valores={s}
                          categorias={opcionesCategoria}
                          pre={`srv-${s.id}`}
                        />
                      </div>
                    </details>
                  </li>
                ))}
            </ul>
          </div>
        ))}
        <details className="tarjeta">
          <summary className="flex cursor-pointer items-center gap-2 p-4 font-bold text-primary">
            <Plus className="h-4 w-4" aria-hidden /> Nuevo oficio
          </summary>
          <div className="border-t border-border p-4">
            <ServiceForm action={guardarOficio} categorias={opcionesCategoria} pre="srv-nuevo" />
          </div>
        </details>
      </Section>
    </>
  );
}
