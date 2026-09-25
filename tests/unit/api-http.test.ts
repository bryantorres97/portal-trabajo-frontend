import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AuthError } from "@/server/auth/authorize";
import { DomainError } from "@/server/errors";
import { assertSameOrigin, readJson, toProblem } from "@/server/http/api";

describe("toProblem (RFC 9457)", () => {
  it("AuthError → status y application/problem+json", async () => {
    const res = toProblem(new AuthError(401, "Se requiere iniciar sesión"));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({
      status: 401,
      title: "No autenticado",
      detail: "Se requiere iniciar sesión",
    });
  });

  it("ZodError → 422 con errores por campo", async () => {
    const r = z.object({ a: z.string() }).safeParse({});
    const res = toProblem(r.error);
    expect(res.status).toBe(422);
    expect((await res.json()).errors[0].path).toBe("a");
  });

  it("errores inesperados → 500 sin filtrar detalles internos", async () => {
    const res = toProblem(new Error("secreto interno"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secreto");
  });

  it("DomainError conserva su estado", () => {
    expect(toProblem(new DomainError(409, "x")).status).toBe(409);
  });
});

describe("assertSameOrigin (CSRF en mutaciones con cookie)", () => {
  const url = "http://localhost:3000/api/v1/me";
  it("acepta el mismo origen", () => {
    expect(() =>
      assertSameOrigin(new Request(url, { method: "PATCH", headers: { origin: "http://localhost:3000" } })),
    ).not.toThrow();
  });
  it("rechaza otro origen o ausencia de origen", () => {
    expect(() =>
      assertSameOrigin(new Request(url, { method: "PATCH", headers: { origin: "https://evil.example" } })),
    ).toThrow(AuthError);
    expect(() => assertSameOrigin(new Request(url, { method: "PATCH" }))).toThrow(AuthError);
  });
  it("exime a clientes con Bearer (app móvil, sin cookies)", () => {
    expect(() =>
      assertSameOrigin(new Request(url, { method: "PATCH", headers: { authorization: "Bearer x" } })),
    ).not.toThrow();
  });
});

describe("readJson", () => {
  it("exige Content-Type JSON y JSON válido", async () => {
    const schema = z.object({ a: z.number() });
    await expect(readJson(new Request("http://x", { method: "POST", body: "a=1" }), schema)).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(
      readJson(
        new Request("http://x", { method: "POST", body: "{", headers: { "content-type": "application/json" } }),
        schema,
      ),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      readJson(
        new Request("http://x", { method: "POST", body: '{"a":1}', headers: { "content-type": "application/json" } }),
        schema,
      ),
    ).resolves.toEqual({ a: 1 });
  });
});
