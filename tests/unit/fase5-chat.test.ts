import { exportJWK, generateKeyPair, importJWK, jwtVerify } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  markReadSchema,
  preview,
  reportMessageSchema,
  sendMessageSchema,
  startConversationSchema,
} from "@/server/domain/chat/schemas";
import { fromPgError } from "@/server/errors";

const WORKER = "00000000-0000-4000-8000-000000000001";

describe("esquemas del chat", () => {
  it("recorta el mensaje y rechaza vacíos o de más de 2000 caracteres", () => {
    expect(sendMessageSchema.parse({ body: "  hola\r\n  " }).body).toBe("hola");
    expect(sendMessageSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ body: "x".repeat(2000) }).success).toBe(true);
  });

  it("clientMessageId debe ser un UUID (idempotencia)", () => {
    expect(sendMessageSchema.safeParse({ body: "a", clientMessageId: "123" }).success).toBe(false);
    expect(sendMessageSchema.parse({ body: "a", clientMessageId: "" }).clientMessageId).toBeUndefined();
  });

  it("iniciar exige un trabajador válido", () => {
    expect(startConversationSchema.safeParse({ workerId: "x", body: "hola" }).success).toBe(false);
    expect(startConversationSchema.safeParse({ workerId: WORKER, body: "hola" }).success).toBe(true);
  });

  it("valida la denuncia y el marcado de lectura", () => {
    expect(reportMessageSchema.safeParse({ reasonCode: "mensaje_spam" }).success).toBe(false);
    expect(reportMessageSchema.safeParse({ reasonCode: "MENSAJE_SPAM", description: "" }).success).toBe(true);
    expect(markReadSchema.parse({})).toEqual({ lastMessageId: undefined });
    expect(markReadSchema.safeParse({ lastMessageId: -1 }).success).toBe(false);
  });

  it("previsualiza en una línea", () => {
    expect(preview("hola\n\n   mundo")).toBe("hola mundo");
    expect(preview("a".repeat(100), 10)).toBe(`${"a".repeat(9)}…`);
  });
});

describe("límites anti-abuso", () => {
  it("program_limit_exceeded (54000) se traduce a 429", () => {
    expect(fromPgError({ code: "54000", message: "Estás enviando mensajes muy rápido" })).toMatchObject({
      status: 429,
      code: "rate_limited",
    });
  });
});

describe("token de Realtime (ADR-004)", () => {
  let publica: CryptoKey;

  beforeAll(async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    publica = publicKey as CryptoKey;
    // Igual que el archivo de Supabase: con key_ops/use, que no deben impedir la importación.
    const jwk = { ...(await exportJWK(privateKey)), kid: "kid-prueba", key_ops: ["sign", "verify"], use: "sig" };
    vi.stubEnv("REALTIME_JWT_PRIVATE_KEY", JSON.stringify(jwk));
  });

  it("emite un JWT ES256 de 10 minutos con iss acolita, sub = users.id y rol authenticated", async () => {
    const { issueRealtimeToken } = await import("@/server/realtime/token");
    const { token, expiresAt } = await issueRealtimeToken(WORKER);
    const { payload, protectedHeader } = await jwtVerify(token, publica, {
      issuer: "acolita",
      audience: "authenticated",
    });
    expect(protectedHeader).toMatchObject({ alg: "ES256", kid: "kid-prueba" });
    expect(payload).toMatchObject({ sub: WORKER, role: "authenticated" });
    expect(payload.exp! - payload.iat!).toBe(600);
    expect(new Date(expiresAt).getTime()).toBe(payload.exp! * 1000);
  });

  it("un token firmado con otra clave no verifica", async () => {
    const { issueRealtimeToken } = await import("@/server/realtime/token");
    const { token } = await issueRealtimeToken(WORKER);
    const otra = (await generateKeyPair("ES256")).publicKey;
    await expect(jwtVerify(token, otra)).rejects.toThrow();
    await expect(importJWK({ kty: "EC" }, "ES256")).rejects.toThrow();
  });
});

describe("mensaje FCM", () => {
  it("arma el mensaje v1 con enlace absoluto para web push", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://acolita.test");
    const { buildFcmMessage } = await import("@/server/notifications/fcm");
    const m = buildFcmMessage("tok", { title: "Nuevo mensaje de Ana P.", body: "Hola", link: "/mensajes/abc" });
    expect(m.message).toMatchObject({
      token: "tok",
      notification: { title: "Nuevo mensaje de Ana P.", body: "Hola" },
      data: { link: "/mensajes/abc" },
      webpush: { fcm_options: { link: "https://acolita.test/mensajes/abc" } },
    });
  });
});
