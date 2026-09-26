import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AdminHeader, EstadoUsuario } from "@/components/admin/AdminHeader";
import { ActionForm } from "@/components/forms/ActionForm";
import { Section } from "@/components/site/SiteShell";
import { etiquetaProveedor, etiquetaRol, formatearFechaHora } from "@/lib/formatos";
import { hasPermission } from "@/server/auth/authorize";
import { requirePagePermission } from "@/server/auth/current-user";
import { DomainError } from "@/server/errors";
import { getUserDetail, listInternalRoles } from "@/server/users/admin";

import { asignarRol, cambiarEstado, revocarRol } from "../actions";

export const metadata: Metadata = { title: "Detalle de usuario · Panel GAD" };

const campo =
  "mt-1 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";

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

      <div className="grid gap-2 lg:grid-cols-2">
        <Section titulo="Datos de la cuenta">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 tarjeta p-5 text-sm">
            <dt className="text-muted-foreground">Estado</dt>
            <dd>
              <EstadoUsuario status={detalle.status} />
              {detalle.blockedReason && <p className="mt-1 text-xs text-muted-foreground">{detalle.blockedReason}</p>}
            </dd>
            <dt className="text-muted-foreground">Alta</dt>
            <dd>{formatearFechaHora(detalle.createdAt)}</dd>
            <dt className="text-muted-foreground">Último ingreso</dt>
            <dd>{formatearFechaHora(detalle.lastLoginAt)}</dd>
            <dt className="text-muted-foreground">Formas de ingreso</dt>
            <dd>{detalle.identities.map((i) => etiquetaProveedor(i.provider)).join(", ") || "—"}</dd>
          </dl>
        </Section>

        <Section titulo="Roles">
          <div className="space-y-4 tarjeta p-5">
            <ul className="divide-y divide-border">
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
                <label htmlFor="roleCode" className="text-sm font-bold">
                  Asignar un rol interno
                </label>
                <select id="roleCode" name="roleCode" className={campo} required>
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
        </Section>
      </div>

      {puedeBloquear && detalle.status !== "ELIMINADO" && (
        <Section titulo={detalle.status === "BLOQUEADO" ? "Desbloquear cuenta" : "Bloquear cuenta"}>
          <div className="tarjeta p-5">
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
                  <label htmlFor="reason" className="text-sm font-bold">
                    Motivo (queda registrado en la auditoría)
                  </label>
                  <textarea
                    id="reason"
                    name="reason"
                    required
                    minLength={5}
                    maxLength={500}
                    rows={3}
                    className={campo}
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
                <label htmlFor="reason" className="text-sm font-bold">
                  Observación (opcional)
                </label>
                <textarea id="reason" name="reason" maxLength={500} rows={2} className={campo} />
              </ActionForm>
            )}
          </div>
        </Section>
      )}
    </>
  );
}
