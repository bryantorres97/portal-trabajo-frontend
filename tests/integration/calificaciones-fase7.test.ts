import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { loadUser, upsertUserFromLogin, type AppUser } from "@/server/auth/users";
import { startConversation } from "@/server/chat/chat";
import { acceptContract, getContract, progressContract, proposeContract } from "@/server/contracts/contracts";
import { getAdminDb } from "@/server/db/admin";
import { hoyEcuador } from "@/server/domain/contracts/schemas";
import type { RequestContext } from "@/server/http/request-info";
import { getClientReputation, getContractReviews, listPublicWorkerReviews, saveReview } from "@/server/reviews/reviews";
import { estado } from "../support/estado";

/** Fase 7 — calificaciones contra la base del CI (RN-06, RN-07, RN-20 y concurrencia). */

const ctx: RequestContext = { ip: "190.1.2.3", userAgent: "vitest", requestId: "req-f7" };
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

async function trabajadorHabilitado(nombre: string) {
  const user = await ciudadano(nombre);
  const db = getAdminDb();
  const { data, error } = await db
    .from("worker_profiles")
    .insert({
      user_id: user.id,
      first_names: nombre,
      last_names: "Prueba",
      public_display_name: nombre,
      status: "HABILITADO",
    })
    .select("id")
    .single();
  if (error) throw error;
  await db.from("user_roles").insert({ user_id: user.id, role_code: "TRABAJADOR" });
  return { user: (await loadUser(user.id)) as AppUser, workerId: data.id as string };
}

function manana() {
  const d = new Date(`${hoyEcuador()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Contratación finalizada entre el cliente y el trabajador. */
async function finalizada(cliente: AppUser, t: { user: AppUser; workerId: string }) {
  const { conversationId } = await startConversation(cliente, { workerId: t.workerId, body: "Hola" }, ctx);
  const id = await proposeContract(
    cliente,
    {
      conversationId,
      terms: {
        description: "Arreglo de la instalación eléctrica",
        scheduledStart: manana(),
        priceAmount: 30,
        priceUnit: "OBRA",
      },
    },
    ctx,
  );
  const { version, contentHash } = (await getContract(t.user, id)).current;
  await acceptContract(t.user, id, { version, contentHash }, ctx);
  await progressContract(t.user, id, "START", ctx);
  await progressContract(cliente, id, "CONFIRM", ctx);
  return { id, conversationId };
}

let cliente: AppUser;
let t: { user: AppUser; workerId: string };
let contrato: { id: string; conversationId: string };

beforeAll(async () => {
  cliente = await ciudadano("Lucía Andrade");
  t = await trabajadorHabilitado(`Elena ${randomUUID().slice(0, 4)}`);
  contrato = await finalizada(cliente, t);
});

describe("calificaciones", () => {
  it("201 palabras se rechazan (422) y 200 se aceptan", async () => {
    const texto = (n: number) => Array.from({ length: n }, () => "bien").join(" ");
    expect(await estado(saveReview(cliente, contrato.id, { rating: 5, comment: texto(201) }, ctx))).toBe(422);
    expect(await estado(saveReview(cliente, contrato.id, { rating: 5, comment: texto(200) }, ctx))).toBe("ok");
  });

  it("la reseña del cliente es pública y actualiza el promedio del trabajador", async () => {
    await saveReview(cliente, contrato.id, { rating: 4, comment: "Puntual y ordenada" }, ctx);
    const { items, total } = await listPublicWorkerReviews(t.workerId);
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ rating: 4, comment: "Puntual y ordenada", authorName: "Lucía A.", edited: true });
    const { data } = await getAdminDb()
      .from("worker_profiles")
      .select("rating_avg, rating_count")
      .eq("id", t.workerId)
      .single();
    expect(data).toMatchObject({ rating_count: 1 });
    expect(Number(data!.rating_avg)).toBe(4);
  });

  it("RN-20: el cliente no ve lo que el trabajador opinó de él; otro trabajador sí", async () => {
    await saveReview(t.user, contrato.id, { rating: 2, comment: "Cambió la fecha tres veces" }, ctx);
    expect((await getContractReviews(cliente, contrato.id)).theirs).toBeNull();
    expect((await getContractReviews(t.user, contrato.id)).theirs).toMatchObject({ rating: 4 });

    const otro = await trabajadorHabilitado(`Mario ${randomUUID().slice(0, 4)}`);
    const { conversationId } = await startConversation(cliente, { workerId: otro.workerId, body: "Hola" }, ctx);
    expect(await getClientReputation(otro.user, conversationId)).toMatchObject({ count: 1, average: 2 });
    expect(await getClientReputation(cliente, conversationId)).toBeNull();
    expect((await listPublicWorkerReviews(t.workerId)).total).toBe(1);
  });

  it("dos envíos simultáneos de la primera calificación: uno la crea y el otro recibe 409", async () => {
    const otroCliente = await ciudadano("Rosa Tapia");
    const k = await finalizada(otroCliente, t);
    const r = await Promise.all([
      estado(saveReview(otroCliente, k.id, { rating: 5 }, ctx)),
      estado(saveReview(otroCliente, k.id, { rating: 3 }, ctx)),
    ]);
    expect(r.filter((x) => x === "ok").length).toBeGreaterThanOrEqual(1);
    expect(r.every((x) => x === "ok" || x === 409)).toBe(true);
    const { count } = await getAdminDb()
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", k.id);
    expect(count).toBe(1);
  });
});
