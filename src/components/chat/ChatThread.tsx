"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Check, CheckCheck, Flag, Loader2, RotateCcw, SendHorizontal, WifiOff } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";

import { useRealtimeChannel } from "@/components/chat/useRealtimeChannel";
import { cn } from "@/lib/utils";

export type MensajeInicial = {
  id: number;
  isMine: boolean;
  body: string | null;
  hidden: boolean;
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
  initialMessages: MensajeInicial[];
  initialHasMore: boolean;
  initialOtherLastReadId: number | null;
  blockedByMe: boolean;
  blockedByOther: boolean;
  closed: boolean;
  workerLinked: boolean;
  myRole: "CLIENTE" | "TRABAJADOR";
  reasons: { code: string; label: string }[];
};

const horaFmt = new Intl.DateTimeFormat("es-EC", { timeStyle: "short", timeZone: "America/Guayaquil" });
const diaFmt = new Intl.DateTimeFormat("es-EC", { dateStyle: "full", timeZone: "America/Guayaquil" });
const MAX = 2000;

const desdeServidor = (m: MensajeInicial): Mensaje => ({ ...m, key: String(m.id), estado: "ok" });

/** Une listas por id y ordena cronológicamente (los pendientes locales quedan al final). */
function unir(actuales: Mensaje[], nuevos: Mensaje[]): Mensaje[] {
  const porId = new Map<number, Mensaje>();
  const pendientes: Mensaje[] = [];
  for (const m of [...actuales, ...nuevos]) {
    if (m.estado !== "ok") pendientes.push(m);
    else porId.set(m.id, m);
  }
  const confirmados = [...porId.values()].sort((a, b) => a.id - b.id);
  return [...confirmados, ...pendientes];
}

export function ChatThread(p: Props) {
  const router = useRouter();
  const [mensajes, setMensajes] = useState<Mensaje[]>(() => p.initialMessages.map(desdeServidor));
  const [hayMas, setHayMas] = useState(p.initialHasMore);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [otroLeyo, setOtroLeyo] = useState(p.initialOtherLastReadId ?? 0);
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [denunciando, setDenunciando] = useState<number | null>(null);
  const listaRef = useRef<HTMLOListElement>(null);
  const alFinal = useRef(true);
  const ultimoLeido = useRef(0);
  const base = `/api/v1/conversations/${p.conversationId}`;
  const bloqueada = p.blockedByMe || p.blockedByOther;
  const puedeEscribir = !bloqueada && !p.closed;

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
      });
    },
    [base],
  );

  useEffect(() => {
    marcarLeido(mensajes);
  }, [mensajes, marcarLeido]);

  useEffect(() => {
    const alVolver = () => marcarLeido(mensajes);
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [mensajes, marcarLeido]);

  // --- Desplazamiento: se mantiene abajo si el usuario ya estaba abajo ---------------
  useLayoutEffect(() => {
    const el = listaRef.current;
    if (el && alFinal.current) el.scrollTop = el.scrollHeight;
  }, [mensajes]);

  // --- Tiempo real ---------------------------------------------------------------
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
          body: String(payload.body),
          hidden: false,
          createdAt: String(payload.createdAt),
          estado: "ok",
        };
        setMensajes((prev) => unir(prev, [m]));
      },
      read: (payload) => {
        if (payload.role !== p.myRole) setOtroLeyo((v) => Math.max(v, Number(payload.lastReadId)));
      },
      status: () => router.refresh(),
    },
    () => void resincronizar(),
  );

  // Sin tiempo real (no configurado o sin conexión): consulta periódica.
  useEffect(() => {
    if (conexion === "en-linea" || conexion === "conectando") return;
    const t = setInterval(() => void resincronizar(), 5000);
    return () => clearInterval(t);
  }, [conexion, resincronizar]);

  // --- Envío (optimista e idempotente) ---------------------------------------------
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
      setAviso(e instanceof Error ? e.message : "No se pudo enviar el mensaje.");
      setMensajes((prev) =>
        prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, estado: "error" as const } : m)),
      );
    }
  }

  function alEnviar(e: FormEvent) {
    e.preventDefault();
    const cuerpo = texto.trim();
    if (!cuerpo || !puedeEscribir) return;
    const clientMessageId = crypto.randomUUID();
    alFinal.current = true;
    setAviso(null);
    setTexto("");
    setMensajes((prev) => [
      ...prev,
      {
        id: Number.MAX_SAFE_INTEGER,
        key: clientMessageId,
        clientMessageId,
        isMine: true,
        body: cuerpo,
        hidden: false,
        createdAt: new Date().toISOString(),
        estado: "enviando",
      },
    ]);
    void enviar(clientMessageId, cuerpo);
  }

  async function cargarAnteriores() {
    const primero = mensajes.find((m) => m.estado === "ok");
    if (!primero) return;
    setCargandoMas(true);
    alFinal.current = false;
    const res = await fetch(`${base}/messages?before=${primero.id}&limit=50`, { cache: "no-store" });
    if (res.ok) {
      const { items, hasMore } = (await res.json()) as { items: MensajeInicial[]; hasMore: boolean };
      setMensajes((m) => unir(m, items.map(desdeServidor)));
      setHayMas(hasMore);
    }
    setCargandoMas(false);
  }

  async function cambiarBloqueo(bloquear: boolean) {
    const res = await fetch(`${base}/block`, { method: bloquear ? "POST" : "DELETE" });
    if (!res.ok) setAviso("No pudimos actualizar el bloqueo. Inténtalo de nuevo.");
    router.refresh();
  }

  const ultimoMioVisto = [...mensajes].reverse().find((m) => m.isMine && m.estado === "ok" && m.id <= otroLeyo)?.id;

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[28rem] flex-col tarjeta">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          {conexion === "en-linea" ? (
            <>
              <span className="h-2 w-2 rounded-full bg-verde" aria-hidden /> En línea
            </>
          ) : conexion === "conectando" ? (
            "Conectando…"
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5" aria-hidden /> Actualizando cada pocos segundos
            </>
          )}
        </p>
        {p.blockedByMe ? (
          <button type="button" onClick={() => void cambiarBloqueo(false)} className="text-xs font-bold text-primary">
            Desbloquear
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void cambiarBloqueo(true)}
            className="inline-flex items-center gap-1 text-xs font-bold text-destructive"
          >
            <Ban className="h-3.5 w-3.5" aria-hidden /> Bloquear
          </button>
        )}
      </div>

      <ol
        ref={listaRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          alFinal.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 space-y-2 overflow-y-auto px-4 py-4"
        aria-label={`Conversación con ${p.counterpartName}`}
        aria-live="polite"
        aria-relevant="additions"
      >
        {hayMas && (
          <li className="text-center">
            <button
              type="button"
              onClick={() => void cargarAnteriores()}
              disabled={cargandoMas}
              className="text-xs font-bold text-primary"
            >
              {cargandoMas ? "Cargando…" : "Ver mensajes anteriores"}
            </button>
          </li>
        )}
        {mensajes.length === 0 && (
          <li className="py-10 text-center text-sm text-muted-foreground">Aún no hay mensajes.</li>
        )}
        {mensajes.map((m, i) => {
          const dia = diaFmt.format(new Date(m.createdAt));
          const nuevoDia = i === 0 || diaFmt.format(new Date(mensajes[i - 1].createdAt)) !== dia;
          return (
            <li key={m.key}>
              {nuevoDia && <p className="my-3 text-center text-xs font-semibold text-muted-foreground">{dia}</p>}
              <div className={cn("flex", m.isMine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm sm:max-w-[70%]",
                    m.isMine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-secondary",
                    m.estado === "error" && "bg-destructive/15 text-foreground",
                  )}
                >
                  {m.hidden ? (
                    <p className="italic opacity-80">Mensaje ocultado por moderación.</p>
                  ) : (
                    <p className="break-words whitespace-pre-wrap">{m.body}</p>
                  )}
                  <p
                    className={cn(
                      "mt-1 flex items-center justify-end gap-1 text-[11px]",
                      m.isMine ? "text-primary-foreground/80" : "text-muted-foreground",
                    )}
                  >
                    {horaFmt.format(new Date(m.createdAt))}
                    {m.isMine && m.estado === "enviando" && (
                      <Loader2 className="h-3 w-3 animate-spin" aria-label="Enviando" />
                    )}
                    {m.isMine &&
                      m.estado === "ok" &&
                      (m.id === ultimoMioVisto ? (
                        <CheckCheck className="h-3.5 w-3.5" aria-label="Visto" />
                      ) : (
                        <Check className="h-3.5 w-3.5" aria-label="Enviado" />
                      ))}
                  </p>
                </div>
              </div>
              {m.isMine && m.estado === "error" && (
                <p className="mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => m.clientMessageId && void enviar(m.clientMessageId, m.body ?? "")}
                    className="inline-flex items-center gap-1 text-xs font-bold text-destructive"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden /> No se envió. Reintentar
                  </button>
                </p>
              )}
              {!m.isMine && m.estado === "ok" && !m.hidden && (
                <div className="mt-0.5">
                  {denunciando === m.id ? (
                    <FormularioDenuncia
                      messageId={m.id}
                      reasons={p.reasons}
                      onClose={(msg) => {
                        setDenunciando(null);
                        if (msg) setAviso(msg);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDenunciando(m.id)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      <Flag className="h-3 w-3" aria-hidden /> Denunciar
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {aviso && (
        <p role="alert" className="mx-4 mb-2 flex gap-2 rounded-xl bg-destructive/10 p-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {aviso}
        </p>
      )}

      {!p.workerLinked && p.myRole === "CLIENTE" && (
        <p className="mx-4 mb-2 rounded-xl bg-amarillo/20 p-2 text-xs">
          {p.counterpartName} aún no activa su cuenta en la plataforma: verá tus mensajes cuando lo haga.
        </p>
      )}

      {puedeEscribir ? (
        <form onSubmit={alEnviar} className="flex items-end gap-2 border-t border-border p-3">
          <label htmlFor="mensaje" className="sr-only">
            Escribe un mensaje
          </label>
          <textarea
            id="mensaje"
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={MAX}
            placeholder="Escribe un mensaje"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/30"
          />
          <button
            type="submit"
            disabled={!texto.trim()}
            aria-label="Enviar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            <SendHorizontal className="h-5 w-5" aria-hidden />
          </button>
        </form>
      ) : (
        <p className="border-t border-border p-4 text-center text-sm text-muted-foreground">
          {p.blockedByMe
            ? "Bloqueaste esta conversación. Desbloquéala para volver a escribir."
            : p.blockedByOther
              ? "La otra persona bloqueó esta conversación."
              : "Esta conversación ya no admite mensajes."}
        </p>
      )}
    </div>
  );
}

function FormularioDenuncia({
  messageId,
  reasons,
  onClose,
}: {
  messageId: number;
  reasons: { code: string; label: string }[];
  onClose: (mensaje?: string) => void;
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
    onClose(res.ok ? "Denuncia enviada. El GAD la revisará." : (err?.detail ?? "No pudimos enviar la denuncia."));
  }
  return (
    <form
      onSubmit={(e) => void enviar(e)}
      className="mt-1 max-w-sm space-y-2 rounded-xl border border-border p-3 text-sm"
    >
      <label htmlFor={`motivo-${messageId}`} className="font-bold">
        Motivo de la denuncia
      </label>
      <select
        id={`motivo-${messageId}`}
        name="reasonCode"
        className="w-full rounded-lg border border-input bg-card px-2 py-2"
      >
        {reasons.map((r) => (
          <option key={r.code} value={r.code}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        name="description"
        rows={2}
        maxLength={1000}
        placeholder="Detalle (opcional)"
        aria-label="Detalle de la denuncia"
        className="w-full rounded-lg border border-input bg-card px-2 py-2"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-destructive px-3 py-2 text-xs font-bold text-destructive-foreground"
        >
          {enviando ? "Enviando…" : "Enviar denuncia"}
        </button>
        <button
          type="button"
          onClick={() => onClose()}
          className="rounded-lg border border-border px-3 py-2 text-xs font-bold"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
