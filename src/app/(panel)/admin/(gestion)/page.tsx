import type { Metadata } from "next";

import { InicioPanel } from "@/components/admin/InicioPanel";
import { hasPermission } from "@/server/auth/authorize";
import { requirePagePermission } from "@/server/auth/current-user";
import { workerSummary } from "@/server/workers/admin";

export const metadata: Metadata = { title: "Panel administrativo" };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await requirePagePermission("admin.access", "/admin");
  const { error } = await searchParams;
  const resumen = hasPermission(user, "worker.read") ? await workerSummary(user) : null;
  return <InicioPanel user={user} resumen={resumen} error={typeof error === "string" ? error : undefined} />;
}
