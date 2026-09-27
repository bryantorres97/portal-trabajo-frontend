import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSignature, MessageCircle } from "lucide-react";

import { ListaContratos } from "@/components/contracts/ListaContratos";
import { boton } from "@/components/ui/boton";
import { cn } from "@/lib/utils";
import { requireConsentedPageAuth } from "@/server/auth/current-user";
import { listContracts } from "@/server/contracts/contracts";

export const metadata: Metadata = { title: "Mis contrataciones" };

/** «Mis contrataciones»: como cliente y como trabajador, activas e historial. */
export default async function ContratacionesPage({ searchParams }: PageProps<"/contrataciones">) {
  const auth = await requireConsentedPageAuth("/contrataciones");
  if (auth.source === "ENTRA") redirect("/admin");
  const { ver } = await searchParams;
  const historial = ver === "historial";
  const items = await listContracts(auth.user, { scope: historial ? "historial" : "activas" });
  const pendientes = historial ? 0 : items.filter((c) => c.needsMyAction).length;

  const pestana = (activa: boolean) =>
    cn(
      "inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold transition-colors",
      activa ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="px-4 pt-8 pb-10 sm:px-6 lg:pt-12">
      <header>
        <h1 className="text-3xl font-extrabold sm:text-4xl">Mis contrataciones</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Los acuerdos que hiciste por el chat, con sus condiciones por escrito. Una contratación existe cuando ambas
          partes aceptan la misma versión.
        </p>
      </header>

      <nav aria-label="Filtrar contrataciones" className="mt-6 inline-flex gap-1 rounded-2xl bg-secondary p-1">
        <Link href="/contrataciones" aria-current={!historial ? "page" : undefined} className={pestana(!historial)}>
          Activas
          {pendientes > 0 && (
            <span className="ml-2 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {pendientes}
            </span>
          )}
        </Link>
        <Link
          href="/contrataciones?ver=historial"
          aria-current={historial ? "page" : undefined}
          className={pestana(historial)}
        >
          Historial
        </Link>
      </nav>

      <div className="mt-6">
        {items.length > 0 ? (
          <ListaContratos items={items} />
        ) : (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-border px-6 py-12 text-center">
            <FileSignature className="h-12 w-12 text-primary/60" aria-hidden />
            <p className="mt-4 text-lg font-bold">
              {historial ? "Aún no tienes contrataciones terminadas" : "No tienes contrataciones activas"}
            </p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Cuando se pongan de acuerdo en una conversación, usa «Proponer condiciones» para dejarlas por escrito.
            </p>
            <Link href="/mensajes" className={cn(boton({ variante: "suave" }), "mt-5")}>
              <MessageCircle aria-hidden /> Ir a mensajes
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
