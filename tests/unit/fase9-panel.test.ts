import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { modulosVisibles } from "@/components/admin/navegacion";
import { aCsv, celdaCsv } from "@/lib/csv";
import { faqSchema, legalDraftSchema, parseRango } from "@/server/domain/panel/schemas";
import { REPORTES } from "@/server/panel/reports";

describe("CSV para Excel", () => {
  it("usa «;», BOM UTF-8 y CRLF", () => {
    const csv = aCsv(["Nombre", "Precio"], [["Walter P.", 45.5]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿Nombre;Precio\r\nWalter P.;45.5\r\n");
  });

  it("escapa comillas, separadores y saltos de línea", () => {
    expect(celdaCsv('Dijo "hola"; adiós')).toBe('"Dijo ""hola""; adiós"');
    expect(celdaCsv("línea 1\nlínea 2")).toBe('"línea 1\nlínea 2"');
    expect(celdaCsv(null)).toBe("");
    expect(celdaCsv(true)).toBe("Sí");
  });

  it("neutraliza fórmulas (inyección CSV)", () => {
    for (const peligroso of ['=HYPERLINK("x")', "+1+1", "-2+3", "@SUM(A1)"]) {
      expect(celdaCsv(peligroso).replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });
});

describe("filtro de periodo (días de Ecuador)", () => {
  const ahora = new Date("2026-09-27T03:00:00Z"); // 26 sept. 22:00 en Ambato

  it("por defecto, los últimos 30 días hasta hoy en Ecuador", () => {
    expect(parseRango({}, ahora)).toEqual({ desde: "2026-08-28", hasta: "2026-09-26", periodo: null });
  });

  it("periodos rápidos", () => {
    expect(parseRango({ periodo: "7d" }, ahora)).toMatchObject({
      desde: "2026-09-20",
      hasta: "2026-09-26",
      periodo: "7d",
    });
  });

  it("rango personalizado; si es inválido, vuelve al predeterminado", () => {
    expect(parseRango({ desde: "2026-01-01", hasta: "2026-01-31" }, ahora)).toMatchObject({
      desde: "2026-01-01",
      hasta: "2026-01-31",
    });
    expect(parseRango({ desde: "2026-02-10", hasta: "2026-01-31" }, ahora).desde).toBe("2026-01-02");
    expect(parseRango({ desde: "no-es-fecha" }, ahora).desde).toBe("2026-08-28");
  });

  it("limita el rango a dos años", () => {
    expect(parseRango({ desde: "2020-01-01", hasta: "2026-01-01" }, ahora).desde).toBe("2024-01-01");
  });
});

describe("reportes", () => {
  it("cada reporte define columnas legibles y sin datos personales de clientes", () => {
    for (const r of Object.values(REPORTES)) {
      expect(r.columnas.length).toBeGreaterThan(5);
      const titulos = r.columnas.map((c) => c.titulo.toLowerCase()).join(" ");
      expect(titulos).not.toMatch(/cliente|correo|teléfono|celular|dirección/);
    }
  });

  it("formatea las filas de un reporte", () => {
    const fila = REPORTES.denuncias.columnas.map((c) =>
      c.valor({
        report_id: "12345678-aaaa",
        target_type: "WORKER",
        reason: "Estafa",
        status: "RESUELTA",
        priority: 1,
        created_at: null,
        due_at: null,
        resolved_at: null,
        resolution: "MEDIDAS_APLICADAS",
        hours_to_resolve: "24.0",
        within_deadline: true,
        sanctions: 1,
      }),
    );
    expect(fila.slice(0, 5)).toEqual(["12345678", "Perfil de trabajador", "Estafa", "Resuelta", "Alta"]);
    expect(fila).toContain("Se aplicaron medidas");
    expect(fila).toContain(24);
  });
});

describe("contenido", () => {
  it("valida preguntas frecuentes y borradores legales", () => {
    expect(
      faqSchema.parse({ audience: "CLIENTES", question: "¿Cuánto cuesta?", answerMd: "Nada.", published: "on" })
        .published,
    ).toBe(true);
    expect(faqSchema.safeParse({ audience: "OTROS", question: "¿?", answerMd: "x" }).success).toBe(false);
    expect(legalDraftSchema.safeParse({ code: "COOKIES", title: "Cookies", contentMd: "x".repeat(30) }).success).toBe(
      false,
    );
  });
});

describe("panel por permisos", () => {
  const titulos = (permisos: string[]) => modulosVisibles(["admin.access", ...permisos]).map((m) => m.titulo);

  it("el supervisor ve indicadores, reportes y auditoría; no el contenido", () => {
    const t = titulos(["metrics.read", "audit.read", "data.export", "report.read", "worker.read"]);
    expect(t).toEqual(expect.arrayContaining(["Indicadores", "Reportes", "Auditoría"]));
    expect(t).not.toContain("Contenido");
  });

  it("un moderador no ve indicadores ni auditoría", () => {
    const t = titulos(["report.read", "moderation.act"]);
    expect(t).not.toContain("Indicadores");
    expect(t).not.toContain("Auditoría");
  });

  it("todos los módulos del panel ya tienen página", () => {
    expect(modulosVisibles(["admin.access", "metrics.read", "audit.read", "content.manage"]).every((m) => m.href)).toBe(
      true,
    );
  });
});

describe("arquitectura", () => {
  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }
  const src = path.resolve(import.meta.dirname, "../../src");

  it("toda exportación de datos exige data.export y queda auditada", () => {
    for (const f of ["server/panel/reports.ts", "server/panel/audit.ts"]) {
      const codigo = readFileSync(path.join(src, f), "utf8");
      const exportar = codigo.slice(codigo.indexOf("export async function export"));
      expect(exportar).toMatch(/requirePermission\(actor, "data\.export"\)/);
      expect(exportar).toMatch(/action: "DATA_EXPORTED"/);
    }
  });

  it("solo el módulo del panel consulta indicadores, reportes y auditoría", () => {
    const lectores = archivos(src).filter((f) =>
      /fn_admin_(metrics|weekly_activity|report_(workers|contracts|reports)|audit_search|sensitive_access_search)/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(lectores.map((f) => path.relative(src, f).replaceAll("\\", "/")).sort()).toEqual([
      "server/panel/audit.ts",
      "server/panel/metrics.ts",
      "server/panel/reports.ts",
    ]);
  });
});
