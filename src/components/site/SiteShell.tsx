import Link from "next/link";
import type { ReactNode } from "react";

import { MensajesProvider } from "@/components/chat/MensajesProvider";
import { BottomNav } from "@/components/site/BottomNav";
import { Logo, LogoInstitucional } from "@/components/site/Logo";
import { navPrincipal, navSecundaria } from "@/components/site/navegacion";
import { SiteHeader } from "@/components/site/SiteHeader";
import { institucion } from "@/content/site";
import { cn } from "@/lib/utils";

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <MensajesProvider>
      <div className="flex min-h-screen flex-col overflow-x-clip bg-background pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Saltar al contenido
        </a>
        <div className="h-1 w-full barra-marca" />
        <SiteHeader />

        <main id="contenido" className="mx-auto w-full max-w-6xl flex-1">
          {children}
        </main>

        <PiePagina />
        <BottomNav />
      </div>
    </MensajesProvider>
  );
}

function PiePagina() {
  return (
    <footer className="mt-16 superficie">
      <div className="contenedor grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Plataforma municipal que conecta a la ciudadanía con trabajadores de oficio registrados, capacitados y
            habilitados por el Municipio.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <span className="h-10 w-1 rounded-full barra-marca" aria-hidden />
            <LogoInstitucional />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{institucion.direccion}</p>
        </div>
        <nav aria-label="Portal">
          <h2 className="font-sans text-sm font-bold tracking-normal">Portal</h2>
          <ul className="mt-3 space-y-1">
            {navPrincipal.map((i) => (
              <li key={i.href}>
                <EnlacePie href={i.href}>{i.label}</EnlacePie>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Información">
          <h2 className="font-sans text-sm font-bold tracking-normal">Información</h2>
          <ul className="mt-3 space-y-1">
            {navSecundaria.map((i) => (
              <li key={i.href}>
                <EnlacePie href={i.href}>{i.label}</EnlacePie>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-border/70">
        <p className="contenedor flex flex-col gap-1 py-5 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <span>
            © {new Date().getFullYear()} {institucion.gad}. Tarifas referenciales, no vinculantes.
          </span>
          <span>No constituye relación de dependencia laboral entre las partes ni con el GAD.</span>
        </p>
      </div>
    </footer>
  );
}

function EnlacePie({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
    >
      {children}
    </Link>
  );
}

/** Encabezado de página. Sin etiqueta sobre el título: el título habla por sí mismo. */
export function PageHeader({
  titulo,
  descripcion,
  children,
  className,
}: {
  titulo: string;
  descripcion?: string;
  /** Acciones o contenido extra bajo la descripción. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("px-4 pt-10 pb-6 sm:px-6 lg:pt-14", className)}>
      <h1 className="max-w-4xl text-[2rem] leading-[1.1] font-extrabold sm:text-5xl">{titulo}</h1>
      {descripcion && (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{descripcion}</p>
      )}
      {children}
    </header>
  );
}

export function Section({
  titulo,
  descripcion,
  children,
  className,
}: {
  titulo?: string;
  descripcion?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("px-4 py-6 sm:px-6", className)}>
      {titulo && <h2 className="text-2xl font-extrabold sm:text-3xl">{titulo}</h2>}
      {descripcion && <p className="mt-2 max-w-2xl text-muted-foreground">{descripcion}</p>}
      {(titulo || descripcion) && <div className="mb-5" />}
      {children}
    </section>
  );
}
