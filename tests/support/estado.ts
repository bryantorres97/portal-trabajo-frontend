import { z } from "zod";

import { AuthError } from "@/server/auth/authorize";
import { DomainError } from "@/server/errors";

/**
 * Resultado de una operación como lo vería la API (`toProblem` en src/server/http/api.ts):
 * "ok", el estado HTTP de un error conocido (DomainError, AuthError, 422 de validación) o "error".
 */
export async function estado<T>(p: Promise<T>): Promise<"ok" | "error" | number> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof DomainError || e instanceof AuthError) return e.status;
    if (e instanceof z.ZodError) return 422;
    return "error";
  }
}
