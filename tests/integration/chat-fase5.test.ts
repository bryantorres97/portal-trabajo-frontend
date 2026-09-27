import { randomUUID } from "node:crypto";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadUser, upsertUserFromLogin, type AppUser } from "@/server/auth/users";
import {
  getConversation,
  listConversations,
  listMessages,
  markConversationRead,
  reportMessage,
  sendMessage,
  setConversationBlock,
  startConversation,
} from "@/server/chat/chat";
import { getAdminDb } from "@/server/db/admin";
import { DomainError } from "@/server/errors";
import type { RequestContext } from "@/server/http/request-info";
import { dispatchOutbox, listNotifications, registerDevice } from "@/server/notifications/notifications";
import { issueRealtimeToken } from "@/server/realtime/token";

/** Fase 5 — chat contra Supabase local, con Realtime real (requiere supabase/signing_keys.json). */

const ctx: RequestContext = { ip: "190.1.2.3", userAgent: "vitest", requestId: "req-f5" };
const ISS = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TestPool";

async function ciudadano(nombre = "Persona Prueba"): Promise<AppUser> {
  const { user } = await upsertUserFromLogin({
    issuer: ISS,
    sub: randomUUID(),
    provider: "COGNITO",
    emailVerified: true,
    displayName: nombre,
  });
  return (await loadUser(user.id)) as AppUser;
}

/** Trabajador HABILITADO con cuenta vinculada. */
async function trabajador(): Promise<{ user: AppUser; workerId: string }> {
  const user = await ciudadano("Trabajador Prueba");
  const { data, error } = await getAdminDb()
    .from("worker_profiles")
    .insert({
      user_id: user.id,
      first_names: "Trabajador",
      last_names: "Prueba",
      public_display_name: `Trabajador ${randomUUID().slice(0, 4)}`,
      status: "HABILITADO",
    })
    .select("id")
    .single();
  if (error) throw error;
  return { user, workerId: data.id as string };
}

const abiertos: SupabaseClient[] = [];

/** Cliente de Realtime del navegador simulado: suscripción privada con el token del servidor. */
async function suscribir(userId: string, topic: string, token?: string) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  abiertos.push(sb);
  await sb.realtime.setAuth(token ?? (await issueRealtimeToken(userId)).token);
  const recibidos: { event: string; payload: Record<string, unknown>; at: number }[] = [];
  const canal: RealtimeChannel = sb.channel(topic, { config: { private: true } });
  for (const event of ["message", "read", "status", "inbox"]) {
    canal.on("broadcast", { event }, ({ payload }) => recibidos.push({ event, payload, at: Date.now() }));
  }
  const estado = await new Promise<string>((res) => {
    const t = setTimeout(() => res("TIMEOUT"), 8000);
    canal.subscribe((s, err) => {
      if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
        clearTimeout(t);
        res(s + (err ? `: ${err.message}` : ""));
      }
    });
  });
  return { estado, recibidos };
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hasta(cond: () => boolean, ms = 5000) {
  const fin = Date.now() + ms;
  while (!cond() && Date.now() < fin) await esperar(25);
  return cond();
}

afterAll(async () => {
  for (const sb of abiertos) {
    await sb.removeAllChannels();
    sb.realtime.disconnect();
  }
});

let cliente: AppUser;
let w: { user: AppUser; workerId: string };
let conversationId: string;

beforeAll(async () => {
  cliente = await ciudadano("Lucía Andrade");
  w = await trabajador();
  const r = await startConversation(cliente, { workerId: w.workerId, body: "Hola, ¿tiene disponibilidad?" }, ctx);
  conversationId = r.conversationId;
});

describe("conversaciones y mensajes", () => {
  it("el cliente inicia y el trabajador ve la conversación con el nombre abreviado del cliente", async () => {
    const [delTrabajador] = await listConversations(w.user);
    expect(delTrabajador).toMatchObject({
      id: conversationId,
      myRole: "TRABAJADOR",
      counterpartName: "Lucía A.",
      unread: 1,
    });
    const again = await startConversation(cliente, { workerId: w.workerId, body: "¿Me confirma?" }, ctx);
    expect(again).toMatchObject({ conversationId, created: false });
  });

  it("un tercero no ve la conversación (404) y la API no revela su existencia", async () => {
    const tercero = await ciudadano();
    await expect(getConversation(tercero, conversationId)).rejects.toMatchObject({ status: 404 });
    await expect(listMessages(tercero, conversationId)).rejects.toMatchObject({ status: 404 });
    await expect(sendMessage(tercero, conversationId, { body: "hola" })).rejects.toMatchObject({ status: 404 });
  });

  it("pagina el historial en orden cronológico", async () => {
    const r = await listMessages(cliente, conversationId, { limit: 1 });
    expect(r.items).toHaveLength(1);
    expect(r.hasMore).toBe(true);
    const anteriores = await listMessages(cliente, conversationId, { before: r.items[0].id, limit: 50 });
    expect(anteriores.items.at(-1)!.id).toBeLessThan(r.items[0].id);
  });

  it("el bloqueo impide enviar a ambas partes hasta que se levanta", async () => {
    await setConversationBlock(w.user, conversationId, true, ctx);
    await expect(sendMessage(cliente, conversationId, { body: "¿Hola?" })).rejects.toMatchObject({ status: 403 });
    await expect(sendMessage(w.user, conversationId, { body: "Hola" })).rejects.toMatchObject({ status: 403 });
    await setConversationBlock(w.user, conversationId, false, ctx);
    await expect(sendMessage(cliente, conversationId, { body: "¿Hola?" })).resolves.toBeGreaterThan(0);
  });

  it("aplica el límite de 20 mensajes por minuto (429)", async () => {
    const c = await ciudadano();
    const t = await trabajador();
    const { conversationId: id } = await startConversation(c, { workerId: t.workerId, body: "1" }, ctx);
    for (let i = 2; i <= 20; i++) await sendMessage(c, id, { body: String(i) });
    await expect(sendMessage(c, id, { body: "21" })).rejects.toMatchObject({ status: 429 });
  });

  it("la denuncia de un mensaje no se repite mientras esté abierta", async () => {
    const { items } = await listMessages(cliente, conversationId);
    const ajeno = items.find((m) => !m.isMine);
    const id = ajeno?.id ?? (await sendMessage(w.user, conversationId, { body: "Mensaje a denunciar" }));
    await reportMessage(cliente, id, { reasonCode: "MENSAJE_OFENSIVO" }, ctx);
    await expect(reportMessage(cliente, id, { reasonCode: "MENSAJE_OFENSIVO" }, ctx)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("concurrencia e idempotencia", () => {
  it("dos emisores simultáneos: todos los mensajes, sin pérdidas, orden estable por id", async () => {
    const c = await ciudadano();
    const t = await trabajador();
    const { conversationId: id } = await startConversation(c, { workerId: t.workerId, body: "inicio" }, ctx);
    await Promise.all([
      ...Array.from({ length: 10 }, (_, i) => sendMessage(c, id, { body: `c${i}` })),
      ...Array.from({ length: 10 }, (_, i) => sendMessage(t.user, id, { body: `t${i}` })),
    ]);
    const { items } = await listMessages(c, id, { limit: 100 });
    expect(items).toHaveLength(21);
    expect(items.map((m) => m.id)).toEqual([...items.map((m) => m.id)].sort((a, b) => a - b));
    // Los envíos paralelos de un mismo emisor no tienen orden garantizado: se verifica el conjunto.
    const deC = items.filter((m) => m.isMine && m.body !== "inicio").map((m) => m.body);
    expect([...deC].sort()).toEqual(Array.from({ length: 10 }, (_, i) => `c${i}`));
  });

  it("el mismo clientMessageId enviado en paralelo crea un solo mensaje", async () => {
    const clientMessageId = randomUUID();
    const ids = await Promise.all(
      Array.from({ length: 5 }, () => sendMessage(cliente, conversationId, { body: "una vez", clientMessageId })),
    );
    expect(new Set(ids).size).toBe(1);
    const { count } = await getAdminDb()
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("client_message_id", clientMessageId);
    expect(count).toBe(1);
  });
});

describe("tiempo real (Supabase Realtime, canales privados)", () => {
  it("las dos partes se suscriben; un tercero y un token ajeno no", async () => {
    expect((await suscribir(cliente.id, `conversation:${conversationId}`)).estado).toBe("SUBSCRIBED");
    expect((await suscribir(w.user.id, `conversation:${conversationId}`)).estado).toBe("SUBSCRIBED");
    const tercero = await ciudadano();
    expect((await suscribir(tercero.id, `conversation:${conversationId}`)).estado).toMatch(/^CHANNEL_ERROR/);
    expect((await suscribir(tercero.id, `user:${cliente.id}`)).estado).toMatch(/^CHANNEL_ERROR/);
    expect((await suscribir(cliente.id, `user:${cliente.id}`, "no-es-un-jwt")).estado).toMatch(/^CHANNEL_ERROR/);
  }, 45000);

  it("entrega los mensajes en tiempo real con p95 < 1 s y avisa a la bandeja", async () => {
    const sala = await suscribir(w.user.id, `conversation:${conversationId}`);
    const bandeja = await suscribir(w.user.id, `user:${w.user.id}`);
    expect(sala.estado).toBe("SUBSCRIBED");
    await esperar(300);
    const latencias: number[] = [];
    for (let i = 0; i < 12; i++) {
      const cuerpo = `tr-${i}-${randomUUID().slice(0, 6)}`;
      const inicio = Date.now();
      await sendMessage(cliente, conversationId, { body: cuerpo });
      const ok = await hasta(
        () => sala.recibidos.some((r) => r.event === "message" && r.payload.body === cuerpo),
        3000,
      );
      expect(ok).toBe(true);
      latencias.push(sala.recibidos.find((r) => r.payload.body === cuerpo)!.at - inicio);
    }
    latencias.sort((a, b) => a - b);
    const p95 = latencias[Math.ceil(latencias.length * 0.95) - 1];
    expect(p95).toBeLessThan(1000);
    expect(bandeja.recibidos.some((r) => r.event === "inbox" && r.payload.conversationId === conversationId)).toBe(
      true,
    );
  }, 30000);

  it("el aviso de lectura llega a la otra parte", { timeout: 15000 }, async () => {
    const sala = await suscribir(cliente.id, `conversation:${conversationId}`);
    await esperar(300);
    await markConversationRead(w.user, conversationId);
    expect(await hasta(() => sala.recibidos.some((r) => r.event === "read" && r.payload.role === "TRABAJADOR"))).toBe(
      true,
    );
  });
});

describe("notificaciones", () => {
  it("una notificación in-app por conversación y push solo con dispositivos registrados", async () => {
    const c = await ciudadano();
    const t = await trabajador();
    const { conversationId: id } = await startConversation(c, { workerId: t.workerId, body: "Hola 1" }, ctx);
    await sendMessage(c, id, { body: "Hola 2" });
    const n = await listNotifications(t.user);
    expect(n.unread).toBe(1);
    expect(n.items[0]).toMatchObject({ type: "NEW_MESSAGE", link: `/mensajes/${id}`, body: "Hola 2" });

    const sinPush = await getAdminDb().from("notification_outbox").select("id").eq("recipient_id", t.user.id);
    expect(sinPush.data).toHaveLength(0);
    await registerDevice(t.user, { platform: "ANDROID", token: `token-de-prueba-${randomUUID()}` });
    await sendMessage(c, id, { body: "Hola 3" });
    const conPush = await getAdminDb().from("notification_outbox").select("status").eq("recipient_id", t.user.id);
    expect(conPush.data).toEqual([{ status: "PENDIENTE" }]);
    // Sin credenciales de FCM el despachador no toma nada.
    expect(await dispatchOutbox()).toEqual({ claimed: 0, sent: 0, failed: 0, skipped: true });
  });

  it("el personal del GAD no inicia conversaciones", async () => {
    const { data } = await getAdminDb().from("users").insert({ display_name: "Funcionario" }).select("id").single();
    await getAdminDb().from("user_identities").insert({
      user_id: data!.id,
      issuer: "https://login.microsoftonline.com/t/v2.0",
      sub: randomUUID(),
      provider: "ENTRA",
    });
    const staff = (await loadUser(data!.id)) as AppUser;
    await expect(startConversation(staff, { workerId: w.workerId, body: "Hola" }, ctx)).rejects.toBeInstanceOf(
      DomainError,
    );
  });
});
