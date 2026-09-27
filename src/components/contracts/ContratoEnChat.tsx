import Link from "next/link";
import { ChevronRight, FileSignature } from "lucide-react";

import { EstadoContrato } from "@/components/contracts/EstadoContrato";
import { cn } from "@/lib/utils";
import { formatearPrecio, type ContractStatus } from "@/server/domain/contracts/state-machine";

/** Resumen de una contratación activa de la conversación (lo arma la página con `listContracts`). */
export type ContratoChat = {
  id: string;
  status: ContractStatus;
  needsMyAction: boolean;
  pendingModification: boolean;
  priceAmount: number;
  priceUnit: string;
  serviceName: string | null;
};

/** Barra bajo la cabecera del chat: contrataciones activas con lo que toca hacer. */
export function BarraContratos({ contratos }: { contratos: ContratoChat[] }) {
  return (
    <ul aria-label="Contrataciones de esta conversación" className="border-b border-border bg-card">
      {contratos.map((c) => (
        <li key={c.id}>
          <Link
            href={`/contrataciones/${c.id}`}
            className={cn(
              "flex min-h-12 items-center gap-3 px-3 py-2 text-sm hover:bg-secondary lg:px-4",
              c.needsMyAction && "bg-primary/5",
            )}
          >
            <FileSignature className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <EstadoContrato status={c.status} />
              <span className="truncate font-semibold">
                {c.serviceName ?? "Contratación"} · {formatearPrecio(c.priceAmount, c.priceUnit)}
              </span>
            </span>
            <span className={cn("shrink-0 font-bold", c.needsMyAction ? "text-primary" : "text-muted-foreground")}>
              {c.needsMyAction ? "Te toca" : "Ver"}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Mensaje de sistema en el hilo (propuestas, aceptaciones, cambios de estado). */
export function TarjetaSistema({
  texto,
  contractId,
  hora,
}: {
  texto: string | null;
  contractId: string | null;
  hora: string;
}) {
  return (
    <div className="my-2 flex justify-center">
      <div className="w-full max-w-md rounded-2xl border border-primary/20 bg-card px-4 py-3 text-sm shadow-sm">
        <p className="flex gap-2.5">
          <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 leading-snug">{texto}</span>
        </p>
        <p className="mt-2 flex items-center justify-between gap-2 pl-6.5">
          <span className="text-[11px] text-muted-foreground tabular-nums">{hora}</span>
          {contractId && (
            <Link
              href={`/contrataciones/${contractId}`}
              className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-sm font-bold text-primary hover:bg-primary/10"
            >
              Ver condiciones <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}
