import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  LogIn,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { ActionForm } from "@/components/forms/ActionForm";
import { PageHeader, Section } from "@/components/site/SiteShell";
import { isAuthConfigured } from "@/lib/env";
import { describirDispositivo, etiquetaProveedor, etiquetaRol, formatearFechaHora } from "@/lib/formatos";
import { hasPermission } from "@/server/auth/authorize";
import { enabledIdentityProviders } from "@/server/auth/cognito";
import { getCurrentAuth, type CurrentAuth } from "@/server/auth/current-user";
import { listActiveSessions } from "@/server/auth/session";
import { getPendingConsents } from "@/server/users/consents";
import { listIdentities } from "@/server/users/identities";
import { getClientProfile } from "@/server/users/profile";

import { cerrarSesion, cerrarTodasLasSesiones, desvincularIdentidad, guardarPerfil } from "./actions";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Mi cuenta" };

const mensajesError: Record<string, string> = {
  auth_no_configurada:
    "El inicio de sesión aún no está configurado en este ambiente. Consulta docs/setup/cognito-dev.md.",
  login_cancelado: "Se canceló el inicio de sesión.",
  login_invalido: "La solicitud de inicio de sesión expiró o no es válida. Inténtalo de nuevo.",
  login_fallido: "No pudimos completar el inicio de sesión. Inténtalo de nuevo en unos minutos.",
  cuenta_bloqueada: "Tu cuenta no está activa. Comunícate con el GAD Municipalidad de Ambato.",
  forbidden: "No tienes permisos para acceder a esa sección.",
  vinculo_sin_sesion: "Para vincular otra forma de ingreso primero debes iniciar sesión.",
};

const mensajesVinculo: Record<string, { tipo: "ok" | "aviso"; texto: string }> = {
  LINKED: { tipo: "ok", texto: "Listo: ahora puedes ingresar también con esa forma de ingreso." },
  MERGED: {
    tipo: "ok",
    texto: "Listo: unimos a esta cuenta la cuenta que habías creado con esa forma de ingreso.",
  },
  ALREADY_LINKED: { tipo: "aviso", texto: "Esa forma de ingreso ya estaba vinculada a tu cuenta." },
  CONFLICT: {
    tipo: "aviso",
    texto:
      "Esa forma de ingreso pertenece a otra cuenta con datos propios, por lo que no pudimos unirlas. Comunícate con el GAD para revisarlo.",
  },
};

export default async function CuentaPage({ searchParams }: PageProps<"/cuenta">) {
  const { error, vinculo } = await searchParams;
  const mensaje = typeof error === "string" ? mensajesError[error] : undefined;
  const avisoVinculo = typeof vinculo === "string" ? mensajesVinculo[vinculo] : undefined;
  const auth = await getCurrentAuth();

  if (auth && (await getPendingConsents(auth.user.id)).length > 0) {
    redirect("/cuenta/consentimiento?returnTo=%2Fcuenta");
  }

  return (
    <>
      <PageHeader
        eyebrow="Mi cuenta"
        titulo={auth ? `Hola${auth.user.displayName ? `, ${auth.user.displayName}` : ""}` : "Ingresa a Acolita.App"}
        descripcion={
          auth
            ? "Gestiona tu perfil, tus formas de ingreso y tus sesiones."
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
      {avisoVinculo && (
        <Section>
          <p role="status" className="flex gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
            {avisoVinculo.tipo === "ok" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-verde" aria-hidden />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 text-naranja" aria-hidden />
            )}
            <span>{avisoVinculo.texto}</span>
          </p>
        </Section>
      )}

      {auth ? <Panel auth={auth} /> : <Ingreso />}
    </>
  );
}

function Ingreso() {
  return (
    <Section>
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
    </Section>
  );
}

async function Panel({ auth }: { auth: CurrentAuth }) {
  const { user } = auth;
  const [perfil, identidades, sesiones] = await Promise.all([
    getClientProfile(user.id),
    listIdentities(user.id),
    listActiveSessions(user.id, auth.sessionId),
  ]);
  const proveedoresVinculables = enabledIdentityProviders().filter((p) => !identidades.some((i) => i.provider === p));
  const tieneNativo = identidades.some((i) => i.provider === "COGNITO");

  return (
    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div>
        <Section titulo="Tu perfil">
          <div className="tarjeta p-5">
            {!perfil && (
              <p className="mb-4 flex gap-2 text-sm text-muted-foreground">
                <UserRound className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                Completa tu nombre para que los trabajadores sepan con quién conversan.
              </p>
            )}
            <ProfileForm
              action={guardarPerfil}
              initial={{
                fullName: perfil?.fullName ?? user.displayName ?? "",
                phone: perfil?.phone ?? "",
                sector: perfil?.sector ?? "",
              }}
            />
          </div>
        </Section>

        <Section titulo="Formas de ingreso">
          <div className="tarjeta p-5">
            <p className="text-sm text-muted-foreground">
              Si ingresas de distintas maneras (usuario y contraseña, Google…), vincúlalas para usar siempre esta misma
              cuenta.
            </p>
            <ul className="mt-4 divide-y divide-border">
              {identidades.map((i) => {
                const enUso = i.issuer === auth.identity.issuer && i.sub === auth.identity.sub;
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <KeyRound className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                      <div className="min-w-0">
                        <p className="font-bold">
                          {etiquetaProveedor(i.provider)}
                          {enUso && <span className="ml-2 text-xs font-semibold text-verde-fuerte">en uso</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {i.email ?? "sin correo"} · último ingreso {formatearFechaHora(i.lastLoginAt)}
                        </p>
                      </div>
                    </div>
                    {!enUso && identidades.length > 1 && (
                      <ActionForm
                        action={desvincularIdentidad}
                        submitLabel="Quitar"
                        pendingLabel="Quitando…"
                        variant="secondary"
                        className="flex items-center gap-2 space-y-0"
                      >
                        <input type="hidden" name="identityId" value={i.id} />
                      </ActionForm>
                    )}
                  </li>
                );
              })}
            </ul>
            {(proveedoresVinculables.length > 0 || !tieneNativo) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {!tieneNativo && (
                  <a
                    href="/api/auth/login?intent=link&returnTo=%2Fcuenta"
                    className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold"
                  >
                    Vincular usuario y contraseña
                  </a>
                )}
                {proveedoresVinculables.map((p) => (
                  <a
                    key={p}
                    href={`/api/auth/login?intent=link&proveedor=${p}&returnTo=%2Fcuenta`}
                    className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold"
                  >
                    Vincular {p}
                  </a>
                ))}
              </div>
            )}
          </div>
        </Section>
      </div>

      <div>
        <Section titulo="Acceso">
          <div className="space-y-4 tarjeta p-5">
            <div>
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Correo</p>
              <p className="mt-1 truncate text-sm font-semibold">{user.email ?? "Sin correo verificado"}</p>
            </div>
            <div>
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Roles</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {user.roles.map((rol) => (
                  <li key={rol} className="rounded-lg bg-secondary px-2.5 py-1 text-xs font-bold">
                    {etiquetaRol(rol)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
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
        </Section>

        <Section titulo="Sesiones activas">
          <div className="tarjeta p-5">
            <ul className="divide-y divide-border">
              {sesiones.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="flex min-w-0 gap-3">
                    <MonitorSmartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-sm font-bold">
                        {describirDispositivo(s.userAgent)}
                        {s.current && <span className="ml-2 text-xs font-semibold text-verde-fuerte">esta sesión</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">Activa desde {formatearFechaHora(s.createdAt)}</p>
                    </div>
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
            <ActionForm
              action={cerrarTodasLasSesiones}
              submitLabel="Cerrar sesión en todos los dispositivos"
              pendingLabel="Cerrando…"
              variant="danger"
              className="mt-4"
              silentSuccess
            >
              <p className="text-xs text-muted-foreground">También cierra esta sesión.</p>
            </ActionForm>
          </div>
        </Section>
      </div>
    </div>
  );
}
