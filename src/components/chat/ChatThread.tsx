"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  Ban,
  BadgeCheck,
  Check,
  CheckCheck,
  FileSignature,
  Flag,
  Loader2,
  MoreVertical,
  RotateCcw,
  SendHorizontal,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";

import { useMensajes } from "@/components/chat/MensajesProvider";
import { useRealtimeChannel } from "@/components/chat/useRealtimeChannel";
import { BarraContratos, TarjetaSistema, type ContratoChat } from "@/components/contracts/ContratoEnChat";
import type { OpcionesFormulario } from "@/components/contracts/FormularioCondiciones";
import { ProponerCondiciones } from "@/components/contracts/ProponerCondiciones";
import { Avatar } from "@/components/site/WorkerCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { etiquetaDia, formatearHora, mismoDia } from "@/lib/formatos";
import { cn } from "@/lib/utils";

export type MensajeInicial = {
  id: number;
  isMine: boolean;
  kind: "TEXT" | "SYSTEM";
  body: string | null;
  hidden: boolean;
  /** Mensajes de sistema: contratación a la que se refieren (tarjeta con enlace). */
  contractId: string | null;
  createdAt: string;
};

type Mensaje = MensajeInicial & {
  /** Clave local estable (id del servidor o clientMessageId mientras se envía). */
  key: string;
  estado: "ok" | "enviando" | "error";
  clientMessageId?: string;
};

type Props = {
  conversationId: string;
  currentUserId: string;
  counterpartName: string;
  /** Foto aprobada de la contraparte (solo trabajadores habilitados). */
  counterpartPhoto?: string | null;
  /** Perfil público del trabajador (solo lo ve el cliente). */
  profileHref?: string | null;
  initialMessages: MensajeInicial[];
  initialHasMore: boolean;
  initialOtherLastReadId: number | null;
  /** Mensajes sin leer al abrir (para marcar «Mensajes nuevos»). */
  unreadAtOpen?: number;
  blockedByMe: boolean;
  blockedByOther: boolean;
  closed: boolean;
  workerLinked: boolean;
  myRole: "CLIENTE" | "TRABAJADOR";
  reasons: { code: string; label: string }[];
  /** Contrataciones activas de esta conversación (barra superior). */
  contratos?: ContratoChat[];
  /** Opciones del formulario de condiciones; sin ellas no se ofrece «Proponer condiciones». */
  opcionesContrato?: OpcionesFormulario | null;
  /** Se puede enviar una propuesta nueva (no hay otra abierta y el trabajador activó su cuenta). */
  puedeProponer?: boolean;
};

const MAX = 2000;

const SUGERENCIAS: Record<Props["myRole"], string[]> = {
  CLIENTE: [
    "¿Tiene disponibilidad esta semana?",
    "¿Cuánto cobraría aproximadamente?",
    "¿Puede venir a ver el trabajo antes?",
  ],
  TRABAJADOR: [
    "Hola, gracias por escribir. ¿En qué sector es el trabajo?",
    "¿Me puede contar más detalles del trabajo?",
    "Sí tengo disponibilidad. ¿Qué día le conviene?",
  ],
};

const desdeServidor = (m: MensajeInicial): Mensaje => ({ ...m, key: String(m.id), estado: "ok" });

/** Une listas por id y ordena cronológicamente (los pendientes locales quedan al final). */
function unir(actuales: Mensaje[], nuevos: Mensaje[]): Mensaje[] {
  const porId = new Map<number, Mensaje>();
  const pendientes: Mensaje[] = [];
  for (const m of [...actuales, ...nuevos]) {
    if (m.estado !== "ok") pendientes.push(m);
    else porId.set(m.id, m);
  }
  return [...[...porId.values()].sort((a, b) => a.id - b.id), ...pendientes];
}

/** Primer mensaje recibido que no se había leído al abrir la conversación. */
function primerNoLeido(lista: Mensaje[], noLeidos: number): number | null {
  if (noLeidos <= 0) return null;
  const recibidos = lista.filter((m) => !m.isMine);
  return recibidos.length ? (recibidos[Math.max(recibidos.length - noLeidos, 0)]?.id ?? null) : null;
}

export function ChatThread(p: Props) {
  const router = useRouter();
  const { refrescar } = useMensajes();
  const [mensajes, setMensajes] = useState<Mensaje[]>(() => p.initialMessages.map(desdeServidor));
  const [hayMas, setHayMas] = useState(p.initialHasMore);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [otroLeyo, setOtroLeyo] = useState(p.initialOtherLastReadId ?? 0);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "error" | "ok"; texto: string } | null>(null);
  const [denunciando, setDenunciando] = useState<number | null>(null);
  const [confirmarBloqueo, setConfirmarBloqueo] = useState(false);
  const [nuevosAbajo, setNuevosAbajo] = useState(0);
  const [proponiendo, setProponiendo] = useState(false);
  const [divisor] = useState(() => primerNoLeido(p.initialMessages.map(desdeServidor), p.unreadAtOpen ?? 0));
  const listaRef = useRef<HTMLOListElement>(null);
  const cajaRef = useRef<HTMLTextAreaElement>(null);
  const alFinal = useRef(true);
  const ultimoLeido = useRef(0);
  const base = `/api/v1/conversations/${p.conversationId}`;
  const puedeEscribir = !p.blockedByMe && !p.blockedByOther && !p.closed;
  const puedeProponer = puedeEscribir && !!p.puedeProponer && !!p.opcionesContrato;

  // Móvil: la conversación ocupa la pantalla; se evita que la página de fondo se desplace.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const movil = window.matchMedia("(max-width: 1023px)");
    const aplicar = () => {
      document.documentElement.style.overflow = movil.matches ? "hidden" : "";
    };
    aplicar();
    movil.addEventListener("change", aplicar);
    return () => {
      movil.removeEventListener("change", aplicar);
      document.documentElement.style.overflow = "";
    };
  }, []);

  // --- Lectura -------------------------------------------------------------------
  const marcarLeido = useCallback(
    (lista: Mensaje[]) => {
      const ultimoAjeno = [...lista].reverse().find((m) => !m.isMine && m.estado === "ok");
      if (!ultimoAjeno || ultimoAjeno.id <= ultimoLeido.current || document.visibilityState !== "visible") return;
      ultimoLeido.current = ultimoAjeno.id;
      void fetch(`${base}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastMessageId: ultimoAjeno.id }),
      }).then(() => {
        // Actualiza el contador global y la lista de la bandeja.
        refrescar();
        router.refresh();
      });
    },
    [base, refrescar, router],
  );

  useEffect(() => {
    marcarLeido(mensajes);
  }, [mensajes, marcarLeido]);

  useEffect(() => {
    const alVolver = () => marcarLeido(mensajes);
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [mensajes, marcarLeido]);

  // --- Desplazamiento --------------------------------------------------------------
  const bajar = useCallback((suave = false) => {
    const el = listaRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: suave ? "smooth" : "auto" });
    alFinal.current = true;
    setNuevosAbajo(0);
  }, []);

  useLayoutEffect(() => {
    // Al abrir: si hay no leídos, se muestra el divisor; si no, el final.
    const el = listaRef.current;
    const marca = divisor ? el?.querySelector<HTMLElement>("[data-divisor]") : null;
    if (el && marca) el.scrollTop = marca.offsetTop - 80;
    else bajar();
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cantidad = mensajes.length;
  const ultimo = mensajes.at(-1);
  useLayoutEffect(() => {
    if (!ultimo) return;
    if (alFinal.current || ultimo.isMine) bajar();
    else setNuevosAbajo((n) => n + 1);
    // Reacciona a mensajes nuevos al final, no a cargas de historial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cantidad, ultimo?.key]);

  // --- Tiempo real -----------------------------------------------------------------
  const resincronizar = useCallback(async () => {
    const res = await fetch(`${base}/messages?limit=50`, { cache: "no-store" });
    if (!res.ok) return;
    const { items } = (await res.json()) as { items: MensajeInicial[] };
    setMensajes((m) => unir(m, items.map(desdeServidor)));
  }, [base]);

  const conexion = useRealtimeChannel(
    `conversation:${p.conversationId}`,
    {
      message: (payload) => {
        const m: Mensaje = {
          id: Number(payload.id),
          key: String(payload.id),
          isMine: payload.senderId === p.currentUserId,
          kind: payload.kind === "SYSTEM" ? "SYSTEM" : "TEXT",
          body: String(payload.body),
          hidden: false,
          contractId: typeof payload.contractId === "string" ? payload.contractId : null,
          createdAt: String(payload.createdAt),
          estado: "ok",
        };
        setMensajes((prev) => unir(prev, [m]));
        // Un evento de contratación cambia la barra superior y lo que se puede proponer.
        if (m.kind === "SYSTEM") router.refresh();
      },
      read: (payload) => {
        if (payload.role !== p.myRole) setOtroLeyo((v) => Math.max(v, Number(payload.lastReadId)));
      },
      status: () => router.refresh(),
    },
    () => void resincronizar(),
  );

  useEffect(() => {
    if (conexion === "en-linea" || conexion === "conectando") return;
    const t = setInterval(() => void resincronizar(), 5000);
    return () => clearInterval(t);
  }, [conexion, resincronizar]);

  // --- Envío (optimista e idempotente) -----------------------------------------------
  async function enviar(clientMessageId: string, cuerpo: string) {
    setMensajes((prev) =>
      prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, estado: "enviando" as const } : m)),
    );
    try {
      const res = await fetch(`${base}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: cuerpo, clientMessageId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail ?? "No se pudo enviar el mensaje.");
      }
      const { id } = (await res.json()) as { id: number };
      setMensajes((prev) => {
        const confirmado = prev.find((m) => m.clientMessageId === clientMessageId);
        const sinPendiente = prev.filter((m) => m.clientMessageId !== clientMessageId);
        if (!confirmado) return sinPendiente;
        return unir(sinPendiente, [{ ...confirmado, id, key: String(id), estado: "ok", clientMessageId: undefined }]);
      });
    } catch (e) {
      setAviso({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo enviar el mensaje." });
      setMensajes((prev) =>
        prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, estado: "error" as const } : m)),
      );
    }
  }

  function alEnviar(e?: FormEvent) {
    e?.preventDefault();
    const cuerpo = texto.trim();
    if (!cuerpo || !puedeEscribir) return;
    const clientMessageId = crypto.randomUUID();
    setAviso(null);
    setTexto("");
    requestAnimationFrame(() => ajustarAltura());
    setMensajes((prev) => [
      ...prev,
      {
        id: Number.MAX_SAFE_INTEGER,
        key: clientMessageId,
        clientMessageId,
        isMine: true,
        kind: "TEXT",
        body: cuerpo,
        hidden: false,
        contractId: null,
        createdAt: new Date().toISOString(),
        estado: "enviando",
      },
    ]);
    void enviar(clientMessageId, cuerpo);
    cajaRef.current?.focus();
  }

  function ajustarAltura() {
    const caja = cajaRef.current;
    if (!caja) return;
    caja.style.height = "auto";
    caja.style.height = `${Math.min(caja.scrollHeight, 160)}px`;
  }

  async function cargarAnteriores() {
    const primero = mensajes.find((m) => m.estado === "ok");
    const el = listaRef.current;
    if (!primero || !el) return;
    setCargandoMas(true);
    alFinal.current = false;
    const alturaAntes = el.scrollHeight;
    const res = await fetch(`${base}/messages?before=${primero.id}&limit=50`, { cache: "no-store" });
    if (res.ok) {
      const { items, hasMore } = (await res.json()) as { items: MensajeInicial[]; hasMore: boolean };
      setMensajes((m) => unir(m, items.map(desdeServidor)));
      setHayMas(hasMore);
      // Conserva la posición de lectura al insertar mensajes arriba.
      requestAnimationFrame(() => {
        el.scrollTop += el.scrollHeight - alturaAntes;
      });
    }
    setCargandoMas(false);
  }

  async function cambiarBloqueo(bloquear: boolean) {
    setConfirmarBloqueo(false);
    const res = await fetch(`${base}/block`, { method: bloquear ? "POST" : "DELETE" });
    setAviso(
      res.ok
        ? { tipo: "ok", texto: bloquear ? "Bloqueaste esta conversación." : "Desbloqueaste la conversación." }
        : { tipo: "error", texto: "No pudimos actualizar el bloqueo. Inténtalo de nuevo." },
    );
    router.refresh();
  }

  const yaEscribi = mensajes.some((m) => m.isMine);
  const cerca = texto.length > MAX - 200;
  const subtitulo =
    p.myRole === "CLIENTE"
      ? p.workerLinked
        ? "Trabajador habilitado por el GAD"
        : "Aún no activa su cuenta"
      : "Cliente";

  return (
    <section
      aria-label={`Conversación con ${p.counterpartName}`}
      className="fixed inset-0 z-50 flex flex-col bg-background lg:static lg:z-auto lg:h-full lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:shadow-[var(--shadow-tarjeta)]"
    >
      {/* Cabecera */}
      <header className="flex items-center gap-2 border-b border-border bg-card px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:px-4 lg:py-3">
        <Link
          href="/mensajes"
          aria-label="Volver a mensajes"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-foreground hover:bg-secondary lg:hidden"
        >
          <ArrowLeft className="h-6 w-6" aria-hidden />
        </Link>
        <Avatar nombre={p.counterpartName} foto={p.counterpartPhoto} className="h-11 w-11 text-sm" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg leading-tight font-extrabold">{p.counterpartName}</h2>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {p.myRole === "CLIENTE" && p.workerLinked && (
              <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-verde-fuerte" aria-hidden />
            )}
            <span className="truncate">{subtitulo}</span>
            {conexion === "sin-conexion" && <span className="shrink-0">· reconectando…</span>}
          </p>
        </div>
        {puedeProponer && (
          <button
            type="button"
            onClick={() => setProponiendo(true)}
            aria-label="Proponer condiciones"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl bg-primary/10 px-3 text-sm font-bold text-primary hover:bg-primary/15"
          >
            <FileSignature className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden />
            <span className="hidden sm:inline">Proponer condiciones</span>
          </button>
        )}
        {p.profileHref && (
          <Link
            href={p.profileHref}
            className="hidden min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-bold hover:bg-secondary xl:inline-flex"
          >
            <UserRound className="h-4 w-4" aria-hidden /> Ver perfil
          </Link>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Más opciones"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-foreground hover:bg-secondary"
          >
            <MoreVertical className="h-5 w-5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[60] min-w-56">
            {p.profileHref && (
              <DropdownMenuItem asChild className="min-h-11 text-base">
                <Link href={p.profileHref}>
                  <UserRound className="mr-2 h-4 w-4" aria-hidden /> Ver perfil del trabajador
                </Link>
              </DropdownMenuItem>
            )}
            {p.profileHref && <DropdownMenuSeparator />}
            {p.blockedByMe ? (
              <DropdownMenuItem className="min-h-11 text-base" onSelect={() => void cambiarBloqueo(false)}>
                <Ban className="mr-2 h-4 w-4" aria-hidden /> Desbloquear conversación
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="min-h-11 text-base text-destructive focus:text-destructive"
                onSelect={() => setConfirmarBloqueo(true)}
              >
                <Ban className="mr-2 h-4 w-4" aria-hidden /> Bloquear conversación
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {p.contratos && p.contratos.length > 0 && <BarraContratos contratos={p.contratos} />}

      {/* Mensajes */}
      <div className="relative min-h-0 flex-1">
        <ol
          ref={listaRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            alFinal.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            if (alFinal.current) setNuevosAbajo(0);
          }}
          className="h-full space-y-1 overflow-y-auto overscroll-contain bg-secondary/40 px-3 py-4 lg:px-6"
          aria-live="polite"
          aria-relevant="additions"
        >
          <li className="mx-auto mb-4 flex max-w-md gap-2 rounded-2xl bg-card px-4 py-3 text-xs leading-relaxed text-muted-foreground shadow-sm">
            <ShieldCheck className="h-4 w-4 shrink-0 text-verde-fuerte" aria-hidden />
            <span>
              Conversa y acuerda todo aquí. No compartas contraseñas ni datos bancarios. El GAD solo revisa una
              conversación si alguien la denuncia.
            </span>
          </li>
          {hayMas && (
            <li className="pb-2 text-center">
              <button
                type="button"
                onClick={() => void cargarAnteriores()}
                disabled={cargandoMas}
                className="min-h-10 rounded-full bg-card px-4 text-sm font-bold text-primary shadow-sm disabled:opacity-60"
              >
                {cargandoMas ? "Cargando…" : "Ver mensajes anteriores"}
              </button>
            </li>
          )}
          {mensajes.length === 0 && (
            <li className="py-10 text-center text-sm text-muted-foreground">Escribe el primer mensaje.</li>
          )}
          {mensajes.map((m, i) => {
            const previo = mensajes[i - 1];
            const siguiente = mensajes[i + 1];
            const nuevoDia = !previo || !mismoDia(previo.createdAt, m.createdAt);
            const inicioGrupo = nuevoDia || previo?.isMine !== m.isMine || previo?.kind === "SYSTEM";
            const finGrupo =
              !siguiente ||
              siguiente.isMine !== m.isMine ||
              siguiente.kind === "SYSTEM" ||
              !mismoDia(siguiente.createdAt, m.createdAt);
            return (
              <li key={m.key} className={cn(inicioGrupo && "pt-2")}>
                {nuevoDia && (
                  <p className="my-3 text-center">
                    <span className="rounded-full bg-card px-3 py-1 text-xs font-bold text-muted-foreground shadow-sm">
                      {etiquetaDia(m.createdAt)}
                    </span>
                  </p>
                )}
                {m.id === divisor && (
                  <p data-divisor className="my-3 flex items-center gap-3 text-xs font-bold text-primary">
                    <span className="h-px flex-1 bg-primary/30" />
                    Mensajes nuevos
                    <span className="h-px flex-1 bg-primary/30" />
                  </p>
                )}
                {m.kind === "SYSTEM" ? (
                  <TarjetaSistema texto={m.body} contractId={m.contractId} hora={formatearHora(m.createdAt)} />
                ) : (
                  <div className={cn("group flex items-end gap-1", m.isMine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[82%] px-3.5 py-2 text-[0.95rem] leading-snug shadow-sm sm:max-w-[68%]",
                        m.isMine ? "rounded-2xl bg-primary text-primary-foreground" : "rounded-2xl bg-card",
                        m.isMine && finGrupo && "rounded-br-md",
                        !m.isMine && finGrupo && "rounded-bl-md",
                        m.estado === "error" && "bg-destructive/15 text-foreground",
                        m.estado === "enviando" && "opacity-80",
                      )}
                    >
                      {m.hidden ? (
                        <p className="italic opacity-80">Mensaje ocultado por moderación.</p>
                      ) : (
                        <p className="break-words whitespace-pre-wrap">{m.body}</p>
                      )}
                      <p
                        className={cn(
                          "mt-0.5 flex items-center justify-end gap-1 text-[11px] tabular-nums",
                          m.isMine && m.estado !== "error" ? "text-primary-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        {formatearHora(m.createdAt)}
                        {m.isMine && m.estado === "enviando" && (
                          <Loader2 className="h-3 w-3 animate-spin" aria-label="Enviando" />
                        )}
                        {m.isMine &&
                          m.estado === "ok" &&
                          (m.id <= otroLeyo ? (
                            <CheckCheck className="h-3.5 w-3.5" aria-label="Visto" />
                          ) : (
                            <Check className="h-3.5 w-3.5" aria-label="Enviado" />
                          ))}
                      </p>
                    </div>
                    {!m.isMine && m.estado === "ok" && !m.hidden && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label="Opciones del mensaje"
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground opacity-60 transition-opacity hover:bg-card hover:opacity-100 focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                        >
                          <MoreVertical className="h-4 w-4" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="z-[60]">
                          <DropdownMenuItem
                            className="min-h-11 text-base text-destructive focus:text-destructive"
                            onSelect={() => setDenunciando(m.id)}
                          >
                            <Flag className="mr-2 h-4 w-4" aria-hidden /> Denunciar mensaje
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )}
                {m.isMine && m.estado === "error" && (
                  <p className="mt-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => m.clientMessageId && void enviar(m.clientMessageId, m.body ?? "")}
                      className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs font-bold text-destructive"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> No se envió. Reintentar
                    </button>
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        {nuevosAbajo > 0 && (
          <button
            type="button"
            onClick={() => bajar(true)}
            className="absolute bottom-3 left-1/2 inline-flex min-h-10 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg"
          >
            <ArrowDown className="h-4 w-4" aria-hidden />
            {nuevosAbajo === 1 ? "1 mensaje nuevo" : `${nuevosAbajo} mensajes nuevos`}
          </button>
        )}
      </div>

      {/* Pie: avisos y caja de texto */}
      <footer className="border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        {aviso && (
          <p
            role={aviso.tipo === "error" ? "alert" : "status"}
            className={cn(
              "mx-3 mt-3 flex gap-2 rounded-xl p-3 text-sm",
              aviso.tipo === "error" ? "bg-destructive/10 text-destructive" : "bg-verde/15 text-foreground",
            )}
          >
            {aviso.tipo === "error" && <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />}
            {aviso.texto}
          </p>
        )}
        {!p.workerLinked && p.myRole === "CLIENTE" && (
          <p className="mx-3 mt-3 rounded-xl bg-amarillo/20 p-3 text-sm">
            {p.counterpartName} aún no activa su cuenta en la plataforma: verá tus mensajes cuando lo haga.
          </p>
        )}

        {puedeEscribir ? (
          <>
            {!yaEscribi && (
              <div className="flex gap-2 overflow-x-auto px-3 pt-3 pb-1" aria-label="Respuestas sugeridas" role="group">
                {SUGERENCIAS[p.myRole].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setTexto(s);
                      requestAnimationFrame(() => {
                        ajustarAltura();
                        cajaRef.current?.focus();
                      });
                    }}
                    className="min-h-10 shrink-0 rounded-full border border-primary/30 bg-primary/5 px-4 text-sm font-semibold whitespace-nowrap text-primary hover:bg-primary/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={alEnviar} className="flex items-end gap-2 p-3">
              <label htmlFor="mensaje" className="sr-only">
                Escribe un mensaje
              </label>
              <div className="flex min-w-0 flex-1 flex-col">
                <textarea
                  id="mensaje"
                  ref={cajaRef}
                  value={texto}
                  onChange={(e) => {
                    setTexto(e.target.value.slice(0, MAX));
                    ajustarAltura();
                  }}
                  onKeyDown={(e) => {
                    // En computadoras, Enter envía y Mayús+Enter hace un salto de línea. En el celular,
                    // Enter es un salto de línea y se envía con el botón.
                    const tecladoFisico = window.matchMedia?.("(pointer: fine)").matches ?? true;
                    if (tecladoFisico && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      alEnviar();
                    }
                  }}
                  rows={1}
                  maxLength={MAX}
                  placeholder="Escribe un mensaje"
                  aria-describedby={cerca ? "mensaje-contador" : undefined}
                  className="max-h-40 min-h-12 w-full resize-none rounded-2xl border border-input bg-background px-4 py-3 text-base leading-snug outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
                />
                {cerca && (
                  <p id="mensaje-contador" className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
                    {MAX - texto.length} caracteres disponibles
                  </p>
                )}
              </div>
              <button
                type="submit"
                disabled={!texto.trim()}
                aria-label="Enviar"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
              >
                <SendHorizontal className="h-5 w-5" aria-hidden />
              </button>
            </form>
          </>
        ) : (
          <div className="p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {p.blockedByMe
                ? "Bloqueaste esta conversación. Desbloquéala para volver a escribir."
                : p.blockedByOther
                  ? "La otra persona bloqueó esta conversación."
                  : "Esta conversación ya no admite mensajes."}
            </p>
            {p.blockedByMe && (
              <button
                type="button"
                onClick={() => void cambiarBloqueo(false)}
                className="mt-3 min-h-11 rounded-xl border border-border px-5 text-sm font-bold hover:bg-secondary"
              >
                Desbloquear
              </button>
            )}
          </div>
        )}
      </footer>

      {p.opcionesContrato && (
        <ProponerCondiciones
          modo={{ tipo: "nueva", conversationId: p.conversationId }}
          opciones={p.opcionesContrato}
          abierto={proponiendo}
          onAbiertoChange={setProponiendo}
        />
      )}

      <Dialog open={confirmarBloqueo} onOpenChange={setConfirmarBloqueo}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>¿Bloquear esta conversación?</DialogTitle>
            <DialogDescription>
              Mientras esté bloqueada, ni tú ni {p.counterpartName} podrán enviar mensajes. Puedes desbloquearla cuando
              quieras. Si alguien te molesta o intenta estafarte, además denuncia el mensaje.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setConfirmarBloqueo(false)}
              className="min-h-11 rounded-xl border border-border px-5 text-sm font-bold"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void cambiarBloqueo(true)}
              className="min-h-11 rounded-xl bg-destructive px-5 text-sm font-bold text-destructive-foreground"
            >
              Bloquear
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={denunciando !== null} onOpenChange={(abierto) => !abierto && setDenunciando(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          {denunciando !== null && (
            <FormularioDenuncia
              messageId={denunciando}
              reasons={p.reasons}
              onClose={(resultado) => {
                setDenunciando(null);
                if (resultado) setAviso(resultado);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function FormularioDenuncia({
  messageId,
  reasons,
  onClose,
}: {
  messageId: number;
  reasons: { code: string; label: string }[];
  onClose: (resultado?: { tipo: "error" | "ok"; texto: string }) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setEnviando(true);
    const res = await fetch(`/api/v1/messages/${messageId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasonCode: fd.get("reasonCode"), description: fd.get("description") }),
    });
    const err = res.ok ? null : ((await res.json().catch(() => ({}))) as { detail?: string });
    setEnviando(false);
    onClose(
      res.ok
        ? { tipo: "ok", texto: "Gracias. Enviamos tu denuncia al GAD y la revisarán." }
        : { tipo: "error", texto: err?.detail ?? "No pudimos enviar la denuncia." },
    );
  }
  return (
    <form onSubmit={(e) => void enviar(e)} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Denunciar mensaje</DialogTitle>
        <DialogDescription>
          El personal del GAD revisará el mensaje. La otra persona no sabrá quién lo denunció.
        </DialogDescription>
      </DialogHeader>
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">¿Qué pasó?</legend>
        {reasons.map((r, i) => (
          <label
            key={r.code}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <input
              type="radio"
              name="reasonCode"
              value={r.code}
              defaultChecked={i === 0}
              className="h-5 w-5 accent-primary"
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor={`detalle-${messageId}`} className="text-sm font-bold">
          Cuéntanos más <span className="font-normal text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          id={`detalle-${messageId}`}
          name="description"
          rows={3}
          maxLength={1000}
          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
        />
      </div>
      <DialogFooter className="gap-2">
        <button
          type="button"
          onClick={() => onClose()}
          className="min-h-11 rounded-xl border border-border px-5 text-sm font-bold"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="min-h-11 rounded-xl bg-destructive px-5 text-sm font-bold text-destructive-foreground disabled:opacity-60"
        >
          {enviando ? "Enviando…" : "Enviar denuncia"}
        </button>
      </DialogFooter>
    </form>
  );
}
