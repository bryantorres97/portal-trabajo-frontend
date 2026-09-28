import { beforeEach, describe, expect, it, vi } from "vitest";

import { modulosVisibles } from "@/components/admin/navegacion";
import {
  audienciaSchema,
  bajaDispositivoSchema,
  crearCampanaSchema,
  dispositivoAnonimoSchema,
  fechaLocalEcuador,
} from "@/server/domain/notifications/schemas";

const USUARIO = "00000000-0000-4000-8000-000000000001";
const AHORA = new Date("2026-09-27T15:00:00Z"); // 10:00 en Ecuador

const base = {
  title: "Feria de empleo",
  body: "Te esperamos el sábado en el parque Cevallos.",
  segment: "TODOS",
  platforms: ["WEB", "ANDROID", "IOS"],
};

describe("aviso del GAD: validación", () => {
  const schema = crearCampanaSchema(AHORA);

  it("acepta un aviso para todos y descarta destinatarios fuera de una selección", () => {
    const d = schema.parse({ ...base, userIds: [USUARIO], deviceIds: ["7"] });
    expect(d.segment).toBe("TODOS");
    expect(d.userIds).toEqual([]);
    expect(d.deviceIds).toEqual([]);
    expect(d.link).toBeNull();
    expect(d.scheduledAt).toBeNull();
  });

  it("una selección exige al menos una persona o un dispositivo", () => {
    const r = schema.safeParse({ ...base, segment: "SELECCION" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["segment"]);
    const ok = schema.parse({ ...base, segment: "SELECCION", deviceIds: ["12", "12"] });
    expect(ok.deviceIds).toEqual([12, 12]);
  });

  it("limita título y mensaje, y exige una plataforma", () => {
    expect(schema.safeParse({ ...base, title: "x".repeat(66) }).success).toBe(false);
    expect(schema.safeParse({ ...base, body: "x".repeat(241) }).success).toBe(false);
    expect(schema.safeParse({ ...base, platforms: [] }).success).toBe(false);
    expect(schema.safeParse({ ...base, platforms: ["DESKTOP"] }).success).toBe(false);
    expect(schema.parse({ ...base, platforms: ["WEB", "WEB"] }).platforms).toEqual(["WEB"]);
  });

  it("el enlace solo admite rutas internas del portal", () => {
    expect(schema.parse({ ...base, link: " /preguntas-frecuentes " }).link).toBe("/preguntas-frecuentes");
    for (const link of ["https://evil.test", "//evil.test", "/\\evil", "/", "/con espacio", "javascript:alert(1)"]) {
      expect(schema.safeParse({ ...base, link }).success, link).toBe(false);
    }
  });

  it("programa en hora de Ecuador, solo a futuro y hasta 90 días", () => {
    expect(schema.parse({ ...base, scheduledAt: "2026-09-28T08:30" }).scheduledAt?.toISOString()).toBe(
      "2026-09-28T13:30:00.000Z",
    );
    expect(schema.safeParse({ ...base, scheduledAt: "2026-09-27T09:00" }).success).toBe(false);
    expect(schema.safeParse({ ...base, scheduledAt: "2027-01-10T08:00" }).success).toBe(false);
    expect(schema.safeParse({ ...base, scheduledAt: "mañana" }).success).toBe(false);
    expect(schema.parse({ ...base, scheduledAt: "" }).scheduledAt).toBeNull();
    expect(fechaLocalEcuador("2026-13-01T08:00")).toBeNull();
  });

  it("valida la estimación, los dispositivos anónimos y la baja", () => {
    expect(audienciaSchema.safeParse({ segment: "CLIENTES", platforms: [] }).success).toBe(false);
    expect(dispositivoAnonimoSchema.safeParse({ platform: "WEB", token: "t".repeat(40) }).success).toBe(false);
    expect(dispositivoAnonimoSchema.safeParse({ platform: "IOS", token: "t".repeat(40) }).success).toBe(true);
    expect(bajaDispositivoSchema.parse({ token: "t".repeat(40) }).keepAnonymous).toBe(false);
  });
});

describe("FCM", () => {
  beforeEach(() => vi.resetModules());

  it("solo desactiva el dispositivo cuando el error es del token", async () => {
    const { isInvalidTokenResponse } = await import("@/server/notifications/fcm");
    expect(isInvalidTokenResponse(404, "")).toBe(true);
    expect(isInvalidTokenResponse(400, '{"status":"UNREGISTERED"}')).toBe(true);
    expect(
      isInvalidTokenResponse(400, "INVALID_ARGUMENT The registration token is not a valid FCM registration token"),
    ).toBe(true);
    // Un mensaje mal armado no significa que el dispositivo ya no exista.
    expect(isInvalidTokenResponse(400, "INVALID_ARGUMENT Invalid value at 'message.webpush.fcm_options.link'")).toBe(
      false,
    );
    expect(isInvalidTokenResponse(503, "UNAVAILABLE")).toBe(false);
  });

  it("usa el canal de Android de la app según el evento", async () => {
    const { buildFcmMessage } = await import("@/server/notifications/fcm");
    const canal = (event?: string) =>
      buildFcmMessage("tok", { title: "t", body: "b", link: "/", data: event ? { event } : undefined }).message.android
        .notification.channel_id;
    expect(canal("NEW_MESSAGE")).toBe("mensajes");
    expect(canal("CONTRACT_UPDATE")).toBe("contrataciones");
    expect(canal("REVIEW_REQUEST")).toBe("contrataciones");
    expect(canal("AVISO_GAD")).toBe("avisos_gad");
    expect(canal()).toBe("avisos_gad");
  });

  it("sin HTTPS no incluye fcm_options.link (FCM lo rechazaría)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3300");
    const { buildFcmMessage } = await import("@/server/notifications/fcm");
    const m = buildFcmMessage("tok", { title: "Aviso", body: "Hola", link: "/oficios" });
    expect(m.message.webpush).not.toHaveProperty("fcm_options");
    expect(m.message.data).toEqual({ link: "/oficios" });
  });
});

describe("despacho de avisos", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("FCM_PROJECT_ID", "llankana-test");
    vi.stubEnv("FCM_CLIENT_EMAIL", "push@llankana-test.iam.gserviceaccount.com");
    vi.stubEnv("FCM_PRIVATE_KEY", "clave");
  });

  function dbFalsa(lote: unknown[]) {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "fn_claim_push_deliveries") return { data: lote, error: null };
      return { data: null, error: null };
    });
    vi.doMock("@/server/db/admin", () => ({ getAdminDb: () => ({ rpc }) }));
    return rpc;
  }

  const entrega = (id: number, token: string) => ({
    id,
    campaign_id: "c1",
    token,
    title: "Feria",
    body: "Sábado",
    link: null,
  });

  it("traduce cada resultado de FCM y los registra en un solo llamado", async () => {
    const rpc = dbFalsa([entrega(1, "ok"), entrega(2, "baja"), entrega(3, "caido"), entrega(4, "excepcion")]);
    const { dispatchCampaignDeliveries } = await import("@/server/notifications/dispatcher");
    const send = vi.fn(async (token: string) => {
      if (token === "excepcion") throw new Error("red");
      if (token === "ok") return { ok: true, invalidToken: false };
      if (token === "baja") return { ok: false, invalidToken: true, error: "FCM 404" };
      return { ok: false, invalidToken: false, error: "FCM 503" };
    });

    const r = await dispatchCampaignDeliveries(200, send, 2);

    expect(r).toEqual({ claimed: 4, sent: 1, failed: 2, discarded: 1 });
    expect(send).toHaveBeenCalledWith("ok", {
      title: "Feria",
      body: "Sábado",
      link: "/",
      data: { event: "AVISO_GAD", campaignId: "c1" },
    });
    expect(rpc).toHaveBeenCalledWith("fn_complete_push_deliveries", {
      p_results: [
        { id: 1, result: "ENVIADA" },
        { id: 2, result: "DESCARTADA", error: "FCM 404", invalid: true },
        { id: 3, result: "REINTENTAR", error: "FCM 503" },
        { id: 4, result: "REINTENTAR", error: "red" },
      ],
    });
  });

  it("sin entregas pendientes no registra nada", async () => {
    const rpc = dbFalsa([]);
    const { dispatchCampaignDeliveries } = await import("@/server/notifications/dispatcher");
    expect(await dispatchCampaignDeliveries(200, vi.fn())).toEqual({ claimed: 0, sent: 0, failed: 0, discarded: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("sin Firebase configurado no toma envíos (quedan pendientes)", async () => {
    vi.stubEnv("FCM_PROJECT_ID", "");
    const rpc = dbFalsa([entrega(1, "ok")]);
    const { dispatchPending } = await import("@/server/notifications/dispatcher");
    expect((await dispatchPending({ send: vi.fn() })).skipped).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("dispositivos anónimos de la app", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("FCM_PROJECT_ID", "llankana-test");
    vi.stubEnv("FCM_CLIENT_EMAIL", "push@llankana-test.iam.gserviceaccount.com");
    vi.stubEnv("FCM_PRIVATE_KEY", "clave");
    vi.stubEnv("SESSION_SECRET", "s".repeat(40));
  });

  function dbFalsa(respuesta: string) {
    const rpc = vi.fn(async () => ({ data: respuesta, error: null }));
    vi.doMock("@/server/db/admin", () => ({ getAdminDb: () => ({ rpc }) }));
    return rpc;
  }

  const token = "t".repeat(40);

  it("guarda un HMAC de la IP, nunca la IP", async () => {
    const rpc = dbFalsa("OK");
    const { registerAnonymousDevice } = await import("@/server/notifications/notifications");
    await registerAnonymousDevice({ platform: "ANDROID", token }, "190.152.1.10", async () => true);
    const params = (rpc.mock.calls[0] as unknown as [string, Record<string, string>])[1];
    expect(params.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(params)).not.toContain("190.152.1.10");
  });

  it("rechaza tokens que FCM no reconoce y aplica el límite por IP", async () => {
    const rpc = dbFalsa("RATE_LIMITED");
    const { registerAnonymousDevice } = await import("@/server/notifications/notifications");
    await expect(
      registerAnonymousDevice({ platform: "IOS", token }, "1.1.1.1", async () => false),
    ).rejects.toMatchObject({
      status: 422,
    });
    expect(rpc).not.toHaveBeenCalled();
    await expect(
      registerAnonymousDevice({ platform: "IOS", token }, "1.1.1.1", async () => true),
    ).rejects.toMatchObject({
      status: 429,
    });
  });
});

describe("panel", () => {
  it("el módulo de notificaciones aparece solo con notifications.broadcast", () => {
    expect(modulosVisibles(["admin.access", "notifications.broadcast"]).map((m) => m.href)).toContain(
      "/admin/notificaciones",
    );
    expect(modulosVisibles(["admin.access", "content.manage"]).map((m) => m.href)).not.toContain(
      "/admin/notificaciones",
    );
  });
});
