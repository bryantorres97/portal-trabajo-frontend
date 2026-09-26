import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, Building2, LogOut, ShieldCheck } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { isStaffAuthConfigured } from "@/lib/env";
import { hasPermission } from "@/server/auth/authorize";
import { getCurrentAuth } from "@/server/auth/current-user";
import { safeReturnTo } from "@/server/http/request-info";

export const metadata: Metadata = { title: "Ingreso del personal · Panel GAD" };

const mensajesError: Record<string, string> = {
  no_configurado: "El ingreso del personal aún no está configurado en este ambiente. Consulta docs/setup/entra-dev.md.",
  login_cancelado: "Se canceló el inicio de sesión.",
  acceso_denegado:
    "Microsoft no autorizó el ingreso. Verifica que tu cuenta tenga acceso a esta aplicación y que completaste la verificación en dos pasos.",
  login_invalido: "La solicitud de inicio de sesión expiró o no es válida. Inténtalo de nuevo.",
  login_fallido: "No pudimos completar el inicio de sesión. Inténtalo de nuevo en unos minutos.",
  cuenta_bloqueada: "Tu cuenta está bloqueada en el portal. Comunícate con el administrador del sistema.",
  cuenta_externa:
    "Solo las cuentas institucionales del GAD pueden ingresar al panel. Las cuentas personales o invitadas no tienen acceso.",
  cuenta_ciudadana:
    "El panel administrativo requiere tu cuenta institucional de Microsoft. Las cuentas ciudadanas no tienen acceso al panel.",
  sin_permisos:
    "Tu cuenta institucional todavía no tiene roles en el portal. Pide a un administrador del sistema que te los asigne.",
};

/** Pantalla de ingreso del personal del GAD con Microsoft Entra ID (ADR-012). */
export default async function IngresoPersonalPage({ searchParams }: PageProps<"/admin/ingresar">) {
  const { error, returnTo } = await searchParams;
  const destino = safeReturnTo(typeof returnTo === "string" ? returnTo : null, "/admin");
  const auth = await getCurrentAuth();
  const esPersonal = auth?.source === "ENTRA";

  if (esPersonal && hasPermission(auth.user, "admin.access"))
    redirect(destino.startsWith("/admin") ? destino : "/admin");

  const mensaje = typeof error === "string" ? mensajesError[error] : undefined;
  const sinRoles = esPersonal && !hasPermission(auth.user, "admin.access");

  return (
    <>
      <PageHeader
        eyebrow="GAD Municipalidad de Ambato"
        titulo="Ingreso del personal"
        descripcion="El panel administrativo es solo para funcionarios del GAD, con su cuenta institucional de Microsoft 365."
      />

      {(mensaje || sinRoles) && (
        <Section>
          <p role="alert" className="flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <span>{mensaje ?? mensajesError.sin_permisos}</span>
          </p>
        </Section>
      )}

      <Section>
        <div className="tarjeta p-5 sm:max-w-md">
          {sinRoles ? (
            <>
              <p className="text-sm">
                Ingresaste como <span className="font-bold">{auth.user.email ?? auth.user.displayName}</span>.
              </p>
              <form action="/api/auth/logout" method="post" className="mt-4">
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold"
                >
                  <LogOut className="h-4 w-4" aria-hidden /> Cerrar sesión
                </button>
              </form>
            </>
          ) : isStaffAuthConfigured() ? (
            <>
              <a
                href={`/api/auth/staff/login?returnTo=${encodeURIComponent(destino)}`}
                className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-primary-foreground"
              >
                <Building2 className="h-5 w-5" aria-hidden /> Ingresar con cuenta institucional
              </a>
              {auth && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Tienes abierta una sesión ciudadana; al ingresar con tu cuenta institucional se cerrará.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">El ingreso del personal estará disponible próximamente.</p>
          )}
          <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
            Se usa el inicio de sesión de Microsoft del GAD, con verificación en dos pasos.
          </p>
        </div>
      </Section>
    </>
  );
}
