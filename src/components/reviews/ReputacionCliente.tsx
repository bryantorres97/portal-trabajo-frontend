import { Star, Users } from "lucide-react";

import { Estrellas } from "@/components/site/Estrellas";
import { formatearFecha } from "@/lib/formatos";
import type { ClientReputation } from "@/server/reviews/reviews";

/**
 * Reputación del cliente, solo para el trabajador (RN-20): la arma el servidor con
 * `getClientReputation`, que devuelve null a cualquier otra persona.
 */

/** Una línea para la cabecera del chat: «★ 4,5 · 3 calificaciones». */
export function ReputacionCompacta({ r }: { r: ClientReputation }) {
  if (r.count === 0) return <span>Cliente nuevo</span>;
  return (
    <span className="inline-flex items-center gap-1" title="Calificación que le dieron otros trabajadores">
      <Star className="h-3.5 w-3.5 fill-amarillo text-amarillo" aria-hidden />
      <span>
        {r.average.toLocaleString("es-EC", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · {r.count}{" "}
        {r.count === 1 ? "calificación" : "calificaciones"} de trabajadores
      </span>
    </span>
  );
}

/** Tarjeta con el promedio y las últimas opiniones de otros trabajadores. */
export function TarjetaReputacion({ r, nombre }: { r: ClientReputation; nombre: string }) {
  return (
    <section aria-labelledby="reputacion-cliente" className="panel p-5">
      <h2 id="reputacion-cliente" className="flex items-center gap-2 text-lg font-extrabold">
        <Users className="h-5 w-5 text-primary" aria-hidden /> {nombre} como cliente
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">Solo lo ven trabajadores y el GAD.</p>
      {r.count === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Aún no tiene calificaciones de otros trabajadores
          {r.contractsCompleted > 0 ? ` (${r.contractsCompleted} contrataciones finalizadas).` : "."}
        </p>
      ) : (
        <>
          <p className="mt-3 flex items-center gap-2">
            <Estrellas valor={r.average} />
            <span className="font-extrabold tabular-nums">
              {r.average.toLocaleString("es-EC", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-sm text-muted-foreground">
              ({r.count} {r.count === 1 ? "calificación" : "calificaciones"})
            </span>
          </p>
          <ul className="mt-3 space-y-3">
            {r.recent
              .filter((x) => x.comment)
              .map((x, i) => (
                <li key={i} className="rounded-2xl bg-secondary p-3 text-sm">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Estrellas valor={x.rating} tamaño="sm" /> {x.authorName} · {formatearFecha(x.createdAt)}
                  </p>
                  <p className="mt-1 break-words">{x.comment}</p>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}
