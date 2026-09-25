/** Resultado estándar de las Server Actions (serializable, compartido cliente/servidor). */
export type ActionState = {
  status: "idle" | "ok" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialActionState: ActionState = { status: "idle" };
