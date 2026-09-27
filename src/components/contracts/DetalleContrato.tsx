"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Hammer,
  History,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  ShieldAlert,
  Wallet,
  XCircle,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { useRealtimeChannel } from "@/components/chat/useRealtimeChannel";
import { EstadoContrato } from "@/components/contracts/EstadoContrato";
import type { OpcionesFormulario } from "@/components/contracts/FormularioCondiciones";
import { ProponerCondiciones } from "@/components/contracts/ProponerCondiciones";
import { boton } from "@/components/ui/boton";
import { ayuda, campo, etiqueta } from "@/components/ui/campo";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatearFecha, formatearFechaHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import type { ContractDetail, ContractVersion } from "@/server/contracts/contracts";
import { ETIQUETAS_EVENTO, formatearPrecio, type ContractAction } from "@/server/domain/contracts/state-machine";

type Dialogo = "aceptar" | "rechazar" | "retirar" | "cancelar" | "disputa" | "retirar-disputa" | null;
type Formulario = "contrapropuesta" | "modificacion" | "editar" | null;

const CAMPOS: { clave: keyof ContractVersion; etiqueta: string }[] = [
  { clave: "serviceName", etiqueta: "Servicio" },
  { clave: "description", etiqueta: "Trabajo" },
  { clave: "scheduledStart", etiqueta: "Cuándo" },
  { clave: "scheduledEnd", etiqueta: "Cuándo" },
  { clave: "parishName", etiqueta: "Dónde" },
  { clave: "locationDetail", etiqueta: "Dónde" },
  { clave: "priceAmount", etiqueta: "Precio" },
  { clave: "priceUnit", etiqueta: "Precio" },
  { clave: "conditions", etiqueta: "Otras condiciones" },
];

/** Campos que cambiaron respecto de la versión de referencia (para resaltarlos). */
export function camposCambiados(v: ContractVersion, base: ContractVersion | null | undefined): Set<string> {
  const cambios = new Set<string>();
  if (!base) return cambios;
  for (const { clave, etiqueta } of CAMPOS) {
    if ((v[clave] ?? null) !== (base[clave] ?? null)) cambios.add(etiqueta);
  }
  return cambios;
}

export function DetalleContrato({
  c,
  opciones,
  motivos,
}: {
  c: ContractDetail;
  opciones: OpcionesFormulario;
  motivos: { code: string; label: string }[];
}) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [formulario, setFormulario] = useState<Formulario>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  // Otra parte actuó (tarjeta de sistema en la conversación): se recargan los datos.
  useRealtimeChannel(`conversation:${c.conversationId}`, {
    message: (payload) => {
      if (payload.contractId === c.id) router.refresh();
    },
  });

  const puede = (a: ContractAction) => c.actions.includes(a);
  const otra = c.counterpartName;
  const pendiente = c.pending;
  const esModificacion = !!pendiente && c.status !== "PROPUESTA_ENVIADA";
  const anterior = c.versions.find((v) => v.version === c.current.version - 1);
  const base = esModificacion ? c.agreed : anterior;

  async function ejecutar(accion: string, cuerpo?: object, metodo: "POST" | "DELETE" = "POST"): Promise<boolean> {
    setOcupado(accion);
    setAviso(null);
    const res = await fetch(`/api/v1/contracts/${c.id}/${accion}`, {
      method: metodo,
      headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    setOcupado(null);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string };
      setAviso({ tipo: "error", texto: err.detail ?? "No pudimos completar la acción. Inténtalo de nuevo." });
      setDialogo(null);
      if (res.status === 409) router.refresh();
      return false;
    }
    setDialogo(null);
    router.refresh();
    return true;
  }

  const siguiente = queSigue(c);

  return (
    <div className="px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
      <Link
        href="/contrataciones"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl text-sm font-bold text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Mis contrataciones
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-muted-foreground">
            {c.myRole === "CLIENTE" ? "Contratas a" : "Te contrata"} {otra}
          </p>
          <h1 className="mt-1 text-3xl leading-tight font-extrabold sm:text-4xl">
            {(c.agreed ?? c.current).serviceName ?? "Contratación"}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <EstadoContrato status={c.status} className="text-sm" />
            {esModificacion && (
              <span className="rounded-full bg-amarillo/25 px-2.5 py-0.5 text-xs font-bold">
                Modificación pendiente
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/mensajes/${c.conversationId}`} className={boton({ variante: "secundario" })}>
            <MessageCircle aria-hidden /> Conversación
          </Link>
          {(puede("MODIFY") || puede("CANCEL") || puede("DISPUTE")) && (
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Más acciones" className={boton({ variante: "secundario" })}>
                <MoreHorizontal aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-60">
                {puede("MODIFY") && (
                  <DropdownMenuItem className="min-h-11 text-base" onSelect={() => setFormulario("modificacion")}>
                    <Pencil className="mr-2 h-4 w-4" aria-hidden /> Modificar lo acordado
                  </DropdownMenuItem>
                )}
                {puede("CANCEL") && (
                  <DropdownMenuItem className="min-h-11 text-base" onSelect={() => setDialogo("cancelar")}>
                    <XCircle className="mr-2 h-4 w-4" aria-hidden /> Cancelar contratación
                  </DropdownMenuItem>
                )}
                {puede("DISPUTE") && (
                  <DropdownMenuItem
                    className="min-h-11 text-base text-destructive focus:text-destructive"
                    onSelect={() => setDialogo("disputa")}
                  >
                    <ShieldAlert className="mr-2 h-4 w-4" aria-hidden /> Reportar un problema
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {aviso && (
        <p
          role={aviso.tipo === "error" ? "alert" : "status"}
          className={cn(
            "mt-6 flex gap-2 rounded-2xl p-4 text-sm font-semibold",
            aviso.tipo === "error" ? "bg-destructive/10 text-destructive" : "bg-verde/15",
          )}
        >
          {aviso.tipo === "error" && <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />}
          {aviso.texto}
        </p>
      )}

      {/* Qué sigue: la acción principal de esta parte */}
      <section
        aria-labelledby="que-sigue"
        className={cn(
          "mt-6 rounded-3xl p-5 sm:p-6",
          siguiente.destacado ? "bg-primary text-primary-foreground shadow-[var(--shadow-suave)]" : "panel",
        )}
      >
        <h2 id="que-sigue" className="flex items-center gap-2 text-lg font-extrabold">
          {siguiente.icono}
          {siguiente.titulo}
        </h2>
        <p
          className={cn(
            "mt-1.5 max-w-2xl",
            siguiente.destacado ? "text-primary-foreground/90" : "text-muted-foreground",
          )}
        >
          {siguiente.texto}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {puede("ACCEPT") && (
            <button type="button" onClick={() => setDialogo("aceptar")} className={boton({ variante: "claro" })}>
              <CheckCircle2 aria-hidden /> {esModificacion ? "Aceptar modificación" : "Aceptar condiciones"}
            </button>
          )}
          {puede("COUNTER") && (
            <button
              type="button"
              onClick={() => setFormulario(pendiente?.proposedByMe ? "editar" : "contrapropuesta")}
              className={boton({ variante: siguiente.destacado ? "claro" : "secundario" })}
            >
              <Pencil aria-hidden /> {pendiente?.proposedByMe ? "Corregir mi propuesta" : "Proponer cambios"}
            </button>
          )}
          {puede("REJECT") && (
            <button
              type="button"
              onClick={() => setDialogo("rechazar")}
              className={cn(
                boton({ variante: "fantasma" }),
                siguiente.destacado && "text-primary-foreground hover:bg-white/15",
              )}
            >
              Rechazar
            </button>
          )}
          {puede("WITHDRAW") && (
            <button type="button" onClick={() => setDialogo("retirar")} className={boton({ variante: "secundario" })}>
              {esModificacion ? "Retirar modificación" : "Retirar propuesta"}
            </button>
          )}
          {puede("START") && (
            <Accion
              ocupado={ocupado === "start"}
              onClick={() => void ejecutar("start")}
              destacado={siguiente.destacado}
            >
              <Hammer aria-hidden /> Marcar inicio del trabajo
            </Accion>
          )}
          {puede("COMPLETE") && (
            <Accion
              ocupado={ocupado === "complete"}
              onClick={() => void ejecutar("complete")}
              destacado={siguiente.destacado}
            >
              <CheckCircle2 aria-hidden /> Marcar como terminado
            </Accion>
          )}
          {puede("CONFIRM") && (
            <Accion
              ocupado={ocupado === "confirm"}
              onClick={() => void ejecutar("confirm")}
              destacado={siguiente.destacado}
            >
              <CheckCircle2 aria-hidden /> Confirmar que terminó
            </Accion>
          )}
          {puede("WITHDRAW_DISPUTE") && (
            <button
              type="button"
              onClick={() => setDialogo("retirar-disputa")}
              className={boton({ variante: "secundario" })}
            >
              Retirar la disputa
            </button>
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-6">
          {pendiente && (
            <TarjetaVersion
              v={pendiente}
              titulo={esModificacion ? "Modificación propuesta" : "Propuesta vigente"}
              otra={otra}
              miRol={c.myRole}
              cambios={camposCambiados(pendiente, base)}
              resaltada
            />
          )}
          {c.agreed && (
            <TarjetaVersion v={c.agreed} titulo="Condiciones acordadas" otra={otra} miRol={c.myRole} acordada />
          )}
          {!pendiente && !c.agreed && (
            <TarjetaVersion v={c.current} titulo="Última propuesta" otra={otra} miRol={c.myRole} />
          )}
        </div>

        <aside className="space-y-6">
          <section aria-labelledby="historial" className="panel p-5">
            <h2 id="historial" className="flex items-center gap-2 text-lg font-extrabold">
              <History className="h-5 w-5 text-primary" aria-hidden /> Historial
            </h2>
            <ol className="mt-4 space-y-3 border-l-2 border-border pl-4">
              {[...c.events].reverse().map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1.5 -left-[1.4rem] h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
                  <p className="text-sm font-bold">
                    {ETIQUETAS_EVENTO[e.event] ?? e.event}
                    {e.termsVersion ? ` · v${e.termsVersion}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.byMe ? "Tú" : e.actorRole === "SISTEMA" ? "Automático" : e.actorRole === "GAD" ? "GAD" : otra} ·{" "}
                    {formatearFechaHora(e.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {c.versions.length > 1 && (
            <details className="panel p-5">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-lg font-extrabold">
                <FileText className="h-5 w-5 text-primary" aria-hidden /> Todas las versiones ({c.versions.length})
              </summary>
              <ul className="mt-3 space-y-3">
                {c.versions.map((v) => (
                  <li key={v.id} className="rounded-2xl border border-border p-3 text-sm">
                    <p className="flex flex-wrap items-center justify-between gap-2 font-bold">
                      <span>Versión {v.version}</span>
                      <span className="font-normal text-muted-foreground">{estadoVersion(v, c)}</span>
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {v.proposedByMe ? "Enviada por ti" : `Enviada por ${otra}`} · {formatearFechaHora(v.createdAt)}
                    </p>
                    <p className="mt-1 tabular-nums">
                      {formatearPrecio(v.priceAmount, v.priceUnit)} · desde {formatearFecha(v.scheduledStart)}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>

      {/* Formularios de nuevas versiones */}
      <ProponerCondiciones
        modo={{
          tipo: formulario ?? "contrapropuesta",
          contractId: c.id,
          baseVersion: c.current.version,
        }}
        opciones={opciones}
        inicial={formulario === "modificacion" ? (c.agreed ?? c.current) : c.current}
        abierto={formulario !== null}
        onAbiertoChange={(a) => !a && setFormulario(null)}
      />

      {/* Confirmaciones */}
      <Dialog open={dialogo !== null} onOpenChange={(a) => !a && setDialogo(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          {dialogo === "aceptar" && pendiente && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {esModificacion ? "¿Aceptar la modificación?" : "¿Aceptar estas condiciones?"}
                </DialogTitle>
                <DialogDescription>
                  {esModificacion
                    ? "Pasarán a ser las condiciones acordadas. La versión anterior queda en el historial."
                    : `Al aceptar, la contratación con ${otra} queda confirmada con estas condiciones.`}
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-2xl bg-secondary p-4 text-sm">
                <dt className="font-bold">Precio</dt>
                <dd className="tabular-nums">{formatearPrecio(pendiente.priceAmount, pendiente.priceUnit)}</dd>
                <dt className="font-bold">Inicio</dt>
                <dd>{formatearFecha(pendiente.scheduledStart)}</dd>
                <dt className="font-bold">Versión</dt>
                <dd>{pendiente.version}</dd>
              </dl>
              <DialogFooter className="gap-2">
                <button type="button" onClick={() => setDialogo(null)} className={boton({ variante: "secundario" })}>
                  Volver
                </button>
                <Accion
                  ocupado={ocupado === "accept"}
                  onClick={() =>
                    void ejecutar("accept", { version: pendiente.version, contentHash: pendiente.contentHash }).then(
                      (ok) =>
                        ok &&
                        setAviso({
                          tipo: "ok",
                          texto: esModificacion
                            ? "Aceptaste la modificación."
                            : "¡Listo! La contratación quedó confirmada.",
                        }),
                    )
                  }
                >
                  Sí, aceptar
                </Accion>
              </DialogFooter>
            </>
          )}

          {(dialogo === "rechazar" || dialogo === "retirar") && pendiente && (
            <FormularioNota
              titulo={
                dialogo === "rechazar"
                  ? esModificacion
                    ? "¿Rechazar la modificación?"
                    : "¿Rechazar la propuesta?"
                  : esModificacion
                    ? "¿Retirar la modificación?"
                    : "¿Retirar tu propuesta?"
              }
              descripcion={
                esModificacion
                  ? "Seguirán vigentes las condiciones acordadas."
                  : dialogo === "rechazar"
                    ? `La negociación termina. Si quieres seguir, mejor propón cambios a ${otra}.`
                    : "La negociación termina. Podrás enviar una nueva propuesta desde la conversación."
              }
              etiquetaNota="Motivo (opcional)"
              obligatoria={false}
              textoBoton={dialogo === "rechazar" ? "Rechazar" : "Retirar"}
              ocupado={ocupado !== null}
              onCancelar={() => setDialogo(null)}
              onEnviar={(note) =>
                void ejecutar(dialogo === "rechazar" ? "reject" : "withdraw", { version: pendiente.version, note })
              }
            />
          )}

          {dialogo === "cancelar" && (
            <FormularioNota
              titulo="¿Cancelar la contratación?"
              descripcion={`Se avisará a ${otra}. La cancelación y su motivo quedan registrados.`}
              etiquetaNota="Motivo de la cancelación"
              obligatoria
              textoBoton="Cancelar contratación"
              ocupado={ocupado !== null}
              onCancelar={() => setDialogo(null)}
              onEnviar={(reason) => void ejecutar("cancel", { reason })}
            />
          )}

          {dialogo === "disputa" && (
            <FormularioDisputa
              motivos={motivos}
              ocupado={ocupado !== null}
              onCancelar={() => setDialogo(null)}
              onEnviar={(datos) =>
                void ejecutar("dispute", datos).then(
                  (ok) => ok && setAviso({ tipo: "ok", texto: "Registramos la disputa. El GAD revisará el caso." }),
                )
              }
            />
          )}

          {dialogo === "retirar-disputa" && (
            <>
              <DialogHeader>
                <DialogTitle>¿Retirar la disputa?</DialogTitle>
                <DialogDescription>
                  La contratación continúa donde estaba y el GAD ya no revisará el caso.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <button type="button" onClick={() => setDialogo(null)} className={boton({ variante: "secundario" })}>
                  Volver
                </button>
                <Accion ocupado={ocupado === "dispute"} onClick={() => void ejecutar("dispute", undefined, "DELETE")}>
                  Retirar disputa
                </Accion>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Accion({
  ocupado,
  onClick,
  destacado,
  children,
}: {
  ocupado: boolean;
  onClick: () => void;
  destacado?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      className={boton({ variante: destacado ? "claro" : "primario" })}
    >
      {ocupado && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

function estadoVersion(v: ContractVersion, c: ContractDetail): string {
  if (v.clientAcceptedAt && v.workerAcceptedAt) return v.id === c.agreed?.id ? "Acordada (vigente)" : "Acordada";
  if (v.rejectedAt) return "Rechazada";
  if (v.withdrawnAt) return "Retirada";
  if (v.id === c.pending?.id) return "Pendiente";
  return v.id === c.current.id ? "Sin acuerdo" : "Reemplazada";
}

function queSigue(c: ContractDetail): { titulo: string; texto: string; icono: ReactNode; destacado: boolean } {
  const otra = c.counterpartName;
  const p = c.pending;
  const icono = (n: ReactNode) => n;
  const vence = c.expiresAt ? ` Vence el ${formatearFechaHora(c.expiresAt)}` : "";
  if (p && !p.proposedByMe) {
    const mod = c.status !== "PROPUESTA_ENVIADA";
    return {
      titulo: mod ? `${otra} propone modificar lo acordado` : `${otra} te envió una propuesta`,
      texto: `Revisa la versión ${p.version}. Si estás de acuerdo, acéptala; si no, propón cambios o recházala.${vence}`,
      icono: icono(<FileText className="h-5 w-5" aria-hidden />),
      destacado: true,
    };
  }
  if (p) {
    return {
      titulo: `Esperando la respuesta de ${otra}`,
      texto: `Enviaste la versión ${p.version}. Te avisaremos cuando responda.${vence}`,
      icono: icono(<Clock className="h-5 w-5" aria-hidden />),
      destacado: false,
    };
  }
  switch (c.status) {
    case "CONTRATADA":
      return c.myRole === "TRABAJADOR"
        ? {
            titulo: "Contratación confirmada",
            texto: "Cuando empieces el trabajo, márcalo aquí para que el cliente lo sepa.",
            icono: <CheckCircle2 className="h-5 w-5" aria-hidden />,
            destacado: true,
          }
        : {
            titulo: "Contratación confirmada",
            texto: `${otra} marcará el inicio cuando empiece el trabajo. Coordinen los detalles por el chat.`,
            icono: <CheckCircle2 className="h-5 w-5" aria-hidden />,
            destacado: false,
          };
    case "EN_CURSO":
      return c.myRole === "TRABAJADOR"
        ? {
            titulo: "Trabajo en curso",
            texto: "Cuando termines, márcalo como terminado. El cliente confirmará la finalización.",
            icono: <Hammer className="h-5 w-5" aria-hidden />,
            destacado: true,
          }
        : {
            titulo: "Trabajo en curso",
            texto: `Cuando ${otra} termine, podrás confirmar la finalización. Si algo no está bien, repórtalo.`,
            icono: <Hammer className="h-5 w-5" aria-hidden />,
            destacado: false,
          };
    case "FINALIZACION_PENDIENTE":
      return c.myRole === "CLIENTE"
        ? {
            titulo: `${otra} marcó el trabajo como terminado`,
            texto: `Confirma que terminó${c.confirmDueAt ? ` antes del ${formatearFechaHora(c.confirmDueAt)}` : ""}; si no respondes, se confirmará automáticamente. Si hay un problema, repórtalo.`,
            icono: <CheckCircle2 className="h-5 w-5" aria-hidden />,
            destacado: true,
          }
        : {
            titulo: "Esperando la confirmación del cliente",
            texto: `${otra} debe confirmar la finalización${c.confirmDueAt ? `; si no responde, se confirmará sola el ${formatearFechaHora(c.confirmDueAt)}` : ""}.`,
            icono: <Clock className="h-5 w-5" aria-hidden />,
            destacado: false,
          };
    case "EN_DISPUTA":
      return {
        titulo: "Disputa en revisión",
        texto: c.disputedByMe
          ? "Reportaste un problema. El personal del GAD revisará el caso y les avisará. Si lo resolvieron entre ustedes, puedes retirar la disputa."
          : `${otra} reportó un problema. El personal del GAD revisará el caso y les avisará.`,
        icono: <ShieldAlert className="h-5 w-5" aria-hidden />,
        destacado: false,
      };
    case "FINALIZADA":
      return {
        titulo: "Contratación finalizada",
        texto: `Terminó el ${formatearFecha(c.completedAt)}${c.autoConfirmed ? " (confirmada automáticamente)" : ""}. Gracias por usar el portal.`,
        icono: <CheckCircle2 className="h-5 w-5" aria-hidden />,
        destacado: false,
      };
    case "CANCELADA":
      return {
        titulo: c.agreedAt ? "Contratación cancelada" : "Propuesta retirada",
        texto: `${c.cancelledByMe ? "La cancelaste" : "Se canceló"} el ${formatearFecha(c.cancelledAt)}.${c.cancelReason ? ` Motivo: ${c.cancelReason}` : ""}`,
        icono: <XCircle className="h-5 w-5" aria-hidden />,
        destacado: false,
      };
    case "RECHAZADA":
      return {
        titulo: "Propuesta rechazada",
        texto: "La negociación terminó sin acuerdo. Pueden enviar una nueva propuesta desde la conversación.",
        icono: <XCircle className="h-5 w-5" aria-hidden />,
        destacado: false,
      };
    case "EXPIRADA":
      return {
        titulo: "Propuesta expirada",
        texto: "Venció sin respuesta. Pueden enviar una nueva propuesta desde la conversación.",
        icono: <Clock className="h-5 w-5" aria-hidden />,
        destacado: false,
      };
    default:
      return { titulo: "Contratación", texto: "", icono: null, destacado: false };
  }
}

function TarjetaVersion({
  v,
  titulo,
  otra,
  miRol,
  cambios = new Set(),
  resaltada,
  acordada,
}: {
  v: ContractVersion;
  titulo: string;
  otra: string;
  miRol: "CLIENTE" | "TRABAJADOR";
  cambios?: Set<string>;
  resaltada?: boolean;
  acordada?: boolean;
}) {
  const miAceptacion = miRol === "CLIENTE" ? v.clientAcceptedAt : v.workerAcceptedAt;
  const suAceptacion = miRol === "CLIENTE" ? v.workerAcceptedAt : v.clientAcceptedAt;
  const fila = (etiquetaCampo: string, icono: ReactNode, valor: ReactNode) => (
    <div className="flex gap-3 py-3">
      <span className="mt-0.5 text-primary">{icono}</span>
      <div className="min-w-0 flex-1">
        <dt className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          {etiquetaCampo}
          {cambios.has(etiquetaCampo) && (
            <span className="rounded-full bg-amarillo/40 px-2 py-0.5 text-[11px] font-extrabold text-foreground">
              Cambió
            </span>
          )}
        </dt>
        <dd className="mt-0.5 break-words whitespace-pre-wrap">{valor}</dd>
      </div>
    </div>
  );

  return (
    <section
      aria-label={`${titulo} (versión ${v.version})`}
      className={cn("panel p-5 sm:p-6", resaltada && "ring-2 ring-primary/40", acordada && "border-verde-fuerte/40")}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-extrabold">{titulo}</h2>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold">Versión {v.version}</span>
      </header>
      <p className="mt-1 text-sm text-muted-foreground">
        {v.proposedByMe ? "La enviaste tú" : `La envió ${otra}`} el {formatearFechaHora(v.createdAt)}
      </p>

      <dl className="mt-3 divide-y divide-border">
        {fila("Trabajo", <FileText className="h-5 w-5" aria-hidden />, v.description)}
        {v.serviceName && fila("Servicio", <Hammer className="h-5 w-5" aria-hidden />, v.serviceName)}
        {fila(
          "Precio",
          <Wallet className="h-5 w-5" aria-hidden />,
          <span className="text-lg font-extrabold tabular-nums">{formatearPrecio(v.priceAmount, v.priceUnit)}</span>,
        )}
        {fila(
          "Cuándo",
          <CalendarDays className="h-5 w-5" aria-hidden />,
          v.scheduledEnd
            ? `Del ${formatearFecha(v.scheduledStart)} al ${formatearFecha(v.scheduledEnd)}`
            : formatearFecha(v.scheduledStart),
        )}
        {(v.parishName || v.locationDetail) &&
          fila(
            "Dónde",
            <MapPin className="h-5 w-5" aria-hidden />,
            [v.locationDetail, v.parishName].filter(Boolean).join(" · "),
          )}
        {v.conditions && fila("Otras condiciones", <FileText className="h-5 w-5" aria-hidden />, v.conditions)}
      </dl>

      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <li className="flex items-center gap-2">
          {miAceptacion ? (
            <CheckCircle2 className="h-4 w-4 text-verde-fuerte" aria-hidden />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
          {miAceptacion ? `Aceptada por ti · ${formatearFechaHora(miAceptacion)}` : "Falta tu aceptación"}
        </li>
        <li className="flex items-center gap-2">
          {suAceptacion ? (
            <CheckCircle2 className="h-4 w-4 text-verde-fuerte" aria-hidden />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
          {suAceptacion
            ? `Aceptada por ${otra} · ${formatearFechaHora(suAceptacion)}`
            : `Falta la aceptación de ${otra}`}
        </li>
      </ul>
      {acordada && (
        <p className="mt-4 text-xs break-all text-muted-foreground">
          Código de verificación (SHA-256): <span className="font-mono">{v.contentHash}</span>
        </p>
      )}
    </section>
  );
}

function FormularioNota({
  titulo,
  descripcion,
  etiquetaNota,
  obligatoria,
  textoBoton,
  ocupado,
  onCancelar,
  onEnviar,
}: {
  titulo: string;
  descripcion: string;
  etiquetaNota: string;
  obligatoria: boolean;
  textoBoton: string;
  ocupado: boolean;
  onCancelar: () => void;
  onEnviar: (nota: string | undefined) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const nota = String(new FormData(e.currentTarget).get("nota") ?? "").trim();
    if (obligatoria && nota.length < 10) {
      setError("Explica el motivo (al menos 10 caracteres).");
      return;
    }
    onEnviar(nota || undefined);
  }
  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>{titulo}</DialogTitle>
        <DialogDescription>{descripcion}</DialogDescription>
      </DialogHeader>
      <div>
        <label htmlFor="nota" className={etiqueta}>
          {etiquetaNota}
        </label>
        <textarea
          id="nota"
          name="nota"
          rows={3}
          maxLength={500}
          required={obligatoria}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "nota-error" : undefined}
          className={cn(campo, "min-h-24 resize-y")}
        />
        {error && (
          <p id="nota-error" className="mt-1.5 text-sm font-semibold text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter className="gap-2">
        <button type="button" onClick={onCancelar} className={boton({ variante: "secundario" })}>
          Volver
        </button>
        <button type="submit" disabled={ocupado} className={boton({ variante: "peligro" })}>
          {ocupado && <Loader2 className="animate-spin" aria-hidden />}
          {textoBoton}
        </button>
      </DialogFooter>
    </form>
  );
}

function FormularioDisputa({
  motivos,
  ocupado,
  onCancelar,
  onEnviar,
}: {
  motivos: { code: string; label: string }[];
  ocupado: boolean;
  onCancelar: () => void;
  onEnviar: (datos: { reasonCode: string; description: string }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const description = String(fd.get("description") ?? "").trim();
    if (description.length < 20) {
      setError("Describe el problema (al menos 20 caracteres).");
      return;
    }
    onEnviar({ reasonCode: String(fd.get("reasonCode")), description });
  }
  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Reportar un problema</DialogTitle>
        <DialogDescription>
          Se abre una disputa: la contratación queda en pausa y el personal del GAD revisará el caso. Intenta primero
          resolverlo por el chat.
        </DialogDescription>
      </DialogHeader>
      <fieldset className="space-y-2">
        <legend className={etiqueta}>¿Qué pasó?</legend>
        {motivos.map((m, i) => (
          <label
            key={m.code}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <input
              type="radio"
              name="reasonCode"
              value={m.code}
              defaultChecked={i === 0}
              className="h-5 w-5 accent-primary"
            />
            {m.label}
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor="disputa-detalle" className={etiqueta}>
          Cuéntanos qué pasó
        </label>
        <textarea
          id="disputa-detalle"
          name="description"
          rows={4}
          maxLength={1000}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "disputa-error" : "disputa-ayuda"}
          className={cn(campo, "min-h-28 resize-y")}
        />
        {error ? (
          <p id="disputa-error" className="mt-1.5 text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : (
          <p id="disputa-ayuda" className={ayuda}>
            No incluyas datos bancarios ni contraseñas.
          </p>
        )}
      </div>
      <DialogFooter className="gap-2">
        <button type="button" onClick={onCancelar} className={boton({ variante: "secundario" })}>
          Volver
        </button>
        <button type="submit" disabled={ocupado} className={boton({ variante: "peligro" })}>
          {ocupado && <Loader2 className="animate-spin" aria-hidden />}
          Abrir disputa
        </button>
      </DialogFooter>
    </form>
  );
}
