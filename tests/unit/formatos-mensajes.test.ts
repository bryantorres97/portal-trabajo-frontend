import { describe, expect, it } from "vitest";

import { etiquetaDia, formatearMomento, mismoDia } from "@/lib/formatos";

// 26 sep 2026, 15:00 en Ecuador (UTC-5).
const AHORA = new Date("2026-09-26T20:00:00Z");

describe("fechas del chat (hora de Ecuador)", () => {
  it("hoy muestra la hora; ayer, «Ayer»; esta semana, el día; antes, la fecha", () => {
    expect(formatearMomento("2026-09-26T19:05:00Z", AHORA)).toBe("14:05");
    expect(formatearMomento("2026-09-25T15:00:00Z", AHORA)).toBe("Ayer");
    expect(formatearMomento("2026-09-22T15:00:00Z", AHORA)).toBe("martes");
    expect(formatearMomento("2026-09-12T15:00:00Z", AHORA)).toMatch(/^12 sept/);
    expect(formatearMomento("2025-03-12T15:00:00Z", AHORA)).toMatch(/2025/);
  });

  it("respeta la medianoche de Ecuador, no la de UTC", () => {
    // 27 sep 02:00 UTC = 26 sep 21:00 en Ecuador → sigue siendo «hoy».
    expect(formatearMomento("2026-09-27T02:00:00Z", AHORA)).toBe("21:00");
    expect(mismoDia("2026-09-27T02:00:00Z", "2026-09-26T15:00:00Z")).toBe(true);
  });

  it("separadores de día legibles", () => {
    expect(etiquetaDia("2026-09-26T15:00:00Z", AHORA)).toBe("Hoy");
    expect(etiquetaDia("2026-09-25T15:00:00Z", AHORA)).toBe("Ayer");
    expect(etiquetaDia("2026-09-21T15:00:00Z", AHORA)).toBe("Lunes, 21 de septiembre");
  });
});
