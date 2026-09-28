import "server-only";

import { importPKCS8, SignJWT } from "jose";

import { getAppEnv, getFcmEnv } from "@/lib/env";

/**
 * Firebase Cloud Messaging HTTP v1, sin SDK: el servidor obtiene un access token de Google con la
 * cuenta de servicio (JWT RS256) y envía un mensaje por token de dispositivo.
 */

export type PushMessage = { title: string; body: string; link: string; data?: Record<string, string> };

export type PushResult = { ok: boolean; invalidToken: boolean; error?: string };

let tokenCache: { value: string; exp: number } | undefined;

async function accessToken(fetcher: typeof fetch): Promise<string> {
  if (tokenCache && tokenCache.exp - 60 > Date.now() / 1000) return tokenCache.value;
  const env = getFcmEnv();
  const key = await importPKCS8(env.FCM_PRIVATE_KEY, "RS256");
  const ahora = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(env.FCM_CLIENT_EMAIL)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + 3600)
    .sign(key);
  const res = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Google OAuth respondió ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { value: json.access_token, exp: ahora + json.expires_in };
  return json.access_token;
}

/** Cuerpo del mensaje FCM v1 (exportado para pruebas). */
export function buildFcmMessage(token: string, m: PushMessage) {
  const url = new URL(m.link, getAppEnv().NEXT_PUBLIC_APP_URL);
  return {
    message: {
      token,
      notification: { title: m.title, body: m.body },
      data: { link: m.link, ...(m.data ?? {}) },
      // FCM exige HTTPS en fcm_options.link (en local el service worker abre data.link).
      webpush: {
        ...(url.protocol === "https:" ? { fcm_options: { link: url.toString() } } : {}),
        notification: { icon: "/icon.png" },
      },
      android: { priority: "HIGH" as const },
    },
  };
}

/**
 * ¿El token ya no sirve? 404/UNREGISTERED, o INVALID_ARGUMENT que se refiere al token. Un
 * INVALID_ARGUMENT por el contenido del mensaje no debe desactivar el dispositivo.
 */
export function isInvalidTokenResponse(status: number, texto: string): boolean {
  if (status === 404 || /UNREGISTERED/.test(texto)) return true;
  return status === 400 && /INVALID_ARGUMENT/.test(texto) && /registration token/i.test(texto);
}

export async function sendPush(token: string, m: PushMessage, fetcher: typeof fetch = fetch): Promise<PushResult> {
  const env = getFcmEnv();
  const res = await fetcher(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(fetcher)}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildFcmMessage(token, m)),
  });
  if (res.ok) return { ok: true, invalidToken: false };
  const texto = await res.text().catch(() => "");
  // Token dado de baja o inválido: se desactiva para no reintentar.
  return {
    ok: false,
    invalidToken: isInvalidTokenResponse(res.status, texto),
    error: `FCM ${res.status}: ${texto.slice(0, 200)}`,
  };
}

/**
 * Comprueba con FCM (validate_only, no llega nada al dispositivo) que el token pertenece a este
 * proyecto. Se usa antes de aceptar dispositivos anónimos de la app móvil.
 */
export async function isValidPushToken(token: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const env = getFcmEnv();
  const res = await fetcher(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(fetcher)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ validate_only: true, message: { token, data: { event: "VALIDACION" } } }),
  });
  if (res.ok) return true;
  const texto = await res.text().catch(() => "");
  if (isInvalidTokenResponse(res.status, texto)) return false;
  throw new Error(`FCM ${res.status}: ${texto.slice(0, 200)}`);
}
