"use client";

import { AlertCircle, CheckCircle2, Loader2, Search, Send, Smartphone, X } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";

import { FieldError } from "@/components/forms/ActionForm";
import { ayuda, campoCompacto, etiqueta } from "@/components/ui/campo";
import { boton } from "@/components/ui/boton";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import {
  ETIQUETAS_PLATAFORMA,
  ETIQUETAS_SEGMENTO,
  PLATAFORMAS,
  SEGMENTOS,
  type Plataforma,
  type Segmento,
} from "@/server/domain/notifications/schemas";
import type { Audiencia, Destinatario } from "@/server/notifications/campaigns";

import { buscarDestinatarios, crearAviso, estimarAudiencia } from "./actions";

type PersonaElegida = { nombre: string };
type DispositivoElegido = { nombre: string; platform: Plataforma };

const numero = new Intl.NumberFormat("es-EC");

/**
 * Nuevo aviso push del GAD. Tras crearlo, el formulario se reinicia (se vuelve a montar con otra
 * `key`) y el mensaje de resultado queda visible.
 */
export function NuevoAviso({ fcmListo, programables }: { fcmListo: boolean; programables: boolean }) {
  const [version, setVersion] = useState(0);
  const [state, action, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await crearAviso(prev, fd);
    if (r.status === "ok") setVersion((v) => v + 1);
    return r;
  }, initialActionState);

  return (
    <div className="space-y-4">
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-semibold",
            state.status === "error" ? "bg-destructive/10 text-destructive" : "bg-verde/15 text-foreground",
          )}
        >
          {state.status === "error" ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-verde-fuerte" aria-hidden />
          )}
          {state.message}
        </p>
      )}
      <Formulario
        key={version}
        action={action}
        pending={pending}
        state={state.status === "error" ? state : initialActionState}
        fcmListo={fcmListo}
        programables={programables}
      />
    </div>
  );
}

function Formulario({
  action,
  pending,
  state,
  fcmListo,
  programables,
}: {
  action: (fd: FormData) => void;
  pending: boolean;
  state: ActionState;
  fcmListo: boolean;
  /** Sin programador por minuto (plan Hobby de Vercel) solo se envía al momento. */
  programables: boolean;
}) {
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [segmento, setSegmento] = useState<Segmento>("USUARIOS");
  const [plataformas, setPlataformas] = useState<Plataforma[]>([...PLATAFORMAS]);
  const [cuando, setCuando] = useState<"ahora" | "programar">("ahora");
  const [personas, setPersonas] = useState<Record<string, PersonaElegida>>({});
  const [dispositivos, setDispositivos] = useState<Record<string, DispositivoElegido>>({});
  const [audiencia, setAudiencia] = useState<Audiencia | null>(null);
  const [calculando, setCalculando] = useState(false);

  const userIds = Object.keys(personas);
  const deviceIds = Object.keys(dispositivos);
  const clave = JSON.stringify([segmento, plataformas, userIds, deviceIds]);

  // Estimación de destinatarios en vivo (con una pequeña espera para no consultar en cada clic).
  useEffect(() => {
    const [seg, plats, users, devices] = JSON.parse(clave) as [Segmento, Plataforma[], string[], string[]];
    let vigente = true;
    const t = setTimeout(async () => {
      if (plats.length === 0 || (seg === "SELECCION" && users.length + devices.length === 0)) {
        setAudiencia(null);
        setCalculando(false);
        return;
      }
      setCalculando(true);
      const r = await estimarAudiencia({ segment: seg, platforms: plats, userIds: users, deviceIds: devices });
      if (!vigente) return;
      setAudiencia(r.ok ? r.audiencia : null);
      setCalculando(false);
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [clave]);

  function alternarPlataforma(p: Plataforma) {
    setPlataformas((actual) => (actual.includes(p) ? actual.filter((x) => x !== p) : [...actual, p]));
  }

  return (
    <form action={action} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]" noValidate>
      <div className="space-y-5">
        <div>
          <label htmlFor="aviso-titulo" className={etiqueta}>
            Título
          </label>
          <input
            id="aviso-titulo"
            name="title"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={65}
            aria-describedby="aviso-titulo-ayuda aviso-titulo-e"
            className={campoCompacto}
          />
          <p id="aviso-titulo-ayuda" className={ayuda}>
            {titulo.length}/65 · Corto y claro: es lo primero que se lee en el celular.
          </p>
          <FieldError id="aviso-titulo-e" state={state} name="title" />
        </div>

        <div>
          <label htmlFor="aviso-mensaje" className={etiqueta}>
            Mensaje
          </label>
          <textarea
            id="aviso-mensaje"
            name="body"
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            maxLength={240}
            rows={3}
            aria-describedby="aviso-mensaje-ayuda aviso-mensaje-e"
            className={cn(campoCompacto, "min-h-20 resize-y")}
          />
          <p id="aviso-mensaje-ayuda" className={ayuda}>
            {mensaje.length}/240
          </p>
          <FieldError id="aviso-mensaje-e" state={state} name="body" />
        </div>

        <div>
          <label htmlFor="aviso-enlace" className={etiqueta}>
            Al tocarlo, abrir <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="aviso-enlace"
            name="link"
            placeholder="/preguntas-frecuentes"
            maxLength={300}
            aria-describedby="aviso-enlace-ayuda aviso-enlace-e"
            className={campoCompacto}
          />
          <p id="aviso-enlace-ayuda" className={ayuda}>
            Una página del portal, por ejemplo /oficios o /buscar. Vacío: abre «Mi cuenta».
          </p>
          <FieldError id="aviso-enlace-e" state={state} name="link" />
        </div>

        <fieldset>
          <legend className={etiqueta}>¿A quién?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {SEGMENTOS.map((s) => (
              <label
                key={s}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors",
                  segmento === s ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                )}
              >
                <input
                  type="radio"
                  name="segment"
                  value={s}
                  checked={segmento === s}
                  onChange={() => setSegmento(s)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <span>
                  <span className="block font-bold">{ETIQUETAS_SEGMENTO[s].titulo}</span>
                  <span className="text-muted-foreground">{ETIQUETAS_SEGMENTO[s].detalle}</span>
                </span>
              </label>
            ))}
          </div>
          <FieldError id="aviso-segmento-e" state={state} name="segment" />
        </fieldset>

        {segmento === "SELECCION" && (
          <Selector
            personas={personas}
            dispositivos={dispositivos}
            setPersonas={setPersonas}
            setDispositivos={setDispositivos}
          />
        )}
        {segmento === "SELECCION" && userIds.map((id) => <input key={id} type="hidden" name="userIds" value={id} />)}
        {segmento === "SELECCION" &&
          deviceIds.map((id) => <input key={id} type="hidden" name="deviceIds" value={id} />)}

        <fieldset>
          <legend className={etiqueta}>Plataformas</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {PLATAFORMAS.map((p) => (
              <label key={p} className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  name="platforms"
                  value={p}
                  checked={plataformas.includes(p)}
                  onChange={() => alternarPlataforma(p)}
                  className="h-5 w-5 accent-primary"
                />
                {ETIQUETAS_PLATAFORMA[p]}
              </label>
            ))}
          </div>
          <FieldError id="aviso-plataformas-e" state={state} name="platforms" />
        </fieldset>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="alsoInApp" className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
          <span>
            <span className="block font-bold">Dejarlo también en la bandeja del portal</span>
            <span className="text-muted-foreground">
              Lo ven en «Mi cuenta» todas las personas del grupo, aunque no tengan notificaciones activadas.
            </span>
          </span>
        </label>

        {programables && (
          <fieldset>
            <legend className={etiqueta}>¿Cuándo?</legend>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input
                  type="radio"
                  name="cuando"
                  value="ahora"
                  checked={cuando === "ahora"}
                  onChange={() => setCuando("ahora")}
                  className="h-4 w-4 accent-primary"
                />
                Enviar ahora
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                <input
                  type="radio"
                  name="cuando"
                  value="programar"
                  checked={cuando === "programar"}
                  onChange={() => setCuando("programar")}
                  className="h-4 w-4 accent-primary"
                />
                Programar
              </label>
              {cuando === "programar" && (
                <div>
                  <label htmlFor="aviso-fecha" className="sr-only">
                    Fecha y hora de envío (hora de Ecuador)
                  </label>
                  <input
                    id="aviso-fecha"
                    type="datetime-local"
                    name="scheduledAt"
                    aria-describedby="aviso-fecha-e"
                    className={cn(campoCompacto, "mt-0 w-auto")}
                  />
                </div>
              )}
            </div>
            <FieldError id="aviso-fecha-e" state={state} name="scheduledAt" />
          </fieldset>
        )}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <div>
          <p className={etiqueta}>Así se verá</p>
          <div className="mt-2 rounded-2xl bg-foreground/90 p-3 text-background shadow-[var(--shadow-suave)]">
            <div className="flex items-start gap-3 rounded-xl bg-background/10 p-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Smartphone className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 text-sm">
                <p className="text-xs opacity-70">Acolita.App · ahora</p>
                <p className="truncate font-bold">{titulo || "Título del aviso"}</p>
                <p className="line-clamp-3 opacity-90">{mensaje || "El mensaje aparece aquí."}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-secondary p-4 text-sm" aria-live="polite">
          <p className="font-bold">Destinatarios</p>
          {calculando && !audiencia ? (
            <p className="mt-1 text-muted-foreground">Calculando…</p>
          ) : audiencia ? (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              <li>
                <strong className="text-foreground tabular-nums">{numero.format(audiencia.devices)}</strong>{" "}
                {audiencia.devices === 1 ? "dispositivo" : "dispositivos"}
                {audiencia.devices > 0 &&
                  ` (${PLATAFORMAS.filter((p) => audiencia.byPlatform[p] > 0)
                    .map((p) => `${numero.format(audiencia.byPlatform[p])} ${ETIQUETAS_PLATAFORMA[p]}`)
                    .join(", ")})`}
              </li>
              {audiencia.anonymousDevices > 0 && (
                <li className="tabular-nums">{numero.format(audiencia.anonymousDevices)} sin sesión iniciada</li>
              )}
              <li className="tabular-nums">
                {numero.format(audiencia.inAppUsers)} {audiencia.inAppUsers === 1 ? "persona" : "personas"} en la
                bandeja del portal (si lo marcas)
              </li>
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">
              {segmento === "SELECCION" ? "Elige a quién enviar." : "Elige al menos una plataforma."}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            No cuenta a quienes desactivaron los avisos del GAD ni las cuentas bloqueadas.
          </p>
        </div>

        {!fcmListo && (
          <p className="rounded-2xl bg-amarillo/20 p-3 text-sm">
            Firebase no está configurado en este ambiente: el aviso quedará pendiente hasta que se configure.
          </p>
        )}

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="confirmo" className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
          <span>Revisé el texto y los destinatarios. Un aviso enviado no se puede retirar de los dispositivos.</span>
        </label>

        <button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
          className={cn(boton({ tamano: "md" }), "w-full")}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send aria-hidden />}
          {pending ? "Creando…" : cuando === "programar" ? "Programar aviso" : "Enviar aviso"}
        </button>
      </aside>
    </form>
  );
}

function Selector({
  personas,
  dispositivos,
  setPersonas,
  setDispositivos,
}: {
  personas: Record<string, PersonaElegida>;
  dispositivos: Record<string, DispositivoElegido>;
  setPersonas: (f: (p: Record<string, PersonaElegida>) => Record<string, PersonaElegida>) => void;
  setDispositivos: (f: (d: Record<string, DispositivoElegido>) => Record<string, DispositivoElegido>) => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Destinatario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, startBusqueda] = useTransition();

  function buscar() {
    startBusqueda(async () => {
      const r = await buscarDestinatarios(q);
      setError(r.ok ? null : r.error);
      setResultados(r.ok ? r.personas : null);
    });
  }

  function alternarPersona(p: Destinatario) {
    setPersonas((actual) => {
      const copia = { ...actual };
      if (copia[p.userId]) delete copia[p.userId];
      else copia[p.userId] = { nombre: p.displayName ?? p.email ?? "Sin nombre" };
      return copia;
    });
    // Elegir a la persona incluye todos sus dispositivos: se quitan los elegidos por separado.
    setDispositivos((actual) => {
      const copia = { ...actual };
      for (const d of p.devices) delete copia[String(d.id)];
      return copia;
    });
  }

  function alternarDispositivo(p: Destinatario, d: Destinatario["devices"][number]) {
    setDispositivos((actual) => {
      const copia = { ...actual };
      if (copia[String(d.id)]) delete copia[String(d.id)];
      else copia[String(d.id)] = { nombre: p.displayName ?? p.email ?? "Sin nombre", platform: d.platform };
      return copia;
    });
  }

  const elegidos = [
    ...Object.entries(personas).map(([id, p]) => ({
      clave: `u-${id}`,
      texto: `${p.nombre} · todos sus dispositivos`,
      quitar: () =>
        setPersonas((a) => {
          const c = { ...a };
          delete c[id];
          return c;
        }),
    })),
    ...Object.entries(dispositivos).map(([id, d]) => ({
      clave: `d-${id}`,
      texto: `${d.nombre} · ${ETIQUETAS_PLATAFORMA[d.platform]}`,
      quitar: () =>
        setDispositivos((a) => {
          const c = { ...a };
          delete c[id];
          return c;
        }),
    })),
  ];

  return (
    <div className="rounded-2xl border border-border p-4">
      <label htmlFor="aviso-buscar" className={etiqueta}>
        Buscar personas por nombre o correo
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="aviso-buscar"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              buscar();
            }
          }}
          className={cn(campoCompacto, "mt-0")}
        />
        <button
          type="button"
          onClick={buscar}
          disabled={buscando || q.trim().length < 3}
          className={boton({ variante: "secundario", tamano: "sm" })}
        >
          {buscando ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
          Buscar
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      {resultados && (
        <ul className="mt-3 divide-y divide-border/70" aria-label="Resultados">
          {resultados.length === 0 && <li className="py-3 text-sm text-muted-foreground">Sin coincidencias.</li>}
          {resultados.map((p) => {
            const personaElegida = !!personas[p.userId];
            return (
              <li key={p.userId} className="py-3 text-sm">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={personaElegida}
                    onChange={() => alternarPersona(p)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block font-bold">{p.displayName ?? "Sin nombre"}</span>
                    <span className="block truncate text-muted-foreground">
                      {p.email ?? "sin correo"} · {p.roles.includes("TRABAJADOR") ? "Trabajador" : "Cliente"}
                      {p.status !== "ACTIVO" && " · cuenta no activa"}
                      {!p.pushAnnouncements && " · desactivó los avisos del GAD"}
                    </span>
                  </span>
                </label>
                {p.devices.length > 0 ? (
                  <ul className="mt-2 ml-8 flex flex-wrap gap-2">
                    {p.devices.map((d) => (
                      <li key={d.id}>
                        <label
                          className={cn(
                            "flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold",
                            personaElegida && "opacity-50",
                          )}
                        >
                          <input
                            type="checkbox"
                            disabled={personaElegida}
                            checked={personaElegida || !!dispositivos[String(d.id)]}
                            onChange={() => alternarDispositivo(p, d)}
                            className="h-4 w-4 accent-primary"
                          />
                          {ETIQUETAS_PLATAFORMA[d.platform]} ·{" "}
                          {new Date(d.lastSeenAt).toLocaleDateString("es-EC", { day: "numeric", month: "short" })}
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 ml-8 text-xs text-muted-foreground">
                    Sin dispositivos con notificaciones: solo lo verá en la bandeja del portal.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {elegidos.length > 0 && (
        <div className="mt-4 border-t border-border/70 pt-3">
          <p className="text-sm font-bold">Elegidos ({elegidos.length})</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {elegidos.map((e) => (
              <li key={e.clave}>
                <span className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary/10 py-1 pr-1 pl-3 text-xs font-semibold text-primary">
                  {e.texto}
                  <button
                    type="button"
                    onClick={e.quitar}
                    aria-label={`Quitar ${e.texto}`}
                    className="grid h-7 w-7 place-items-center rounded-full hover:bg-primary/15"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
