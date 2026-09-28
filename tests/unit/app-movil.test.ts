import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";

/**
 * Fase 11 — soporte de la app móvil: primer ingreso por API (/me/bootstrap), cierre de sesión
 * global para tokens Bearer, no leídos con Bearer, foto y propuesta del trabajador, motivos de
 * denuncia, contenido público.
 */

const mocks = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  verifyMobileIdToken: vi.fn(),
  logAudit: vi.fn(),
  findIdentityOwner: vi.fn(),
  upsertUserFromLogin: vi.fn(),
  loadUser: vi.fn(),
  headers: vi.fn(),
  getRequestUser: vi.fn(),
  getCurrentAuth: vi.fn(),
  listConversations: vi.fn(),
  apiConsentedUser: vi.fn(),
  proposeOwnPhoto: vi.fn(),
  proposeOwnProfile: vi.fn(),
  getOwnWorker: vi.fn(),
  listReportReasons: vi.fn(),
  getLegalDocument: vi.fn(),
}));

vi.mock("@/server/auth/verify", () => ({
  verifyAccessToken: mocks.verifyAccessToken,
  verifyMobileIdToken: mocks.verifyMobileIdToken,
}));
vi.mock("@/server/audit/log", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/server/auth/users", async (original) => ({
  ...(await original<typeof import("@/server/auth/users")>()),
  findIdentityOwner: mocks.findIdentityOwner,
  upsertUserFromLogin: mocks.upsertUserFromLogin,
  loadUser: mocks.loadUser,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/server/auth/current-user", () => ({
  getRequestUser: mocks.getRequestUser,
  getCurrentAuth: mocks.getCurrentAuth,
}));
vi.mock("@/server/chat/chat", () => ({ listConversations: mocks.listConversations }));
vi.mock("@/server/http/api-auth", () => ({ apiConsentedUser: mocks.apiConsentedUser }));
vi.mock("@/server/workers/public-profile", () => ({
  proposeOwnPhoto: mocks.proposeOwnPhoto,
  proposeOwnProfile: mocks.proposeOwnProfile,
  getOwnWorker: mocks.getOwnWorker,
}));
vi.mock("@/server/reports/reports", () => ({ listReportReasons: mocks.listReportReasons }));
vi.mock("@/server/users/consents", () => ({ getLegalDocument: mocks.getLegalDocument }));
vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  isAuthConfigured: () => true,
}));

const { isAuthTimeRevoked } = await import("@/server/auth/users");
const { bootstrapMobileUser } = await import("@/server/auth/mobile");
const bootstrapRoute = await import("@/app/api/v1/me/bootstrap/route");
const unreadRoute = await import("@/app/api/v1/me/unread/route");
const photoRoute = await import("@/app/api/v1/me/worker/photo/route");
const proposalRoute = await import("@/app/api/v1/me/worker/proposal/route");
const reasonsRoute = await import("@/app/api/v1/report-reasons/route");
const legalRoute = await import("@/app/api/v1/content/legal/[code]/route");

const ISS = "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_TestPool";
const ctx = { ip: "190.1.2.3", userAgent: "okhttp", requestId: "req-1" };
const usuario: AppUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ana@test.ec",
  displayName: "Ana",
  status: "ACTIVO",
  roles: ["CLIENTE"],
  permissions: [],
};

function tokens(opciones: { idSub?: string; aud?: string; authTime?: number } = {}) {
  mocks.verifyAccessToken.mockResolvedValue({
    iss: ISS,
    sub: "sub-1",
    client_id: "cliente-movil",
    auth_time: opciones.authTime ?? 1_800_000_000,
    iat: 1_800_000_100,
  });
  mocks.verifyMobileIdToken.mockResolvedValue({
    iss: ISS,
    sub: opciones.idSub ?? "sub-1",
    aud: opciones.aud ?? "cliente-movil",
    email: "ana@test.ec",
    email_verified: true,
    given_name: "Ana",
    family_name: "Pérez",
  });
}

const cuerpo = { idToken: "x".repeat(40) };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("isAuthTimeRevoked (cierre de sesión global)", () => {
  it("sin marca, todo token vale", () => {
    expect(isAuthTimeRevoked(1_800_000_000, null)).toBe(false);
  });

  it("rechaza tokens autenticados antes de la marca y acepta los posteriores o del mismo segundo", () => {
    const marca = new Date(1_800_000_000_500).toISOString();
    expect(isAuthTimeRevoked(1_799_999_999, marca)).toBe(true);
    expect(isAuthTimeRevoked(1_800_000_000, marca)).toBe(false);
    expect(isAuthTimeRevoked(1_800_000_001, marca)).toBe(false);
  });
});

describe("bootstrapMobileUser (POST /me/bootstrap)", () => {
  it("crea la cuenta con la identidad del ID token y audita el primer ingreso", async () => {
    tokens();
    mocks.findIdentityOwner.mockResolvedValue(null);
    mocks.upsertUserFromLogin.mockResolvedValue({ user: { id: usuario.id, status: "ACTIVO" }, created: true });
    mocks.loadUser.mockResolvedValue(usuario);

    const r = await bootstrapMobileUser("access", cuerpo, ctx);

    expect(r).toEqual({ user: usuario, created: true });
    expect(mocks.upsertUserFromLogin).toHaveBeenCalledWith(
      expect.objectContaining({ issuer: ISS, sub: "sub-1", email: "ana@test.ec", displayName: "Ana Pérez" }),
    );
    expect(mocks.loadUser).toHaveBeenCalledWith(usuario.id, { source: "COGNITO" });
    expect(mocks.logAudit.mock.calls.map(([e]) => e.action)).toEqual(["USER_FIRST_LOGIN", "USER_LOGIN"]);
    expect(mocks.logAudit.mock.calls[1][0].metadata).toMatchObject({ channel: "APP", clientId: "cliente-movil" });
  });

  it("es idempotente: una cuenta existente solo registra el ingreso", async () => {
    tokens();
    mocks.findIdentityOwner.mockResolvedValue({ userId: usuario.id, tokensValidAfter: null });
    mocks.upsertUserFromLogin.mockResolvedValue({ user: { id: usuario.id, status: "ACTIVO" }, created: false });
    mocks.loadUser.mockResolvedValue(usuario);

    expect((await bootstrapMobileUser("access", cuerpo, ctx)).created).toBe(false);
    expect(mocks.logAudit.mock.calls.map(([e]) => e.action)).toEqual(["USER_LOGIN"]);
  });

  it("401 si algún token no es válido", async () => {
    mocks.verifyAccessToken.mockRejectedValue(new Error("exp"));
    mocks.verifyMobileIdToken.mockResolvedValue({});
    await expect(bootstrapMobileUser("access", cuerpo, ctx)).rejects.toMatchObject({ status: 401 });
    expect(mocks.upsertUserFromLogin).not.toHaveBeenCalled();
  });

  it("401 si los tokens son de sujetos o clientes distintos", async () => {
    tokens({ idSub: "otro" });
    await expect(bootstrapMobileUser("access", cuerpo, ctx)).rejects.toBeInstanceOf(AuthError);
    tokens({ aud: "otro-cliente" });
    await expect(bootstrapMobileUser("access", cuerpo, ctx)).rejects.toMatchObject({ status: 401 });
    expect(mocks.upsertUserFromLogin).not.toHaveBeenCalled();
  });

  it("401 si el ingreso es anterior a un «cerrar sesión en todos los dispositivos»", async () => {
    tokens({ authTime: 1_700_000_000 });
    mocks.findIdentityOwner.mockResolvedValue({
      userId: usuario.id,
      tokensValidAfter: new Date(1_750_000_000_000).toISOString(),
    });
    await expect(bootstrapMobileUser("access", cuerpo, ctx)).rejects.toMatchObject({ status: 401 });
    expect(mocks.upsertUserFromLogin).not.toHaveBeenCalled();
  });

  it("403 y auditoría DENIED si la cuenta está bloqueada", async () => {
    tokens();
    mocks.findIdentityOwner.mockResolvedValue({ userId: usuario.id, tokensValidAfter: null });
    mocks.upsertUserFromLogin.mockResolvedValue({ user: { id: usuario.id, status: "BLOQUEADO" }, created: false });

    await expect(bootstrapMobileUser("access", cuerpo, ctx)).rejects.toMatchObject({ status: 403 });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "USER_LOGIN", result: "DENIED" }));
    expect(mocks.loadUser).not.toHaveBeenCalled();
  });

  it("422 sin ID token", async () => {
    await expect(bootstrapMobileUser("access", {}, ctx)).rejects.toMatchObject({ name: "ZodError" });
  });
});

describe("POST /api/v1/me/bootstrap", () => {
  it("401 sin Bearer (la cookie web no sirve para este paso)", async () => {
    const res = await bootstrapRoute.POST(
      new Request("http://localhost/api/v1/me/bootstrap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
  });
});

describe("GET /api/v1/me/unread con Bearer (app móvil)", () => {
  const { GET } = unreadRoute;

  it("cuenta los no leídos del usuario del token", async () => {
    mocks.headers.mockResolvedValue(new Headers({ authorization: "Bearer abc" }));
    mocks.getRequestUser.mockResolvedValue(usuario);
    mocks.listConversations.mockResolvedValue([{ unread: 2 }, { unread: 0 }, { unread: 3 }]);

    const body = await (await GET()).json();
    expect(body).toEqual({ signedIn: true, chat: true, userId: usuario.id, unreadMessages: 5, unreadConversations: 2 });
    expect(mocks.getCurrentAuth).not.toHaveBeenCalled();
  });

  it("token inválido → sin sesión; cuenta bloqueada → sin chat", async () => {
    mocks.headers.mockResolvedValue(new Headers({ authorization: "Bearer abc" }));
    mocks.getRequestUser.mockResolvedValue(null);
    expect(await (await GET()).json()).toMatchObject({ signedIn: false, chat: false });

    mocks.getRequestUser.mockResolvedValue({ ...usuario, status: "BLOQUEADO" });
    expect(await (await GET()).json()).toMatchObject({ signedIn: true, chat: false, unreadMessages: 0 });
    expect(mocks.listConversations).not.toHaveBeenCalled();
  });

  it("sin Bearer sigue usando la cookie web (el personal no usa el chat)", async () => {
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getCurrentAuth.mockResolvedValue({ user: usuario, source: "ENTRA" });
    expect(await (await GET()).json()).toMatchObject({ signedIn: true, chat: false });
    expect(mocks.getRequestUser).not.toHaveBeenCalled();
  });
});

describe("Espacio del trabajador por API", () => {
  const bearer = { authorization: "Bearer abc" };

  it("POST /me/worker/photo exige multipart y envía el archivo a revisión", async () => {
    const { POST } = photoRoute;
    mocks.apiConsentedUser.mockResolvedValue(usuario);
    mocks.getOwnWorker.mockResolvedValue({ id: "w1", photo: { hasPending: true } });

    const json = await POST(
      new Request("http://localhost/api/v1/me/worker/photo", {
        method: "POST",
        headers: { ...bearer, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(json.status).toBe(400);

    const form = new FormData();
    form.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" }));
    const res = await POST(
      new Request("http://localhost/api/v1/me/worker/photo", { method: "POST", headers: bearer, body: form }),
    );
    expect(res.status).toBe(201);
    expect(mocks.proposeOwnPhoto).toHaveBeenCalledWith(usuario, expect.any(File), expect.any(Object));
    expect(await res.json()).toMatchObject({ photo: { hasPending: true } });
  });

  it("POST /me/worker/proposal valida y envía la propuesta", async () => {
    const { POST } = proposalRoute;
    mocks.apiConsentedUser.mockResolvedValue(usuario);
    mocks.getOwnWorker.mockResolvedValue({ id: "w1", proposal: { bio: "Electricista con 10 años" } });

    const res = await POST(
      new Request("http://localhost/api/v1/me/worker/proposal", {
        method: "POST",
        headers: { ...bearer, "content-type": "application/json" },
        body: JSON.stringify({ publicBio: "Electricista con 10 años", availabilityNote: "Lunes a sábado" }),
      }),
    );
    expect(res.status).toBe(201);
    expect(mocks.proposeOwnProfile).toHaveBeenCalledWith(
      usuario,
      { publicBio: "Electricista con 10 años", availabilityNote: "Lunes a sábado" },
      expect.any(Object),
    );

    const corta = await POST(
      new Request("http://localhost/api/v1/me/worker/proposal", {
        method: "POST",
        headers: { ...bearer, "content-type": "application/json" },
        body: JSON.stringify({ publicBio: "corta" }),
      }),
    );
    expect(corta.status).toBe(422);
  });
});

describe("Endpoints públicos para la app", () => {
  it("GET /report-reasons filtra por tipo, devuelve todos sin filtro y rechaza tipos inválidos", async () => {
    const { GET } = reasonsRoute;
    mocks.listReportReasons.mockImplementation(async (tipo: string) => [{ code: `${tipo}_OTRO`, label: "Otro" }]);

    const uno = await (await GET(new NextRequest("http://localhost/api/v1/report-reasons?targetType=REVIEW"))).json();
    expect(uno.items).toEqual([{ targetType: "REVIEW", code: "REVIEW_OTRO", label: "Otro" }]);

    const todos = await (await GET(new NextRequest("http://localhost/api/v1/report-reasons"))).json();
    expect(todos.items.map((m: { targetType: string }) => m.targetType)).toEqual([
      "WORKER",
      "CLIENT",
      "REVIEW",
      "MESSAGE",
      "CONVERSATION",
      "CONTRACT",
    ]);

    expect((await GET(new NextRequest("http://localhost/api/v1/report-reasons?targetType=OTRO"))).status).toBe(422);
  });

  it("GET /content/legal/{code} devuelve la versión vigente o 404", async () => {
    const { GET } = legalRoute;
    mocks.getLegalDocument.mockImplementation(async (code: string) =>
      code === "TERMINOS"
        ? { code, version: 2, title: "Términos", contentMd: "# Términos", publishedAt: "2026-09-27T00:00:00Z" }
        : null,
    );
    const ok = await GET(new Request("http://x"), { params: Promise.resolve({ code: "terminos" }) });
    expect(await ok.json()).toEqual({
      code: "TERMINOS",
      version: 2,
      title: "Términos",
      content: "# Términos",
      publishedAt: "2026-09-27T00:00:00Z",
    });
    const no = await GET(new Request("http://x"), { params: Promise.resolve({ code: "OTRO" }) });
    expect(no.status).toBe(404);
  });
});
