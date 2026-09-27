import type { Metadata } from "next";

import { InicioPanel } from "@/components/admin/InicioPanel";
import { hasPermission } from "@/server/auth/authorize";
import { requirePagePermission } from "@/server/auth/current-user";
import { reportsSummary } from "@/server/reports/admin";
import { workerSummary } from "@/server/workers/admin";

export const metadata: Metadata = { title: "Panel administrativo" };

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await requirePagePermission("admin.access", "/admin");
  const { error } = await searchParams;
  const [resumen, denuncias] = await Promise.all([
    hasPermission(user, "worker.read") ? workerSummary(user) : null,
    hasPermission(user, "report.read") ? reportsSummary(user) : null,
  ]);
  return (
    <InicioPanel
      user={user}
      resumen={resumen}
      denuncias={denuncias}
      error={typeof error === "string" ? error : undefined}
    />
  );
}
