"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { estaActivo, navPrincipal } from "@/components/site/navegacion";
import { cn } from "@/lib/utils";

/** Barra de navegación inferior para móviles (patrón del prototipo). */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {navPrincipal.map((item) => {
          const activo = estaActivo(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "flex min-h-[4.25rem] flex-col items-center justify-center gap-1 px-1 text-[0.68rem] font-semibold text-muted-foreground",
                  activo && "text-primary",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="text-center leading-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
