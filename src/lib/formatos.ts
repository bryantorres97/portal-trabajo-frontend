/** Formatos de presentación en español (Ecuador). Sin dependencias de servidor. */

const fechaHora = new Intl.DateTimeFormat("es-EC", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Guayaquil",
});

const fechaCalendario = new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeZone: "UTC" });
const fechaLocal = new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeZone: "America/Guayaquil" });

/** Fecha de calendario `YYYY-MM-DD` (sin zona horaria) o marca de tiempo ISO. */
export function formatearFecha(valor: string | null | undefined): string {
  if (!valor) return "—";
  return /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? fechaCalendario.format(new Date(`${valor}T12:00:00Z`))
    : fechaLocal.format(new Date(valor));
}

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

const TZ = "America/Guayaquil";
const horaCorta = new Intl.DateTimeFormat("es-EC", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const diaSemana = new Intl.DateTimeFormat("es-EC", { weekday: "long", timeZone: TZ });
const diaMes = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", timeZone: TZ });
const diaMesAnio = new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const fechaLarga = new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const claveDia = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });

/** Días de calendario (en Ecuador) entre la fecha y hoy: 0 = hoy, 1 = ayer. */
function diasAtras(iso: string, ahora: Date): number {
  const a = Date.parse(`${claveDia.format(ahora)}T00:00:00Z`);
  const b = Date.parse(`${claveDia.format(new Date(iso))}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

export function formatearHora(iso: string): string {
  return horaCorta.format(new Date(iso));
}

/** Como en las apps de mensajería: «14:05», «Ayer», «lunes», «12 sept.», «12 sept. 2025». */
export function formatearMomento(iso: string | null | undefined, ahora = new Date()): string {
  if (!iso) return "";
  const d = diasAtras(iso, ahora);
  if (d <= 0) return formatearHora(iso);
  if (d === 1) return "Ayer";
  if (d < 7) return diaSemana.format(new Date(iso));
  const fecha = new Date(iso);
  return fecha.getUTCFullYear() === ahora.getUTCFullYear() ? diaMes.format(fecha) : diaMesAnio.format(fecha);
}

/** Separador de día dentro de una conversación: «Hoy», «Ayer» o «lunes, 21 de septiembre». */
export function etiquetaDia(iso: string, ahora = new Date()): string {
  const d = diasAtras(iso, ahora);
  if (d <= 0) return "Hoy";
  if (d === 1) return "Ayer";
  const texto = fechaLarga.format(new Date(iso));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function mismoDia(a: string, b: string): boolean {
  return claveDia.format(new Date(a)) === claveDia.format(new Date(b));
}
