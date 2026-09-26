import { describe, expect, it } from "vitest";

import {
  checkFile,
  documentPath,
  safeOriginalName,
  sniffFileKind,
  MAX_FILE_BYTES,
} from "@/server/domain/documents/files";
import {
  CODE_ALPHABET,
  generateActivationCode,
  normalizeActivationCode,
} from "@/server/domain/workers/activation-code";
import {
  enrollmentUpdateSchema,
  esMayorDeEdad,
  parseWorkerForm,
  statusChangeSchema,
  sugerirNombrePublico,
  toWorkerRpc,
  workerFormFromFormData,
} from "@/server/domain/workers/schemas";
import {
  WORKER_STATUSES,
  allowedTransitions,
  canTransition,
  isPubliclyVisible,
  manualTransitions,
  requiresReason,
  transitionPermission,
  type WorkerStatus,
} from "@/server/domain/workers/state-machine";

/**
 * Matriz esperada de transiciones (docs/analysis/01-negocio.md §6.1). La misma lista está en
 * supabase/tests/04_fase4_trabajadores.test.sql para comprobar que la base impone lo mismo.
 */
export const TRANSICIONES_ESPERADAS = [
  "REGISTRADO>DOCUMENTACION_PENDIENTE",
  "REGISTRADO>PENDIENTE_REVISION",
  "REGISTRADO>RECHAZADO",
  "DOCUMENTACION_PENDIENTE>PENDIENTE_REVISION",
  "DOCUMENTACION_PENDIENTE>RECHAZADO",
  "PENDIENTE_REVISION>DOCUMENTACION_PENDIENTE",
  "PENDIENTE_REVISION>CAPACITACION_PENDIENTE",
  "PENDIENTE_REVISION>RECHAZADO",
  "CAPACITACION_PENDIENTE>CAPACITACION_EN_PROCESO",
  "CAPACITACION_PENDIENTE>RECHAZADO",
  "CAPACITACION_EN_PROCESO>CAPACITACION_PENDIENTE",
  "CAPACITACION_EN_PROCESO>CAPACITACION_APROBADA",
  "CAPACITACION_EN_PROCESO>RECHAZADO",
  "CAPACITACION_APROBADA>HABILITADO",
  "CAPACITACION_APROBADA>RECHAZADO",
  "HABILITADO>SUSPENDIDO",
  "HABILITADO>INACTIVO",
  "SUSPENDIDO>HABILITADO",
  "SUSPENDIDO>INACTIVO",
  "INACTIVO>HABILITADO",
];

const pares = WORKER_STATUSES.flatMap((from) =>
  WORKER_STATUSES.map((to) => [from, to] as [WorkerStatus, WorkerStatus]),
);

describe("máquina de estados del trabajador", () => {
  it.each(pares)("%s → %s coincide con la matriz esperada", (from, to) => {
    expect(canTransition(from, to)).toBe(TRANSICIONES_ESPERADAS.includes(`${from}>${to}`));
  });

  it("RECHAZADO es terminal; ningún estado vuelve a REGISTRADO", () => {
    expect(allowedTransitions("RECHAZADO")).toEqual([]);
    for (const s of WORKER_STATUSES) expect(canTransition(s, "REGISTRADO")).toBe(false);
  });

  it("solo se llega a HABILITADO desde capacitación aprobada, suspendido o inactivo", () => {
    const origenes = WORKER_STATUSES.filter((s) => canTransition(s, "HABILITADO"));
    expect(origenes.sort()).toEqual(["CAPACITACION_APROBADA", "INACTIVO", "SUSPENDIDO"]);
  });

  it("RECHAZADO es alcanzable desde todo estado previo a HABILITADO", () => {
    const previos: WorkerStatus[] = [
      "REGISTRADO",
      "DOCUMENTACION_PENDIENTE",
      "PENDIENTE_REVISION",
      "CAPACITACION_PENDIENTE",
      "CAPACITACION_EN_PROCESO",
      "CAPACITACION_APROBADA",
    ];
    for (const s of previos) expect(canTransition(s, "RECHAZADO")).toBe(true);
    for (const s of ["HABILITADO", "SUSPENDIDO", "INACTIVO"] as const)
      expect(canTransition(s, "RECHAZADO")).toBe(false);
  });

  it("asigna el permiso correcto a cada transición", () => {
    expect(transitionPermission("CAPACITACION_APROBADA", "HABILITADO")).toBe("worker.enable");
    expect(transitionPermission("SUSPENDIDO", "HABILITADO")).toBe("worker.enable");
    expect(transitionPermission("HABILITADO", "SUSPENDIDO")).toBe("worker.suspend");
    expect(transitionPermission("REGISTRADO", "RECHAZADO")).toBe("worker.suspend");
    expect(transitionPermission("PENDIENTE_REVISION", "CAPACITACION_PENDIENTE")).toBe("document.review");
    expect(transitionPermission("CAPACITACION_EN_PROCESO", "CAPACITACION_PENDIENTE")).toBe("training.record");
    expect(transitionPermission("CAPACITACION_EN_PROCESO", "CAPACITACION_APROBADA")).toBe("training.approve");
    expect(transitionPermission("REGISTRADO", "PENDIENTE_REVISION")).toBe("worker.update");
  });

  it("exige motivo para rechazar, suspender, dar de baja, devolver y reactivar", () => {
    expect(requiresReason("REGISTRADO", "RECHAZADO")).toBe(true);
    expect(requiresReason("HABILITADO", "SUSPENDIDO")).toBe(true);
    expect(requiresReason("HABILITADO", "INACTIVO")).toBe(true);
    expect(requiresReason("PENDIENTE_REVISION", "DOCUMENTACION_PENDIENTE")).toBe(true);
    expect(requiresReason("SUSPENDIDO", "HABILITADO")).toBe(true);
    expect(requiresReason("CAPACITACION_APROBADA", "HABILITADO")).toBe(false);
    expect(requiresReason("REGISTRADO", "PENDIENTE_REVISION")).toBe(false);
  });

  it("las acciones manuales se filtran por permiso y excluyen las automáticas de capacitación", () => {
    expect(manualTransitions("CAPACITACION_APROBADA", ["worker.enable"])).toEqual(["HABILITADO"]);
    expect(manualTransitions("CAPACITACION_APROBADA", ["worker.update"])).toEqual([]);
    expect(manualTransitions("CAPACITACION_PENDIENTE", ["training.record", "worker.suspend"])).toEqual(["RECHAZADO"]);
    expect(manualTransitions("CAPACITACION_EN_PROCESO", ["training.record", "training.approve"])).toEqual([
      "CAPACITACION_APROBADA",
    ]);
  });

  it("solo HABILITADO es visible públicamente", () => {
    expect(WORKER_STATUSES.filter(isPubliclyVisible)).toEqual(["HABILITADO"]);
  });
});

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(32).fill(0)]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37);
const JPG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
const EXE = bytes(0x4d, 0x5a, 0x90, 0x00);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");

describe("validación de archivos por firma binaria", () => {
  it("reconoce PDF, JPG, PNG y WEBP", () => {
    expect(sniffFileKind(PDF)).toBe("application/pdf");
    expect(sniffFileKind(JPG)).toBe("image/jpeg");
    expect(sniffFileKind(PNG)).toBe("image/png");
    expect(sniffFileKind(WEBP)).toBe("image/webp");
    expect(sniffFileKind(EXE)).toBeNull();
  });

  it("rechaza un ejecutable o un HTML declarado como PDF (MIME falso)", () => {
    expect(checkFile(EXE, "application/pdf", ["application/pdf"])).toMatchObject({ ok: false });
    expect(checkFile(HTML, "application/pdf", ["application/pdf"])).toMatchObject({ ok: false });
  });

  it("rechaza cuando el tipo declarado no coincide con el contenido", () => {
    expect(checkFile(PDF, "image/jpeg", ["application/pdf", "image/jpeg"])).toEqual({
      ok: false,
      error: "El tipo del archivo no coincide con su contenido.",
    });
  });

  it("acepta image/jpg como alias y octet-stream sin tipo declarado", () => {
    expect(checkFile(JPG, "image/jpg", ["image/jpeg"])).toEqual({ ok: true, kind: "image/jpeg" });
    expect(checkFile(PNG, "application/octet-stream", ["image/png"])).toEqual({ ok: true, kind: "image/png" });
  });

  it("rechaza PDF como foto, archivos vacíos y de más de 4 MB", () => {
    expect(checkFile(PDF, "application/pdf", ["image/jpeg", "image/png"]).ok).toBe(false);
    expect(checkFile(new Uint8Array(), "image/png", ["image/png"]).ok).toBe(false);
    const grande = new Uint8Array(MAX_FILE_BYTES + 1);
    grande.set(PNG);
    expect(checkFile(grande, "image/png", ["image/png"])).toMatchObject({ ok: false });
  });

  it("la ruta usa un UUID, nunca el nombre original", () => {
    expect(documentPath("w", "f", "application/pdf")).toBe("workers/w/documents/f.pdf");
    expect(safeOriginalName("../../etc/passwd")).toBe(".._.._etc_passwd");
  });
});

describe("código de activación", () => {
  it("genera códigos XXXX-XXXX con el alfabeto sin caracteres ambiguos", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateActivationCode();
      expect(c).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
      for (const ch of c.replace("-", "")) expect(CODE_ALPHABET).toContain(ch);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it("no repite códigos en una muestra grande", () => {
    const muestra = new Set(Array.from({ length: 2000 }, () => generateActivationCode()));
    expect(muestra.size).toBe(2000);
  });

  it("normaliza espacios, guiones y minúsculas; rechaza formatos inválidos", () => {
    expect(normalizeActivationCode(" abcd 2345 ")).toBe("ABCD-2345");
    expect(normalizeActivationCode("abcd-2345")).toBe("ABCD-2345");
    expect(normalizeActivationCode("ABCD-234")).toBeNull();
    expect(normalizeActivationCode("ABCD-2340")).toBeNull(); // el 0 no pertenece al alfabeto
    expect(normalizeActivationCode("")).toBeNull();
  });
});

const SERV_A = "00000000-0000-4000-8000-00000000000a";
const SERV_B = "00000000-0000-4000-8000-00000000000b";

const valido = {
  firstNames: "  Manuel   Antonio ",
  lastNames: "Yánez Pilco",
  birthDate: "1985-04-10",
  phone: "099 123 4567",
  email: "MANUEL@Correo.ec",
  address: "",
  parishCode: "la-merced",
  services: [SERV_A, SERV_B],
  primaryService: SERV_B,
  publicDisplayName: "Manuel Y.",
  yearsExperience: "12",
  isAvailable: "on",
};

describe("formulario del trabajador", () => {
  it("normaliza y arma los datos para la base con un único oficio principal", () => {
    const d = parseWorkerForm(valido);
    expect(d).toMatchObject({ firstNames: "Manuel Antonio", phone: "0991234567", email: "manuel@correo.ec" });
    expect(d.address).toBeUndefined();
    const rpc = toWorkerRpc(d);
    expect(rpc.services).toEqual([
      { serviceId: SERV_A, isPrimary: false },
      { serviceId: SERV_B, isPrimary: true },
    ]);
    expect(rpc.data).toMatchObject({ yearsExperience: 12, isAvailable: true, duplicatesConfirmed: false });
  });

  it("exige celular o correo", () => {
    expect(() => parseWorkerForm({ ...valido, phone: "", email: "" })).toThrow();
  });

  it("exige al menos un oficio y que el principal esté entre los elegidos", () => {
    expect(() => parseWorkerForm({ ...valido, services: [] })).toThrow();
    expect(() => parseWorkerForm({ ...valido, services: [SERV_A], primaryService: SERV_B })).toThrow();
  });

  it("rechaza menores de edad", () => {
    expect(esMayorDeEdad("2000-01-01", new Date("2026-09-26T00:00:00Z"))).toBe(true);
    expect(esMayorDeEdad("2010-01-01", new Date("2026-09-26T00:00:00Z"))).toBe(false);
    expect(() => parseWorkerForm({ ...valido, birthDate: "2015-05-05" })).toThrow();
  });

  it("lee los oficios marcados del FormData", () => {
    const fd = new FormData();
    fd.append("firstNames", "Ana");
    fd.append("services", SERV_A);
    fd.append("services", SERV_B);
    fd.append("$ACTION_ID_x", "ignorar");
    expect(workerFormFromFormData(fd)).toEqual({ firstNames: "Ana", services: [SERV_A, SERV_B] });
  });

  it("sugiere un nombre público sin apellidos completos", () => {
    expect(sugerirNombrePublico("Ana Lucía", "vega torres")).toBe("Ana V.");
  });
});

describe("cambios de estado e inscripciones", () => {
  const workerId = "00000000-0000-4000-8000-000000000001";
  it("la fecha de fin de suspensión se interpreta al final del día en Ecuador", () => {
    expect(statusChangeSchema.parse({ workerId, to: "SUSPENDIDO", suspendedUntil: "2026-10-01" }).suspendedUntil).toBe(
      "2026-10-01T23:59:59-05:00",
    );
  });

  it("reprobar o abandonar exige observación", () => {
    const enrollmentId = workerId;
    expect(enrollmentUpdateSchema.safeParse({ enrollmentId, status: "REPROBADO" }).success).toBe(false);
    expect(enrollmentUpdateSchema.safeParse({ enrollmentId, status: "REPROBADO", note: "No asistió" }).success).toBe(
      true,
    );
    expect(enrollmentUpdateSchema.safeParse({ enrollmentId, status: "APROBADO", score: "95" }).success).toBe(true);
    expect(enrollmentUpdateSchema.safeParse({ enrollmentId, status: "APROBADO", score: "120" }).success).toBe(false);
  });
});
