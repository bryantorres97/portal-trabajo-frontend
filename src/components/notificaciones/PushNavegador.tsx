"use client";

import { BellOff, BellRing, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { boton } from "@/components/ui/boton";
import type { WebPushConfig } from "@/lib/env";

/**
 * Activa las notificaciones push en este navegador: pide permiso, registra el service worker,
 * obtiene el token de Firebase y lo registra en `/api/v1/devices` (ligado a la sesión). El SDK de
 * Firebase se carga solo al activar.
 */

const CLAVE = "llankana.push.token";

type Estado = "cargando" | "no-soportado" | "bloqueado" | "inactivo" | "activo" | "procesando";

function leerToken(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

function guardarToken(token: string | null) {
  try {
    if (token) localStorage.setItem(CLAVE, token);
    else localStorage.removeItem(CLAVE);
  } catch {
    // Almacenamiento no disponible (modo privado): se vuelve a registrar en la próxima visita.
  }
}

function soportado(): boolean {
  return (
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

async function mensajeria(config: WebPushConfig) {
  const [{ getApps, initializeApp }, { getMessaging, isSupported }] = await Promise.all([
    import("firebase/app"),
    import("firebase/messaging"),
  ]);
  if (!(await isSupported())) throw new Error("no-soportado");
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: config.apiKey,
      projectId: config.projectId,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    });
  return getMessaging(app);
}

async function obtenerToken(config: WebPushConfig): Promise<string> {
  const { getToken } = await import("firebase/messaging");
  const registro = await navigator.serviceWorker.register("/sw-notificaciones.js", {
    scope: "/",
    updateViaCache: "none",
  });
  await navigator.serviceWorker.ready;
  return getToken(await mensajeria(config), {
    serviceWorkerRegistration: registro,
    ...(config.vapidKey ? { vapidKey: config.vapidKey } : {}),
  });
}

async function llamarApi(method: "POST" | "DELETE", token: string) {
  const res = await fetch("/api/v1/devices", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(method === "POST" ? { platform: "WEB", token } : { token }),
  });
  if (!res.ok) {
    const problema = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(problema?.detail ?? "No pudimos registrar este navegador.");
  }
}

/**
 * Estado al cargar la página. Si ya estaba activo, renueva el registro: el token puede cambiar y,
 * tras cerrar sesión e ingresar de nuevo, hay que ligarlo a la sesión nueva.
 */
async function estadoInicial(config: WebPushConfig | null): Promise<Estado> {
  if (!config || !soportado()) return "no-soportado";
  if (Notification.permission === "denied") return "bloqueado";
  if (Notification.permission !== "granted" || !leerToken()) return "inactivo";
  try {
    const token = await obtenerToken(config);
    await llamarApi("POST", token);
    guardarToken(token);
    return "activo";
  } catch {
    return "inactivo";
  }
}

export function PushNavegador({ config }: { config: WebPushConfig | null }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    void estadoInicial(config).then((e) => {
      if (vigente) setEstado(e);
    });
    return () => {
      vigente = false;
    };
  }, [config]);

  async function activar() {
    if (!config) return;
    setError(null);
    setEstado("procesando");
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") return setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
      const token = await obtenerToken(config);
      await llamarApi("POST", token);
      guardarToken(token);
      setEstado("activo");
    } catch (e) {
      setError(
        e instanceof Error && e.message !== "no-soportado" ? e.message : "No pudimos activar las notificaciones.",
      );
      setEstado("inactivo");
    }
  }

  async function desactivar() {
    if (!config) return;
    setError(null);
    setEstado("procesando");
    const token = leerToken();
    try {
      if (token) await llamarApi("DELETE", token);
      const { deleteToken } = await import("firebase/messaging");
      await deleteToken(await mensajeria(config)).catch(() => false);
      guardarToken(null);
      setEstado("inactivo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos desactivar las notificaciones.");
      setEstado("activo");
    }
  }

  if (estado === "cargando") {
    return <p className="text-sm text-muted-foreground">Revisando este navegador…</p>;
  }
  if (estado === "no-soportado") {
    return (
      <p className="text-sm text-muted-foreground">
        {config
          ? "Este navegador no admite notificaciones push. Puedes ver tus avisos en esta página."
          : "Las notificaciones push todavía no están disponibles. Puedes ver tus avisos en esta página."}
      </p>
    );
  }
  if (estado === "bloqueado") {
    return (
      <p className="text-sm text-muted-foreground">
        Bloqueaste las notificaciones de este sitio. Para recibirlas, permítelas en la configuración del navegador
        (ícono junto a la dirección) y vuelve a esta página.
      </p>
    );
  }

  const activo = estado === "activo";
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground" role="status">
        {activo
          ? "Activadas en este navegador: te avisaremos de mensajes, contrataciones y avisos del GAD aunque no tengas la página abierta."
          : "Recibe un aviso cuando te escriban o cambie una contratación, aunque no tengas la página abierta."}
      </p>
      <button
        type="button"
        onClick={activo ? desactivar : activar}
        disabled={estado === "procesando"}
        className={boton({ variante: activo ? "secundario" : "primario", tamano: "sm" })}
      >
        {estado === "procesando" ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : activo ? (
          <BellOff aria-hidden />
        ) : (
          <BellRing aria-hidden />
        )}
        {activo ? "Desactivar en este navegador" : "Activar en este navegador"}
      </button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
