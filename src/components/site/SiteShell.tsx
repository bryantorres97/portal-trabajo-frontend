import Link from "next/link";
import type { ReactNode } from "react";

import { BottomNav } from "@/components/site/BottomNav";
import { LogoInstitucional } from "@/components/site/Logo";
import { SiteHeader } from "@/components/site/SiteHeader";
import { institucion } from "@/content/site";

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-0">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <div className="h-1.5 w-full barra-marca" />
      <SiteHeader />

      <main id="contenido" className="mx-auto max-w-6xl">
        {children}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pt-12 pb-10">
        <div className="tarjeta p-5">
          <LogoInstitucional />
          <p className="mt-3 text-sm font-semibold text-foreground">{institucion.direccion}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Acolita.App es la plataforma municipal de intermediación laboral del {institucion.gad}. No constituye
            relación de dependencia laboral entre las partes ni con el {institucion.gad}.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link href="/contacto" className="font-semibold text-primary">
              Contacto
            </Link>
            <Link href="/privacidad" className="font-semibold text-primary">
              Privacidad y derechos del titular
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            © {new Date().getFullYear()} {institucion.gad}. Tarifas referenciales, no vinculantes.
          </p>
        </div>
      </footer>

      <BottomNav />
    </div>
  );
}

export function PageHeader({ eyebrow, titulo, descripcion }: { eyebrow: string; titulo: string; descripcion: string }) {
  return (
    <header className="px-4 pt-8 pb-6">
      <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase">{eyebrow}</p>
      <h1 className="mt-2 text-3xl leading-tight font-extrabold sm:text-4xl">{titulo}</h1>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">{descripcion}</p>
    </header>
  );
}

export function Section({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <section className="px-4 py-6">
      {titulo && <h2 className="mb-4 text-xl font-extrabold sm:text-2xl">{titulo}</h2>}
      {children}
    </section>
  );
}
