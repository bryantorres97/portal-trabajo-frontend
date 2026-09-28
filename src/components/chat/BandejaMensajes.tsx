"use client";

import Link from "next/link";
import { useRouter, useSelectedLayoutSegment } from "next/navigation";
import { Ban, Check, CheckCheck, MessageCircle, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ContadorNoLeidos, useMensajes } from "@/components/chat/MensajesProvider";
import { Avatar, fotoTrabajador } from "@/components/site/WorkerCard";
import { formatearMomento } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/server/chat/chat";

type Props = {
  conversaciones: ConversationSummary[];
  /** La cuenta está vinculada a una ficha de trabajador (cambia el mensaje de la bandeja vacía). */
  esTrabajador: boolean;
  children: ReactNode;
};

/**
 * Bandeja de mensajes. Escritorio: lista y conversación lado a lado. Móvil: la lista en /mensajes
 * y la conversación en pantalla completa (se oculta la lista cuando hay una conversación abierta).
 */
export function BandejaMensajes({ conversaciones, esTrabajador, children }: Props) {
  const segmento = useSelectedLayoutSegment();
  const router = useRouter();
  const { avisos } = useMensajes();
  const [filtro, setFiltro] = useState<"todas" | "sin-leer">("todas");
  const primerAviso = useRef(avisos);

  // Un mensaje nuevo en cualquier conversación actualiza la lista (orden, vista previa, contador).
  useEffect(() => {
    if (avisos !== primerAviso.current) router.refresh();
  }, [avisos, router]);

  const abierta = segmento && segmento !== "nuevo" ? segmento : null;
  const hayDetalle = segmento !== null;
  const sinLeer = conversaciones.filter((c) => c.unread > 0).length;
  const visibles = useMemo(
    () => (filtro === "sin-leer" ? conversaciones.filter((c) => c.unread > 0 || c.id === abierta) : conversaciones),
    [conversaciones, filtro, abierta],
  );

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-0 px-0 sm:px-4 lg:h-[calc(100dvh-5.75rem)] lg:grid-cols-[23rem_minmax(0,1fr)] lg:gap-4 lg:py-4">
      <section
        aria-labelledby="titulo-bandeja"
        className={cn(
          "flex min-h-0 min-w-0 flex-col bg-card lg:rounded-2xl lg:border lg:border-border lg:shadow-[var(--shadow-tarjeta)]",
          hayDetalle && "hidden lg:flex",
        )}
      >
        <header className="px-4 pt-6 pb-3 lg:pt-5">
          <h1 id="titulo-bandeja" className="text-3xl font-extrabold lg:text-2xl">
            Mensajes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {conversaciones.length === 0
              ? "Aquí verás tus conversaciones."
              : sinLeer > 0
                ? `${sinLeer} ${sinLeer === 1 ? "conversación con mensajes nuevos" : "conversaciones con mensajes nuevos"}`
                : "Estás al día."}
          </p>
          {conversaciones.length > 0 && (
            <div
              role="group"
              aria-label="Filtrar conversaciones"
              className="mt-4 inline-flex rounded-xl bg-secondary p-1"
            >
              {(
                [
                  ["todas", "Todas"],
                  ["sin-leer", `Sin leer${sinLeer ? ` (${sinLeer})` : ""}`],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  aria-pressed={filtro === valor}
                  onClick={() => setFiltro(valor)}
                  className={cn(
                    "min-h-9 rounded-lg px-4 text-sm font-bold text-muted-foreground transition-colors",
                    filtro === valor && "bg-card text-foreground shadow-sm",
                  )}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          )}
        </header>

        {conversaciones.length === 0 ? (
          <BandejaVacia esTrabajador={esTrabajador} />
        ) : visibles.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No tienes mensajes sin leer.</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 lg:pb-2">
            {visibles.map((c) => (
              <FilaConversacion key={c.id} c={c} activa={c.id === abierta} />
            ))}
          </ul>
        )}
      </section>

      <div className={cn("min-h-0", !hayDetalle && "hidden lg:block")}>{children}</div>
    </div>
  );
}

function FilaConversacion({ c, activa }: { c: ConversationSummary; activa: boolean }) {
  const nuevo = c.unread > 0;
  return (
    <li>
      <Link
        href={`/mensajes/${c.id}`}
        aria-current={activa ? "page" : undefined}
        className={cn(
          "mx-2 flex min-h-[4.75rem] items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-secondary/70",
          activa && "bg-primary/10 hover:bg-primary/10",
        )}
      >
        <Avatar
          nombre={c.counterpartName}
          foto={c.myRole === "CLIENTE" && c.workerHasPhoto ? fotoTrabajador(c.workerId) : null}
          className="h-13 w-13 text-base"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn("truncate text-base", nuevo ? "font-extrabold" : "font-bold")}>{c.counterpartName}</p>
            <time
              dateTime={c.lastMessageAt ?? c.createdAt}
              className={cn(
                "shrink-0 text-xs tabular-nums",
                nuevo ? "font-bold text-primary" : "text-muted-foreground",
              )}
            >
              {formatearMomento(c.lastMessageAt ?? c.createdAt)}
            </time>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p
              className={cn(
                "flex min-w-0 items-center gap-1 text-sm",
                nuevo ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {c.status === "BLOQUEADA" ? (
                <>
                  <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">Conversación bloqueada</span>
                </>
              ) : (
                <>
                  {c.lastSenderIsMe &&
                    (c.otherLastReadId != null && c.otherLastReadId > 0 && c.unread === 0 ? (
                      <CheckCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Visto" />
                    ) : (
                      <Check className="h-4 w-4 shrink-0" aria-label="Enviado" />
                    ))}
                  <span className="truncate">{c.lastMessagePreview ?? "Sin mensajes"}</span>
                </>
              )}
            </p>
            {nuevo && <ContadorNoLeidos valor={c.unread} className="ring-0" />}
          </div>
          <p className="mt-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {c.myRole === "CLIENTE" ? "Trabajador" : "Cliente"}
          </p>
        </div>
      </Link>
    </li>
  );
}

function BandejaVacia({ esTrabajador }: { esTrabajador: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-6 pb-12 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-3xl bg-primary/10 text-primary">
        <MessageCircle className="h-8 w-8" aria-hidden />
      </span>
      {esTrabajador ? (
        <>
          <p className="mt-4 text-lg font-bold">Todavía no te han escrito</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Cuando un cliente te escriba desde tu perfil, su mensaje aparecerá aquí y te avisaremos.
          </p>
          <Link href="/cuenta/trabajador" className="mt-5 text-sm font-bold text-primary underline underline-offset-4">
            Revisar mi perfil de trabajador
          </Link>
        </>
      ) : (
        <>
          <p className="mt-4 text-lg font-bold">Aún no tienes conversaciones</p>
          <ol className="mt-3 max-w-xs space-y-1.5 text-left text-sm text-muted-foreground">
            <li>1. Busca el oficio que necesitas.</li>
            <li>2. Abre el perfil del trabajador.</li>
            <li>3. Toca «Escribir por el chat».</li>
          </ol>
          <Link
            href="/buscar"
            className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground"
          >
            <Search className="h-5 w-5" aria-hidden /> Buscar trabajadores
          </Link>
        </>
      )}
    </div>
  );
}
