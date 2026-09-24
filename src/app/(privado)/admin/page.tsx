import type { Metadata } from "next";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { requirePagePermission } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Panel administrativo" };

/** Punto de entrada del panel GAD. Los módulos llegan en las Fases 2, 4, 8 y 9. */
export default async function AdminPage() {
  const user = await requirePagePermission("admin.access", "/admin");

  return (
    <>
      <PageHeader
        eyebrow="GAD Municipalidad de Ambato"
        titulo="Panel administrativo"
        descripcion="Gestión de trabajadores, capacitación, denuncias, moderación y reportes."
      />
      <Section>
        <div className="tarjeta p-5">
          <p className="text-sm text-muted-foreground">
            Sesión de <strong className="text-foreground">{user.email ?? user.id}</strong> con permisos:
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {user.permissions.map((p) => (
              <li key={p} className="rounded-lg bg-secondary px-2.5 py-1 font-mono text-xs">
                {p}
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </>
  );
}
