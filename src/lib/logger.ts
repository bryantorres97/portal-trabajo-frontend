/**
 * Logger estructurado (JSON en una línea) para el servidor.
 * Reglas (docs/analysis/05-seguridad-auditoria.md): nunca registrar tokens, contraseñas,
 * contenido de mensajes ni cédulas completas. Las claves sensibles se redactan automáticamente.
 */

type Nivel = "debug" | "info" | "warn" | "error";

const prioridad: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const CLAVES_SENSIBLES = /token|secret|password|authorization|cookie|cedula|id_?document|code_verifier/i;

export function redactar(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 5 || valor === null || typeof valor !== "object") return valor;
  if (valor instanceof Error) return { name: valor.name, message: valor.message };
  if (Array.isArray(valor)) return valor.map((v) => redactar(v, profundidad + 1));
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>).map(([k, v]) => [
      k,
      CLAVES_SENSIBLES.test(k) ? "[REDACTADO]" : redactar(v, profundidad + 1),
    ]),
  );
}

function nivelMinimo(): Nivel {
  const nivel = process.env.LOG_LEVEL as Nivel | undefined;
  return nivel && nivel in prioridad ? nivel : process.env.NODE_ENV === "production" ? "info" : "debug";
}

function escribir(nivel: Nivel, mensaje: string, contexto?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" || prioridad[nivel] < prioridad[nivelMinimo()]) return;
  const linea = JSON.stringify({
    ts: new Date().toISOString(),
    level: nivel,
    msg: mensaje,
    ...(contexto ? (redactar(contexto) as Record<string, unknown>) : {}),
  });
  if (nivel === "error") console.error(linea);
  else if (nivel === "warn") console.warn(linea);
  else console.log(linea);
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => escribir("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => escribir("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => escribir("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => escribir("error", msg, ctx),
};
