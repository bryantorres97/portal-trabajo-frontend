"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionState } from "@/lib/action-state";
import { AuthError } from "@/server/auth/authorize";
import { getCurrentAuth } from "@/server/auth/current-user";
import { workerFormFromFormData } from "@/server/domain/workers/schemas";
import { ETIQUETAS_ESTADO } from "@/server/domain/workers/state-machine";
import { formToObject, runAction } from "@/server/http/action";
import { currentRequestContext } from "@/server/http/request-info";
import { issueActivationCode } from "@/server/workers/activation";
import { createWorker, updateWorker, changeWorkerStatus, type DuplicateCandidate } from "@/server/workers/admin";
import { reviewDocument, uploadDocument } from "@/server/workers/documents";
import { reviewWorkerPhoto, reviewWorkerProfile, setWorkerPhoto } from "@/server/workers/public-profile";
import { enrollWorker, saveTraining, updateEnrollment } from "@/server/workers/training";

/** Las acciones del panel exigen una sesión del personal (Entra ID, ADR-012); los permisos los verifica cada caso de uso. */
async function actor() {
  const auth = await getCurrentAuth();
  if (!auth) throw new AuthError(401, "Tu sesión expiró. Vuelve a ingresar.");
  if (auth.source !== "ENTRA") throw new AuthError(403, "Esta acción requiere una cuenta institucional del GAD.");
  return auth.user;
}

export type WorkerFormState = ActionState & { duplicates?: DuplicateCandidate[] };

export async function registrarTrabajador(_prev: WorkerFormState, formData: FormData): Promise<WorkerFormState> {
  let creado: string | undefined;
  let duplicados: DuplicateCandidate[] | undefined;
  const estado = await runAction(async () => {
    const r = await createWorker(await actor(), workerFormFromFormData(formData), await currentRequestContext());
    if (r.status === "duplicates") duplicados = r.candidates;
    else creado = r.id;
  });
  if (estado.status === "error") return estado;
  if (duplicados) {
    return {
      status: "error",
      message: "Encontramos posibles registros duplicados. Revísalos antes de continuar.",
      duplicates: duplicados,
    };
  }
  redirect(`/admin/trabajadores/${creado}?registrado=1`);
}

export async function guardarTrabajador(_prev: WorkerFormState, formData: FormData): Promise<WorkerFormState> {
  const workerId = z.uuid().safeParse(formData.get("workerId"));
  if (!workerId.success) return { status: "error", message: "Trabajador no válido." };
  const estado = await runAction(async () => {
    await updateWorker(await actor(), workerId.data, workerFormFromFormData(formData), await currentRequestContext());
  });
  if (estado.status === "error") return estado;
  redirect(`/admin/trabajadores/${workerId.data}?guardado=1`);
}

export async function cambiarEstadoTrabajador(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const to = await changeWorkerStatus(await actor(), formToObject(formData), await currentRequestContext());
    refresh();
    return `Estado actualizado: ${ETIQUETAS_ESTADO[to]}.`;
  });
}

export async function subirDocumento(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await uploadDocument(await actor(), formData, await currentRequestContext());
    refresh();
    return "Documento cargado. Queda pendiente de revisión.";
  });
}

export async function revisarDocumento(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const r = await reviewDocument(await actor(), formToObject(formData), await currentRequestContext());
    refresh();
    return r === "VALIDADO" ? "Documento validado." : "Documento rechazado.";
  });
}

export async function inscribirCapacitacion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await enrollWorker(await actor(), formToObject(formData), await currentRequestContext());
    refresh();
    return "Trabajador inscrito en la capacitación.";
  });
}

export async function actualizarInscripcion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await updateEnrollment(await actor(), formToObject(formData), await currentRequestContext());
    refresh();
    return "Inscripción actualizada.";
  });
}

export async function emitirCodigoActivacion(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let emitido: { code: string; expiresAt: string } | undefined;
  const estado = await runAction(async () => {
    const workerId = z.uuid().parse(formData.get("workerId"));
    emitido = await issueActivationCode(await actor(), workerId, await currentRequestContext());
  });
  if (estado.status === "error" || !emitido) return estado;
  // No se llama a refresh(): el código se muestra una sola vez en este formulario.
  return { status: "ok", message: "Código emitido. Entrégalo al trabajador.", data: emitido };
}

export async function subirFotoTrabajador(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const workerId = z.uuid().parse(formData.get("workerId"));
    await setWorkerPhoto(await actor(), workerId, formData.get("file"), await currentRequestContext());
    refresh();
    return "Foto guardada.";
  });
}

export async function revisarFoto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const d = await reviewWorkerPhoto(await actor(), formToObject(formData), await currentRequestContext());
    refresh();
    return d === "APROBAR" ? "Foto aprobada y publicada." : "Foto rechazada.";
  });
}

export async function revisarPerfil(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const d = await reviewWorkerProfile(await actor(), formToObject(formData), await currentRequestContext());
    refresh();
    return d === "APROBAR" ? "Cambios publicados en el perfil." : "Cambios rechazados.";
  });
}

export async function guardarCurso(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    await saveTraining(await actor(), formToObject(formData), await currentRequestContext());
    refresh();
    return "Curso guardado.";
  });
}
