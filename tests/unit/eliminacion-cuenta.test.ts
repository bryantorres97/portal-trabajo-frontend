import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";

/**
 * Eliminación de cuenta (ADR-018): la base hace el trabajo en `fn_delete_account`; aquí se prueba
 * lo que queda en el servidor (revocar tokens web, borrar archivos, cookie, errores de la API).
 */

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  remove: vi.fn(),
  revokeEncryptedTokens: vi.fn(),
  apiUser: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/server/db/admin", () => ({
  getAdminDb: () => ({ rpc: mocks.rpc, storage: { from: () => ({ remove: mocks.remove }) } }),
}));
vi.mock("@/server/auth/session", () => ({ revokeEncryptedTokens: mocks.revokeEncryptedTokens }));
vi.mock("@/server/http/api-auth", () => ({ apiUser: mocks.apiUser, apiConsentedUser: mocks.apiUser }));
vi.mock("@/lib/logger", () => ({ logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn() } }));

const { deleteAccount, getAccountDeletionCheck } = await import("@/server/users/account-deletion");
const meRoute = await import("@/app/api/v1/me/route");
const deletionRoute = await import("@/app/api/v1/me/deletion/route");

const usuario: AppUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@test.ec",
  displayName: "Ana",
  status: "ACTIVO",
  roles: ["CLIENTE", "TRABAJADOR"],
  permissions: [],
};
const ctx = { ip: "190.1.2.3", userAgent: "okhttp", requestId: "req-1" };
const eliminada = {
  cancelledProposals: 1,
  closedConversations: 2,
  tokens: ["jwe-1"],
  files: ["workers/w/photos/f.jpg", "workers/w/documents/d.pdf"],
};

function borrar(bearer = true) {
  return new Request("https://llankana.test/api/v1/me", {
    method: "DELETE",
    headers: bearer ? { authorization: "Bearer x" } : { origin: "https://otro.test" },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.revokeEncryptedTokens.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue({ data: [], error: null });
});

describe("deleteAccount", () => {
  it("llama a la base con los datos de auditoría y limpia tokens y archivos", async () => {
    mocks.rpc.mockResolvedValue({ data: eliminada, error: null });
    const r = await deleteAccount(usuario, ctx);
    expect(mocks.rpc).toHaveBeenCalledWith("fn_delete_account", {
      p_user_id: usuario.id,
      p_ip: "190.1.2.3",
      p_user_agent: "okhttp",
      p_request_id: "req-1",
    });
    expect(mocks.revokeEncryptedTokens).toHaveBeenCalledWith(["jwe-1"]);
    expect(mocks.remove).toHaveBeenCalledWith(eliminada.files);
    expect(r).toEqual({ cancelledProposals: 1, closedConversations: 2 });
  });

  it("no toca el bucket si no hay archivos", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...eliminada, files: [] }, error: null });
    await deleteAccount(usuario, ctx);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("si falla la limpieza, la cuenta igual queda eliminada y se registra", async () => {
    mocks.rpc.mockResolvedValue({ data: eliminada, error: null });
    mocks.revokeEncryptedTokens.mockRejectedValue(new Error("cognito caído"));
    mocks.remove.mockResolvedValue({ data: null, error: { message: "storage caído" } });
    await expect(deleteAccount(usuario, ctx)).resolves.toEqual({ cancelledProposals: 1, closedConversations: 2 });
    expect(mocks.warn).toHaveBeenCalledWith("account.delete.token_revoke_failed", expect.anything());
    expect(mocks.warn).toHaveBeenCalledWith("account.delete.files_cleanup_failed", expect.anything());
  });

  it("con contrataciones en marcha no limpia nada", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "55000", message: "Tienes 1 contratación(es) en marcha." },
    });
    await expect(deleteAccount(usuario, ctx)).rejects.toMatchObject({ status: 409 });
    expect(mocks.revokeEncryptedTokens).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("getAccountDeletionCheck", () => {
  it("se puede eliminar si no hay contrataciones en marcha", async () => {
    mocks.rpc.mockResolvedValue({
      data: { isWorker: false, blockingContracts: [], pendingProposals: 2 },
      error: null,
    });
    await expect(getAccountDeletionCheck(usuario)).resolves.toEqual({
      canDelete: true,
      isWorker: false,
      blockingContracts: [],
      pendingProposals: 2,
    });
  });

  it("no se puede con una contratación confirmada", async () => {
    const c = { id: "c1", status: "CONTRATADA", role: "CLIENTE", counterpartName: "Walter P." };
    mocks.rpc.mockResolvedValue({
      data: { isWorker: false, blockingContracts: [c], pendingProposals: 0 },
      error: null,
    });
    expect((await getAccountDeletionCheck(usuario)).canDelete).toBe(false);
  });
});

describe("DELETE /api/v1/me", () => {
  it("elimina con Bearer y borra la cookie de sesión", async () => {
    mocks.apiUser.mockResolvedValue(usuario);
    mocks.rpc.mockResolvedValue({ data: eliminada, error: null });
    const res = await meRoute.DELETE(borrar());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelledProposals: 1, closedConversations: 2 });
    expect(res.headers.get("set-cookie")).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it("409 con el detalle si hay contrataciones en marcha", async () => {
    mocks.apiUser.mockResolvedValue(usuario);
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "55000", message: "Tienes 1 contratación(es) en marcha." },
    });
    const res = await meRoute.DELETE(borrar());
    expect(res.status).toBe(409);
    expect((await res.json()).detail).toContain("en marcha");
  });

  it("con cookie exige el mismo origen (CSRF)", async () => {
    const res = await meRoute.DELETE(borrar(false));
    expect(res.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("401 sin sesión", async () => {
    mocks.apiUser.mockRejectedValue(new AuthError(401, "Se requiere iniciar sesión"));
    expect((await meRoute.DELETE(borrar())).status).toBe(401);
  });
});

describe("GET /api/v1/me/deletion", () => {
  it("devuelve la verificación", async () => {
    mocks.apiUser.mockResolvedValue(usuario);
    mocks.rpc.mockResolvedValue({ data: { isWorker: true, blockingContracts: [], pendingProposals: 0 }, error: null });
    const res = await deletionRoute.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ canDelete: true, isWorker: true });
    expect(mocks.rpc).toHaveBeenCalledWith("fn_account_deletion_check", { p_user_id: usuario.id });
  });
});
