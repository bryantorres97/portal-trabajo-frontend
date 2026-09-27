import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuthError } from "@/server/auth/authorize";
import { loadUser, type AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import type { RequestContext } from "@/server/http/request-info";
import { cancelCampaign, createCampaign, estimateAudience, listCampaigns } from "@/server/notifications/campaigns";
import { registerDevice, setNotificationPreferences } from "@/server/notifications/notifications";

/** Avisos push del GAD contra la base del CI: segmentos, preferencia, bandeja, auditoría y permisos. */

const ctx: RequestContext = { ip: "10.0.0.10", userAgent: "vitest", requestId: "req-push" };
const ENTRA = "https://login.microsoftonline.com/tenant-pruebas/v2.0";

async function usuario(roles: string[], entra = false): Promise<AppUser> {
  const db = getAdminDb();
  const { data, error } = await db
    .from("users")
    .insert({ display_name: `Persona ${roles.join("+")} ${randomUUID().slice(0, 4)}` })
    .select("id")
    .single();
  if (error) throw error;
  if (entra)
    await db.from("user_identities").insert({ user_id: data.id, issuer: ENTRA, sub: randomUUID(), provider: "ENTRA" });
  for (const r of roles) await db.from("user_roles").insert({ user_id: data.id, role_code: r });
  return (await loadUser(data.id)) as AppUser;
}

async function dispositivo(u: AppUser, platform: "ANDROID" | "IOS") {
  const token = `token-push-${randomUUID()}`;
  await registerDevice(u, { platform, token });
  const { data } = await getAdminDb().from("device_tokens").select("id").eq("token", token).single();
  return Number(data!.id);
}

describe("avisos push del GAD", () => {
  it("selección: entrega por dispositivo, respeta la preferencia y deja el aviso en la bandeja", async () => {
    const admin = await usuario(["ADMIN_SISTEMA"], true);
    const clienta = await usuario(["CLIENTE"]);
    const trabajador = await usuario(["CLIENTE", "TRABAJADOR"]);
    const sinAvisos = await usuario(["CLIENTE"]);
    await dispositivo(clienta, "ANDROID");
    const ios = await dispositivo(trabajador, "IOS");
    await dispositivo(sinAvisos, "ANDROID");
    await setNotificationPreferences(sinAvisos, { pushAnnouncements: false });

    const seleccion = {
      segment: "SELECCION",
      platforms: ["ANDROID", "IOS"],
      userIds: [clienta.id, sinAvisos.id],
      deviceIds: [ios],
    };
    expect(await estimateAudience(admin, seleccion)).toMatchObject({ devices: 2, pushUsers: 2, inAppUsers: 3 });

    const id = await createCampaign(
      admin,
      { ...seleccion, title: "Aviso de prueba", body: "Mensaje de prueba", alsoInApp: true },
      ctx,
    );
    const { items } = await listCampaigns(admin);
    expect(items.find((c) => c.id === id)).toMatchObject({ status: "ENVIANDO", totalDevices: 2, inAppUsers: 3 });

    const { count } = await getAdminDb()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("dedupe_key", `campaign:${id}`);
    expect(count).toBe(3);

    const { data: auditoria } = await getAdminDb()
      .from("audit_log")
      .select("metadata")
      .eq("action", "PUSH_CAMPAIGN_CREATED")
      .eq("resource_id", id)
      .single();
    expect(auditoria?.metadata).toMatchObject({ segment: "SELECCION", targetUsers: 2, targetDevices: 1 });
  });

  it("un aviso programado se cancela y sin permiso no se envía nada", async () => {
    const admin = await usuario(["ADMIN_SISTEMA"], true);
    const moderador = await usuario(["MODERADOR"], true);
    const manana = new Date(Date.now() + 86_400_000 + 3_600_000);
    const local = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Guayaquil",
      dateStyle: "short",
      timeStyle: "short",
    })
      .format(manana)
      .replace(" ", "T");
    const id = await createCampaign(
      admin,
      { segment: "TRABAJADORES", platforms: ["ANDROID"], title: "Programado", body: "Para mañana", scheduledAt: local },
      ctx,
    );
    await cancelCampaign(admin, id, ctx);
    expect((await listCampaigns(admin)).items.find((c) => c.id === id)?.status).toBe("CANCELADA");

    await expect(
      createCampaign(moderador, { segment: "TODOS", platforms: ["WEB"], title: "Hola", body: "Mensaje" }, ctx),
    ).rejects.toBeInstanceOf(AuthError);
  });
});
