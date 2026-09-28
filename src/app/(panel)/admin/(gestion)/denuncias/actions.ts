"use server";

import { refresh } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { AuthError } from "@/server/auth/authorize";
import { getCurrentAuth } from "@/server/auth/current-user";
import { formToObject, runAction } from "@/server/http/action";
import { currentRequestContext } from "@/server/http/request-info";
import {
  accessReportEvidence,
  applyModeration,
  liftModeration,
  resolveContractDispute,
  updateReport,
  type EvidenceView,
} from "@/server/reports/admin";

/** Solo el personal (sesión de Entra ID) gestiona denuncias. */
async function personal() {
  const auth = await getCurrentAuth();
  if (!auth) throw new AuthError(401, "Tu sesión expiró. Vuelve a ingresar.");
  if (auth.source !== "ENTRA") throw new AuthError(403, "Ingresa con tu cuenta institucional.");
  return auth.user;
}

const MENSAJES: Record<string, string> = {
  ASSIGN_ME: "Te asignaste la denuncia.",
  UNASSIGN: "La denuncia quedó sin asignar.",
  PRIORITY: "Prioridad actualizada.",
  REVIEW: "La denuncia está en revisión.",
  REQUEST_INFO: "Pedimos la información al denunciante.",
  ESCALATE: "Denuncia escalada.",
  RESOLVE: "Denuncia resuelta. El denunciante recibirá el resultado.",
  DISCARD: "Denuncia cerrada sin acciones.",
  NOTE: "Nota interna guardada.",
};

export async function gestionarDenuncia(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const datos = formToObject(formData);
    await updateReport(await personal(), datos, await currentRequestContext());
    refresh();
    return MENSAJES[datos.op] ?? "Cambios guardados.";
  });
}

export async function sancionar(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await applyModeration(await personal(), formToObject(formData), await currentRequestContext());
    refresh();
    return "Acción aplicada y registrada.";
  });
}

export async function levantarSancion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const deshecha = await liftModeration(await personal(), formToObject(formData), await currentRequestContext());
    refresh();
    return deshecha ? "Acción revocada y efecto deshecho." : "Acción revocada (su efecto ya no estaba vigente).";
  });
}

export async function resolverDisputa(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const datos = formToObject(formData);
    await resolveContractDispute(await personal(), datos, await currentRequestContext());
    refresh();
    return datos.outcome === "FINALIZADA"
      ? "Contratación finalizada; la denuncia quedó resuelta."
      : "Contratación cancelada; la denuncia quedó resuelta.";
  });
}

/**
 * RN-09: devuelve la conversación, la contratación y la evidencia. Cada llamada registra el acceso
 * con su justificación; el contenido no se guarda en la página (al recargar se vuelve a justificar).
 */
export async function verEvidencia(
  reportId: string,
  justification: string,
): Promise<{ ok: true; data: EvidenceView } | { ok: false; message: string }> {
  let resultado: EvidenceView | undefined;
  const r = await runAction(async () => {
    resultado = await accessReportEvidence(
      await personal(),
      { reportId, justification },
      await currentRequestContext(),
    );
  });
  if (r.status === "ok" && resultado) {
    refresh();
    return { ok: true, data: resultado };
  }
  return { ok: false, message: r.fieldErrors?.justification?.[0] ?? r.message ?? "No se pudo acceder a la evidencia." };
}
