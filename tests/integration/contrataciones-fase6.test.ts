import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { loadUser, upsertUserFromLogin, type AppUser } from "@/server/auth/users";
import { listMessages, startConversation } from "@/server/chat/chat";
import {
  acceptContract,
  counterContract,
  declineContract,
  getContract,
  listContracts,
  progressContract,
  proposeContract,
} from "@/server/contracts/contracts";
import { getAdminDb } from "@/server/db/admin";
import { hoyEcuador } from "@/server/domain/contracts/schemas";
import { DomainError } from "@/server/errors";
import type { RequestContext } from "@/server/http/request-info";

/** Fase 6 — contrataciones contra la base del CI (concurrencia real entre conexiones). */

const ctx: RequestContext = { ip: "190.1.2.3", userAgent: "vitest", requestId: "req-f6" };
const ISS = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TestPool";

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

function enDias(n: number) {
  const d = new Date(`${hoyEcuador()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const terminos = (precio = 45) => ({
  description: "Pintar la fachada de la casa (dos pisos)",
  scheduledStart: enDias(5),
  parishCode: "atocha-ficoa",
  locationDetail: "Av. Cevallos y Montalvo",
  priceAmount: precio,
  priceUnit: "OBRA",
});

let cliente: AppUser;
let trabajador: AppUser;
let conversationId: string;

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
  conversationId = (await startConversation(cliente, { workerId: data.id, body: "Hola, ¿pinta fachadas?" }, ctx))
    .conversationId;
});

async function estado<T>(p: Promise<T>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof DomainError ? e.status : "error";
  }
}

describe("negociación y aceptación bilateral", () => {
  it("la contratación nace con la propuesta y se confirma con la aceptación de la misma versión", async () => {
    const id = await proposeContract(cliente, { conversationId, terms: terminos() }, ctx);
    const vistoPorTrabajador = await getContract(trabajador, id);
    expect(vistoPorTrabajador).toMatchObject({ status: "PROPUESTA_ENVIADA", myRole: "TRABAJADOR" });
    expect(vistoPorTrabajador.actions).toEqual(["ACCEPT", "COUNTER", "REJECT"]);
    expect(vistoPorTrabajador.current.locationDetail).toBe("Av. Cevallos y Montalvo");

    const { version, contentHash } = vistoPorTrabajador.current;
    expect(await acceptContract(trabajador, id, { version, contentHash }, ctx)).toBe("CONTRATADA");

    const [mio] = await listContracts(cliente, { scope: "activas" }, conversationId);
    expect(mio).toMatchObject({ id, status: "CONTRATADA", needsMyAction: false, counterpartName: expect.any(String) });
    const { items } = await listMessages(cliente, conversationId);
    expect(items.filter((m) => m.kind === "SYSTEM" && m.contractId === id)).toHaveLength(2);

    // Cierra este caso para no bloquear la conversación en los siguientes.
    await progressContract(trabajador, id, "START", ctx);
    expect(await progressContract(cliente, id, "CONFIRM", ctx)).toBe("FINALIZADA");
  });

  it("aceptaciones y contrapropuestas simultáneas se serializan: solo una gana, la otra recibe 409", async () => {
    const id = await proposeContract(cliente, { conversationId, terms: terminos(50) }, ctx);
    const { version, contentHash } = (await getContract(trabajador, id)).current;

    const resultados = await Promise.all([
      estado(acceptContract(trabajador, id, { version, contentHash }, ctx)),
      estado(counterContract(trabajador, id, { baseVersion: version, terms: terminos(80) }, ctx)),
      estado(counterContract(cliente, id, { baseVersion: version, terms: terminos(55) }, ctx)),
    ]);
    expect(resultados.filter((r) => r === "ok")).toHaveLength(1);
    expect(resultados.filter((r) => r === 409)).toHaveLength(2);

    const final = await getContract(cliente, id);
    const aceptada = resultados[0] === "ok";
    expect(final.status).toBe(aceptada ? "CONTRATADA" : "PROPUESTA_ENVIADA");
    expect(final.versions).toHaveLength(aceptada ? 1 : 2);
    if (final.status === "PROPUESTA_ENVIADA") {
      await declineContract(
        final.current.proposedByMe ? cliente : trabajador,
        id,
        final.current.proposedByMe ? "WITHDRAW" : "REJECT",
        { version: final.current.version },
        ctx,
      );
    } else {
      await progressContract(trabajador, id, "START", ctx);
      await progressContract(cliente, id, "CONFIRM", ctx);
    }
  });

  it("dos propuestas simultáneas en la misma conversación: una se crea y la otra recibe 409", async () => {
    const resultados = await Promise.all([
      estado(proposeContract(cliente, { conversationId, terms: terminos(40) }, ctx)),
      estado(proposeContract(trabajador, { conversationId, terms: terminos(60) }, ctx)),
    ]);
    expect(resultados.sort()).toEqual([409, "ok"]);
  });

  it("un tercero no ve ni actúa sobre la contratación (404)", async () => {
    const [abierta] = await listContracts(cliente, { scope: "activas" }, conversationId);
    const intruso = await ciudadano("Tercero Curioso");
    expect(await estado(getContract(intruso, abierta.id))).toBe(404);
    expect(await estado(progressContract(intruso, abierta.id, "START", ctx))).toBe(404);
    expect(await listContracts(intruso, { scope: "todas" })).toEqual([]);
  });
});
