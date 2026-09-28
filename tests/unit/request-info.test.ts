import { describe, expect, it } from "vitest";

import { requestInfo, safeReturnTo } from "@/server/http/request-info";

describe("safeReturnTo (prevención de open redirect)", () => {
  it.each([
    ["/cuenta", "/cuenta"],
    ["/admin/trabajadores?estado=HABILITADO", "/admin/trabajadores?estado=HABILITADO"],
  ])("acepta rutas internas: %s", (entrada, esperado) => {
    expect(safeReturnTo(entrada)).toBe(esperado);
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
    "/api/auth/logout",
  ])("rechaza %s y usa el valor por defecto", (entrada) => {
    expect(safeReturnTo(entrada)).toBe("/cuenta");
  });

  it("rechaza rutas excesivamente largas", () => {
    expect(safeReturnTo(`/${"a".repeat(600)}`)).toBe("/cuenta");
  });
});

describe("requestInfo", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    const info = requestInfo(new Headers({ "x-forwarded-for": "190.1.2.3, 10.0.0.1", "user-agent": "UA" }));
    expect(info).toEqual({ ip: "190.1.2.3", userAgent: "UA", requestId: null });
  });
});
