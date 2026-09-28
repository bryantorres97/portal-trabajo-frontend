import { describe, expect, it } from "vitest";

import { redactar } from "@/lib/logger";
import { toAuditRow } from "@/server/audit/log";

describe("toAuditRow", () => {
  it("normaliza la entrada con valores por defecto", () => {
    expect(toAuditRow({ action: "USER_LOGIN", actorId: "u1", ip: "190.1.2.3" })).toMatchObject({
      action: "USER_LOGIN",
      actor_id: "u1",
      actor_roles: [],
      result: "SUCCESS",
      ip: "190.1.2.3",
      metadata: {},
    });
  });

  it("descarta IPs inválidas y trunca el user agent", () => {
    const row = toAuditRow({ action: "USER_LOGIN", ip: "no-es-ip", userAgent: "a".repeat(600) });
    expect(row.ip).toBeNull();
    expect(row.user_agent).toHaveLength(512);
  });

  it("rechaza acciones con formato inválido", () => {
    expect(() => toAuditRow({ action: "user login" })).toThrow();
  });
});

describe("redactar (logs sin datos sensibles)", () => {
  it("oculta tokens, secretos, cookies y cédulas en cualquier nivel", () => {
    expect(
      redactar({ accessToken: "a", nested: { client_secret: "b", cedula: "1800000000", ok: 1 }, cookie: "c" }),
    ).toEqual({
      accessToken: "[REDACTADO]",
      nested: { client_secret: "[REDACTADO]", cedula: "[REDACTADO]", ok: 1 },
      cookie: "[REDACTADO]",
    });
  });

  it("serializa errores sin stack", () => {
    expect(redactar(new Error("falló"))).toEqual({ name: "Error", message: "falló" });
  });
});
