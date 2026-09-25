import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardList, GraduationCap, Flag, HardHat, Users, type LucideIcon } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { etiquetaRol } from "@/lib/formatos";
import { hasPermission } from "@/server/auth/authorize";
import { requirePagePermission } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Panel administrativo" };

type Modulo = { titulo: string; detalle: string; icon: LucideIcon; permiso: string; href?: string; fase?: string };

const modulos: Modulo[] = [
  {
    titulo: "Usuarios",
    detalle: "Cuentas del portal, roles internos y bloqueos.",
    icon: Users,
    permiso: "user.read",
    href: "/admin/usuarios",
  },
  {
    titulo: "Trabajadores",
    detalle: "Registro presencial, documentos y habilitación.",
    icon: HardHat,
    permiso: "worker.read",
    fase: "Fase 4",
  },
  {
    titulo: "Capacitación",
    detalle: "Cursos, inscripciones y resultados.",
    icon: GraduationCap,
    permiso: "training.record",
    fase: "Fase 4",
  },
  {
    titulo: "Denuncias",
    detalle: "Bandeja de casos y moderación.",
    icon: Flag,
    permiso: "report.read",
    fase: "Fase 8",
  },
  {
    titulo: "Auditoría y reportes",
    detalle: "Registro de acciones y métricas.",
    icon: ClipboardList,
    permiso: "audit.read",
    fase: "Fase 9",
  },
];

/** Punto de entrada del panel GAD: muestra solo los módulos permitidos para el usuario. */
export default async function AdminPage() {
  const user = await requirePagePermission("admin.access", "/admin");
  const visibles = modulos.filter((m) => hasPermission(user, m.permiso));

  return (
    <>
      <PageHeader
        eyebrow="GAD Municipalidad de Ambato"
        titulo="Panel administrativo"
        descripcion={`Tus roles: ${user.roles.map(etiquetaRol).join(", ")}.`}
      />
      <Section>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((m) => {
            const contenido = (
              <>
                <m.icon className="h-6 w-6 text-primary" aria-hidden />
                <h2 className="mt-3 text-base font-bold">{m.titulo}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{m.detalle}</p>
                <p className="mt-3 flex items-center gap-1 text-xs font-bold text-primary">
                  {m.href ? (
                    <>
                      Abrir <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </>
                  ) : (
                    <span className="text-muted-foreground">Disponible en la {m.fase}</span>
                  )}
                </p>
              </>
            );
            return (
              <li key={m.titulo}>
                {m.href ? (
                  <Link href={m.href} className="block h-full tarjeta p-5 transition-shadow hover:shadow-md">
                    {contenido}
                  </Link>
                ) : (
                  <div className="h-full tarjeta p-5 opacity-70">{contenido}</div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
