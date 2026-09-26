import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Clock, ExternalLink, KeyRound, MessageCircle } from "lucide-react";

import { EstadoTrabajador } from "@/components/admin/EstadoTrabajador";
import { ActionForm } from "@/components/forms/ActionForm";
import { PageHeader, Section } from "@/components/site/SiteShell";
import { Avatar, Disponibilidad } from "@/components/site/WorkerCard";
import { formatearFecha } from "@/lib/formatos";
import { requireConsentedPageAuth } from "@/server/auth/current-user";
import { isPubliclyVisible } from "@/server/domain/workers/state-machine";
import { getOwnWorker, type OwnWorker } from "@/server/workers/public-profile";

import { cambiarDisponibilidad, canjearCodigo, proponerFoto, proponerPerfil } from "./actions";

export const metadata: Metadata = { title: "Soy trabajador" };

const campo =
  "mt-1 w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";

export default async function TrabajadorCuentaPage() {
  const auth = await requireConsentedPageAuth("/cuenta/trabajador");
  if (auth.source === "ENTRA") redirect("/admin");
  const w = await getOwnWorker(auth.user.id);

  return (
    <>
      <PageHeader
        eyebrow="Mi cuenta"
        titulo={w ? "Mi perfil de trabajador" : "Soy trabajador"}
        descripcion={
          w
            ? "Revisa tu estado, indica si estás disponible y propone cambios a tu perfil público."
            : "Si el GAD Municipalidad de Ambato te registró como trabajador, vincula tu cuenta con el código que te entregaron."
        }
      />
      {w ? <Panel w={w} /> : <Vincular />}
      <Section>
        <Link href="/cuenta" className="text-sm font-bold text-primary">
          ← Volver a mi cuenta
        </Link>
      </Section>
    </>
  );
}

function Vincular() {
  return (
    <Section>
      <div className="max-w-lg tarjeta p-5">
        <ActionForm action={canjearCodigo} submitLabel="Vincular mi cuenta" pendingLabel="Verificando…">
          <label htmlFor="code" className="flex items-center gap-2 text-sm font-bold">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden /> Código de activación
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
            className={`${campo} font-mono text-xl tracking-[0.2em] uppercase`}
          />
          <p className="text-xs text-muted-foreground">
            Tiene 8 caracteres y vence a los 7 días. Si lo perdiste o venció, pide uno nuevo en el punto de atención del
            GAD.
          </p>
        </ActionForm>
      </div>
    </Section>
  );
}

function Panel({ w }: { w: OwnWorker }) {
  const visible = isPubliclyVisible(w.status);
  return (
    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div>
        <Section titulo="Tu estado">
          <div className="space-y-3 tarjeta p-5 text-sm">
            <div className="flex items-center gap-3">
              <Avatar
                nombre={w.displayName}
                foto={w.photo.hasApproved ? "/cuenta/trabajador/foto" : null}
                className="h-16 w-16 text-xl"
              />
              <div>
                <p className="text-lg font-bold">{w.displayName}</p>
                <EstadoTrabajador status={w.status} />
              </div>
            </div>
            {visible ? (
              <p className="flex gap-2">
                <BadgeCheck className="h-5 w-5 shrink-0 text-verde" aria-hidden />
                Estás habilitado: los clientes te encuentran en la búsqueda.
                <Link href={`/trabajadores/${w.id}`} className="inline-flex items-center gap-1 font-bold text-primary">
                  Ver mi perfil <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </p>
            ) : (
              <p className="flex gap-2 text-muted-foreground">
                <Clock className="h-5 w-5 shrink-0" aria-hidden />
                Tu perfil todavía no es público. El GAD te avisará cuando completes el proceso de habilitación.
              </p>
            )}
            <Link
              href="/mensajes"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              <MessageCircle className="h-4 w-4" aria-hidden /> Ver mis mensajes
            </Link>
            <p className="text-muted-foreground">
              Oficios: {w.services.join(", ")}
              {w.parish ? ` · ${w.parish}` : ""}
            </p>
          </div>
        </Section>

        <Section titulo="Tu perfil público">
          <div className="space-y-4 tarjeta p-5 text-sm">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase">Descripción publicada</p>
              <p className="mt-1 whitespace-pre-line">{w.publicBio ?? "Aún no tienes descripción."}</p>
              {w.availabilityNote && <p className="mt-1 text-xs">Disponibilidad: {w.availabilityNote}</p>}
            </div>
            {w.proposal && (
              <p className="rounded-xl bg-naranja/10 p-3">
                Tienes cambios enviados el {formatearFecha(w.proposal.submittedAt)}, pendientes de revisión del GAD.
              </p>
            )}
            {w.proposalReviewNote && (
              <p role="status" className="rounded-xl bg-destructive/10 p-3">
                El GAD no aprobó tus últimos cambios: {w.proposalReviewNote}
              </p>
            )}
            <details>
              <summary className="cursor-pointer font-bold">Proponer cambios</summary>
              <ActionForm action={proponerPerfil} submitLabel="Enviar a revisión" className="mt-3">
                <label htmlFor="publicBio" className="text-sm font-bold">
                  Descripción (cuéntales a los clientes qué haces)
                </label>
                <textarea
                  id="publicBio"
                  name="publicBio"
                  rows={5}
                  maxLength={800}
                  defaultValue={w.proposal?.bio ?? w.publicBio ?? ""}
                  className={campo}
                />
                <label htmlFor="availabilityNote" className="text-sm font-bold">
                  Horario o disponibilidad (opcional)
                </label>
                <input
                  id="availabilityNote"
                  name="availabilityNote"
                  maxLength={160}
                  placeholder="Ej.: lunes a sábado, de 8:00 a 17:00"
                  defaultValue={w.proposal?.availabilityNote ?? w.availabilityNote ?? ""}
                  className={campo}
                />
                <p className="text-xs text-muted-foreground">
                  No incluyas tu teléfono ni redes sociales: los clientes te escriben por el chat del portal.
                </p>
              </ActionForm>
            </details>
          </div>
        </Section>
      </div>

      <div>
        <Section titulo="Disponibilidad">
          <div className="space-y-3 tarjeta p-5">
            <Disponibilidad disponible={w.isAvailable} />
            <ActionForm
              action={cambiarDisponibilidad}
              submitLabel={w.isAvailable ? "Marcar como no disponible" : "Marcar como disponible"}
              variant="secondary"
            >
              <input type="hidden" name="isAvailable" value={w.isAvailable ? "false" : "true"} />
            </ActionForm>
          </div>
        </Section>

        <Section titulo="Tu foto">
          <div className="space-y-3 tarjeta p-5 text-sm">
            {w.photo.hasPending && <p className="rounded-xl bg-naranja/10 p-3">Tu nueva foto está en revisión.</p>}
            {w.photo.status === "RECHAZADA" && w.photo.reviewNote && (
              <p role="status" className="rounded-xl bg-destructive/10 p-3">
                El GAD no aprobó tu foto: {w.photo.reviewNote}
              </p>
            )}
            <ActionForm action={proponerFoto} submitLabel="Enviar foto" pendingLabel="Subiendo…">
              <label htmlFor="foto" className="text-sm font-bold">
                Foto de frente, con buena luz (JPG, PNG o WEBP; máximo 4 MB)
              </label>
              <input
                id="foto"
                name="file"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp"
                className={campo}
              />
            </ActionForm>
          </div>
        </Section>
      </div>
    </div>
  );
}
