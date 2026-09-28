import { z } from "zod";

/** Avisos push del GAD (campañas), dispositivos y preferencias: compartidos por la web, la API y la app móvil. */

export const SEGMENTOS = ["TODOS", "USUARIOS", "CLIENTES", "TRABAJADORES", "SELECCION"] as const;
export type Segmento = (typeof SEGMENTOS)[number];

export const PLATAFORMAS = ["WEB", "ANDROID", "IOS"] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];

export const ETIQUETAS_SEGMENTO: Record<Segmento, { titulo: string; detalle: string }> = {
  TODOS: {
    titulo: "Todos los dispositivos",
    detalle: "Incluye la app instalada sin iniciar sesión.",
  },
  USUARIOS: { titulo: "Usuarios registrados", detalle: "Clientes y trabajadores con sesión." },
  CLIENTES: { titulo: "Solo clientes", detalle: "Cuentas ciudadanas que no son trabajadores." },
  TRABAJADORES: { titulo: "Solo trabajadores", detalle: "Trabajadores con cuenta activada." },
  SELECCION: { titulo: "Personas o dispositivos elegidos", detalle: "Busca y marca a quién enviar." },
};

export const ETIQUETAS_PLATAFORMA: Record<Plataforma, string> = {
  WEB: "Navegador",
  ANDROID: "Android",
  IOS: "iPhone",
};

export const ETIQUETAS_ESTADO_CAMPANA = {
  PROGRAMADA: "Programado",
  ENVIANDO: "Enviando",
  COMPLETADA: "Enviado",
  CANCELADA: "Cancelado",
} as const;
export type EstadoCampana = keyof typeof ETIQUETAS_ESTADO_CAMPANA;

/** Rutas internas del portal (la app móvil las traduce a sus pantallas). */
const enlace = z
  .string()
  .trim()
  .max(300, "Admite hasta 300 caracteres")
  .refine((v) => v === "" || /^\/[^/\\\s]\S*$/.test(v), {
    message: "Usa una dirección del portal que empiece con «/», por ejemplo /preguntas-frecuentes",
  })
  .transform((v) => v || null);

const TZ_ECUADOR = "-05:00"; // Ecuador continental no usa horario de verano.
const MAX_DIAS_PROGRAMACION = 90;

/** «2026-10-01T08:30» en hora de Ecuador → instante. */
export function fechaLocalEcuador(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}:00${TZ_ECUADOR}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function crearCampanaSchema(ahora = new Date()) {
  return z
    .object({
      title: z.string().trim().min(3, "Escribe un título").max(65, "Admite hasta 65 caracteres"),
      body: z.string().trim().min(3, "Escribe el mensaje").max(240, "Admite hasta 240 caracteres"),
      link: z.preprocess((v) => v ?? "", enlace),
      segment: z.enum(SEGMENTOS, { error: "Elige a quién enviar" }),
      platforms: z
        .array(z.enum(PLATAFORMAS))
        .min(1, "Elige al menos una plataforma")
        .transform((p) => [...new Set(p)]),
      userIds: z.array(z.uuid()).max(500, "Hasta 500 personas por aviso").default([]),
      deviceIds: z.array(z.coerce.number().int().positive()).max(1000, "Hasta 1000 dispositivos por aviso").default([]),
      alsoInApp: z.boolean().default(false),
      /** Vacío = enviar ahora. Hora de Ecuador (datetime-local). */
      scheduledAt: z
        .string()
        .trim()
        .optional()
        .transform((v, ctx) => {
          if (!v) return null;
          const d = fechaLocalEcuador(v);
          if (!d) {
            ctx.addIssue({ code: "custom", message: "Fecha y hora inválidas" });
            return z.NEVER;
          }
          if (d.getTime() <= ahora.getTime() + 60_000) {
            ctx.addIssue({ code: "custom", message: "Elige una fecha y hora futuras" });
            return z.NEVER;
          }
          if (d.getTime() > ahora.getTime() + MAX_DIAS_PROGRAMACION * 86_400_000) {
            ctx.addIssue({
              code: "custom",
              message: `Se puede programar hasta ${MAX_DIAS_PROGRAMACION} días hacia adelante`,
            });
            return z.NEVER;
          }
          return d;
        }),
    })
    .superRefine((d, ctx) => {
      if (d.segment === "SELECCION" && d.userIds.length + d.deviceIds.length === 0) {
        ctx.addIssue({ code: "custom", path: ["segment"], message: "Elige al menos una persona o dispositivo" });
      }
    })
    .transform((d) => (d.segment === "SELECCION" ? d : { ...d, userIds: [] as string[], deviceIds: [] as number[] }));
}

export type NuevaCampana = z.infer<ReturnType<typeof crearCampanaSchema>>;

export const audienciaSchema = z.object({
  segment: z.enum(SEGMENTOS),
  platforms: z.array(z.enum(PLATAFORMAS)).min(1),
  userIds: z.array(z.uuid()).max(500).default([]),
  deviceIds: z.array(z.coerce.number().int().positive()).max(1000).default([]),
});

export const busquedaDestinatariosSchema = z.object({
  q: z.string().trim().min(3, "Escribe al menos 3 caracteres").max(100),
});

export const dispositivoAnonimoSchema = z.object({
  platform: z.enum(["ANDROID", "IOS"], { error: "Solo la app móvil registra dispositivos sin sesión" }),
  token: z.string().min(20).max(4096),
});

export const bajaDispositivoSchema = z.object({
  token: z.string().min(20).max(4096),
  /** App móvil: al cerrar sesión, el dispositivo sigue recibiendo avisos generales como anónimo. */
  keepAnonymous: z.boolean().default(false),
});

export const preferenciasSchema = z.object({
  pushAnnouncements: z.boolean(),
});
