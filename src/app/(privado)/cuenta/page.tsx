import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, BadgeCheck, CheckCircle2, LogIn, MessageCircle, ShieldCheck } from "lucide-react";

import { boton } from "@/components/ui/boton";
import { getWebPushConfig, isAuthConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/server/auth/authorize";
import { enabledIdentityProviders } from "@/server/auth/cognito";
import { getCurrentAuth, type CurrentAuth } from "@/server/auth/current-user";
import { listActiveSessions } from "@/server/auth/session";
import { listContracts } from "@/server/contracts/contracts";
import { getNotificationPreferences, listNotifications } from "@/server/notifications/notifications";
import { getPendingConsents } from "@/server/users/consents";
import { listIdentities } from "@/server/users/identities";
import { getClientProfile } from "@/server/users/profile";
import { getOwnWorker } from "@/server/workers/public-profile";

import { PanelCuenta } from "./PanelCuenta";

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
  vinculo_no_permitido: "Las cuentas institucionales del GAD no se vinculan con cuentas ciudadanas.",
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

  // El personal del GAD (sesión de Entra ID) no tiene cuenta ciudadana: su espacio es el panel.
  if (auth?.source === "ENTRA") redirect("/admin");
  if (auth && (await getPendingConsents(auth.user.id)).length > 0) {
    redirect("/cuenta/consentimiento?returnTo=%2Fcuenta");
  }

  return (
    <>
      {(mensaje || avisoVinculo) && (
        <div className="px-4 pt-6 sm:px-6">
          {mensaje && (
            <p role="alert" className="flex gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
              <span>{mensaje}</span>
            </p>
          )}
          {avisoVinculo && (
            <p role="status" className="flex gap-3 rounded-2xl bg-secondary p-4 text-sm">
              {avisoVinculo.tipo === "ok" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-verde-fuerte" aria-hidden />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0 text-naranja" aria-hidden />
              )}
              <span>{avisoVinculo.texto}</span>
            </p>
          )}
        </div>
      )}
      {auth ? <Panel auth={auth} /> : <Ingreso />}
    </>
  );
}

function Ingreso() {
  const beneficios = [
    { icon: MessageCircle, texto: "Escribe a trabajadores sin compartir tu teléfono." },
    { icon: BadgeCheck, texto: "Todos están registrados y habilitados por el GAD." },
    { icon: ShieldCheck, texto: "Tus acuerdos quedan registrados y puedes denunciar abusos." },
  ];
  return (
    <div className="grid items-center gap-10 px-4 pt-10 pb-6 sm:px-6 lg:grid-cols-2 lg:pt-16">
      <div>
        <h1 className="text-4xl leading-tight font-extrabold sm:text-5xl">Ingresa a Acolita.App</h1>
        <p className="mt-4 max-w-lg text-lg text-muted-foreground">
          Inicia sesión o crea tu cuenta para contactar trabajadores y gestionar tus contrataciones.
        </p>
        <ul className="mt-8 space-y-4">
          {beneficios.map((b) => (
            <li key={b.texto} className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-verde/15 text-verde-fuerte">
                <b.icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="pt-2">{b.texto}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel p-6 sm:p-8">
        {isAuthConfigured() ? (
          <div className="flex flex-col gap-3">
            <a href="/api/auth/login?returnTo=%2Fcuenta" className={cn(boton({ tamano: "lg" }), "w-full")}>
              <LogIn aria-hidden /> Ingresar o crear cuenta
            </a>
            {enabledIdentityProviders().map((proveedor) => (
              <a
                key={proveedor}
                href={`/api/auth/login?proveedor=${proveedor}&returnTo=%2Fcuenta`}
                className={cn(boton({ variante: "secundario", tamano: "lg" }), "w-full")}
              >
                Continuar con {proveedor}
              </a>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">El inicio de sesión estará disponible próximamente.</p>
        )}
        <p className="mt-5 text-sm text-muted-foreground">
          El acceso usa el sistema de identidad ciudadana del GAD Municipalidad de Ambato.
        </p>
      </div>
    </div>
  );
}

async function Panel({ auth }: { auth: CurrentAuth }) {
  const { user } = auth;
  const [perfil, identidades, sesiones, notificaciones, trabajador, contratos, preferencias] = await Promise.all([
    getClientProfile(user.id),
    listIdentities(user.id),
    listActiveSessions(user.id, auth.sessionId),
    listNotifications(user, 10),
    getOwnWorker(user.id),
    listContracts(user, { scope: "activas" }),
    getNotificationPreferences(user),
  ]);
  const proveedoresVinculables = enabledIdentityProviders().filter((p) => !identidades.some((i) => i.provider === p));
  const tieneNativo = identidades.some((i) => i.provider === "COGNITO");

  return (
    <PanelCuenta
      d={{
        nombre: perfil?.fullName ?? user.displayName,
        email: user.email,
        esTrabajador: user.roles.includes("TRABAJADOR"),
        esPersonal: hasPermission(user, "admin.access"),
        perfil: {
          fullName: perfil?.fullName ?? user.displayName ?? "",
          phone: perfil?.phone ?? "",
          sector: perfil?.sector ?? "",
        },
        perfilCompleto: !!perfil,
        trabajador: trabajador ? { status: trabajador.status, displayName: trabajador.displayName } : null,
        notificaciones,
        avisos: { pushAnnouncements: preferencias.pushAnnouncements, webPush: getWebPushConfig() },
        contrataciones: {
          activas: contratos.length,
          porResponder: contratos.filter((c) => c.needsMyAction).length,
        },
        identidades: identidades.map((i) => ({
          id: i.id,
          provider: i.provider,
          email: i.email,
          lastLoginAt: i.lastLoginAt,
          enUso: i.issuer === auth.identity.issuer && i.sub === auth.identity.sub,
        })),
        sesiones: sesiones.map((s) => ({
          id: s.id,
          userAgent: s.userAgent,
          createdAt: s.createdAt,
          current: s.current,
        })),
        vincular: [
          ...(tieneNativo
            ? []
            : [{ href: "/api/auth/login?intent=link&returnTo=%2Fcuenta", etiqueta: "Vincular usuario y contraseña" }]),
          ...proveedoresVinculables.map((p) => ({
            href: `/api/auth/login?intent=link&proveedor=${p}&returnTo=%2Fcuenta`,
            etiqueta: `Vincular ${p}`,
          })),
        ],
      }}
    />
  );
}
