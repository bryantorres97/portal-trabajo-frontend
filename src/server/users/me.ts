import "server-only";

import type { AppUser } from "@/server/auth/users";
import { getPendingConsents } from "@/server/users/consents";
import { getClientProfile, type ClientProfile } from "@/server/users/profile";

/** Respuesta de `GET /api/v1/me` (y de `POST /api/v1/me/bootstrap`). */
export type MeResponse = {
  id: string;
  email: string | null;
  displayName: string | null;
  status: AppUser["status"];
  roles: string[];
  permissions: string[];
  profile: ClientProfile | null;
  pendingConsents: { code: string; version: number; title: string }[];
};

export async function buildMe(user: AppUser): Promise<MeResponse> {
  const [profile, pendientes] = await Promise.all([getClientProfile(user.id), getPendingConsents(user.id)]);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    roles: user.roles,
    permissions: user.permissions,
    profile,
    pendingConsents: pendientes.map((d) => ({ code: d.code, version: d.version, title: d.title })),
  };
}
