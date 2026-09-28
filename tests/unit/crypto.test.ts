import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createPkcePair, decryptPayload, encryptPayload, randomToken, sha256Hex } from "@/server/auth/crypto";

const SECRET = "x".repeat(48);

describe("PKCE", () => {
  it("genera challenge S256 = base64url(sha256(verifier))", async () => {
    const { verifier, challenge } = await createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });
});

describe("randomToken / sha256Hex", () => {
  it("produce tokens distintos y hashes hex de 64 caracteres", async () => {
    expect(randomToken()).not.toBe(randomToken());
    expect(await sha256Hex("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("encryptPayload / decryptPayload", () => {
  it("cifra y descifra (ida y vuelta)", async () => {
    const jwe = await encryptPayload({ at: "token-a" }, SECRET, "p", 60);
    expect(jwe).not.toContain("token-a");
    await expect(decryptPayload(jwe, SECRET, "p")).resolves.toMatchObject({ at: "token-a" });
  });

  it("no descifra con otro secreto ni con otro propósito", async () => {
    const jwe = await encryptPayload({ at: "token-a" }, SECRET, "p", 60);
    await expect(decryptPayload(jwe, "y".repeat(48), "p")).resolves.toBeNull();
    await expect(decryptPayload(jwe, SECRET, "otro")).resolves.toBeNull();
  });

  it("rechaza contenido manipulado", async () => {
    const jwe = await encryptPayload({ at: "token-a" }, SECRET, "p", 60);
    const partes = jwe.split(".");
    partes[3] = partes[3].replace(/^./, (c) => (c === "A" ? "B" : "A"));
    await expect(decryptPayload(partes.join("."), SECRET, "p")).resolves.toBeNull();
  });

  it("rechaza payloads expirados", async () => {
    const jwe = await encryptPayload({ at: "token-a" }, SECRET, "p", -10);
    await expect(decryptPayload(jwe, SECRET, "p")).resolves.toBeNull();
  });
});
