/** Formatos de presentación en español (Ecuador). Sin dependencias de servidor. */

const fechaHora = new Intl.DateTimeFormat("es-EC", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Guayaquil",
});

export function formatearFechaHora(iso: string | null | undefined): string {
  return iso ? fechaHora.format(new Date(iso)) : "—";
}

/** Resumen legible de un user agent ("Chrome en Windows"). No pretende ser exhaustivo. */
export function describirDispositivo(userAgent: string | null | undefined): string {
  if (!userAgent) return "Dispositivo desconocido";
  const navegador = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Navegador";
  const sistema = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "otro sistema";
  return `${navegador} en ${sistema}`;
}

export const ETIQUETAS_ROL: Record<string, string> = {
  CLIENTE: "Cliente",
  TRABAJADOR: "Trabajador",
  ADMIN_SISTEMA: "Administrador del sistema",
  ADMIN_TRABAJADORES: "Administrador de trabajadores",
  OPERADOR_PUNTO: "Operador de punto de atención",
  RESP_CAPACITACION: "Responsable de capacitación",
  MODERADOR: "Moderador",
  RESP_DENUNCIAS: "Responsable de denuncias",
  SUPERVISOR: "Supervisor",
};

export function etiquetaRol(code: string): string {
  return ETIQUETAS_ROL[code] ?? code;
}

export function etiquetaProveedor(provider: string): string {
  if (provider === "COGNITO") return "Usuario y contraseña";
  if (provider === "ENTRA") return "Cuenta institucional (Microsoft)";
  return provider;
}
