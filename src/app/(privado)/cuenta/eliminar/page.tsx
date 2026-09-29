import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronRight, Trash2 } from "lucide-react";

import { requirePageAuth } from "@/server/auth/current-user";
import { ETIQUETAS_ESTADO } from "@/server/domain/contracts/state-machine";
import { getAccountDeletionCheck } from "@/server/users/account-deletion";

import { FormularioEliminar } from "./FormularioEliminar";

export const metadata: Metadata = { title: "Eliminar mi cuenta" };

/** Eliminación de cuenta por el titular (ADR-018): qué se borra, qué se conserva y confirmación. */
export default async function EliminarCuentaPage() {
  const auth = await requirePageAuth("/cuenta/eliminar");
  if (auth.source === "ENTRA") redirect("/admin");
  const check = await getAccountDeletionCheck(auth.user);

  const seBorra = [
    "Tu nombre, correo y teléfono, y tus formas de ingreso a Llankana.",
    "Tus notificaciones y los dispositivos que reciben avisos.",
    ...(check.isWorker
      ? ["Tu perfil de trabajador sale del buscador; se borran tu foto, tu descripción, tus oficios y tus documentos."]
      : []),
  ];
  const seConserva = [
    "Los mensajes y reseñas que escribiste: la otra persona los sigue viendo, firmados como «Cuenta eliminada».",
    "El registro de tus contrataciones y denuncias, sin tus datos, porque también es de la otra parte.",
    "Tu cuenta ciudadana del GAD: la usan otros servicios municipales. Si vuelves a ingresar a Llankana, empezarás con una cuenta nueva.",
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 pb-6 sm:px-6 lg:pt-14">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <Trash2 className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-3xl leading-tight font-extrabold sm:text-4xl">Eliminar mi cuenta</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        La eliminación es inmediata y no se puede deshacer. Esto es lo que pasa con tus datos.
      </p>

      <section aria-labelledby="titulo-borra" className="mt-8 panel p-6">
        <h2 id="titulo-borra" className="text-lg font-extrabold">
          Se borra
        </h2>
        <Lista items={seBorra} color="bg-destructive" />
        <h2 className="mt-6 text-lg font-extrabold">Se conserva</h2>
        <Lista items={seConserva} color="bg-muted-foreground" />
      </section>

      {check.canDelete ? (
        <section aria-labelledby="titulo-confirmar" className="mt-6 panel p-6">
          <h2 id="titulo-confirmar" className="sr-only">
            Confirmar
          </h2>
          {check.pendingProposals > 0 && (
            <p className="mb-5 flex gap-3 rounded-2xl bg-amarillo/20 p-4 text-sm">
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
              <span>
                {check.pendingProposals === 1
                  ? "Tienes 1 propuesta sin aceptar: se cancelará y avisaremos a la otra persona."
                  : `Tienes ${check.pendingProposals} propuestas sin aceptar: se cancelarán y avisaremos a las otras personas.`}
              </span>
            </p>
          )}
          <FormularioEliminar />
        </section>
      ) : (
        <section aria-labelledby="titulo-bloqueo" className="mt-6 panel p-6">
          <h2 id="titulo-bloqueo" className="flex items-center gap-2 text-lg font-extrabold">
            <AlertTriangle className="h-5 w-5 text-naranja" aria-hidden />
            Primero termina tus contrataciones
          </h2>
          <p className="mt-2 text-muted-foreground">
            Para proteger a la otra parte, no puedes eliminar tu cuenta mientras tengas contrataciones en marcha.
            Termínalas o cancélalas y vuelve aquí.
          </p>
          <ul className="mt-4 divide-y divide-border/70">
            {check.blockingContracts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/contrataciones/${c.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-3 hover:bg-secondary"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">Con {c.counterpartName}</span>
                    <span className="text-sm text-muted-foreground">{ETIQUETAS_ESTADO[c.status]}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-6 text-center">
        <Link href="/cuenta" className="font-bold text-primary underline underline-offset-4">
          Volver a mi cuenta
        </Link>
      </p>
    </div>
  );
}

function Lista({ items, color }: { items: string[]; color: string }) {
  return (
    <ul className="mt-3 space-y-2.5">
      {items.map((t) => (
        <li key={t} className="flex gap-3">
          <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
