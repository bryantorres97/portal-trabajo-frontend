import { describe, expect, it } from "vitest";

import { AuthError, hasPermission, requirePermission, requireUser } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";

function usuario(parcial: Partial<AppUser> = {}): AppUser {
  return {
    id: "u1",
    email: "a@b.ec",
    displayName: null,
    status: "ACTIVO",
    roles: ["CLIENTE"],
    permissions: [],
    ...parcial,
  };
}

describe("autorización por permiso (ADR-006)", () => {
  it("sin usuario → 401", () => {
    expect(() => requirePermission(null, "admin.access")).toThrowError(
      expect.objectContaining({ status: 401 }) as unknown as Error,
    );
  });

  it("usuario bloqueado → 403 aunque tenga el permiso", () => {
    const u = usuario({ status: "BLOQUEADO", permissions: ["admin.access"] });
    expect(hasPermission(u, "admin.access")).toBe(false);
    expect(() => requirePermission(u, "admin.access")).toThrow(AuthError);
    expect(() => requireUser(u)).toThrow(AuthError);
  });

  it("sin el permiso → 403", () => {
    try {
      requirePermission(usuario(), "worker.enable");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).status).toBe(403);
    }
  });

  it("con el permiso → devuelve el usuario", () => {
    const u = usuario({ roles: ["ADMIN_TRABAJADORES"], permissions: ["worker.enable"] });
    expect(requirePermission(u, "worker.enable")).toBe(u);
  });
});
