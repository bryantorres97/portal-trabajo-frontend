import type { ReactNode } from "react";

import { PanelNav, type UsuarioPanel } from "@/components/admin/PanelNav";

/** Marco del panel del GAD: navegación lateral y área de trabajo. */
export function PanelShell({ usuario, children }: { usuario: UsuarioPanel; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background lg:flex">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <PanelNav usuario={usuario} />
      <main id="contenido" className="mx-auto w-full max-w-[76rem] min-w-0 flex-1 px-4 pb-20 sm:px-6 lg:px-10">
        {children}
      </main>
    </div>
  );
}
