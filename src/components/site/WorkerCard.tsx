import Link from "next/link";
import { BadgeCheck, Briefcase, MapPin } from "lucide-react";

import { Estrellas } from "@/components/site/Estrellas";
import { iniciales } from "@/lib/busqueda";
import { cn } from "@/lib/utils";

/** Avatar con iniciales (las fotos llegan con la Fase 4, moderadas; ADR-009: no se generan imágenes). */
export function Avatar({ nombre, className }: { nombre: string; className?: string }) {
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

export function Disponibilidad({ disponible }: { disponible: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-bold",
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
};

export function WorkerCard({ worker, headingLevel = 3 }: { worker: WorkerCardData; headingLevel?: 2 | 3 }) {
  const Titulo = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="relative flex h-full flex-col gap-3 tarjeta p-4 transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar nombre={worker.displayName} className="h-14 w-14 text-lg" />
        <div className="min-w-0 flex-1">
          <Titulo className="text-base leading-tight font-bold">
            <Link href={`/trabajadores/${worker.id}`} className="after:absolute after:inset-0 focus:outline-none">
              {worker.displayName}
            </Link>
          </Titulo>
          {worker.specialty && <p className="mt-0.5 truncate text-sm text-muted-foreground">{worker.specialty}</p>}
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-verde-fuerte">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Habilitado por el GAD
          </p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Oficios">
        {worker.services.map((s) => (
          <li key={s.slug} className="rounded-lg bg-secondary px-2 py-0.5 text-xs font-semibold">
            {s.name}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        {worker.ratingCount > 0 ? (
          <span className="flex items-center gap-1">
            <Estrellas valor={worker.ratingAvg} tamaño="sm" />
            <span>
              {worker.ratingAvg.toFixed(1)} ({worker.ratingCount})
            </span>
          </span>
        ) : (
          <span>Sin calificaciones aún</span>
        )}
        <span className="flex items-center gap-1">
          <Briefcase className="h-3.5 w-3.5" aria-hidden />
          {worker.yearsExperience} {worker.yearsExperience === 1 ? "año" : "años"}
        </span>
        {worker.parish && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {worker.parish}
          </span>
        )}
      </div>
      <Disponibilidad disponible={worker.isAvailable} />
    </article>
  );
}
