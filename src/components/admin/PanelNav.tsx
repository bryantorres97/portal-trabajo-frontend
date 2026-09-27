"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, LogOut, Menu } from "lucide-react";
import { useState } from "react";

import { moduloActivo, modulosVisibles } from "@/components/admin/navegacion";
import { Logo } from "@/components/site/Logo";
import { boton } from "@/components/ui/boton";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type UsuarioPanel = { nombre: string; detalle: string; permisos: string[] };

function iniciales(nombre: string): string {
  const partes = nombre.split(/[\s@.]+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "G";
}

/** Navegación lateral del panel: barra fija en escritorio y menú deslizable en móvil. */
export function PanelNav({ usuario }: { usuario: UsuarioPanel }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[16.5rem] shrink-0 flex-col border-r border-border/70 superficie lg:flex print:hidden">
        <div className="h-1 w-full barra-marca" />
        <Marca />
        <ContenidoNav usuario={usuario} />
      </aside>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md lg:hidden print:hidden">
        <div className="h-1 w-full barra-marca" />
        <div className="flex h-14 items-center gap-3 px-4">
          <Sheet open={abierto} onOpenChange={setAbierto}>
            <SheetTrigger
              aria-label="Abrir menú del panel"
              className={cn(boton({ variante: "secundario", tamano: "sm" }), "h-11 w-11 px-0")}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[18rem] flex-col gap-0 border-r-0 superficie p-0">
              <div className="h-1 w-full barra-marca" />
              <SheetTitle asChild>
                <div>
                  <Marca />
                </div>
              </SheetTitle>
              <SheetDescription className="sr-only">Secciones del panel administrativo</SheetDescription>
              <ContenidoNav usuario={usuario} alNavegar={() => setAbierto(false)} />
            </SheetContent>
          </Sheet>
          <Link href="/admin" className="flex min-w-0 items-baseline gap-2" aria-label="Panel del GAD, inicio">
            <Logo className="text-xl" />
            <span className="truncate text-sm font-semibold text-muted-foreground">Panel del GAD</span>
          </Link>
          <span
            aria-hidden
            className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary"
          >
            {iniciales(usuario.nombre)}
          </span>
        </div>
      </header>
    </>
  );
}

function Marca() {
  return (
    <Link href="/admin" className="block px-5 pt-5 pb-4" aria-label="Panel del GAD, inicio">
      <Logo className="text-[1.6rem]" />
      <span className="mt-1 block text-sm font-semibold text-muted-foreground">Panel del GAD</span>
    </Link>
  );
}

function ContenidoNav({ usuario, alNavegar }: { usuario: UsuarioPanel; alNavegar?: () => void }) {
  const pathname = usePathname();
  const modulos = modulosVisibles(usuario.permisos);
  const disponibles = modulos.filter((m) => m.href);
  const proximos = modulos.filter((m) => !m.href);

  return (
    <>
      <nav aria-label="Panel" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-0.5">
          {disponibles.map((m) => {
            const activo = moduloActivo(pathname, m.href!);
            return (
              <li key={m.titulo}>
                <Link
                  href={m.href!}
                  onClick={alNavegar}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.95rem] font-semibold text-muted-foreground transition-colors duration-150 hover:bg-card/80 hover:text-foreground",
                    activo && "bg-card text-foreground shadow-[var(--shadow-suave)]",
                  )}
                >
                  <m.icon className={cn("h-[1.15rem] w-[1.15rem] shrink-0", activo && "text-primary")} aria-hidden />
                  {m.titulo}
                </Link>
              </li>
            );
          })}
        </ul>

        {proximos.length > 0 && (
          <>
            <p className="mt-6 px-3 text-xs font-semibold text-muted-foreground">Próximamente</p>
            <ul className="mt-1 space-y-0.5">
              {proximos.map((m) => (
                <li
                  key={m.titulo}
                  className="flex min-h-10 items-center gap-3 px-3 text-sm font-medium text-muted-foreground/80"
                >
                  <m.icon className="h-4 w-4 shrink-0" aria-hidden />
                  {m.titulo}
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <div className="border-t border-border/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 px-2 py-2">
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary"
          >
            {iniciales(usuario.nombre)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{usuario.nombre}</span>
            <span className="block truncate text-xs text-muted-foreground">{usuario.detalle}</span>
          </span>
        </div>
        <div className="mt-1 space-y-0.5">
          <Link
            href="/"
            onClick={alNavegar}
            className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-card/80 hover:text-foreground"
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden /> Ver el portal
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-card/80 hover:text-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden /> Cerrar sesión
            </button>
          </form>
        </div>
        <Image
          src="/images/logos/gad-ambato-logo.png"
          alt="GAD Municipalidad de Ambato"
          width={400}
          height={125}
          className="mx-3 mt-4 h-9 w-auto"
        />
      </div>
    </>
  );
}
