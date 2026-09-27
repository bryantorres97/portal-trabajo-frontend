import {
  ClipboardList,
  Flag,
  GraduationCap,
  HardHat,
  LayoutGrid,
  MessageSquareQuote,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

export type ModuloPanel = {
  titulo: string;
  detalle: string;
  icon: LucideIcon;
  /** Basta con uno de los permisos. */
  permisos: string[];
  href?: string;
  /** Módulos aún no construidos: se muestran sin enlace. */
  fase?: string;
};

/** Módulos del panel del GAD, en el orden del trabajo diario. */
export const modulosPanel: ModuloPanel[] = [
  {
    titulo: "Inicio",
    detalle: "Lo que está por atender.",
    icon: LayoutGrid,
    permisos: ["admin.access"],
    href: "/admin",
  },
  {
    titulo: "Trabajadores",
    detalle: "Registro presencial, documentos y habilitación.",
    icon: HardHat,
    permisos: ["worker.read"],
    href: "/admin/trabajadores",
  },
  {
    titulo: "Capacitación",
    detalle: "Cursos, inscripciones y resultados.",
    icon: GraduationCap,
    permisos: ["training.record", "training.manage"],
    href: "/admin/capacitacion",
  },
  {
    titulo: "Catálogo",
    detalle: "Categorías, oficios y tarifas referenciales.",
    icon: Tags,
    permisos: ["catalog.manage"],
    href: "/admin/catalogo",
  },
  {
    titulo: "Usuarios",
    detalle: "Cuentas del portal, roles internos y bloqueos.",
    icon: Users,
    permisos: ["user.read"],
    href: "/admin/usuarios",
  },
  {
    titulo: "Reseñas",
    detalle: "Calificaciones denunciadas: ocultar o restaurar.",
    icon: MessageSquareQuote,
    permisos: ["moderation.act"],
    href: "/admin/resenas",
  },
  {
    titulo: "Denuncias",
    detalle: "Bandeja de casos y moderación.",
    icon: Flag,
    permisos: ["report.read"],
    fase: "Fase 8",
  },
  {
    titulo: "Auditoría y reportes",
    detalle: "Registro de acciones y métricas.",
    icon: ClipboardList,
    permisos: ["audit.read"],
    fase: "Fase 9",
  },
];

export function modulosVisibles(permisos: readonly string[]): ModuloPanel[] {
  return modulosPanel.filter((m) => m.permisos.some((p) => permisos.includes(p)));
}

/** Activo si la ruta coincide o es una subruta; «Inicio» solo en /admin exacto. */
export function moduloActivo(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}
