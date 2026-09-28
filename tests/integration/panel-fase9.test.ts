import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuthError } from "@/server/auth/authorize";
import { loadUser, type AppUser } from "@/server/auth/users";
import { listPublicFaq, saveFaq } from "@/server/content/content";
import { getAdminDb } from "@/server/db/admin";
import type { RequestContext } from "@/server/http/request-info";
import { exportAudit } from "@/server/panel/audit";
import { getMetrics } from "@/server/panel/metrics";
import { exportReport } from "@/server/panel/reports";

/** Fase 9 — panel contra la base del CI: permisos por rol, exportaciones auditadas y contenido. */

const ctx: RequestContext = { ip: "10.0.0.9", userAgent: "vitest", requestId: "req-f9" };
const ENTRA = "https://login.microsoftonline.com/tenant-pruebas/v2.0";

async function personal(rol: string): Promise<AppUser> {
  const db = getAdminDb();
  const { data, error } = await db
    .from("users")
    .insert({ display_name: `Funcionario ${rol}` })
    .select("id")
    .single();
  if (error) throw error;
  await db.from("user_identities").insert({ user_id: data.id, issuer: ENTRA, sub: randomUUID(), provider: "ENTRA" });
  await db.from("user_roles").insert({ user_id: data.id, role_code: rol });
  return (await loadUser(data.id)) as AppUser;
}

const fecha = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(d);
const hoy = fecha(new Date());
/** Los reportes admiten hasta dos años: un rango relativo no envejece con el calendario. */
const haceUnAno = fecha(new Date(Date.now() - 365 * 86_400_000));

describe("panel administrativo", () => {
  it("el supervisor ve indicadores con los datos del seed (15 habilitados)", async () => {
    const supervisor = await personal("SUPERVISOR");
    const m = await getMetrics(supervisor, haceUnAno, hoy);
    expect(m.workers.byStatus.HABILITADO).toBeGreaterThanOrEqual(15);
    expect(m.workers.enabledByCategory.length).toBeGreaterThan(0);
  });

  it("cada exportación queda auditada con los filtros y las filas", async () => {
    const supervisor = await personal("SUPERVISOR");
    const { csv } = await exportReport(supervisor, "trabajadores", { desde: haceUnAno, hasta: hoy }, ctx);
    expect(csv.startsWith("﻿Nombre público;Estado")).toBe(true);
    const { data } = await getAdminDb()
      .from("audit_log")
      .select("action, metadata")
      .eq("actor_id", supervisor.id)
      .eq("action", "DATA_EXPORTED")
      .single();
    expect(data?.metadata).toMatchObject({ tipo: "trabajadores", desde: haceUnAno, hasta: hoy });
    const { csv: auditoria } = await exportAudit(supervisor, { desde: hoy, hasta: hoy }, ctx);
    expect(auditoria).toContain("DATA_EXPORTED");
  });

  it("sin data.export no se descarga; sin content.manage no se edita el contenido", async () => {
    const moderador = await personal("MODERADOR");
    await expect(exportReport(moderador, "denuncias", { desde: hoy, hasta: hoy }, ctx)).rejects.toBeInstanceOf(
      AuthError,
    );
    await expect(
      saveFaq(moderador, { audience: "GENERAL", question: "¿Pregunta?", answerMd: "Respuesta", published: true }, ctx),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("el administrador publica una pregunta y aparece en el portal", async () => {
    const admin = await personal("ADMIN_SISTEMA");
    const pregunta = `¿Pregunta de prueba ${randomUUID().slice(0, 6)}?`;
    await saveFaq(
      admin,
      { audience: "GENERAL", question: pregunta, answerMd: "Respuesta de prueba", published: "on" },
      ctx,
    );
    expect((await listPublicFaq()).some((f) => f.question === pregunta)).toBe(true);
  });
});
