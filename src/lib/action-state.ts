/** Resultado estándar de las Server Actions (serializable, compartido cliente/servidor). */
export type ActionState = {
  status: "idle" | "ok" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Datos adicionales para la interfaz (p. ej. un código que se muestra una sola vez). */
  data?: Record<string, string>;
};

export const initialActionState: ActionState = { status: "idle" };
