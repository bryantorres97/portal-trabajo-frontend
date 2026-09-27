import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, LogOut, ShieldCheck } from "lucide-react";

import { Aviso } from "@/components/admin/AdminHeader";
import { Logo } from "@/components/site/Logo";
import { boton } from "@/components/ui/boton";
import { isStaffAuthConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";
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

/** Pantalla de ingreso del personal del GAD con Microsoft Entra ID (ADR-012). Sin el marco del portal. */
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
    <div className="flex min-h-screen flex-col bg-background">
      <div className="h-1 w-full barra-marca" />
      <main id="contenido" className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="hidden flex-col justify-between superficie p-10 lg:flex xl:p-14" aria-hidden>
          <Logo className="text-3xl" />
          <div className="max-w-md">
            <p className="font-display text-4xl leading-[1.1] font-extrabold tracking-tight text-balance">
              Registro, capacitación y habilitación de trabajadores de oficio.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Herramienta interna del GAD Municipalidad de Ambato para el personal de los puntos de atención.
            </p>
          </div>
          <Image
            src="/images/logos/gad-ambato-logo.png"
            alt=""
            width={400}
            height={125}
            className="h-12 w-auto self-start"
            priority
          />
        </section>

        <div className="flex flex-col px-4 py-8 sm:px-8 lg:justify-center lg:px-16">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-10 flex items-center justify-between gap-4 lg:hidden">
              <Logo />
              <Image
                src="/images/logos/gad-ambato-logo.png"
                alt="GAD Municipalidad de Ambato"
                width={400}
                height={125}
                className="h-8 w-auto"
                priority
              />
            </div>

            <h1 className="text-[2rem] leading-tight font-extrabold sm:text-4xl">Ingreso del personal</h1>
            <p className="mt-3 text-base text-muted-foreground">
              El panel administrativo es solo para funcionarios del GAD, con su cuenta institucional de Microsoft 365.
            </p>

            {(mensaje || sinRoles) && (
              <Aviso tipo="error" className="mt-6">
                {mensaje ?? mensajesError.sin_permisos}
              </Aviso>
            )}

            <div className="mt-8">
              {sinRoles ? (
                <div className="tarjeta p-5">
                  <p className="text-sm">
                    Ingresaste como <span className="font-bold">{auth.user.email ?? auth.user.displayName}</span>.
                  </p>
                  <form action="/api/auth/logout" method="post" className="mt-4">
                    <button type="submit" className={boton({ variante: "secundario" })}>
                      <LogOut aria-hidden /> Cerrar sesión
                    </button>
                  </form>
                </div>
              ) : isStaffAuthConfigured() ? (
                <>
                  <a
                    href={`/api/auth/staff/login?returnTo=${encodeURIComponent(destino)}`}
                    className={cn(boton({ tamano: "lg" }), "w-full")}
                  >
                    <Building2 aria-hidden /> Ingresar con cuenta institucional
                  </a>
                  {auth && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Tienes abierta una sesión ciudadana; al ingresar con tu cuenta institucional se cerrará.
                    </p>
                  )}
                </>
              ) : (
                <p className="tarjeta p-5 text-sm text-muted-foreground">
                  El ingreso del personal estará disponible próximamente.
                </p>
              )}
              <p className="mt-5 flex gap-2.5 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-verde-fuerte" aria-hidden />
                Se usa el inicio de sesión de Microsoft del GAD, con verificación en dos pasos.
              </p>
            </div>

            <Link
              href="/"
              className="mt-12 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Ir al portal ciudadano
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
