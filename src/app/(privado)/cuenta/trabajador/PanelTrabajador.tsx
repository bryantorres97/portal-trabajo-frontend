import Link from "next/link";
import { AlertTriangle, Check, Clock, ExternalLink, KeyRound, MapPin, MessageCircle, PencilLine } from "lucide-react";

import { ActionForm } from "@/components/forms/ActionForm";
import { Avatar } from "@/components/site/WorkerCard";
import { boton } from "@/components/ui/boton";
import { campo } from "@/components/ui/campo";
import { formatearFecha } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import type { WorkerStatus } from "@/server/domain/workers/state-machine";
import type { OwnWorker } from "@/server/workers/public-profile";

import { cambiarDisponibilidad, canjearCodigo, proponerFoto, proponerPerfil } from "./actions";
import { InterruptorDisponibilidad, SubirFoto } from "./ControlesTrabajador";

const PASOS = ["Registro", "Documentos", "Capacitación", "Habilitado"] as const;

function pasoActual(s: WorkerStatus): number {
  if (s === "REGISTRADO") return 0;
  if (s === "DOCUMENTACION_PENDIENTE" || s === "PENDIENTE_REVISION") return 1;
  if (s.startsWith("CAPACITACION")) return s === "CAPACITACION_APROBADA" ? 2.5 : 2;
  return 3;
}

const QUE_SIGUE: Record<WorkerStatus, { titulo: string; texto: string; tono: "info" | "ok" | "alerta" }> = {
  REGISTRADO: {
    titulo: "Tu registro está en marcha",
    texto: "El personal del GAD revisará tus datos. Si falta algún documento, te lo pedirán en el punto de atención.",
    tono: "info",
  },
  DOCUMENTACION_PENDIENTE: {
    titulo: "Falta documentación",
    texto: "Acércate al punto de atención del GAD con los documentos que te indicaron.",
    tono: "alerta",
  },
  PENDIENTE_REVISION: {
    titulo: "Estamos revisando tus documentos",
    texto: "No tienes que hacer nada por ahora. Te avisaremos cuando termine la revisión.",
    tono: "info",
  },
  CAPACITACION_PENDIENTE: {
    titulo: "Siguiente paso: la capacitación",
    texto: "El GAD te inscribirá en la capacitación y te dirá la fecha y el lugar.",
    tono: "info",
  },
  CAPACITACION_EN_PROCESO: {
    titulo: "Estás en capacitación",
    texto: "Cuando la apruebes, el GAD revisará tu perfil para habilitarte.",
    tono: "info",
  },
  CAPACITACION_APROBADA: {
    titulo: "¡Aprobaste la capacitación!",
    texto: "El GAD revisará tu perfil público y te habilitará. Mientras tanto, agrega tu foto y una buena descripción.",
    tono: "ok",
  },
  HABILITADO: {
    titulo: "Estás habilitado",
    texto: "Los clientes te encuentran en la búsqueda y pueden escribirte por el chat.",
    tono: "ok",
  },
  SUSPENDIDO: {
    titulo: "Tu perfil está suspendido",
    texto: "Por ahora no apareces en la búsqueda. Comunícate con el GAD para conocer el motivo.",
    tono: "alerta",
  },
  INACTIVO: {
    titulo: "Tu perfil está inactivo",
    texto: "No apareces en la búsqueda. Si quieres volver, comunícate con el GAD.",
    tono: "alerta",
  },
  RECHAZADO: {
    titulo: "Tu registro no fue aprobado",
    texto: "Comunícate con el GAD Municipalidad de Ambato para conocer el motivo.",
    tono: "alerta",
  },
};

export function VincularCuenta() {
  return (
    <div className="mx-auto grid max-w-5xl items-start gap-8 px-4 pt-10 pb-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:pt-14">
      <div>
        <h1 className="text-4xl leading-tight font-extrabold sm:text-5xl">Soy trabajador</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Si el GAD Municipalidad de Ambato te registró como trabajador, une tu cuenta con tu ficha usando el código que
          te entregaron.
        </p>
        <ol className="mt-8 space-y-5">
          {[
            ["Busca tu código", "Te lo dio el funcionario del GAD en el punto de atención. Tiene 8 letras y números."],
            ["Escríbelo aquí", "No importa si usas mayúsculas, minúsculas o espacios."],
            ["¡Listo!", "Verás tu estado, podrás recibir mensajes y editar tu perfil."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-verde font-display font-extrabold text-white">
                {i + 1}
              </span>
              <span className="pt-1.5">
                <span className="block font-bold">{t}</span>
                <span className="text-muted-foreground">{d}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm text-muted-foreground">
          ¿No tienes código o se venció? Pídelo en el punto de atención del GAD.{" "}
          <Link href="/trabajadores" className="font-bold text-primary underline underline-offset-4">
            Ver puntos de atención
          </Link>
        </p>
      </div>
      <div className="panel p-6 sm:p-8">
        <ActionForm action={canjearCodigo} submitLabel="Vincular mi cuenta" pendingLabel="Verificando…">
          <label htmlFor="code" className="flex items-center gap-2 text-base font-bold">
            <KeyRound className="h-5 w-5 text-primary" aria-hidden /> Código de activación
          </label>
          <input
            id="code"
            name="code"
            required
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            placeholder="ABCD-2345"
            className={cn(campo, "text-center font-mono text-2xl tracking-[0.25em] uppercase")}
          />
          <p className="text-sm text-muted-foreground">Vence a los 7 días de emitido.</p>
        </ActionForm>
      </div>
    </div>
  );
}

export function PanelTrabajador({ w, fotoUrl }: { w: OwnWorker; fotoUrl: string | null }) {
  const paso = pasoActual(w.status);
  const sigue = QUE_SIGUE[w.status];
  const detenido = w.status === "SUSPENDIDO" || w.status === "INACTIVO" || w.status === "RECHAZADO";

  return (
    <div className="px-4 pt-8 pb-4 sm:px-6 lg:pt-12">
      <header className="flex items-center gap-4">
        <Avatar nombre={w.displayName} foto={fotoUrl} className="h-16 w-16 rounded-3xl text-xl sm:h-20 sm:w-20" />
        <div className="min-w-0">
          <h1 className="text-3xl leading-tight font-extrabold sm:text-4xl">{w.displayName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-muted-foreground">
            <span>{w.services.join(" · ")}</span>
            {w.parish && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" aria-hidden /> {w.parish}
              </span>
            )}
          </p>
        </div>
      </header>

      {/* Estado y progreso de la habilitación */}
      <section aria-labelledby="titulo-estado" className="mt-8 panel p-5 sm:p-7">
        <h2 id="titulo-estado" className="sr-only">
          Tu estado
        </h2>
        {!detenido && (
          <ol className="grid grid-cols-4 gap-2" aria-label="Avance de tu habilitación">
            {PASOS.map((p, i) => {
              const hecho = i < paso || (i === 3 && paso === 3);
              const actual = !hecho && i === Math.ceil(paso);
              return (
                <li key={p} className="flex flex-col gap-2" aria-current={actual ? "step" : undefined}>
                  <span
                    className={cn("h-2 rounded-full", hecho ? "bg-verde" : actual ? "bg-primary" : "bg-secondary")}
                  />
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs font-bold sm:text-sm",
                      hecho ? "text-verde-fuerte" : actual ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {hecho && <Check className="h-3.5 w-3.5" aria-hidden />}
                    {p}
                    <span className="sr-only">{hecho ? " (completado)" : actual ? " (en curso)" : " (pendiente)"}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <div
          className={cn(
            "flex gap-3 rounded-2xl p-4",
            !detenido && "mt-6",
            sigue.tono === "ok" && "bg-verde/15",
            sigue.tono === "info" && "bg-primary/5",
            sigue.tono === "alerta" && "bg-amarillo/20",
          )}
        >
          {sigue.tono === "alerta" ? (
            <AlertTriangle className="h-6 w-6 shrink-0 text-naranja" aria-hidden />
          ) : sigue.tono === "ok" ? (
            <Check className="h-6 w-6 shrink-0 text-verde-fuerte" aria-hidden />
          ) : (
            <Clock className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          )}
          <div>
            <p className="text-lg font-bold">{sigue.titulo}</p>
            <p className="mt-0.5 text-muted-foreground">{sigue.texto}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/mensajes" className={boton()}>
            <MessageCircle aria-hidden /> Ver mis mensajes
          </Link>
          {w.status === "HABILITADO" && (
            <Link href={`/trabajadores/${w.id}`} className={boton({ variante: "secundario" })}>
              <ExternalLink aria-hidden /> Ver mi perfil público
            </Link>
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-6">
          {/* Perfil público */}
          <section aria-labelledby="titulo-perfil" className="panel p-5 sm:p-7">
            <h2 id="titulo-perfil" className="text-xl font-extrabold">
              Así te ven los clientes
            </h2>
            <div className="mt-4 rounded-2xl superficie p-5">
              <p className="whitespace-pre-line">
                {w.publicBio ?? <span className="text-muted-foreground">Aún no tienes una descripción.</span>}
              </p>
              {w.availabilityNote && (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" aria-hidden /> {w.availabilityNote}
                </p>
              )}
            </div>
            {w.proposal && (
              <p className="mt-4 flex items-start gap-2 rounded-2xl bg-amarillo/20 p-4 text-sm">
                <Clock className="h-5 w-5 shrink-0" aria-hidden />
                Enviaste cambios el {formatearFecha(w.proposal.submittedAt)}. Se publicarán cuando el GAD los revise.
              </p>
            )}
            {w.proposalReviewNote && (
              <p role="status" className="mt-4 flex items-start gap-2 rounded-2xl bg-destructive/10 p-4 text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
                El GAD no aprobó tus últimos cambios: {w.proposalReviewNote}
              </p>
            )}
            <details className="group mt-5">
              <summary
                className={cn(
                  boton({ variante: "secundario" }),
                  "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
                )}
              >
                <PencilLine aria-hidden /> Cambiar mi descripción
              </summary>
              <ActionForm action={proponerPerfil} submitLabel="Enviar a revisión" className="mt-5">
                <div>
                  <label htmlFor="publicBio" className="font-bold">
                    Cuéntales a los clientes qué haces
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Por ejemplo: qué trabajos haces, desde cuándo y en qué zonas.
                  </p>
                  <textarea
                    id="publicBio"
                    name="publicBio"
                    rows={5}
                    maxLength={800}
                    defaultValue={w.proposal?.bio ?? w.publicBio ?? ""}
                    className={campo}
                  />
                </div>
                <div>
                  <label htmlFor="availabilityNote" className="font-bold">
                    Horario <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <input
                    id="availabilityNote"
                    name="availabilityNote"
                    maxLength={160}
                    placeholder="Ej.: lunes a sábado, de 8:00 a 17:00"
                    defaultValue={w.proposal?.availabilityNote ?? w.availabilityNote ?? ""}
                    className={campo}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  No incluyas tu teléfono ni redes sociales: los clientes te escriben por el chat del portal.
                </p>
              </ActionForm>
            </details>
          </section>
        </div>

        <div className="space-y-6">
          {/* Disponibilidad */}
          <section aria-labelledby="titulo-disp" className="panel p-5 sm:p-6">
            <h2 id="titulo-disp" className="text-xl font-extrabold">
              ¿Puedes tomar trabajos?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Los clientes ven si estás disponible.</p>
            <InterruptorDisponibilidad action={cambiarDisponibilidad} disponible={w.isAvailable} />
          </section>

          {/* Foto */}
          <section aria-labelledby="titulo-foto" className="panel p-5 sm:p-6">
            <h2 id="titulo-foto" className="text-xl font-extrabold">
              Tu foto
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Un perfil con foto genera más confianza. De frente, con buena luz y sin gafas oscuras.
            </p>
            {w.photo.hasPending && (
              <p className="mt-4 flex items-start gap-2 rounded-2xl bg-amarillo/20 p-3 text-sm">
                <Clock className="h-5 w-5 shrink-0" aria-hidden /> Tu nueva foto está en revisión.
              </p>
            )}
            {w.photo.status === "RECHAZADA" && w.photo.reviewNote && (
              <p role="status" className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm">
                El GAD no aprobó tu foto: {w.photo.reviewNote}
              </p>
            )}
            <SubirFoto action={proponerFoto} />
          </section>
        </div>
      </div>
    </div>
  );
}
