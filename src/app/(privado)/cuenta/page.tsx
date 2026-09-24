import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, LogIn, LogOut, ShieldCheck, UserRound } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { isAuthConfigured } from "@/lib/env";
import { hasPermission } from "@/server/auth/authorize";
import { enabledIdentityProviders } from "@/server/auth/cognito";
import { getCurrentUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Mi cuenta" };

const mensajesError: Record<string, string> = {
  auth_no_configurada:
    "El inicio de sesión aún no está configurado en este ambiente. Consulta docs/setup/cognito-dev.md.",
  login_cancelado: "Se canceló el inicio de sesión.",
  login_invalido: "La solicitud de inicio de sesión expiró o no es válida. Inténtalo de nuevo.",
  login_fallido: "No pudimos completar el inicio de sesión. Inténtalo de nuevo en unos minutos.",
  cuenta_bloqueada: "Tu cuenta no está activa. Comunícate con el GAD Municipalidad de Ambato.",
  forbidden: "No tienes permisos para acceder a esa sección.",
};

export default async function CuentaPage({ searchParams }: PageProps<"/cuenta">) {
  const { error } = await searchParams;
  const mensaje = typeof error === "string" ? mensajesError[error] : undefined;
  const user = await getCurrentUser();

  return (
    <>
      <PageHeader
        eyebrow="Mi cuenta"
        titulo={user ? `Hola${user.displayName ? `, ${user.displayName}` : ""}` : "Ingresa a Acolita.App"}
        descripcion={
          user
            ? "Desde aquí podrás gestionar tu perfil, tus conversaciones y tus contrataciones."
            : "Inicia sesión o crea tu cuenta para contactar trabajadores y gestionar tus contrataciones."
        }
      />

      {mensaje && (
        <Section>
          <p role="alert" className="flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
            <span>{mensaje}</span>
          </p>
        </Section>
      )}

      <Section>
        {user ? (
          <div className="space-y-4 tarjeta p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-secondary">
                <UserRound className="h-6 w-6 text-primary" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold">{user.displayName ?? "Usuario"}</p>
                <p className="truncate text-sm text-muted-foreground">{user.email ?? "Correo no verificado"}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Roles</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {user.roles.map((rol) => (
                  <li key={rol} className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-bold">
                    {rol}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-3">
              {hasPermission(user, "admin.access") && (
                <Link
                  href="/admin"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden /> Panel administrativo
                </Link>
              )}
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold"
                >
                  <LogOut className="h-4 w-4" aria-hidden /> Cerrar sesión
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="tarjeta p-5">
            {isAuthConfigured() ? (
              <div className="flex flex-col gap-3 sm:max-w-sm">
                <a
                  href="/api/auth/login?returnTo=%2Fcuenta"
                  className="inline-flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-primary-foreground"
                >
                  <LogIn className="h-5 w-5" aria-hidden /> Ingresar o crear cuenta
                </a>
                {enabledIdentityProviders().map((proveedor) => (
                  <a
                    key={proveedor}
                    href={`/api/auth/login?proveedor=${proveedor}&returnTo=%2Fcuenta`}
                    className="inline-flex min-h-13 items-center justify-center rounded-2xl border border-border bg-card px-6 text-base font-bold"
                  >
                    Continuar con {proveedor}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">El inicio de sesión estará disponible próximamente.</p>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              El acceso usa el sistema de identidad ciudadana del GAD Municipalidad de Ambato.
            </p>
          </div>
        )}
      </Section>
    </>
  );
}
