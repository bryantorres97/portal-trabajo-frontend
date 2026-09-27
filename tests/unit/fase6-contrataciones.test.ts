import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { camposCambiados } from "@/components/contracts/DetalleContrato";
import { buildContractDetail, type ContractVersion } from "@/server/contracts/contracts";
import { acceptSchema, counterSchema, hoyEcuador, termsSchema } from "@/server/domain/contracts/schemas";
import {
  availableActions,
  canTransition,
  CONTRACT_STATUSES,
  formatearPrecio,
  isTerminal,
  needsMyAction,
  TRANSICIONES,
  type ContractSnapshot,
} from "@/server/domain/contracts/state-machine";
import { fromPgError } from "@/server/errors";

const raiz = path.resolve(import.meta.dirname, "../..");
const migracion = readFileSync(path.join(raiz, "supabase/migrations/20260926210000_contrataciones.sql"), "utf8");

describe("máquina de estados: TypeScript y la base dicen lo mismo", () => {
  it("los estados coinciden con el enum contract_status", () => {
    const bloque = /create type public\.contract_status as enum \(([^)]*)\)/.exec(migracion)?.[1] ?? "";
    expect([...bloque.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])).toEqual([...CONTRACT_STATUSES]);
  });

  it("las transiciones coinciden con private.contract_transition_allowed", () => {
    const inicio = migracion.indexOf("function private.contract_transition_allowed");
    const cuerpo = migracion.slice(inicio, migracion.indexOf("$$;", inicio));
    const sql = [...cuerpo.matchAll(/'([A-Z_]+)>([A-Z_]+)'/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const ts = Object.entries(TRANSICIONES)
      .flatMap(([desde, hacia]) => hacia.map((h) => `${desde}>${h}`))
      .sort();
    expect(sql).toEqual(ts);
  });

  it("los estados finales no tienen salida y la negociación no salta a la ejecución", () => {
    expect(["FINALIZADA", "CANCELADA", "RECHAZADA", "EXPIRADA"].every((s) => isTerminal(s as never))).toBe(true);
    expect(canTransition("PROPUESTA_ENVIADA", "EN_CURSO")).toBe(false);
    expect(canTransition("CONTRATADA", "FINALIZADA")).toBe(false);
    expect(canTransition("EN_CURSO", "CANCELADA")).toBe(false);
  });
});

const snap = (s: Partial<ContractSnapshot>): ContractSnapshot => ({
  status: "PROPUESTA_ENVIADA",
  myRole: "CLIENTE",
  pendingTerms: false,
  pendingProposedByMe: false,
  disputedByMe: false,
  ...s,
});

describe("acciones disponibles por parte", () => {
  it("quien recibe la propuesta acepta, contrapropone o rechaza; quien la envió corrige o retira", () => {
    expect(availableActions(snap({ pendingTerms: true }))).toEqual(["ACCEPT", "COUNTER", "REJECT"]);
    expect(availableActions(snap({ pendingTerms: true, pendingProposedByMe: true }))).toEqual(["COUNTER", "WITHDRAW"]);
  });

  it("contratada: el trabajador marca el inicio; ambos pueden modificar, cancelar o reportar", () => {
    expect(availableActions(snap({ status: "CONTRATADA", myRole: "TRABAJADOR" }))).toEqual([
      "START",
      "MODIFY",
      "CANCEL",
      "DISPUTE",
    ]);
    expect(availableActions(snap({ status: "CONTRATADA" }))).toEqual(["MODIFY", "CANCEL", "DISPUTE"]);
  });

  it("con una modificación pendiente no se propone otra y se responde la vigente", () => {
    const a = availableActions(snap({ status: "EN_CURSO", myRole: "CLIENTE", pendingTerms: true }));
    expect(a).toContain("ACCEPT");
    expect(a).not.toContain("MODIFY");
    expect(a).toContain("CONFIRM");
  });

  it("por confirmar: solo el cliente confirma; en disputa, solo quien la abrió la retira", () => {
    expect(availableActions(snap({ status: "FINALIZACION_PENDIENTE" }))).toEqual(["CONFIRM", "DISPUTE"]);
    expect(availableActions(snap({ status: "FINALIZACION_PENDIENTE", myRole: "TRABAJADOR" }))).toEqual(["DISPUTE"]);
    expect(availableActions(snap({ status: "EN_DISPUTA", disputedByMe: true }))).toEqual(["WITHDRAW_DISPUTE"]);
    expect(availableActions(snap({ status: "EN_DISPUTA" }))).toEqual([]);
    expect(availableActions(snap({ status: "FINALIZADA" }))).toEqual([]);
  });

  it("marca a quién le toca", () => {
    expect(needsMyAction(snap({ pendingTerms: true }))).toBe(true);
    expect(needsMyAction(snap({ pendingTerms: true, pendingProposedByMe: true }))).toBe(false);
    expect(needsMyAction(snap({ status: "CONTRATADA", myRole: "TRABAJADOR" }))).toBe(true);
    expect(needsMyAction(snap({ status: "FINALIZACION_PENDIENTE" }))).toBe(true);
    expect(needsMyAction(snap({ status: "FINALIZACION_PENDIENTE", myRole: "TRABAJADOR" }))).toBe(false);
  });
});

const manana = () => {
  const d = new Date(`${hoyEcuador()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const terminos = (cambios: Record<string, unknown> = {}) => ({
  description: "Cambiar la tubería del baño",
  scheduledStart: manana(),
  priceAmount: "45.50",
  priceUnit: "OBRA",
  ...cambios,
});

describe("validación de condiciones (misma regla en web, API y base)", () => {
  afterEach(() => vi.useRealTimers());

  it("acepta condiciones válidas y normaliza vacíos a undefined", () => {
    const r = termsSchema.parse(terminos({ serviceId: "", locationDetail: "  ", conditions: "" }));
    expect(r).toMatchObject({ priceAmount: 45.5, priceUnit: "OBRA" });
    expect(r.serviceId).toBeUndefined();
    expect(r.locationDetail).toBeUndefined();
  });

  it.each([
    ["fecha pasada", { scheduledStart: "2020-01-01" }, "scheduledStart"],
    ["fin antes del inicio", { scheduledEnd: "2020-01-01" }, "scheduledEnd"],
    ["precio cero", { priceAmount: 0 }, "priceAmount"],
    ["tres decimales", { priceAmount: "10.123" }, "priceAmount"],
    ["modalidad inventada", { priceUnit: "MES" }, "priceUnit"],
    ["descripción corta", { description: "Arreglo" }, "description"],
    ["dirección larga", { locationDetail: "x".repeat(201) }, "locationDetail"],
  ])("rechaza %s", (_caso, cambios, campo) => {
    const r = termsSchema.safeParse(terminos(cambios));
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === campo)).toBe(true);
  });

  it("usa el día de Ecuador (UTC−5), no el del servidor", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T03:00:00Z")); // 30 sep. 22:00 en Ambato
    expect(hoyEcuador()).toBe("2026-09-30");
  });

  it("aceptar exige la versión y un hash SHA-256; contraproponer exige la versión base", () => {
    expect(acceptSchema.safeParse({ version: 2, contentHash: "abc" }).success).toBe(false);
    expect(acceptSchema.safeParse({ version: 2, contentHash: "a".repeat(64) }).success).toBe(true);
    expect(counterSchema.safeParse({ terms: terminos() }).success).toBe(false);
  });

  it("una versión obsoleta o un estado que no admite la acción responden 409", () => {
    expect(fromPgError({ code: "55000", message: "Las condiciones cambiaron" })?.status).toBe(409);
    expect(fromPgError({ code: "22007", message: "fecha" })?.status).toBe(422);
  });

  it("formatea el precio en dólares con la modalidad", () => {
    expect(formatearPrecio(45, "OBRA").replace(/\s/g, " ")).toMatch(/45,00.*por la obra$/);
  });
});

const version = (v: Partial<ContractVersion>): ContractVersion => ({
  id: "v1",
  version: 1,
  proposedByMe: true,
  proposerRole: "CLIENTE",
  serviceId: null,
  serviceName: "Gasfitería",
  description: "Cambiar la tubería",
  scheduledStart: "2026-10-01",
  scheduledEnd: null,
  parishCode: null,
  parishName: null,
  locationDetail: null,
  priceAmount: 45,
  priceUnit: "OBRA",
  conditions: null,
  contentHash: "a".repeat(64),
  clientAcceptedAt: "2026-09-26T10:00:00Z",
  workerAcceptedAt: null,
  rejectedAt: null,
  withdrawnAt: null,
  responseNote: null,
  createdAt: "2026-09-26T10:00:00Z",
  ...v,
});

const detalle = (cambios: Record<string, unknown>) =>
  buildContractDetail({
    id: "c1",
    conversationId: "k1",
    workerId: "w1",
    myRole: "TRABAJADOR",
    counterpartName: "Carla M.",
    status: "PROPUESTA_ENVIADA",
    statusBeforeDispute: null,
    agreedAt: null,
    startedAt: null,
    completionRequestedAt: null,
    completedAt: null,
    autoConfirmed: false,
    cancelledAt: null,
    cancelledByMe: false,
    cancelReason: null,
    disputedAt: null,
    disputedByMe: false,
    expiresAt: null,
    confirmDueAt: null,
    createdAt: "2026-09-26T10:00:00Z",
    updatedAt: "2026-09-26T10:00:00Z",
    events: [],
    currentTermsId: "v1",
    agreedTermsId: null,
    versions: [version({ proposedByMe: false, priceAmount: "45.00" as unknown as number })],
    ...cambios,
  } as Parameters<typeof buildContractDetail>[0]);

describe("detalle de la contratación", () => {
  it("en negociación, la versión vigente está pendiente y la contraparte puede aceptarla", () => {
    const d = detalle({});
    expect(d.pending?.id).toBe("v1");
    expect(d.agreed).toBeNull();
    expect(d.current.priceAmount).toBe(45);
    expect(d.actions).toEqual(["ACCEPT", "COUNTER", "REJECT"]);
  });

  it("contratada sin cambios: no hay pendiente y lo vigente es lo acordado", () => {
    const d = detalle({
      status: "CONTRATADA",
      agreedTermsId: "v1",
      versions: [version({ workerAcceptedAt: "2026-09-26T11:00:00Z" })],
    });
    expect(d.pending).toBeNull();
    expect(d.agreed?.id).toBe("v1");
    expect(d.actions).toContain("START");
  });

  it("modificación pendiente: se distingue de lo acordado y se resaltan los cambios", () => {
    const acordada = version({ workerAcceptedAt: "2026-09-26T11:00:00Z" });
    const nueva = version({ id: "v2", version: 2, proposedByMe: false, priceAmount: 60, clientAcceptedAt: null });
    const d = detalle({ status: "CONTRATADA", agreedTermsId: "v1", currentTermsId: "v2", versions: [nueva, acordada] });
    expect(d.pending?.id).toBe("v2");
    expect(d.agreed?.id).toBe("v1");
    expect(d.actions).toEqual(expect.arrayContaining(["ACCEPT", "REJECT", "START"]));
    expect([...camposCambiados(d.pending!, d.agreed)]).toEqual(["Precio"]);
  });
});

describe("arquitectura", () => {
  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }

  it("solo el módulo de contrataciones consulta sus tablas y funciones", () => {
    const src = path.join(raiz, "src");
    const lectores = archivos(src).filter((f) =>
      /fn_(list|get)_contracts?|fn_contract_(?!reviews)|from\("contract(s|_terms|_events)"\)/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(lectores.map((f) => path.relative(src, f).replaceAll("\\", "/"))).toEqual(["server/contracts/contracts.ts"]);
  });
});
