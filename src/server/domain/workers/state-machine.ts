/**
 * Máquina de estados del trabajador (docs/analysis/01-negocio.md §6.1).
 * Es la definición de referencia: la migración `gestion_trabajadores` repite las mismas reglas en
 * `private.worker_transition_*` para que la base las imponga aunque el servidor falle.
 * Módulo puro (sin dependencias de servidor): lo usan también los componentes del panel.
 */

export const WORKER_STATUSES = [
  "REGISTRADO",
  "DOCUMENTACION_PENDIENTE",
  "PENDIENTE_REVISION",
  "CAPACITACION_PENDIENTE",
  "CAPACITACION_EN_PROCESO",
  "CAPACITACION_APROBADA",
  "HABILITADO",
  "SUSPENDIDO",
  "RECHAZADO",
  "INACTIVO",
] as const;

export type WorkerStatus = (typeof WORKER_STATUSES)[number];

const TRANSICIONES: Record<WorkerStatus, readonly WorkerStatus[]> = {
  REGISTRADO: ["DOCUMENTACION_PENDIENTE", "PENDIENTE_REVISION", "RECHAZADO"],
  DOCUMENTACION_PENDIENTE: ["PENDIENTE_REVISION", "RECHAZADO"],
  PENDIENTE_REVISION: ["DOCUMENTACION_PENDIENTE", "CAPACITACION_PENDIENTE", "RECHAZADO"],
  CAPACITACION_PENDIENTE: ["CAPACITACION_EN_PROCESO", "RECHAZADO"],
  CAPACITACION_EN_PROCESO: ["CAPACITACION_PENDIENTE", "CAPACITACION_APROBADA", "RECHAZADO"],
  CAPACITACION_APROBADA: ["HABILITADO", "RECHAZADO"],
  HABILITADO: ["SUSPENDIDO", "INACTIVO"],
  SUSPENDIDO: ["HABILITADO", "INACTIVO"],
  INACTIVO: ["HABILITADO"],
  RECHAZADO: [],
};

export function allowedTransitions(from: WorkerStatus): readonly WorkerStatus[] {
  return TRANSICIONES[from];
}

export function canTransition(from: WorkerStatus, to: WorkerStatus): boolean {
  return TRANSICIONES[from].includes(to);
}

/** Permiso necesario para llevar al trabajador de `from` a `to`. */
export function transitionPermission(from: WorkerStatus, to: WorkerStatus): string {
  if (to === "DOCUMENTACION_PENDIENTE" || to === "PENDIENTE_REVISION") return "worker.update";
  if (to === "CAPACITACION_PENDIENTE" && from === "PENDIENTE_REVISION") return "document.review";
  if (to === "CAPACITACION_PENDIENTE" || to === "CAPACITACION_EN_PROCESO") return "training.record";
  if (to === "CAPACITACION_APROBADA") return "training.approve";
  if (to === "HABILITADO") return "worker.enable";
  return "worker.suspend";
}

/** Rechazos, suspensiones, bajas, devoluciones por documentación y reactivaciones exigen motivo. */
export function requiresReason(from: WorkerStatus, to: WorkerStatus): boolean {
  return (
    to === "RECHAZADO" ||
    to === "SUSPENDIDO" ||
    to === "INACTIVO" ||
    to === "DOCUMENTACION_PENDIENTE" ||
    (to === "HABILITADO" && (from === "SUSPENDIDO" || from === "INACTIVO"))
  );
}

/**
 * Transiciones que el panel ofrece como acción manual. Las de capacitación (en proceso,
 * aprobada, de vuelta a pendiente) ocurren solas al registrar inscripciones y resultados.
 */
export function manualTransitions(from: WorkerStatus, permissions: readonly string[]): WorkerStatus[] {
  return TRANSICIONES[from].filter(
    (to) =>
      to !== "CAPACITACION_EN_PROCESO" &&
      !(from === "CAPACITACION_EN_PROCESO" && to === "CAPACITACION_PENDIENTE") &&
      permissions.includes(transitionPermission(from, to)),
  );
}

export function isTerminal(status: WorkerStatus): boolean {
  return TRANSICIONES[status].length === 0;
}

/** Visible en la búsqueda pública (RN-01). */
export function isPubliclyVisible(status: WorkerStatus): boolean {
  return status === "HABILITADO";
}

export const ETIQUETAS_ESTADO: Record<WorkerStatus, string> = {
  REGISTRADO: "Registrado",
  DOCUMENTACION_PENDIENTE: "Documentación pendiente",
  PENDIENTE_REVISION: "Pendiente de revisión",
  CAPACITACION_PENDIENTE: "Capacitación pendiente",
  CAPACITACION_EN_PROCESO: "En capacitación",
  CAPACITACION_APROBADA: "Capacitación aprobada",
  HABILITADO: "Habilitado",
  SUSPENDIDO: "Suspendido",
  RECHAZADO: "Rechazado",
  INACTIVO: "Inactivo",
};

/** Texto del botón que lleva al estado `to`. */
export function accionHacia(from: WorkerStatus, to: WorkerStatus): string {
  switch (to) {
    case "DOCUMENTACION_PENDIENTE":
      return from === "PENDIENTE_REVISION" ? "Devolver por documentación" : "Marcar documentación pendiente";
    case "PENDIENTE_REVISION":
      return "Enviar a revisión";
    case "CAPACITACION_PENDIENTE":
      return "Aprobar documentación";
    case "CAPACITACION_APROBADA":
      return "Marcar capacitación aprobada";
    case "HABILITADO":
      return from === "CAPACITACION_APROBADA" ? "Habilitar" : "Reactivar";
    case "SUSPENDIDO":
      return "Suspender";
    case "INACTIVO":
      return "Dar de baja";
    case "RECHAZADO":
      return "Rechazar";
    default:
      return ETIQUETAS_ESTADO[to];
  }
}
