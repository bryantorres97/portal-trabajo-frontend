import "server-only";

import { requirePermission } from "@/server/auth/authorize";
import type { AppUser } from "@/server/auth/users";
import { getAdminDb } from "@/server/db/admin";
import { throwPg } from "@/server/errors";

/** Indicadores del panel (Fase 9, metrics.read). Los cálculos viven en `fn_admin_metrics`. */

export type Metricas = {
  from: string;
  to: string;
  workers: {
    byStatus: Record<string, number>;
    registered: number;
    enabled: number;
    enabledByCategory: { category: string; count: number }[];
    linked: number;
  };
  citizens: { total: number; new: number };
  chat: { conversationsTotal: number; conversationsNew: number; messages: number };
  contracts: {
    byStatus: Record<string, number>;
    proposed: number;
    agreed: number;
    completed: number;
    cancelled: number;
    conversionPct: number | null;
    avgHoursToAgreement: number | null;
  };
  reviews: { count: number; avgRating: number | null; hidden: number };
  reports: {
    created: number;
    byTargetType: Record<string, number>;
    open: number;
    overdue: number;
    resolved: number;
    avgResolutionHours: number | null;
    withinDeadlinePct: number | null;
    sanctions: number;
  };
};

export async function getMetrics(actor: AppUser, desde: string, hasta: string): Promise<Metricas> {
  requirePermission(actor, "metrics.read");
  const { data, error } = await getAdminDb().rpc("fn_admin_metrics", {
    p_actor_id: actor.id,
    p_from: desde,
    p_to: hasta,
  });
  if (error) throwPg(error);
  return data as Metricas;
}

export type Semana = {
  semana: string;
  conversaciones: number;
  contrataciones: number;
  finalizadas: number;
  denuncias: number;
};

export async function weeklyActivity(actor: AppUser, semanas = 12): Promise<Semana[]> {
  requirePermission(actor, "metrics.read");
  const { data, error } = await getAdminDb().rpc("fn_admin_weekly_activity", {
    p_actor_id: actor.id,
    p_weeks: semanas,
  });
  if (error) throwPg(error);
  return (
    (data ?? []) as {
      week_start: string;
      conversations: number | string;
      contracts: number | string;
      completed: number | string;
      reports: number | string;
    }[]
  ).map((w) => ({
    semana: w.week_start,
    conversaciones: Number(w.conversations),
    contrataciones: Number(w.contracts),
    finalizadas: Number(w.completed),
    denuncias: Number(w.reports),
  }));
}
