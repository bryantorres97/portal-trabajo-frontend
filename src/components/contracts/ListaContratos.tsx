import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";

import { EstadoContrato } from "@/components/contracts/EstadoContrato";
import { formatearFecha, formatearMomento } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import type { ContractSummary } from "@/server/contracts/contracts";
import { formatearPrecio } from "@/server/domain/contracts/state-machine";

/** Lista de «Mis contrataciones»: lo que requiere mi acción aparece resaltado. */
export function ListaContratos({ items }: { items: ContractSummary[] }) {
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            href={`/contrataciones/${c.id}`}
            className={cn(
              "group flex items-center gap-4 panel rounded-3xl p-4 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevada)] sm:p-5",
              c.needsMyAction && "ring-2 ring-primary/50",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <EstadoContrato status={c.status} />
                {c.needsMyAction && (
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                    Te toca a ti
                  </span>
                )}
                {c.pendingModification && !c.needsMyAction && (
                  <span className="rounded-full bg-amarillo/25 px-2.5 py-0.5 text-xs font-bold">
                    Modificación enviada
                  </span>
                )}
              </div>
              <p className="mt-2 truncate text-lg font-extrabold">
                {c.serviceName ?? "Contratación"} ·{" "}
                {c.myRole === "CLIENTE" ? c.counterpartName : `para ${c.counterpartName}`}
              </p>
              <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{c.description}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-bold tabular-nums">{formatearPrecio(c.priceAmount, c.priceUnit)}</span>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <CalendarDays className="h-4 w-4" aria-hidden /> {formatearFecha(c.scheduledStart)}
                </span>
                <span className="text-muted-foreground">Actualizada {formatearMomento(c.updatedAt)}</span>
              </p>
            </div>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
