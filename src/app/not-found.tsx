import Link from "next/link";

import { SiteShell } from "@/components/site/SiteShell";

export default function NotFound() {
  return (
    <SiteShell>
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md text-center">
          <p className="texto-marca font-display text-7xl font-extrabold">404</p>
          <h1 className="mt-4 text-xl font-semibold">Página no encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">La página que buscas no existe o fue movida.</p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
