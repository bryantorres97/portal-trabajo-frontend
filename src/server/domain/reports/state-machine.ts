/**
 * Denuncias (Fase 8): estados, transiciones y catálogos. Es la definición de referencia: la migración
 * `denuncias_moderacion` repite las transiciones en `private.report_transition_allowed` (un test compara
 * ambas). Módulo puro: lo usan también los componentes.
 */

export const REPORT_STATUSES = [
  "ABIERTA",
  "EN_REVISION",
  "EN_ESPERA_DE_INFORMACION",
  "ESCALADA",
  "RESUELTA",
  "DESCARTADA",
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const TRANSICIONES: Record<ReportStatus, readonly ReportStatus[]> = {
  ABIERTA: ["EN_REVISION", "RESUELTA", "DESCARTADA"],
  EN_REVISION: ["EN_ESPERA_DE_INFORMACION", "ESCALADA", "RESUELTA", "DESCARTADA"],
  EN_ESPERA_DE_INFORMACION: ["EN_REVISION", "RESUELTA", "DESCARTADA"],
  ESCALADA: ["EN_REVISION", "RESUELTA", "DESCARTADA"],
  RESUELTA: [],
  DESCARTADA: [],
};

export function canTransition(from: ReportStatus, to: ReportStatus): boolean {
  return TRANSICIONES[from].includes(to);
}

export function isOpen(status: ReportStatus): boolean {
  return TRANSICIONES[status].length > 0;
}

export const ETIQUETAS_ESTADO: Record<ReportStatus, string> = {
  ABIERTA: "Recibida",
  EN_REVISION: "En revisión",
  EN_ESPERA_DE_INFORMACION: "Esperando información",
  ESCALADA: "Escalada",
  RESUELTA: "Resuelta",
  DESCARTADA: "Cerrada sin acciones",
};

export const TIPOS_OBJETIVO = ["WORKER", "CLIENT", "REVIEW", "MESSAGE", "CONVERSATION", "CONTRACT"] as const;
export type ReportTargetType = (typeof TIPOS_OBJETIVO)[number];

export const ETIQUETAS_OBJETIVO: Record<ReportTargetType, string> = {
  WORKER: "Perfil de trabajador",
  CLIENT: "Cliente",
  REVIEW: "Reseña",
  MESSAGE: "Mensaje",
  CONVERSATION: "Conversación",
  CONTRACT: "Contratación (disputa)",
};

export const PRIORIDADES = { 1: "Alta", 2: "Media", 3: "Baja" } as const;
export type Prioridad = keyof typeof PRIORIDADES;

export const RESOLUCIONES = [
  "MEDIDAS_APLICADAS",
  "SIN_INCUMPLIMIENTO",
  "RESUELTO_ENTRE_PARTES",
  "DUPLICADA",
  "OTRO",
] as const;
export type Resolucion = (typeof RESOLUCIONES)[number];

export const ETIQUETAS_RESOLUCION: Record<Resolucion, string> = {
  MEDIDAS_APLICADAS: "Se aplicaron medidas",
  SIN_INCUMPLIMIENTO: "Sin incumplimiento",
  RESUELTO_ENTRE_PARTES: "Resuelto entre las partes",
  DUPLICADA: "Duplicada",
  OTRO: "Otro",
};

/** Catálogo de acciones de moderación (P-14: configurable). */
export const ACCIONES = [
  "ADVERTENCIA",
  "OCULTAR_MENSAJE",
  "OCULTAR_RESENA",
  "SUSPENDER_TRABAJADOR",
  "DESHABILITAR_TRABAJADOR",
  "SUSPENDER_CUENTA",
  "BLOQUEAR_CUENTA",
] as const;
export type AccionModeracion = (typeof ACCIONES)[number];

export const ETIQUETAS_ACCION: Record<AccionModeracion, string> = {
  ADVERTENCIA: "Enviar una advertencia",
  OCULTAR_MENSAJE: "Ocultar el mensaje",
  OCULTAR_RESENA: "Ocultar la reseña",
  SUSPENDER_TRABAJADOR: "Suspender al trabajador (temporal)",
  DESHABILITAR_TRABAJADOR: "Dar de baja al trabajador",
  SUSPENDER_CUENTA: "Suspender la cuenta (temporal)",
  BLOQUEAR_CUENTA: "Bloquear la cuenta",
};

/** Permiso que exige cada acción (moderadores: contenido y advertencias; responsables: sanciones). */
export function permisoAccion(a: AccionModeracion): "moderation.act" | "report.manage" {
  return a === "ADVERTENCIA" || a === "OCULTAR_MENSAJE" || a === "OCULTAR_RESENA" ? "moderation.act" : "report.manage";
}

export function esTemporal(a: AccionModeracion): boolean {
  return a === "SUSPENDER_TRABAJADOR" || a === "SUSPENDER_CUENTA";
}

/** Acciones que tienen sentido para una denuncia (la base vuelve a validar el objetivo y el estado). */
export function accionesPara(c: {
  targetType: ReportTargetType;
  tieneCuentaDenunciada: boolean;
  trabajadorEstado: string | null;
  mensajeOculto: boolean | null;
  resenaEstado: string | null;
  permisos: readonly string[];
}): AccionModeracion[] {
  return ACCIONES.filter((a) => {
    if (!c.permisos.includes(permisoAccion(a))) return false;
    switch (a) {
      case "ADVERTENCIA":
      case "SUSPENDER_CUENTA":
      case "BLOQUEAR_CUENTA":
        return c.tieneCuentaDenunciada;
      case "OCULTAR_MENSAJE":
        return c.targetType === "MESSAGE" && c.mensajeOculto === false;
      case "OCULTAR_RESENA":
        return c.targetType === "REVIEW" && c.resenaEstado === "PUBLICADA";
      case "SUSPENDER_TRABAJADOR":
        return c.trabajadorEstado === "HABILITADO";
      case "DESHABILITAR_TRABAJADOR":
        return c.trabajadorEstado === "HABILITADO" || c.trabajadorEstado === "SUSPENDIDO";
    }
  });
}

export const ETIQUETAS_EVENTO: Record<string, string> = {
  CREADA: "Denuncia recibida",
  ESTADO: "Cambio de estado",
  ASIGNADA: "Asignación",
  PRIORIDAD: "Prioridad",
  NOTA_INTERNA: "Nota interna",
  INFO_SOLICITADA: "Se pidió información",
  INFO_APORTADA: "Información aportada",
  EVIDENCIA_ADJUNTA: "Archivo adjunto",
  ACCESO_EVIDENCIA: "Acceso a la evidencia",
  ACCION: "Acción de moderación",
  ACCION_REVOCADA: "Acción revocada",
  ACCION_VENCIDA: "Acción vencida",
};

/** Vistas de la bandeja del GAD. */
export const VISTAS = [
  "por_atender",
  "mias",
  "sin_asignar",
  "espera",
  "escaladas",
  "vencidas",
  "cerradas",
  "todas",
] as const;
export type VistaBandeja = (typeof VISTAS)[number];

export const ETIQUETAS_VISTA: Record<VistaBandeja, string> = {
  por_atender: "Por atender",
  mias: "Asignadas a mí",
  sin_asignar: "Sin asignar",
  espera: "Esperando información",
  escaladas: "Escaladas",
  vencidas: "Vencidas",
  cerradas: "Cerradas",
  todas: "Todas",
};
