import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminHeader, Bloque, EstadoUsuario } from "@/components/admin/AdminHeader";
import { ActionForm } from "@/components/forms/ActionForm";
import { campoCompacto, etiqueta } from "@/components/ui/campo";
import { etiquetaProveedor, etiquetaRol, formatearFechaHora } from "@/lib/formatos";
import { hasPermission } from "@/server/auth/authorize";
import { requirePagePermission } from "@/server/auth/current-user";
import { DomainError } from "@/server/errors";
import { getUserDetail, listInternalRoles } from "@/server/users/admin";

import { asignarRol, cambiarEstado, revocarRol } from "../actions";

export const metadata: Metadata = { title: "Detalle de usuario · Panel GAD" };

export default async function UsuarioDetallePage({ params }: PageProps<"/admin/usuarios/[id]">) {
  const { id } = await params;
  const actor = await requirePagePermission("user.read", `/admin/usuarios/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();

  const detalle = await getUserDetail(actor, id).catch((e) => {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  });
  const puedeRoles = hasPermission(actor, "role.manage");
  const puedeBloquear = hasPermission(actor, "user.block") && actor.id !== detalle.id;
  const rolesInternos = puedeRoles ? await listInternalRoles() : [];
  const asignables = rolesInternos.filter((r) => !detalle.roles.includes(r.code));
  const esInterno = detalle.roles.some((r) => r !== "CLIENTE" && r !== "TRABAJADOR");

  return (
    <>
      <AdminHeader
        migas={[{ href: "/admin/usuarios", label: "Usuarios" }, { label: detalle.displayName ?? "Usuario" }]}
        titulo={detalle.displayName ?? "Usuario sin nombre"}
        descripcion={detalle.email ?? "Sin correo verificado"}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Bloque titulo="Datos de la cuenta">
          <dl className="grid gap-x-6 gap-y-3.5 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Estado</dt>
              <dd className="mt-1">
                <EstadoUsuario status={detalle.status} />
                {detalle.blockedReason && <p className="mt-1 text-sm text-muted-foreground">{detalle.blockedReason}</p>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Alta</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{formatearFechaHora(detalle.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Último ingreso</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{formatearFechaHora(detalle.lastLoginAt)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Formas de ingreso</dt>
              <dd className="mt-0.5 font-semibold">
                {detalle.identities.map((i) => etiquetaProveedor(i.provider)).join(", ") || "—"}
              </dd>
            </div>
          </dl>
        </Bloque>

        <Bloque titulo="Roles">
          <div className="space-y-4">
            <ul className="-my-2 divide-y divide-border/70">
              {detalle.roles.map((rol) => {
                const interno = rolesInternos.some((r) => r.code === rol);
                return (
                  <li key={rol} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm font-bold">{etiquetaRol(rol)}</span>
                    {puedeRoles && interno && (
                      <ActionForm
                        action={revocarRol}
                        submitLabel="Revocar"
                        pendingLabel="…"
                        variant="secondary"
                        tamano="sm"
                        className="flex items-center gap-2 space-y-0"
                      >
                        <input type="hidden" name="userId" value={detalle.id} />
                        <input type="hidden" name="roleCode" value={rol} />
                      </ActionForm>
                    )}
                  </li>
                );
              })}
            </ul>
            {puedeRoles && !detalle.isStaff && (
              <p className="text-xs text-muted-foreground">
                Es una cuenta ciudadana: los roles internos solo se asignan a cuentas institucionales (Microsoft). La
                persona debe ingresar primero en /admin/ingresar con su cuenta del GAD.
              </p>
            )}
            {puedeRoles && detalle.isStaff && detalle.status === "ACTIVO" && asignables.length > 0 && (
              <ActionForm action={asignarRol} submitLabel="Asignar rol" pendingLabel="Asignando…">
                <input type="hidden" name="userId" value={detalle.id} />
                <label htmlFor="roleCode" className={etiqueta}>
                  Asignar un rol interno
                </label>
                <select id="roleCode" name="roleCode" className={campoCompacto} required>
                  {asignables.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </ActionForm>
            )}
            {!puedeRoles && (
              <p className="text-xs text-muted-foreground">Solo un administrador del sistema puede cambiar roles.</p>
            )}
          </div>
        </Bloque>
      </div>

      {puedeBloquear && detalle.status !== "ELIMINADO" && (
        <Bloque
          titulo={detalle.status === "BLOQUEADO" ? "Desbloquear cuenta" : "Bloquear cuenta"}
          className="mt-6 max-w-2xl"
        >
          <div>
            {detalle.status === "ACTIVO" ? (
              esInterno && !puedeRoles ? (
                <p className="text-sm text-muted-foreground">
                  Esta cuenta tiene roles internos: solo un administrador del sistema puede bloquearla.
                </p>
              ) : (
                <ActionForm
                  action={cambiarEstado}
                  submitLabel="Bloquear cuenta"
                  pendingLabel="Bloqueando…"
                  variant="danger"
                >
                  <input type="hidden" name="userId" value={detalle.id} />
                  <input type="hidden" name="status" value="BLOQUEADO" />
                  <label htmlFor="reason" className={etiqueta}>
                    Motivo (queda registrado en la auditoría)
                  </label>
                  <textarea
                    id="reason"
                    name="reason"
                    required
                    minLength={5}
                    maxLength={500}
                    rows={3}
                    className={campoCompacto}
                  />
                  <p className="text-xs text-muted-foreground">
                    El bloqueo cierra de inmediato todas las sesiones de la cuenta.
                  </p>
                </ActionForm>
              )
            ) : (
              <ActionForm action={cambiarEstado} submitLabel="Desbloquear cuenta" pendingLabel="Desbloqueando…">
                <input type="hidden" name="userId" value={detalle.id} />
                <input type="hidden" name="status" value="ACTIVO" />
                <label htmlFor="reason" className={etiqueta}>
                  Observación (opcional)
                </label>
                <textarea id="reason" name="reason" maxLength={500} rows={2} className={campoCompacto} />
              </ActionForm>
            )}
          </div>
        </Bloque>
      )}
    </>
  );
}
