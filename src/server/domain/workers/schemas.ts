import { z } from "zod";

import { WORKER_STATUSES } from "@/server/domain/workers/state-machine";

/**
 * Esquemas del trabajador. Se comparten entre el asistente de registro (cliente) y el servidor
 * (Server Actions y API): el servidor SIEMPRE revalida. El documento de identidad (cédula o pasaporte)
 * es privado y obligatorio (ADR-019).
 */

const opcional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

const texto = (min: number, max: number, campo: string) =>
  z
    .string({ error: `${campo} es obligatorio` })
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(min, min === 1 ? `${campo} es obligatorio` : `${campo} debe tener al menos ${min} caracteres`)
        .max(max, `${campo} admite hasta ${max} caracteres`),
    );

const sinEspacios = (v: string) => v.replace(/[\s-]/g, "");

const celular = z
  .string()
  .transform(sinEspacios)
  .pipe(z.string().regex(/^09\d{8}$/, "Ingresa un celular de 10 dígitos que empiece con 09"));

const telefonoContacto = z
  .string()
  .transform(sinEspacios)
  .pipe(z.string().regex(/^0[2-9]\d{7,8}$/, "Ingresa un teléfono fijo (9 dígitos) o celular (10 dígitos)"));

/** Edad mínima 18 años (la base lo vuelve a verificar). */
export function esMayorDeEdad(fechaIso: string, hoy = new Date()): boolean {
  const [a, m, d] = fechaIso.split("-").map(Number);
  const limite = new Date(Date.UTC(hoy.getUTCFullYear() - 18, hoy.getUTCMonth(), hoy.getUTCDate()));
  return Date.UTC(a, m - 1, d) <= limite.getTime() && a >= 1920;
}

const fechaNacimiento = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Fecha no válida")
  .refine((v) => esMayorDeEdad(v), "El trabajador debe ser mayor de edad");

const booleano = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/**
 * Cédula ecuatoriana: 10 dígitos, provincia 01–24 o 30, tercer dígito menor que 6 y dígito
 * verificador con módulo 10 (coeficientes 2-1-2-1-2-1-2-1-2). La base aplica la misma regla.
 */
export function cedulaValida(cedula: string): boolean {
  if (!/^\d{10}$/.test(cedula)) return false;
  const provincia = Number(cedula.slice(0, 2));
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30) || Number(cedula[2]) >= 6) return false;
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    const d = Number(cedula[i]) * (i % 2 === 0 ? 2 : 1);
    suma += d > 9 ? d - 9 : d;
  }
  return (10 - (suma % 10)) % 10 === Number(cedula[9]);
}

export const TIPOS_DOCUMENTO = ["CEDULA", "PASAPORTE"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];
export const ETIQUETAS_DOCUMENTO: Record<TipoDocumento, string> = { CEDULA: "Cédula", PASAPORTE: "Pasaporte" };

/** Sin espacios ni guiones y en mayúsculas, como se guarda en la base. */
export const normalizarDocumento = (v: string) => v.replace(/[\s-]/g, "").toUpperCase();

/** Paso 1 — datos personales (privados). */
export const workerPersonalSchema = z
  .object({
    firstNames: texto(1, 80, "Los nombres"),
    lastNames: texto(1, 80, "Los apellidos"),
    idDocumentType: z.enum(TIPOS_DOCUMENTO, { error: "Elige el tipo de documento" }),
    idDocumentNumber: z
      .string({ error: "Ingresa el número del documento" })
      .transform(normalizarDocumento)
      .pipe(z.string().min(1, "Ingresa el número del documento")),
    birthDate: opcional(fechaNacimiento),
  })
  .superRefine((v, ctx) => {
    if (!v.idDocumentNumber) return;
    if (v.idDocumentType === "CEDULA" && !cedulaValida(v.idDocumentNumber)) {
      ctx.addIssue({
        code: "custom",
        path: ["idDocumentNumber"],
        message: "La cédula no es válida: revisa los 10 dígitos",
      });
    }
    if (v.idDocumentType === "PASAPORTE" && !/^[A-Z0-9]{5,20}$/.test(v.idDocumentNumber)) {
      ctx.addIssue({
        code: "custom",
        path: ["idDocumentNumber"],
        message: "El pasaporte debe tener entre 5 y 20 letras o números",
      });
    }
  });

/** Paso 2 — contacto (privado, RN-19: nunca se publica). */
export const workerContactSchema = z
  .object({
    phone: opcional(celular),
    email: opcional(z.email("Correo no válido").max(254).toLowerCase()),
    address: opcional(texto(3, 200, "La dirección")),
    parishCode: opcional(z.string().regex(/^[a-z0-9-]{2,60}$/, "Parroquia no válida")),
    emergencyContactName: opcional(texto(3, 120, "El contacto de emergencia")),
    emergencyContactPhone: opcional(telefonoContacto),
  })
  .refine((v) => v.phone || v.email, {
    path: ["phone"],
    message: "Registra al menos un celular o un correo para contactar al trabajador",
  });

/** Paso 3 — oficios y perfil público. */
export const workerServicesSchema = z
  .object({
    services: z
      .array(z.uuid("Oficio no válido"))
      .min(1, "Selecciona al menos un oficio")
      .max(10, "Se admiten hasta 10 oficios")
      .refine((s) => new Set(s).size === s.length, "Hay oficios repetidos"),
    primaryService: z.uuid("Elige el oficio principal"),
    publicDisplayName: texto(3, 80, "El nombre público"),
    specialty: opcional(texto(3, 120, "La especialidad")),
    publicBio: opcional(texto(10, 800, "La descripción")),
    yearsExperience: z.coerce
      .number({ error: "Años de experiencia no válidos" })
      .int("Usa un número entero")
      .min(0, "No puede ser negativo")
      .max(70, "Máximo 70 años"),
    isAvailable: booleano,
  })
  .refine((v) => v.services.includes(v.primaryService), {
    path: ["primaryService"],
    message: "El oficio principal debe estar entre los oficios seleccionados",
  });

export const workerFormSchema = z.object({
  ...workerPersonalSchema.shape,
  ...workerContactSchema.shape,
  ...workerServicesSchema.shape,
  duplicatesConfirmed: booleano,
});

/** Esquema completo con las validaciones cruzadas de cada paso. */
export function parseWorkerForm(input: unknown) {
  const datos = workerFormSchema.parse(input);
  workerPersonalSchema.parse(datos);
  workerContactSchema.parse(datos);
  workerServicesSchema.parse(datos);
  return datos;
}

export type WorkerFormInput = z.infer<typeof workerFormSchema>;

/** Convierte el FormData del asistente (checkboxes múltiples de oficios) en un objeto plano. */
export function workerFormFromFormData(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !k.startsWith("$ACTION") && k !== "services") obj[k] = v;
  }
  obj.services = formData.getAll("services").filter((v): v is string => typeof v === "string");
  return obj;
}

/** Datos para `fn_admin_create_worker` / `fn_admin_update_worker`. */
export function toWorkerRpc(d: WorkerFormInput) {
  return {
    data: {
      firstNames: d.firstNames,
      lastNames: d.lastNames,
      idDocumentType: d.idDocumentType,
      idDocumentNumber: d.idDocumentNumber,
      birthDate: d.birthDate ?? null,
      phone: d.phone ?? null,
      email: d.email ?? null,
      address: d.address ?? null,
      parishCode: d.parishCode ?? null,
      emergencyContactName: d.emergencyContactName ?? null,
      emergencyContactPhone: d.emergencyContactPhone ?? null,
      publicDisplayName: d.publicDisplayName,
      specialty: d.specialty ?? null,
      publicBio: d.publicBio ?? null,
      yearsExperience: d.yearsExperience,
      isAvailable: d.isAvailable,
      duplicatesConfirmed: d.duplicatesConfirmed,
    },
    services: d.services.map((id) => ({ serviceId: id, isPrimary: id === d.primaryService })),
  };
}

/** Nombre público sugerido: "Nombre A." (sin exponer apellidos completos). */
export function sugerirNombrePublico(nombres: string, apellidos: string): string {
  const primero = nombres.trim().split(/\s+/)[0] ?? "";
  const inicial = apellidos.trim().charAt(0).toUpperCase();
  return [primero, inicial ? `${inicial}.` : ""].filter(Boolean).join(" ");
}

export const workerSearchSchema = z.object({
  q: opcional(z.string().trim().max(120)),
  status: opcional(z.enum(WORKER_STATUSES)),
  /** Solo perfiles con foto o cambios propuestos por revisar. */
  pendingReview: z.boolean().default(false),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export const statusChangeSchema = z.object({
  workerId: z.uuid("Trabajador no válido"),
  to: z.enum(WORKER_STATUSES),
  reason: opcional(z.string().trim().max(500, "El motivo admite hasta 500 caracteres")),
  suspendedUntil: opcional(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida")
      .transform((v) => `${v}T23:59:59-05:00`),
  ),
});

export const documentUploadSchema = z
  .object({
    workerId: z.uuid(),
    typeCode: z.string().regex(/^[A-Z][A-Z_]*$/, "Tipo de documento no válido"),
    issuedAt: opcional(z.iso.date("Fecha no válida")),
    expiresAt: opcional(z.iso.date("Fecha no válida")),
    replacesId: opcional(z.uuid()),
  })
  .refine((v) => !v.issuedAt || !v.expiresAt || v.issuedAt <= v.expiresAt, {
    path: ["expiresAt"],
    message: "La fecha de vencimiento debe ser posterior a la de emisión",
  });

export const documentReviewSchema = z
  .object({
    documentId: z.uuid(),
    status: z.enum(["VALIDADO", "RECHAZADO"]),
    note: opcional(z.string().trim().max(500)),
  })
  .refine((v) => v.status !== "RECHAZADO" || (v.note?.length ?? 0) >= 5, {
    path: ["note"],
    message: "Indica el motivo del rechazo (mínimo 5 caracteres)",
  });

export const trainingSchema = z.object({
  id: opcional(z.uuid()),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/, "Usa mayúsculas, números, guiones (p. ej. «GENERAL»)"),
  name: texto(3, 120, "El nombre"),
  description: opcional(texto(3, 500, "La descripción")),
  provider: z.enum(["INTERNO", "EXTERNO"]),
  validityMonths: opcional(z.coerce.number().int().min(1).max(120)),
  required: booleano,
  active: booleano,
});

export const enrollSchema = z.object({ workerId: z.uuid(), trainingId: z.uuid("Selecciona un curso") });

export const enrollmentUpdateSchema = z
  .object({
    enrollmentId: z.uuid(),
    status: z.enum(["EN_PROCESO", "APROBADO", "REPROBADO", "ABANDONADO"]),
    score: opcional(z.coerce.number().min(0, "Mínimo 0").max(100, "Máximo 100")),
    note: opcional(z.string().trim().max(500)),
    evidenceDocumentId: opcional(z.uuid()),
  })
  .refine((v) => !["REPROBADO", "ABANDONADO"].includes(v.status) || (v.note?.length ?? 0) >= 5, {
    path: ["note"],
    message: "Indica una observación (mínimo 5 caracteres)",
  });

export const reviewDecisionSchema = z
  .object({
    workerId: z.uuid(),
    decision: z.enum(["APROBAR", "RECHAZAR"]),
    note: opcional(z.string().trim().max(300)),
  })
  .refine((v) => v.decision === "APROBAR" || (v.note?.length ?? 0) >= 5, {
    path: ["note"],
    message: "Indica el motivo del rechazo (mínimo 5 caracteres)",
  });

/** Edición limitada del trabajador (se publica solo al aprobarla el GAD). */
export const profileProposalSchema = z.object({
  publicBio: opcional(texto(10, 800, "La descripción")),
  availabilityNote: opcional(texto(3, 160, "La nota de disponibilidad")),
});

export const availabilitySchema = z.object({ isAvailable: z.boolean() });
