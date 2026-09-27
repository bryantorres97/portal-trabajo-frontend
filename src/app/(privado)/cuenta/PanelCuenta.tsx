import Link from "next/link";
import {
  Bell,
  ChevronRight,
  FileSignature,
  HardHat,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";

import { AccesoMensajes } from "@/components/chat/AccesoMensajes";
import { EstadoTrabajador } from "@/components/admin/EstadoTrabajador";
import { ActionForm } from "@/components/forms/ActionForm";
import { Avatar } from "@/components/site/WorkerCard";
import { boton } from "@/components/ui/boton";
import { describirDispositivo, etiquetaProveedor, formatearFechaHora, formatearMomento } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import type { WorkerStatus } from "@/server/domain/workers/state-machine";

import {
  cerrarSesion,
  cerrarTodasLasSesiones,
  desvincularIdentidad,
  guardarPerfil,
  marcarNotificacionesLeidas,
} from "./actions";
import { ProfileForm } from "./ProfileForm";

export type DatosPanelCuenta = {
  nombre: string | null;
  email: string | null;
  esTrabajador: boolean;
  esPersonal: boolean;
  perfil: { fullName: string; phone: string; sector: string };
  perfilCompleto: boolean;
  trabajador: { status: WorkerStatus; displayName: string } | null;
  contrataciones: { activas: number; porResponder: number };
  notificaciones: {
    unread: number;
    items: {
      id: number;
      title: string;
      body: string | null;
      link: string | null;
      readAt: string | null;
      createdAt: string;
    }[];
  };
  identidades: {
    id: number;
    provider: string;
    email: string | null;
    lastLoginAt: string | null;
    enUso: boolean;
  }[];
  sesiones: { id: string; userAgent: string | null; createdAt: string; current: boolean }[];
  vincular: { href: string; etiqueta: string }[];
};

function Bloque({
  id,
  titulo,
  icono,
  children,
}: {
  id: string;
  titulo: string;
  icono: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="panel p-5 sm:p-6">
      <h2 id={id} className="flex items-center gap-2.5 text-xl font-extrabold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary">{icono}</span>
        {titulo}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Espacio personal del ciudadano: accesos principales, datos, notificaciones y seguridad. */
export function PanelCuenta({ d }: { d: DatosPanelCuenta }) {
  const saludo = d.nombre?.split(/\s+/)[0];
  return (
    <div className="px-4 pt-8 pb-4 sm:px-6 lg:pt-12">
      <header className="flex items-center gap-4">
        <Avatar nombre={d.nombre ?? "Usuario"} className="h-16 w-16 rounded-3xl text-xl sm:h-20 sm:w-20 sm:text-2xl" />
        <div className="min-w-0">
          <h1 className="text-3xl leading-tight font-extrabold sm:text-4xl">Hola{saludo ? `, ${saludo}` : ""}</h1>
          <p className="mt-1 truncate text-muted-foreground">{d.email ?? "Sin correo verificado"}</p>
        </div>
      </header>

      {!d.perfilCompleto && (
        <p className="mt-6 flex items-start gap-3 rounded-2xl bg-amarillo/20 p-4 text-sm">
          <UserRound className="h-5 w-5 shrink-0" aria-hidden />
          <span>
            <strong>Completa tu nombre</strong> para que los trabajadores sepan con quién conversan.{" "}
            <a href="#tus-datos" className="font-bold text-primary underline underline-offset-4">
              Completar ahora
            </a>
          </span>
        </p>
      )}

      <nav aria-label="Accesos" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AccesoMensajes />
        <Acceso
          href="/contrataciones"
          icono={<FileSignature className="h-6 w-6" aria-hidden />}
          titulo="Mis contrataciones"
          detalle={
            d.contrataciones.porResponder > 0 ? (
              <span className="font-bold text-primary">
                {d.contrataciones.porResponder === 1
                  ? "1 espera tu respuesta"
                  : `${d.contrataciones.porResponder} esperan tu respuesta`}
              </span>
            ) : d.contrataciones.activas > 0 ? (
              `${d.contrataciones.activas} ${d.contrataciones.activas === 1 ? "activa" : "activas"}`
            ) : (
              "Tus acuerdos por escrito"
            )
          }
        />
        <Acceso
          href="/buscar"
          icono={<Search className="h-6 w-6" aria-hidden />}
          titulo="Buscar trabajadores"
          detalle="Habilitados por el GAD"
        />
        <Acceso
          href="/cuenta/trabajador"
          icono={<HardHat className="h-6 w-6" aria-hidden />}
          titulo={d.trabajador ? "Mi perfil de trabajador" : "Soy trabajador"}
          detalle={d.trabajador ? <EstadoTrabajador status={d.trabajador.status} /> : "Vincula tu cuenta con tu código"}
        />
      </nav>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="space-y-6">
          <Bloque id="notificaciones" titulo="Notificaciones" icono={<Bell className="h-5 w-5" aria-hidden />}>
            {d.notificaciones.items.length === 0 ? (
              <p className="text-muted-foreground">No tienes notificaciones. Aquí te avisaremos cuando te escriban.</p>
            ) : (
              <>
                <ul className="-mx-2 space-y-1">
                  {d.notificaciones.items.map((n) => (
                    <li key={n.id}>
                      <Link
                        href={n.link ?? "/cuenta"}
                        className={cn(
                          "flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-secondary",
                          !n.readAt && "bg-primary/5",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-2 h-2 w-2 shrink-0 rounded-full",
                            n.readAt ? "bg-transparent" : "bg-primary",
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block", n.readAt ? "font-semibold" : "font-extrabold")}>
                            {n.title}
                            {!n.readAt && <span className="sr-only"> (sin leer)</span>}
                          </span>
                          {n.body && <span className="block truncate text-sm text-muted-foreground">{n.body}</span>}
                        </span>
                        <time dateTime={n.createdAt} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatearMomento(n.createdAt)}
                        </time>
                      </Link>
                    </li>
                  ))}
                </ul>
                {d.notificaciones.unread > 0 && (
                  <ActionForm
                    action={marcarNotificacionesLeidas}
                    submitLabel="Marcar todas como leídas"
                    variant="secondary"
                    className="mt-4"
                  >
                    {null}
                  </ActionForm>
                )}
              </>
            )}
          </Bloque>

          <div id="tus-datos" className="scroll-mt-28">
            <Bloque id="titulo-datos" titulo="Tus datos" icono={<UserRound className="h-5 w-5" aria-hidden />}>
              <ProfileForm action={guardarPerfil} initial={d.perfil} />
            </Bloque>
          </div>
        </div>

        <div className="space-y-6">
          <Bloque id="formas-ingreso" titulo="Formas de ingreso" icono={<KeyRound className="h-5 w-5" aria-hidden />}>
            <p className="text-sm text-muted-foreground">
              Si entras de distintas maneras (usuario y contraseña, Google…), vincúlalas para usar siempre esta cuenta.
            </p>
            <ul className="mt-4 divide-y divide-border/70">
              {d.identidades.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {etiquetaProveedor(i.provider)}
                      {i.enUso && (
                        <span className="ml-2 rounded-full bg-verde/15 px-2 py-0.5 text-xs font-semibold text-verde-fuerte">
                          en uso
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {i.email ?? "sin correo"} · último ingreso {formatearFechaHora(i.lastLoginAt)}
                    </p>
                  </div>
                  {!i.enUso && d.identidades.length > 1 && (
                    <ActionForm
                      action={desvincularIdentidad}
                      submitLabel="Quitar"
                      pendingLabel="Quitando…"
                      variant="secondary"
                      className="space-y-0"
                    >
                      <input type="hidden" name="identityId" value={i.id} />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            {d.vincular.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {d.vincular.map((v) => (
                  <a key={v.href} href={v.href} className={boton({ variante: "secundario", tamano: "sm" })}>
                    {v.etiqueta}
                  </a>
                ))}
              </div>
            )}
          </Bloque>

          <Bloque id="sesiones" titulo="Dispositivos" icono={<MonitorSmartphone className="h-5 w-5" aria-hidden />}>
            <ul className="divide-y divide-border/70">
              {d.sesiones.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {describirDispositivo(s.userAgent)}
                      {s.current && (
                        <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                          este dispositivo
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Desde {formatearFechaHora(s.createdAt)}</p>
                  </div>
                  {!s.current && (
                    <ActionForm
                      action={cerrarSesion}
                      submitLabel="Cerrar"
                      pendingLabel="…"
                      variant="secondary"
                      className="space-y-0"
                    >
                      <input type="hidden" name="sessionId" value={s.id} />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4">
              <form action="/api/auth/logout" method="post">
                <button type="submit" className={cn(boton({ variante: "secundario" }), "w-full")}>
                  <LogOut aria-hidden /> Cerrar sesión
                </button>
              </form>
              <ActionForm
                action={cerrarTodasLasSesiones}
                submitLabel="Cerrar sesión en todos los dispositivos"
                pendingLabel="Cerrando…"
                variant="danger"
                className="space-y-2"
                silentSuccess
              >
                <p className="text-xs text-muted-foreground">
                  Úsalo si perdiste un celular o usaste un equipo prestado.
                </p>
              </ActionForm>
            </div>
          </Bloque>

          {d.esPersonal && (
            <Link href="/admin" className={cn(boton({ variante: "suave" }), "w-full")}>
              <ShieldCheck aria-hidden /> Panel administrativo
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Acceso({
  href,
  icono,
  titulo,
  detalle,
}: {
  href: string;
  icono: ReactNode;
  titulo: string;
  detalle: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 panel rounded-3xl p-5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevada)]"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">{icono}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold">{titulo}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{detalle}</span>
      </span>
      <ChevronRight
        className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
