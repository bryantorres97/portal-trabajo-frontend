import { describe, expect, it } from "vitest";

import { clientProfileSchema, statusChangeSchema } from "@/server/domain/users/schemas";
import { DomainError, fromPgError } from "@/server/errors";

describe("clientProfileSchema", () => {
  it("normaliza espacios y teléfono; campos vacíos quedan como undefined", () => {
    expect(clientProfileSchema.parse({ fullName: "  Ana   María  Pérez ", phone: "099 123-4567", sector: "" })).toEqual(
      {
        fullName: "Ana María Pérez",
        phone: "0991234567",
        sector: undefined,
      },
    );
  });

  it.each(["12345", "0891234567", "09912345678", "abc"])("rechaza el teléfono %s", (phone) => {
    expect(clientProfileSchema.safeParse({ fullName: "Ana Pérez", phone }).success).toBe(false);
  });

  it("exige nombre de al menos 3 caracteres", () => {
    expect(clientProfileSchema.safeParse({ fullName: " A " }).success).toBe(false);
  });
});

describe("statusChangeSchema", () => {
  const userId = "00000000-0000-4000-8000-000000000001";
  it("exige motivo al bloquear, no al desbloquear", () => {
    expect(statusChangeSchema.safeParse({ userId, status: "BLOQUEADO", reason: "" }).success).toBe(false);
    expect(statusChangeSchema.safeParse({ userId, status: "BLOQUEADO", reason: "Spam reiterado" }).success).toBe(true);
    expect(statusChangeSchema.safeParse({ userId, status: "ACTIVO" }).success).toBe(true);
  });

  it("no permite el estado ELIMINADO desde la administración", () => {
    expect(statusChangeSchema.safeParse({ userId, status: "ELIMINADO" }).success).toBe(false);
  });
});

describe("fromPgError", () => {
  it.each([
    ["42501", 403],
    ["P0002", 404],
    ["23505", 409],
    ["23514", 422],
  ])("traduce %s a %i conservando el mensaje de la función SQL", (code, status) => {
    const e = fromPgError({ code, message: "mensaje de la función" });
    expect(e).toBeInstanceOf(DomainError);
    expect(e).toMatchObject({ status, message: "mensaje de la función" });
  });

  it("devuelve null para errores no previstos", () => {
    expect(fromPgError({ code: "08006", message: "conexión" })).toBeNull();
    expect(fromPgError(null)).toBeNull();
  });
});
