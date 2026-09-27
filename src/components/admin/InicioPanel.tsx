import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileSearch,
  FileWarning,
  GraduationCap,
  ImageUp,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { AdminHeader, Aviso, Bloque } from "@/components/admin/AdminHeader";
import { modulosVisibles } from "@/components/admin/navegacion";
import { boton } from "@/components/ui/boton";
import { etiquetaRol } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import type { AppUser } from "@/server/auth/users";
import type { WorkerStatus } from "@/server/domain/workers/state-machine";
import type { ResumenTrabajadores } from "@/server/workers/admin";

type Pendiente = {
  titulo: string;
  detalle: string;
  icon: LucideIcon;
  cantidad: number;
  href: string;
  permiso: string;
};

function pendientes(r: ResumenTrabajadores): Pendiente[] {
  const e = r.porEstado;
  const docs = r.documentosPendientes;
  return [
    {
      titulo: "Registros por revisar",
      detalle: `Documentación enviada a revisión${docs ? ` · ${docs} documento${docs === 1 ? "" : "s"} sin validar` : ""}.`,
      icon: FileSearch,
      cantidad: e.PENDIENTE_REVISION,
      href: "/admin/trabajadores?estado=PENDIENTE_REVISION",
      permiso: "document.review",
    },
    {
      titulo: "Listos para habilitar",
      detalle: "Aprobaron la capacitación: revisa su perfil y habilítalos.",
      icon: ShieldCheck,
      cantidad: e.CAPACITACION_APROBADA,
      href: "/admin/trabajadores?estado=CAPACITACION_APROBADA",
      permiso: "worker.enable",
    },
    {
      titulo: "Por capacitar",
      detalle: "Por inscribir en un curso o con el curso en marcha.",
      icon: GraduationCap,
      cantidad: e.CAPACITACION_PENDIENTE + e.CAPACITACION_EN_PROCESO,
      href: "/admin/capacitacion",
      permiso: "training.record",
    },
    {
      titulo: "Fotos y descripciones por aprobar",
      detalle: "Cambios que los trabajadores enviaron desde su cuenta.",
      icon: ImageUp,
      cantidad: r.porRevisar,
      href: "/admin/trabajadores?revision=1",
      permiso: "worker.update",
    },
    {
      titulo: "Registrados sin documentos",
      detalle: "Carga sus documentos y envíalos a revisión.",
      icon: UserPlus,
      cantidad: e.REGISTRADO,
      href: "/admin/trabajadores?estado=REGISTRADO",
      permiso: "document.upload",
    },
    {
      titulo: "Documentación observada",
      detalle: "Documentos rechazados o incompletos que el trabajador debe corregir.",
      icon: FileWarning,
      cantidad: e.DOCUMENTACION_PENDIENTE,
      href: "/admin/trabajadores?estado=DOCUMENTACION_PENDIENTE",
      permiso: "document.upload",
    },
  ];
}

/** Etapas del proceso de habilitación, para la barra de distribución. */
const etapas: { etiqueta: string; estados: WorkerStatus[]; color: string; href?: string }[] = [
  {
    etiqueta: "En registro",
    estados: ["REGISTRADO", "DOCUMENTACION_PENDIENTE", "PENDIENTE_REVISION"],
    color: "bg-azul",
  },
  {
    etiqueta: "En capacitación",
    estados: ["CAPACITACION_PENDIENTE", "CAPACITACION_EN_PROCESO", "CAPACITACION_APROBADA"],
    color: "bg-amarillo",
  },
  {
    etiqueta: "Habilitados",
    estados: ["HABILITADO"],
    color: "bg-verde",
    href: "/admin/trabajadores?estado=HABILITADO",
  },
  {
    etiqueta: "Suspendidos",
    estados: ["SUSPENDIDO"],
    color: "bg-destructive",
    href: "/admin/trabajadores?estado=SUSPENDIDO",
  },
  { etiqueta: "Inactivos o rechazados", estados: ["INACTIVO", "RECHAZADO"], color: "bg-muted-foreground/40" },
];

/**
 * Portada del panel GAD: lo que está por atender según los permisos del funcionario.
 * `resumen` es null cuando el funcionario no consulta trabajadores.
 */
export function InicioPanel({
  user,
  resumen,
  error,
}: {
  user: Pick<AppUser, "displayName" | "roles" | "permissions">;
  resumen: ResumenTrabajadores | null;
  error?: string;
}) {
  const puede = (p: string) => user.permissions.includes(p);
  const veTrabajadores = puede("worker.read");
  const cola = resumen ? pendientes(resumen).filter((p) => puede(p.permiso)) : [];
  const nombre = (user.displayName ?? "").split(/\s+/)[0] || null;
  const accesos = modulosVisibles(user.permissions).filter((m) => m.href && m.href !== "/admin");

  return (
    <>
      <AdminHeader
        titulo={nombre ? `Hola, ${nombre}` : "Panel administrativo"}
        descripcion={user.roles.map(etiquetaRol).join(" · ") || undefined}
        acciones={
          puede("worker.create") && (
            <Link href="/admin/trabajadores/nuevo" className={boton()}>
              <Plus aria-hidden /> Registrar trabajador
            </Link>
          )
        }
      />

      {error === "forbidden" && (
        <Aviso tipo="error" className="mb-6">
          No tienes permisos para acceder a esa sección. Si la necesitas, pide el rol a un administrador del sistema.
        </Aviso>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {cola.length > 0 && <ColaPendientes cola={cola} />}
          {resumen && <Distribucion resumen={resumen} />}
          {!resumen && (
            <Bloque titulo="Tus secciones">
              <ListaAccesos accesos={accesos} />
            </Bloque>
          )}
        </div>

        <aside className="space-y-6">
          {veTrabajadores && (
            <Bloque titulo="Buscar un trabajador">
              <form role="search" action="/admin/trabajadores" className="flex gap-2">
                <label className="relative flex-1">
                  <span className="sr-only">Nombre, celular o correo</span>
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <input
                    type="search"
                    name="q"
                    maxLength={120}
                    placeholder={puede("worker.read.private") ? "Nombre o celular" : "Nombre público"}
                    className="min-h-11 w-full rounded-xl border border-input bg-card pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-ring/30 sm:text-sm"
                  />
                </label>
                <button type="submit" className={cn(boton({ tamano: "sm" }), "h-11")}>
                  Buscar
                </button>
              </form>
            </Bloque>
          )}
          {resumen && accesos.length > 1 && (
            <Bloque titulo="Secciones" cuerpo="px-2 pb-2 pt-1">
              <ListaAccesos accesos={accesos} />
            </Bloque>
          )}
        </aside>
      </div>
    </>
  );
}

function ColaPendientes({ cola }: { cola: Pendiente[] }) {
  const total = cola.reduce((s, p) => s + p.cantidad, 0);
  const ordenada = [...cola].sort((a, b) => Number(b.cantidad > 0) - Number(a.cantidad > 0));
  return (
    <Bloque
      titulo="Por atender"
      descripcion={total === 0 ? "Todo al día. No hay trámites esperando." : "Trámites que esperan una acción del GAD."}
      cuerpo="pt-3 pb-2"
    >
      <ul className="divide-y divide-border/70">
        {ordenada.map((p) => {
          const vacio = p.cantidad === 0;
          return (
            <li key={p.titulo}>
              <Link
                href={p.href}
                className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-secondary/50"
              >
                <span
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                    vacio ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  <p.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block font-bold", vacio && "text-muted-foreground")}>{p.titulo}</span>
                  <span className="block text-sm text-muted-foreground">{p.detalle}</span>
                </span>
                {vacio ? (
                  <span className="flex items-center gap-1 text-sm font-semibold text-verde-fuerte">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Al día</span>
                    <span className="sr-only sm:hidden">Al día</span>
                  </span>
                ) : (
                  <span className="min-w-8 text-right font-display text-2xl leading-none font-extrabold tabular-nums">
                    {p.cantidad}
                  </span>
                )}
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Bloque>
  );
}

function Distribucion({ resumen }: { resumen: ResumenTrabajadores }) {
  const filas = etapas.map((e) => ({ ...e, cantidad: e.estados.reduce((s, x) => s + resumen.porEstado[x], 0) }));
  const total = filas.reduce((s, f) => s + f.cantidad, 0);
  return (
    <Bloque
      titulo="Trabajadores registrados"
      descripcion={
        total === 0
          ? "Todavía no hay trabajadores registrados."
          : `${total} en total · ${resumen.porEstado.HABILITADO} visibles en la búsqueda pública.`
      }
      acciones={
        <Link
          href="/admin/trabajadores"
          className="inline-flex min-h-10 items-center gap-1 text-sm font-bold text-primary hover:underline"
        >
          Ver todos <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      }
    >
      {total > 0 && (
        <>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
            {filas
              .filter((f) => f.cantidad > 0)
              .map((f) => (
                <span key={f.etiqueta} className={f.color} style={{ width: `${(f.cantidad / total) * 100}%` }} />
              ))}
          </div>
          <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {filas.map((f) => {
              const contenido = (
                <>
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", f.color)} aria-hidden />
                  <span className="flex-1">{f.etiqueta}</span>
                  <span className="font-bold tabular-nums">{f.cantidad}</span>
                </>
              );
              return (
                <li key={f.etiqueta}>
                  {f.href ? (
                    <Link
                      href={f.href}
                      className="-mx-2 flex min-h-9 items-center gap-2.5 rounded-lg px-2 text-sm transition-colors hover:bg-secondary/60"
                    >
                      {contenido}
                    </Link>
                  ) : (
                    <span className="flex min-h-9 items-center gap-2.5 text-sm">{contenido}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Bloque>
  );
}

function ListaAccesos({ accesos }: { accesos: ReturnType<typeof modulosVisibles> }) {
  return (
    <ul>
      {accesos.map((m) => (
        <li key={m.titulo}>
          {m.href ? (
            <Link
              href={m.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/60"
            >
              <m.icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{m.titulo}</span>
                <span className="block text-xs text-muted-foreground">{m.detalle}</span>
              </span>
            </Link>
          ) : (
            <span className="flex items-center gap-3 px-3 py-2.5 text-muted-foreground">
              <m.icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{m.titulo}</span>
                <span className="block text-xs">Disponible en la {m.fase}</span>
              </span>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
