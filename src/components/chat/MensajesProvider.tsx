"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useRealtimeChannel } from "@/components/chat/useRealtimeChannel";

/**
 * Estado global de mensajes sin leer para el encabezado, la barra inferior y la bandeja.
 * Mantiene UNA sola suscripción al canal personal `user:{id}` (Realtime admite un join por
 * topic y socket) y reparte los avisos a quien los necesite.
 */

type Resumen = {
  signedIn: boolean;
  chat: boolean;
  userId?: string;
  unreadMessages: number;
  unreadConversations: number;
};

type Contexto = {
  resumen: Resumen | null;
  /** Aumenta cada vez que llega un aviso de bandeja (para refrescar listas). */
  avisos: number;
  refrescar: () => void;
};

const MensajesContext = createContext<Contexto>({ resumen: null, avisos: 0, refrescar: () => {} });

export function useMensajes() {
  return useContext(MensajesContext);
}

export function MensajesProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [avisos, setAvisos] = useState(0);
  const pendiente = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/me/unread", { cache: "no-store", credentials: "same-origin" });
      if (res.ok) setResumen((await res.json()) as Resumen);
    } catch {
      // Sin red: se conserva el último valor conocido.
    }
  }, []);

  /** Agrupa varios avisos seguidos en una sola consulta. */
  const refrescar = useCallback(() => {
    clearTimeout(pendiente.current);
    pendiente.current = setTimeout(() => void cargar(), 400);
  }, [cargar]);

  // Al navegar (p. ej. al volver de una conversación ya leída) y al volver a la pestaña.
  useEffect(() => {
    refrescar();
  }, [pathname, refrescar]);

  useEffect(() => {
    const alVolver = () => document.visibilityState === "visible" && refrescar();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [refrescar]);

  const topic = resumen?.chat && resumen.userId ? `user:${resumen.userId}` : null;
  const estado = useRealtimeChannel(
    topic,
    {
      inbox: () => {
        setAvisos((n) => n + 1);
        refrescar();
      },
    },
    refrescar,
  );

  // Sin tiempo real: consulta periódica mientras la pestaña está visible.
  useEffect(() => {
    if (!topic || estado === "en-linea" || estado === "conectando") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") {
        setAvisos((n) => n + 1);
        void cargar();
      }
    }, 20_000);
    return () => clearInterval(t);
  }, [topic, estado, cargar]);

  const valor = useMemo(() => ({ resumen, avisos, refrescar }), [resumen, avisos, refrescar]);
  return <MensajesContext.Provider value={valor}>{children}</MensajesContext.Provider>;
}

/** Punto con el número de no leídos (accesible: el número también se anuncia como texto). */
export function ContadorNoLeidos({ valor, className }: { valor: number; className?: string }) {
  if (valor <= 0) return null;
  return (
    <span
      className={
        "grid h-5 min-w-5 place-items-center rounded-full bg-magenta px-1.5 text-[11px] leading-none font-bold text-white tabular-nums ring-2 ring-background " +
        (className ?? "")
      }
    >
      {valor > 99 ? "99+" : valor}
      <span className="sr-only"> {valor === 1 ? "mensaje sin leer" : "mensajes sin leer"}</span>
    </span>
  );
}
