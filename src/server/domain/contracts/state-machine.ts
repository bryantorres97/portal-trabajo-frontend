/**
 * Máquina de estados de la contratación (docs/phases/fase-06-contrataciones.md).
 * Es la definición de referencia: la migración `contrataciones` repite las mismas transiciones en
 * `private.contract_transition_allowed` para que la base las imponga (un test compara ambas).
 * Módulo puro (sin dependencias de servidor): lo usan también los componentes.
 */

export const CONTRACT_STATUSES = [
  "PROPUESTA_ENVIADA",
  "CONTRATADA",
  "EN_CURSO",
  "FINALIZACION_PENDIENTE",
  "EN_DISPUTA",
  "FINALIZADA",
  "CANCELADA",
  "RECHAZADA",
  "EXPIRADA",
] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export type ContractRole = "CLIENTE" | "TRABAJADOR";

export const TRANSICIONES: Record<ContractStatus, readonly ContractStatus[]> = {
  PROPUESTA_ENVIADA: ["CONTRATADA", "RECHAZADA", "CANCELADA", "EXPIRADA"],
  CONTRATADA: ["EN_CURSO", "CANCELADA", "EN_DISPUTA"],
  EN_CURSO: ["FINALIZACION_PENDIENTE", "FINALIZADA", "EN_DISPUTA"],
  FINALIZACION_PENDIENTE: ["FINALIZADA", "EN_DISPUTA"],
  EN_DISPUTA: ["CONTRATADA", "EN_CURSO", "FINALIZACION_PENDIENTE", "FINALIZADA", "CANCELADA"],
  FINALIZADA: [],
  CANCELADA: [],
  RECHAZADA: [],
  EXPIRADA: [],
};

export function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  return TRANSICIONES[from].includes(to);
}

export function isTerminal(status: ContractStatus): boolean {
  return TRANSICIONES[status].length === 0;
}

/** «Activas» en «Mis contrataciones»; el resto va al historial. */
export function isActive(status: ContractStatus): boolean {
  return !isTerminal(status);
}

export const ETIQUETAS_ESTADO: Record<ContractStatus, string> = {
  PROPUESTA_ENVIADA: "En negociación",
  CONTRATADA: "Contratada",
  EN_CURSO: "En curso",
  FINALIZACION_PENDIENTE: "Por confirmar",
  EN_DISPUTA: "En disputa",
  FINALIZADA: "Finalizada",
  CANCELADA: "Cancelada",
  RECHAZADA: "Rechazada",
  EXPIRADA: "Expirada",
};

/** Tono visual del estado (chips). */
export function tonoEstado(status: ContractStatus): "info" | "exito" | "alerta" | "peligro" | "neutro" {
  switch (status) {
    case "PROPUESTA_ENVIADA":
    case "FINALIZACION_PENDIENTE":
      return "alerta";
    case "CONTRATADA":
    case "EN_CURSO":
      return "info";
    case "FINALIZADA":
      return "exito";
    case "EN_DISPUTA":
      return "peligro";
    default:
      return "neutro";
  }
}

export const UNIDADES_PRECIO = ["JORNAL", "HORA", "OBRA", "SERVICIO"] as const;
export type UnidadPrecio = (typeof UNIDADES_PRECIO)[number];

export const ETIQUETAS_UNIDAD: Record<UnidadPrecio, string> = {
  JORNAL: "Por día de trabajo",
  HORA: "Por hora",
  OBRA: "Por obra completa",
  SERVICIO: "Por servicio",
};

const SUFIJO_UNIDAD: Record<string, string> = {
  JORNAL: "por día",
  HORA: "por hora",
  OBRA: "por la obra",
  SERVICIO: "por el servicio",
};

/** «$45,00 por la obra». */
export function formatearPrecio(monto: number, unidad: string): string {
  const valor = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(monto);
  return `${valor} ${SUFIJO_UNIDAD[unidad] ?? ""}`.trim();
}

/** Estado mínimo que necesitan las reglas de acciones (del listado o del detalle). */
export type ContractSnapshot = {
  status: ContractStatus;
  myRole: ContractRole;
  /** Hay una versión pendiente de respuesta (propuesta o modificación). */
  pendingTerms: boolean;
  /** La versión pendiente la envié yo. */
  pendingProposedByMe: boolean;
  disputedByMe: boolean;
};

export type ContractAction =
  | "ACCEPT"
  | "REJECT"
  | "COUNTER"
  | "WITHDRAW"
  | "MODIFY"
  | "CANCEL"
  | "START"
  | "COMPLETE"
  | "CONFIRM"
  | "DISPUTE"
  | "WITHDRAW_DISPUTE";

/**
 * Acciones que la interfaz ofrece a cada parte. La base de datos vuelve a verificar todo
 * (versión vigente, bloqueo de la conversación, estado del trabajador).
 */
export function availableActions(c: ContractSnapshot): ContractAction[] {
  const acciones: ContractAction[] = [];
  const responder = c.pendingTerms && !c.pendingProposedByMe;
  const retirar = c.pendingTerms && c.pendingProposedByMe;

  switch (c.status) {
    case "PROPUESTA_ENVIADA":
      if (responder) acciones.push("ACCEPT", "COUNTER", "REJECT");
      if (retirar) acciones.push("COUNTER", "WITHDRAW");
      break;
    case "CONTRATADA":
    case "EN_CURSO":
      if (responder) acciones.push("ACCEPT", "REJECT");
      if (retirar) acciones.push("WITHDRAW");
      if (c.myRole === "TRABAJADOR") acciones.push(c.status === "CONTRATADA" ? "START" : "COMPLETE");
      if (c.myRole === "CLIENTE" && c.status === "EN_CURSO") acciones.push("CONFIRM");
      acciones.push("MODIFY");
      if (c.status === "CONTRATADA") acciones.push("CANCEL");
      acciones.push("DISPUTE");
      break;
    case "FINALIZACION_PENDIENTE":
      if (c.myRole === "CLIENTE") acciones.push("CONFIRM");
      acciones.push("DISPUTE");
      break;
    case "EN_DISPUTA":
      if (c.disputedByMe) acciones.push("WITHDRAW_DISPUTE");
      break;
  }
  // Una modificación pendiente se responde o se retira antes de proponer otra.
  return c.pendingTerms ? acciones.filter((a) => a !== "MODIFY") : acciones;
}

/** ¿Le toca a esta parte hacer algo? (resalta la contratación en los listados). */
export function needsMyAction(c: ContractSnapshot): boolean {
  if (c.pendingTerms) return !c.pendingProposedByMe;
  if (c.status === "CONTRATADA" || c.status === "EN_CURSO") return c.myRole === "TRABAJADOR";
  return c.status === "FINALIZACION_PENDIENTE" && c.myRole === "CLIENTE";
}

/** Texto de los eventos del historial, desde el punto de vista de quien lo lee. */
export const ETIQUETAS_EVENTO: Record<string, string> = {
  PROPUESTA: "Propuesta de condiciones",
  CONTRAPROPUESTA: "Contrapropuesta",
  ACEPTADA: "Condiciones aceptadas: contratación confirmada",
  RECHAZADA: "Propuesta rechazada",
  RETIRADA: "Propuesta retirada",
  EXPIRADA: "La propuesta expiró sin respuesta",
  MODIFICACION_PROPUESTA: "Propuesta de modificación",
  MODIFICACION_ACEPTADA: "Modificación aceptada",
  MODIFICACION_RECHAZADA: "Modificación rechazada",
  MODIFICACION_RETIRADA: "Modificación retirada",
  MODIFICACION_EXPIRADA: "La modificación expiró sin respuesta",
  CANCELADA: "Contratación cancelada",
  INICIADA: "Trabajo iniciado",
  FINALIZACION_SOLICITADA: "Trabajo marcado como terminado",
  FINALIZADA: "Finalización confirmada",
  FINALIZADA_AUTOMATICAMENTE: "Finalización confirmada automáticamente",
  DISPUTA_ABIERTA: "Disputa abierta",
  DISPUTA_RETIRADA: "Disputa retirada",
  DISPUTA_RESUELTA: "El GAD resolvió la disputa",
  CUENTA_ELIMINADA: "Propuesta cancelada: una de las partes eliminó su cuenta",
};
