import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { loadUser, upsertUserFromLogin, type AppUser } from "@/server/auth/users";
import { reportMessage, sendMessage, startConversation } from "@/server/chat/chat";
import { getAdminDb } from "@/server/db/admin";
import { DomainError } from "@/server/errors";
import type { RequestContext } from "@/server/http/request-info";
import { accessReportEvidence, applyModeration, getReport, updateReport } from "@/server/reports/admin";
import { addReportFile, addReportNote, createReport, getMyReport } from "@/server/reports/reports";

/** Fase 8 — denuncias contra la base del CI (Storage real para la evidencia, RN-09 y sanciones). */

const ctx: RequestContext = { ip: "190.1.2.3", userAgent: "vitest", requestId: "req-f8" };
const ISS = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TestPool";
const ENTRA = "https://login.microsoftonline.com/tenant-pruebas/v2.0";

async function ciudadano(nombre: string): Promise<AppUser> {
  const { user } = await upsertUserFromLogin({
    issuer: ISS,
    sub: randomUUID(),
    provider: "COGNITO",
    emailVerified: true,
    displayName: nombre,
  });
  return (await loadUser(user.id)) as AppUser;
}

async function personal(rol: string): Promise<AppUser> {
  const db = getAdminDb();
  const { data, error } = await db
    .from("users")
    .insert({ display_name: `Funcionario ${rol}` })
    .select("id")
    .single();
  if (error) throw error;
  await db.from("user_identities").insert({ user_id: data.id, issuer: ENTRA, sub: randomUUID(), provider: "ENTRA" });
  await db.from("user_roles").insert({ user_id: data.id, role_code: rol });
  return (await loadUser(data.id)) as AppUser;
}

async function estado<T>(p: Promise<T>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof DomainError ? e.status : "error";
  }
}

const png = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], "captura.png", {
    type: "image/png",
  });

let cliente: AppUser;
let trabajador: AppUser;
let workerId: string;
let conversationId: string;
let messageId: number;

beforeAll(async () => {
  cliente = await ciudadano("Lucía Andrade");
  trabajador = await ciudadano("Pedro Pintor");
  const { data, error } = await getAdminDb()
    .from("worker_profiles")
    .insert({
      user_id: trabajador.id,
      first_names: "Pedro",
      last_names: "Pintor",
      public_display_name: `Pedro ${randomUUID().slice(0, 4)}`,
      status: "HABILITADO",
    })
    .select("id")
    .single();
  if (error) throw error;
  workerId = data.id as string;
  conversationId = (await startConversation(cliente, { workerId, body: "Hola" }, ctx)).conversationId;
  messageId = await sendMessage(trabajador, conversationId, { body: "Deposítame por adelantado" });
});

describe("denuncias", () => {
  it("el denunciante crea, aporta información y adjunta un archivo al bucket privado", async () => {
    const id = await createReport(
      cliente,
      {
        targetType: "WORKER",
        targetId: workerId,
        reasonCode: "TRABAJADOR_FRAUDE",
        description: "Me pidió dinero por adelantado",
      },
      ctx,
    );
    await addReportNote(cliente, id, { note: "Fue el lunes a las 10:00" });
    await addReportFile(cliente, id, png());
    const r = await getMyReport(cliente, id);
    expect(r.evidence.map((e) => e.kind).sort()).toEqual(["FILE", "NOTE"]);
    const { data } = await getAdminDb()
      .from("report_evidence")
      .select("storage_path")
      .eq("report_id", id)
      .eq("kind", "FILE")
      .single();
    const { data: archivo } = await getAdminDb()
      .storage.from("report-evidence")
      .download(data!.storage_path as string);
    expect(archivo?.size).toBe(11);
    expect(await estado(getMyReport(trabajador, id))).toBe(404);
  });

  it("un archivo con contenido falso se rechaza (422)", async () => {
    const id = await createReport(
      cliente,
      {
        targetType: "CONVERSATION",
        targetId: conversationId,
        reasonCode: "CONVERSACION_ACOSO",
        description: "Me amenazó en la conversación",
      },
      ctx,
    );
    const falso = new File([new TextEncoder().encode("MZ ejecutable")], "foto.png", { type: "image/png" });
    expect(await estado(addReportFile(cliente, id, falso))).toBe(422);
  });

  it("RN-09: sin permiso de evidencia no se lee la conversación; con él, cada acceso queda registrado", async () => {
    const reportId = await reportMessage(cliente, messageId, { reasonCode: "MENSAJE_FRAUDE" }, ctx);
    const moderador = await personal("MODERADOR");
    const responsable = await personal("RESP_DENUNCIAS");
    expect(
      await estado(
        accessReportEvidence(moderador, { reportId, justification: "Revisar el mensaje denunciado por fraude" }, ctx),
      ),
    ).toBe(403);
    const vista = await accessReportEvidence(
      responsable,
      { reportId, justification: "Verificar el cobro por adelantado denunciado" },
      ctx,
    );
    expect(vista.focusMessageId).toBe(messageId);
    expect(vista.conversation?.messages.some((m) => m.body === "Deposítame por adelantado")).toBe(true);
    const detalle = await getReport(responsable, reportId);
    expect(detalle.accesses).toHaveLength(1);
    expect(detalle.evidenceUnlockedUntil).not.toBeNull();

    await applyModeration(
      moderador,
      { reportId, action: "OCULTAR_MENSAJE", reason: "Intento de cobro fuera de la plataforma" },
      ctx,
    );
    expect(
      await updateReport(
        responsable,
        { reportId, op: "RESOLVE", resolution: "MEDIDAS_APLICADAS", note: "Mensaje ocultado" },
        ctx,
      ),
    ).toBe("RESUELTA");
  });

  it("dos responsables se asignan la misma denuncia a la vez: queda una sola asignación coherente", async () => {
    const id = await createReport(
      trabajador,
      {
        targetType: "CLIENT",
        targetId: conversationId,
        reasonCode: "CLIENTE_CONDUCTA",
        description: "El cliente me insultó",
      },
      ctx,
    );
    const [a, b] = [await personal("RESP_DENUNCIAS"), await personal("RESP_DENUNCIAS")];
    await Promise.all([
      updateReport(a, { reportId: id, op: "ASSIGN_ME" }, ctx),
      updateReport(b, { reportId: id, op: "ASSIGN_ME" }, ctx),
    ]);
    const r = await getReport(a, id);
    expect([a.id, b.id]).toContain(r.assignedTo);
    expect(r.status).toBe("EN_REVISION");
  });
});
