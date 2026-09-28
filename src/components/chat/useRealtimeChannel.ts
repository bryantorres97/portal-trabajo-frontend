"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import { publicEnv } from "@/lib/env.public";

/**
 * Suscripción a un canal PRIVADO de Supabase Realtime (Broadcast) con el JWT corto que emite el
 * servidor (`POST /api/v1/realtime/token`, ADR-004). El token se renueva antes de vencer y, al
 * reconectarse, se avisa con `onResync` para recuperar lo que llegó mientras no había conexión.
 */

export type EstadoConexion = "conectando" | "en-linea" | "sin-conexion" | "desactivado";

type Handlers = Record<string, (payload: Record<string, unknown>) => void>;

let cliente: SupabaseClient | null = null;
let tokenPromesa: Promise<string | null> | null = null;
let renovacion: ReturnType<typeof setTimeout> | undefined;

function obtenerCliente(): SupabaseClient | null {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key } = publicEnv;
  if (!url || !key) return null;
  cliente ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cliente;
}

async function pedirToken(): Promise<{ token: string; expiresAt: string } | null> {
  const res = await fetch("/api/v1/realtime/token", { method: "POST", credentials: "same-origin" });
  if (!res.ok) return null;
  return (await res.json()) as { token: string; expiresAt: string };
}

/** Autentica Realtime una sola vez por página y programa la renovación (2 min antes de vencer). */
function autenticar(sb: SupabaseClient): Promise<string | null> {
  tokenPromesa ??= (async () => {
    const t = await pedirToken();
    if (!t) {
      tokenPromesa = null;
      return null;
    }
    await sb.realtime.setAuth(t.token);
    clearTimeout(renovacion);
    const espera = Math.max(new Date(t.expiresAt).getTime() - Date.now() - 120_000, 30_000);
    renovacion = setTimeout(() => {
      tokenPromesa = null;
      void autenticar(sb);
    }, espera);
    return t.token;
  })();
  return tokenPromesa;
}

export function useRealtimeChannel(topic: string | null, handlers: Handlers, onResync?: () => void): EstadoConexion {
  const [estado, setEstado] = useState<EstadoConexion>(() => (obtenerCliente() ? "conectando" : "desactivado"));
  const handlersRef = useRef(handlers);
  const resyncRef = useRef(onResync);
  useEffect(() => {
    handlersRef.current = handlers;
    resyncRef.current = onResync;
  });

  useEffect(() => {
    const sb = obtenerCliente();
    if (!sb || !topic) return;
    let canal: RealtimeChannel | null = null;
    let cancelado = false;
    let yaConectado = false;

    void autenticar(sb).then((token) => {
      if (cancelado) return;
      if (!token) {
        setEstado("desactivado");
        return;
      }
      canal = sb.channel(topic, { config: { private: true } });
      for (const evento of Object.keys(handlersRef.current)) {
        canal.on("broadcast", { event: evento }, ({ payload }) => handlersRef.current[evento]?.(payload));
      }
      canal.subscribe((status) => {
        if (cancelado) return;
        if (status === "SUBSCRIBED") {
          setEstado("en-linea");
          // Tras una reconexión se recupera lo que pudo perderse sin conexión.
          if (yaConectado) resyncRef.current?.();
          yaConectado = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setEstado("sin-conexion");
        }
      });
    });

    return () => {
      cancelado = true;
      if (canal) void sb.removeChannel(canal);
    };
  }, [topic]);

  return estado;
}
