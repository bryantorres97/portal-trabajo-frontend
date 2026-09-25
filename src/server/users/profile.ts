import "server-only";

import { clientProfileSchema, type ClientProfileInput } from "@/server/domain/users/schemas";
import { logAudit } from "@/server/audit/log";
import { getAdminDb } from "@/server/db/admin";
import type { RequestContext } from "@/server/http/request-info";

export type ClientProfile = { fullName: string; phone: string | null; sector: string | null; updatedAt: string };

export async function getClientProfile(userId: string): Promise<ClientProfile | null> {
  const { data, error } = await getAdminDb()
    .from("client_profiles")
    .select("full_name, phone, sector, updated_at")
    .eq("user_id", userId)
    .maybeSingle<{ full_name: string; phone: string | null; sector: string | null; updated_at: string }>();
  if (error) throw error;
  return data && { fullName: data.full_name, phone: data.phone, sector: data.sector, updatedAt: data.updated_at };
}

/** Crea o actualiza el perfil del cliente. Solo el propio usuario (la autorización la hace quien llama). */
export async function saveClientProfile(
  userId: string,
  input: ClientProfileInput | Record<string, unknown>,
  ctx: RequestContext,
): Promise<ClientProfile> {
  const datos = clientProfileSchema.parse(input);
  const { data, error } = await getAdminDb()
    .from("client_profiles")
    .upsert(
      { user_id: userId, full_name: datos.fullName, phone: datos.phone ?? null, sector: datos.sector ?? null },
      { onConflict: "user_id" },
    )
    .select("full_name, phone, sector, updated_at")
    .single<{ full_name: string; phone: string | null; sector: string | null; updated_at: string }>();
  if (error) throw error;

  // El nombre visible del portal sigue al perfil.
  await getAdminDb().from("users").update({ display_name: datos.fullName }).eq("id", userId);
  await logAudit({
    action: "PROFILE_UPDATED",
    actorId: userId,
    resourceType: "client_profile",
    resourceId: userId,
    metadata: { fields: Object.keys(datos).filter((k) => datos[k as keyof typeof datos] !== undefined) },
    ...ctx,
  });

  return { fullName: data.full_name, phone: data.phone, sector: data.sector, updatedAt: data.updated_at };
}
