"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, UserRound } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/site/Logo";
import { estaActivo, navPrincipal, navSecundaria } from "@/components/site/navegacion";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const coloresMenu = ["verde", "azul", "magenta", "naranja", "amarillo"] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const todos = [...navPrincipal, ...navSecundaria];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2" aria-label="Acolita.App, ir al inicio">
          <Logo />
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <nav aria-label="Secciones" className="hidden items-center gap-1 lg:flex">
            {todos.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={estaActivo(pathname, item.href) ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  estaActivo(pathname, item.href) && "bg-secondary text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/cuenta"
            className="ml-1 hidden items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex"
          >
            <UserRound className="h-4 w-4" aria-hidden />
            Mi cuenta
          </Link>
          <Sheet open={abierto} onOpenChange={setAbierto}>
            <SheetTrigger
              aria-label="Abrir menú"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-foreground lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </SheetTrigger>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
              <div className="h-1.5 w-full barra-marca" />
              <div className="px-6 pt-5">
                <SheetTitle asChild>
                  <span>
                    <Logo />
                  </span>
                </SheetTitle>
                <SheetDescription className="sr-only">Menú de navegación del portal</SheetDescription>
              </div>
              <nav aria-label="Menú" className="flex-1 overflow-y-auto px-6">
                <div className="flex flex-col py-6">
                  {navPrincipal.map((item, i) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setAbierto(false)}
                      aria-current={estaActivo(pathname, item.href) ? "page" : undefined}
                      className={cn(
                        "group flex items-center justify-between py-4 text-2xl font-bold text-foreground",
                        estaActivo(pathname, item.href) && "text-primary",
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <item.icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                        {item.label}
                      </span>
                      <span
                        className="h-0.5 w-0 rounded-full transition-all duration-300 group-hover:w-12"
                        style={{ backgroundColor: `var(--${coloresMenu[i % coloresMenu.length]})` }}
                      />
                    </Link>
                  ))}
                  <div className="mt-4 border-t border-border pt-4">
                    {[...navSecundaria, { href: "/cuenta", label: "Mi cuenta" }].map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setAbierto(false)}
                        className="block py-3 text-lg font-medium text-muted-foreground hover:text-foreground"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </nav>
              <div className="flex h-1 w-full" aria-hidden>
                <div className="h-full flex-1 bg-verde" />
                <div className="h-full flex-1 bg-azul" />
                <div className="h-full flex-1 bg-magenta" />
                <div className="h-full flex-1 bg-naranja" />
                <div className="h-full flex-1 bg-amarillo" />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
