import { HardHat, Home, Phone, ShieldCheck, Users, type LucideIcon } from "lucide-react";

export type ItemNavegacion = { href: string; label: string; icon: LucideIcon };

export const navPrincipal: ItemNavegacion[] = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/oficios", label: "Oficios", icon: HardHat },
  { href: "/como-funciona", label: "Cómo funciona", icon: ShieldCheck },
  { href: "/trabajadores", label: "Trabajadores", icon: Users },
  { href: "/contacto", label: "Contacto", icon: Phone },
];

export const navSecundaria: ItemNavegacion[] = [
  { href: "/contratantes", label: "Contratantes", icon: Users },
  { href: "/privacidad", label: "Privacidad y datos", icon: ShieldCheck },
];

export function estaActivo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
