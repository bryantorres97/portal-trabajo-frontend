"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LogIn, Menu, MessageCircle, UserRound } from "lucide-react";
import { useState } from "react";

import { ContadorNoLeidos, useMensajes } from "@/components/chat/MensajesProvider";
import { Logo } from "@/components/site/Logo";
import { estaActivo, navPrincipal, navSecundaria } from "@/components/site/navegacion";
import { boton } from "@/components/ui/boton";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const { resumen } = useMensajes();
  // Acceso directo a Mensajes: visible sin sesión (lleva al ingreso) y para ciudadanos; no para el personal.
  const verMensajes = !resumen?.signedIn || resumen.chat;
  const noLeidos = resumen?.unreadMessages ?? 0;
  const enMensajes = estaActivo(pathname, "/mensajes");
  const conSesion = !!resumen?.signedIn;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
      <div className="contenedor flex h-16 items-center gap-3 lg:h-[4.5rem]">
        <Link href="/" className="flex min-w-0 shrink-0 items-center" aria-label="Llankana, ir al inicio">
          <Logo />
        </Link>

        <nav aria-label="Secciones" className="ml-6 hidden items-center gap-1 lg:flex">
          {navPrincipal.map((item) => {
            const activo = estaActivo(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "relative rounded-xl px-3.5 py-2 text-[0.95rem] font-semibold text-muted-foreground transition-colors hover:text-foreground",
                  activo && "text-foreground",
                )}
              >
                {item.label}
                {activo && (
                  <span className="absolute inset-x-3.5 -bottom-[0.9rem] h-[3px] rounded-full bg-primary" aria-hidden />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {verMensajes && (
            <Link
              href="/mensajes"
              aria-current={enMensajes ? "page" : undefined}
              aria-label={noLeidos > 0 ? `Mensajes, ${noLeidos} sin leer` : "Mensajes"}
              className={cn(
                boton({ variante: "fantasma", tamano: "sm" }),
                "relative h-11 min-w-11 px-3",
                enMensajes && "bg-primary/10 text-primary",
              )}
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              <span className="hidden xl:inline">Mensajes</span>
              <ContadorNoLeidos valor={noLeidos} className="absolute -top-1 -right-1" />
            </Link>
          )}
          <Link href="/cuenta" className={cn(boton({ tamano: "sm" }), "hidden h-11 sm:inline-flex")}>
            {conSesion ? <UserRound className="h-4 w-4" aria-hidden /> : <LogIn className="h-4 w-4" aria-hidden />}
            {conSesion ? "Mi cuenta" : "Ingresar"}
          </Link>

          <Sheet open={abierto} onOpenChange={setAbierto}>
            <SheetTrigger
              aria-label="Abrir menú"
              className={cn(boton({ variante: "secundario", tamano: "sm" }), "h-11 w-11 px-0 lg:hidden")}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </SheetTrigger>
            <SheetContent side="right" className="flex w-full flex-col gap-0 border-l-0 p-0 sm:max-w-sm">
              <div className="h-1 w-full barra-marca" />
              <div className="px-6 pt-5 pb-2">
                <SheetTitle asChild>
                  <span>
                    <Logo />
                  </span>
                </SheetTitle>
                <SheetDescription className="sr-only">Menú de navegación del portal</SheetDescription>
              </div>
              <nav aria-label="Menú" className="flex-1 overflow-y-auto px-3 pb-6">
                <ul className="space-y-1 pt-3">
                  {navPrincipal.map((item) => {
                    const activo = estaActivo(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setAbierto(false)}
                          aria-current={activo ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-secondary",
                            activo && "bg-primary/10",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-foreground",
                              activo && "bg-primary text-primary-foreground",
                            )}
                          >
                            <item.icon className="h-5 w-5" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-lg leading-tight font-bold">{item.label}</span>
                            {item.descripcion && (
                              <span className="block text-sm text-muted-foreground">{item.descripcion}</span>
                            )}
                          </span>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-6 px-3 text-xs font-bold tracking-wide text-muted-foreground uppercase">Información</p>
                <ul className="mt-2">
                  {navSecundaria.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setAbierto(false)}
                        className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <item.icon className="h-4 w-4" aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Link
                  href="/cuenta"
                  onClick={() => setAbierto(false)}
                  className={cn(boton({ tamano: "lg" }), "w-full")}
                >
                  {conSesion ? <UserRound aria-hidden /> : <LogIn aria-hidden />}
                  {conSesion ? "Mi cuenta" : "Ingresar o crear cuenta"}
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
