import {
  FileText,
  HardHat,
  HelpCircle,
  Home,
  Mail,
  MessageCircle,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type ItemNavegacion = { href: string; label: string; icon: LucideIcon; descripcion?: string };

/** Rutas que solo se marcan activas en coincidencia exacta (p. ej. /trabajadores ≠ /trabajadores/[id]). */
const EXACTAS = new Set(["/", "/trabajadores"]);

/** Destinos principales del encabezado: lo que la mayoría viene a hacer. */
export const navPrincipal: ItemNavegacion[] = [
  { href: "/buscar", label: "Buscar", icon: Search, descripcion: "Encuentra un trabajador habilitado" },
  { href: "/oficios", label: "Oficios", icon: Wrench, descripcion: "Servicios y tarifas referenciales" },
  { href: "/como-funciona", label: "Cómo funciona", icon: HelpCircle, descripcion: "El proceso y sus garantías" },
  { href: "/trabajadores", label: "Soy trabajador", icon: HardHat, descripcion: "Cómo registrarte en el GAD" },
];

/** Información complementaria (menú móvil y pie de página). */
export const navSecundaria: ItemNavegacion[] = [
  { href: "/contratantes", label: "Para quien contrata", icon: Users },
  { href: "/preguntas-frecuentes", label: "Preguntas frecuentes", icon: HelpCircle },
  { href: "/contacto", label: "Contacto y ayuda", icon: Mail },
  { href: "/privacidad", label: "Privacidad y datos", icon: ShieldCheck },
  { href: "/terminos", label: "Términos y condiciones", icon: FileText },
];

/**
 * Barra inferior del móvil: lo que la persona hace a diario (buscar, conversar, su cuenta).
 * Las páginas informativas quedan en el menú.
 */
export const navInferior: ItemNavegacion[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/buscar", label: "Buscar", icon: Search },
  { href: "/oficios", label: "Oficios", icon: Wrench },
  { href: "/mensajes", label: "Mensajes", icon: MessageCircle },
  { href: "/cuenta", label: "Mi cuenta", icon: UserRound },
];

export function estaActivo(pathname: string, href: string) {
  return EXACTAS.has(href) ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}
