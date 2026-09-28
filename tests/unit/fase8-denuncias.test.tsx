// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { modulosVisibles } from "@/components/admin/navegacion";
import { DenunciarDialogo } from "@/components/reports/DenunciarDialogo";
import { createReportSchema, finDelDiaEcuador, moderationSchema } from "@/server/domain/reports/schemas";
import {
  accionesPara,
  canTransition,
  permisoAccion,
  REPORT_STATUSES,
  TRANSICIONES,
} from "@/server/domain/reports/state-machine";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const raiz = path.resolve(import.meta.dirname, "../..");
const migracion = readFileSync(path.join(raiz, "supabase/migrations/20260927120000_denuncias_moderacion.sql"), "utf8");
const chat = readFileSync(path.join(raiz, "supabase/migrations/20260926144442_chat_notificaciones.sql"), "utf8");

describe("estados de la denuncia: TypeScript y la base dicen lo mismo", () => {
  it("los estados coinciden con el enum report_status", () => {
    const bloque = /create type public\.report_status as enum \(([^)]*)\)/.exec(chat)?.[1] ?? "";
    expect([...bloque.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])).toEqual([...REPORT_STATUSES]);
  });

  it("las transiciones coinciden con private.report_transition_allowed", () => {
    const inicio = migracion.indexOf("function private.report_transition_allowed");
    const cuerpo = migracion.slice(inicio, migracion.indexOf("$$;", inicio));
    const sql = [...cuerpo.matchAll(/'([A-Z_]+)>([A-Z_]+)'/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const ts = Object.entries(TRANSICIONES)
      .flatMap(([d, hs]) => hs.map((h) => `${d}>${h}`))
      .sort();
    expect(sql).toEqual(ts);
  });

  it("una denuncia cerrada no se reabre", () => {
    expect(canTransition("RESUELTA", "ABIERTA")).toBe(false);
    expect(canTransition("DESCARTADA", "EN_REVISION")).toBe(false);
    expect(canTransition("EN_ESPERA_DE_INFORMACION", "EN_REVISION")).toBe(true);
  });
});

describe("sanciones", () => {
  const base = {
    targetType: "MESSAGE" as const,
    tieneCuentaDenunciada: true,
    trabajadorEstado: "HABILITADO",
    mensajeOculto: false,
    resenaEstado: null,
  };

  it("el moderador advierte u oculta; el responsable además suspende o bloquea", () => {
    expect(accionesPara({ ...base, permisos: ["moderation.act"] })).toEqual(["ADVERTENCIA", "OCULTAR_MENSAJE"]);
    expect(accionesPara({ ...base, permisos: ["moderation.act", "report.manage"] })).toEqual([
      "ADVERTENCIA",
      "OCULTAR_MENSAJE",
      "SUSPENDER_TRABAJADOR",
      "DESHABILITAR_TRABAJADOR",
      "SUSPENDER_CUENTA",
      "BLOQUEAR_CUENTA",
    ]);
    expect(permisoAccion("BLOQUEAR_CUENTA")).toBe("report.manage");
  });

  it("solo ofrece lo que aplica al objeto denunciado", () => {
    const r = accionesPara({
      ...base,
      targetType: "REVIEW",
      mensajeOculto: null,
      resenaEstado: "PUBLICADA",
      trabajadorEstado: null,
      tieneCuentaDenunciada: false,
      permisos: ["moderation.act", "report.manage"],
    });
    expect(r).toEqual(["OCULTAR_RESENA"]);
  });

  it("la suspensión termina al final del día indicado (hora de Ecuador)", () => {
    expect(finDelDiaEcuador("2026-10-05")).toBe("2026-10-06T04:59:59.000Z");
    expect(
      moderationSchema.safeParse({ reportId: crypto.randomUUID(), action: "SUSPENDER_CUENTA", reason: "corto" })
        .success,
    ).toBe(false);
  });

  it("denunciar exige una descripción", () => {
    const d = { targetType: "WORKER", targetId: crypto.randomUUID(), reasonCode: "TRABAJADOR_OTRO" };
    expect(createReportSchema.safeParse({ ...d, description: "mal" }).success).toBe(false);
    expect(createReportSchema.safeParse({ ...d, description: "Me pidió dinero por adelantado" }).success).toBe(true);
  });
});

describe("diálogo para denunciar", () => {
  const props = {
    targetType: "WORKER" as const,
    targetId: "00000000-0000-4000-8000-000000000001",
    motivos: [{ code: "TRABAJADOR_FRAUDE", label: "Estafa" }],
    titulo: "Denunciar a Walter P.",
    descripcion: "Cuéntanos",
    abierto: true,
    onAbiertoChange: () => {},
    volverA: "/trabajadores/x",
  };

  it("sin sesión ofrece ingresar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 401 })),
    );
    render(<DenunciarDialogo {...props} />);
    fireEvent.change(screen.getByLabelText("Cuéntanos qué pasó"), {
      target: { value: "Me pidió dinero por adelantado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar denuncia" }));
    await waitFor(() => expect(screen.getByRole("link", { name: "Ingresar" })).toBeTruthy());
  });

  it("al enviarla ofrece el seguimiento", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ id: "abc" }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<DenunciarDialogo {...props} />);
    fireEvent.change(screen.getByLabelText("Cuéntanos qué pasó"), {
      target: { value: "Me pidió dinero por adelantado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar denuncia" }));
    await waitFor(() => expect(screen.getByText("Recibimos tu denuncia")).toBeTruthy());
    expect(screen.getByRole("link", { name: "Ver el seguimiento" }).getAttribute("href")).toBe("/denuncias/abc");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      targetType: "WORKER",
      reasonCode: "TRABAJADOR_FRAUDE",
    });
  });
});

describe("arquitectura (RN-09)", () => {
  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }
  const src = path.join(raiz, "src");

  it("solo el módulo de denuncias del GAD abre la evidencia y los archivos", () => {
    const lectores = archivos(src).filter((f) =>
      /fn_admin_access_report_evidence|fn_admin_evidence_file|EVIDENCE_BUCKET/.test(readFileSync(f, "utf8")),
    );
    expect(lectores.map((f) => path.relative(src, f).replaceAll("\\", "/")).sort()).toEqual([
      "server/reports/admin.ts",
      "server/reports/reports.ts",
      "server/storage/files.ts",
    ]);
    expect(readFileSync(path.join(src, "server/reports/reports.ts"), "utf8")).not.toMatch(/signedUrl|fn_admin_/);
  });

  it("el módulo «Denuncias» del panel ya está disponible", () => {
    const m = modulosVisibles(["admin.access", "report.read"]).find((x) => x.titulo === "Denuncias");
    expect(m?.href).toBe("/admin/denuncias");
  });
});
