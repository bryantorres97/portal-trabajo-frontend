import { PanelShell } from "@/components/admin/PanelShell";
import { etiquetaRol } from "@/lib/formatos";
import { getCurrentAuth } from "@/server/auth/current-user";

/**
 * Marco del panel administrativo: navegación lateral según los permisos del funcionario.
 * Cada página valida su propio permiso (requirePagePermission); este layout solo arma el marco.
 */
export default async function GestionLayout({ children }: LayoutProps<"/admin">) {
  const auth = await getCurrentAuth();
  const user = auth?.source === "ENTRA" ? auth.user : null;
  const usuario = {
    nombre: user?.displayName ?? user?.email ?? "Personal del GAD",
    detalle: user?.roles.map(etiquetaRol).join(", ") || "Sin roles asignados",
    permisos: user?.permissions ?? [],
  };

  return <PanelShell usuario={usuario}>{children}</PanelShell>;
}
