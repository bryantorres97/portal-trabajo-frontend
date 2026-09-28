import "server-only";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { logger } from "@/lib/logger";
import { AuthError } from "@/server/auth/authorize";
import { DomainError } from "@/server/errors";

/**
 * Ejecuta el cuerpo de una Server Action y traduce los errores esperados a un ActionState
 * con mensajes comprensibles. Los errores inesperados se registran y se muestran de forma genérica.
 * (Next 16 ya verifica el origen de las Server Actions; la autorización la hace cada caso de uso.)
 */
export async function runAction(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { status: "ok", message: message ?? "Cambios guardados." };
  } catch (error) {
    // redirect()/notFound() de Next lanzan errores internos que deben propagarse.
    unstable_rethrow(error);
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.issues) (fieldErrors[issue.path.join(".") || "_"] ??= []).push(issue.message);
      return { status: "error", message: "Revisa los datos ingresados.", fieldErrors };
    }
    if (error instanceof DomainError || error instanceof AuthError) {
      return { status: "error", message: error.message };
    }
    logger.error("action.unhandled_error", { error });
    return { status: "error", message: "No pudimos completar la acción. Inténtalo de nuevo." };
  }
}

/** Convierte FormData en objeto plano (solo valores de texto). */
export function formToObject(formData: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) obj[k] = v;
  return obj;
}
