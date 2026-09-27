import "server-only";

import { after } from "next/server";

import { isFcmConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getAdminDb } from "@/server/db/admin";
import { throwPg } from "@/server/errors";
import { sendPush } from "@/server/notifications/fcm";
import { dispatchOutbox } from "@/server/notifications/notifications";

/**
 * Despacho de push: la cola de eventos (chat, contrataciones) y las entregas de los avisos del GAD.
 * Corre tras cada acción que genera notificaciones (`scheduleDispatch`) y con la tarea programada,
 * que además reintenta e inicia los avisos programados.
 */

type ClaimedDelivery = {
  id: number;
  campaign_id: string;
  token: string;
  title: string;
  body: string;
  link: string | null;
};

type DeliveryResult = {
  id: number;
  result: "ENVIADA" | "DESCARTADA" | "REINTENTAR";
  error?: string;
  invalid?: boolean;
};

/** Ejecuta `fn` sobre los elementos con a lo sumo `limite` promesas en curso. */
async function enParalelo<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados = new Array<R>(items.length);
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      resultados[i] = await fn(items[i]!);
    }
  });
  await Promise.all(trabajadores);
  return resultados;
}

/** Envía un lote de entregas de avisos del GAD. Devuelve cuántas tomó y cómo terminaron. */
export async function dispatchCampaignDeliveries(
  limit = 200,
  send = sendPush,
  concurrency = 10,
): Promise<{ claimed: number; sent: number; failed: number; discarded: number }> {
  const db = getAdminDb();
  const { data, error } = await db.rpc("fn_claim_push_deliveries", { p_limit: limit });
  if (error) throwPg(error);
  const lote = (data ?? []) as ClaimedDelivery[];
  if (lote.length === 0) return { claimed: 0, sent: 0, failed: 0, discarded: 0 };

  const resultados = await enParalelo(lote, concurrency, async (e): Promise<DeliveryResult> => {
    try {
      const r = await send(e.token, {
        title: e.title,
        body: e.body,
        link: e.link ?? "/",
        data: { event: "AVISO_GAD", campaignId: e.campaign_id },
      });
      if (r.ok) return { id: e.id, result: "ENVIADA" };
      return r.invalidToken
        ? { id: e.id, result: "DESCARTADA", error: r.error, invalid: true }
        : { id: e.id, result: "REINTENTAR", error: r.error };
    } catch (err) {
      return { id: e.id, result: "REINTENTAR", error: err instanceof Error ? err.message : String(err) };
    }
  });

  const { error: e2 } = await db.rpc("fn_complete_push_deliveries", { p_results: resultados });
  if (e2) throwPg(e2);
  return {
    claimed: lote.length,
    sent: resultados.filter((r) => r.result === "ENVIADA").length,
    failed: resultados.filter((r) => r.result === "REINTENTAR").length,
    discarded: resultados.filter((r) => r.result === "DESCARTADA").length,
  };
}

export type DispatchSummary = {
  skipped: boolean;
  outbox: { sent: number; failed: number };
  campaigns: { sent: number; failed: number; discarded: number };
};

/**
 * Despacha todo lo pendiente hasta vaciar las colas o agotar el tiempo (`budgetMs`). Sin FCM
 * configurado no toma nada: los envíos quedan pendientes hasta que se configure.
 */
export async function dispatchPending({
  budgetMs = 45_000,
  send = sendPush,
}: { budgetMs?: number; send?: typeof sendPush } = {}): Promise<DispatchSummary> {
  const resumen: DispatchSummary = {
    skipped: false,
    outbox: { sent: 0, failed: 0 },
    campaigns: { sent: 0, failed: 0, discarded: 0 },
  };
  if (!isFcmConfigured()) return { ...resumen, skipped: true };
  const limite = Date.now() + budgetMs;
  let quedaOutbox = true;
  let quedanAvisos = true;
  while ((quedaOutbox || quedanAvisos) && Date.now() < limite) {
    if (quedaOutbox) {
      const o = await dispatchOutbox(50, send);
      resumen.outbox.sent += o.sent;
      resumen.outbox.failed += o.failed;
      quedaOutbox = o.claimed > 0;
    }
    if (quedanAvisos && Date.now() < limite) {
      const c = await dispatchCampaignDeliveries(200, send);
      resumen.campaigns.sent += c.sent;
      resumen.campaigns.failed += c.failed;
      resumen.campaigns.discarded += c.discarded;
      quedanAvisos = c.claimed > 0;
    }
  }
  return resumen;
}

/**
 * Despacha lo pendiente después de responder (Server Actions y Route Handlers). Fuera de un
 * request (pruebas, scripts) no hace nada: la tarea programada lo enviará.
 */
export function scheduleDispatch(budgetMs = 20_000) {
  if (!isFcmConfigured()) return;
  try {
    after(async () => {
      try {
        await dispatchPending({ budgetMs });
      } catch (error) {
        logger.error("push.dispatch_failed", { error });
      }
    });
  } catch {
    // Sin contexto de request.
  }
}
