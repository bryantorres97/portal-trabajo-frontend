import "server-only";

import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";

/** Utilidades criptográficas basadas en Web Crypto (compatibles con Node y Edge). */

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(valor: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
  return Buffer.from(digest).toString("hex");
}

/** PKCE (RFC 7636) con método S256. */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(48);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

const claves = new Map<string, Uint8Array>();

/** Deriva una clave AES-256 por propósito a partir de SESSION_SECRET (HKDF-SHA256). */
async function derivarClave(secret: string, proposito: string): Promise<Uint8Array> {
  const cacheKey = `${proposito}:${secret}`;
  const existente = claves.get(cacheKey);
  if (existente) return existente;
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("llankana"),
      info: new TextEncoder().encode(proposito),
    },
    material,
    256,
  );
  const clave = new Uint8Array(bits);
  claves.set(cacheKey, clave);
  return clave;
}

/** Cifra un payload como JWE compacto (dir + A256GCM). */
export async function encryptPayload(
  payload: JWTPayload,
  secret: string,
  proposito: string,
  expiraEnSegundos: number,
): Promise<string> {
  const clave = await derivarClave(secret, proposito);
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiraEnSegundos)
    .encrypt(clave);
}

/** Descifra un JWE producido por `encryptPayload`. Devuelve null si es inválido o expiró. */
export async function decryptPayload<T extends JWTPayload>(
  jwe: string,
  secret: string,
  proposito: string,
): Promise<T | null> {
  try {
    const clave = await derivarClave(secret, proposito);
    const { payload } = await jwtDecrypt(jwe, clave);
    return payload as T;
  } catch {
    return null;
  }
}

/** HMAC-SHA256 (hex) con una clave derivada por propósito de SESSION_SECRET. */
export async function hmacHex(valor: string, secret: string, proposito: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(await derivarClave(secret, proposito)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(valor));
  return Buffer.from(firma).toString("hex");
}
