import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";

import { requireConsentedPageAuth } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Mensajes" };

/** En escritorio ocupa el panel derecho mientras no hay una conversación elegida (en móvil se ve la lista). */
export default async function MensajesPage() {
  const auth = await requireConsentedPageAuth("/mensajes");
  if (auth.source === "ENTRA") redirect("/admin");

  return (
    <div className="hidden h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border p-10 text-center lg:flex">
      <MessagesSquare className="h-12 w-12 text-primary/60" aria-hidden />
      <p className="mt-4 text-lg font-bold">Elige una conversación</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Tus mensajes con trabajadores y clientes aparecen a la izquierda. Por seguridad, el contacto se hace solo por
        este chat.
      </p>
    </div>
  );
}
