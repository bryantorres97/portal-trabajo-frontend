"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ContadorNoLeidos, useMensajes } from "@/components/chat/MensajesProvider";
import { estaActivo, navInferior } from "@/components/site/navegacion";
import { cn } from "@/lib/utils";

/**
 * Barra de navegación inferior para móviles. Dentro de una conversación se oculta: el chat
 * ocupa la pantalla completa, como en cualquier aplicación de mensajería.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { resumen } = useMensajes();
  // El personal del GAD no usa el chat.
  const items = navInferior.filter((i) => i.href !== "/mensajes" || !resumen || resumen.chat || !resumen.signedIn);

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const activo = estaActivo(pathname, item.href);
          const noLeidos = item.href === "/mensajes" ? (resumen?.unreadMessages ?? 0) : 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[4.25rem] flex-col items-center justify-center gap-1 px-1 text-[0.72rem] font-semibold text-muted-foreground transition-colors",
                  activo && "text-primary",
                )}
              >
                <span className="relative">
                  <item.icon className="h-6 w-6 shrink-0" aria-hidden strokeWidth={activo ? 2.4 : 2} />
                  <ContadorNoLeidos valor={noLeidos} className="absolute -top-2 left-3.5" />
                </span>
                <span className="text-center leading-tight">{item.label}</span>
                {activo && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-primary" aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
