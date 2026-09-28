import Link from "next/link";
import { BadgeCheck, Briefcase, MapPin, Star } from "lucide-react";

import { iniciales } from "@/lib/busqueda";
import { cn } from "@/lib/utils";

/** URL de la foto pública aprobada (la sirve el servidor desde el bucket privado). */
export function fotoTrabajador(id: string): string {
  return `/api/v1/workers/${id}/photo`;
}

/**
 * Foto aprobada del trabajador o, si no tiene, avatar con iniciales (ADR-009: no se generan
 * imágenes). Es decorativa: el nombre siempre está escrito al lado.
 */
export function Avatar({ nombre, foto, className }: { nombre: string; foto?: string | null; className?: string }) {
  if (foto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- imagen servida por el propio portal
      <img src={foto} alt="" aria-hidden className={cn("shrink-0 rounded-2xl object-cover", className)} />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-azul/15 to-verde/15 font-display font-extrabold text-primary",
        className,
      )}
    >
      {iniciales(nombre)}
    </span>
  );
}

export function Disponibilidad({ disponible, compacta }: { disponible: boolean; compacta?: boolean }) {
  if (compacta) {
    return (
      <span className={cn("flex items-center gap-1.5 font-semibold", disponible ? "text-verde-fuerte" : "")}>
        <span className={cn("h-2 w-2 rounded-full", disponible ? "bg-verde" : "bg-muted-foreground/50")} aria-hidden />
        {disponible ? "Disponible" : "No disponible"}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
        disponible ? "bg-verde/15 text-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", disponible ? "bg-verde" : "bg-muted-foreground/60")} aria-hidden />
      {disponible ? "Disponible" : "No disponible por ahora"}
    </span>
  );
}

export type WorkerCardData = {
  id: string;
  displayName: string;
  specialty: string | null;
  yearsExperience: number;
  isAvailable: boolean;
  parish: string | null;
  ratingAvg: number;
  ratingCount: number;
  services: { slug: string; name: string }[];
  hasPhoto?: boolean;
};

export function WorkerCard({ worker, headingLevel = 3 }: { worker: WorkerCardData; headingLevel?: 2 | 3 }) {
  const Titulo = headingLevel === 2 ? "h2" : "h3";
  const servicios = worker.services.slice(0, 3);
  const extra = worker.services.length - servicios.length;
  return (
    <article className="group relative flex h-full flex-col panel p-5 transition-[box-shadow,transform] duration-200 ease-out focus-within:ring-2 focus-within:ring-ring hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevada)]">
      <div className="flex items-start gap-4">
        <Avatar
          nombre={worker.displayName}
          foto={worker.hasPhoto ? fotoTrabajador(worker.id) : null}
          className="h-16 w-16 text-xl"
        />
        <div className="min-w-0 flex-1">
          <Titulo className="text-lg leading-tight font-extrabold">
            <Link href={`/trabajadores/${worker.id}`} className="after:absolute after:inset-0 focus:outline-none">
              {worker.displayName}
            </Link>
          </Titulo>
          {worker.specialty && <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{worker.specialty}</p>}
          <p className="mt-1.5 flex items-center gap-1.5 text-sm">
            {worker.ratingCount > 0 ? (
              <>
                <Star className="h-4 w-4 fill-amarillo text-amarillo" aria-hidden />
                <span className="font-bold tabular-nums">{worker.ratingAvg.toFixed(1)}</span>
                <span className="text-muted-foreground tabular-nums">
                  ({worker.ratingCount} {worker.ratingCount === 1 ? "opinión" : "opiniones"})
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Nuevo en la plataforma</span>
            )}
          </p>
        </div>
      </div>

      <ul className="mt-4 mb-5 flex flex-wrap gap-1.5" aria-label="Oficios">
        {servicios.map((s) => (
          <li key={s.slug} className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
            {s.name}
          </li>
        ))}
        {extra > 0 && <li className="rounded-full px-2 py-1 text-xs font-semibold text-muted-foreground">+{extra}</li>}
      </ul>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/70 pt-4 text-sm text-muted-foreground">
        <Disponibilidad disponible={worker.isAvailable} compacta />
        <span className="flex items-center gap-1">
          <Briefcase className="h-4 w-4" aria-hidden />
          {worker.yearsExperience} {worker.yearsExperience === 1 ? "año" : "años"}
        </span>
        {worker.parish && (
          <span className="flex min-w-0 items-center gap-1">
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{worker.parish}</span>
          </span>
        )}
      </div>
      <span
        className="absolute top-4 right-4 grid h-7 w-7 place-items-center rounded-full bg-verde/15 text-verde-fuerte"
        title="Habilitado por el GAD"
      >
        <BadgeCheck className="h-4 w-4" aria-hidden />
        <span className="sr-only">Habilitado por el GAD</span>
      </span>
    </article>
  );
}
