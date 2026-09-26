"use client";

import Link from "next/link";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useActionState, useMemo, useRef, useState } from "react";
import type { z } from "zod";

import { cn } from "@/lib/utils";
import {
  sugerirNombrePublico,
  workerContactSchema,
  workerPersonalSchema,
  workerServicesSchema,
  workerFormFromFormData,
} from "@/server/domain/workers/schemas";
import { ETIQUETAS_ESTADO } from "@/server/domain/workers/state-machine";

import type { WorkerFormState } from "./actions";

const campo =
  "mt-1 w-full rounded-xl border border-input bg-card px-3 py-2.5 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/30 aria-[invalid=true]:border-destructive";

type Opciones = {
  services: { id: string; name: string; category: string }[];
  parishes: { code: string; name: string; kind: string }[];
};

export type WizardValues = {
  firstNames: string;
  lastNames: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  parishCode: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  services: string[];
  primaryService: string;
  publicDisplayName: string;
  specialty: string;
  publicBio: string;
  yearsExperience: string;
  isAvailable: boolean;
};

const VACIO: WizardValues = {
  firstNames: "",
  lastNames: "",
  birthDate: "",
  phone: "",
  email: "",
  address: "",
  parishCode: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  services: [],
  primaryService: "",
  publicDisplayName: "",
  specialty: "",
  publicBio: "",
  yearsExperience: "0",
  isAvailable: true,
};

const PASOS = [
  { titulo: "Datos personales", schema: workerPersonalSchema as z.ZodType },
  { titulo: "Contacto", schema: workerContactSchema as z.ZodType },
  { titulo: "Oficios y perfil", schema: workerServicesSchema as z.ZodType },
  { titulo: "Resumen", schema: null },
] as const;

const CAMPOS_POR_PASO: string[][] = [
  ["firstNames", "lastNames", "birthDate"],
  ["phone", "email", "address", "parishCode", "emergencyContactName", "emergencyContactPhone"],
  ["services", "primaryService", "publicDisplayName", "specialty", "publicBio", "yearsExperience", "isAvailable"],
  [],
];

const MOTIVOS: Record<string, string> = { TELEFONO: "mismo celular", EMAIL: "mismo correo", NOMBRES: "mismos nombres" };

type Props = {
  action: (prev: WorkerFormState, formData: FormData) => Promise<WorkerFormState>;
  opciones: Opciones;
  initial?: WizardValues;
  workerId?: string;
  cancelHref: string;
};

/**
 * Asistente de alta presencial (y de edición): datos personales → contacto → oficios → resumen.
 * Cada paso se valida en el navegador con los mismos esquemas que usa el servidor, que vuelve
 * a validar todo al guardar. Los documentos se cargan en la ficha, una vez creado el trabajador.
 */
export function WorkerWizard({ action, opciones, initial = VACIO, workerId, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as WorkerFormState);
  const [paso, setPaso] = useState(0);
  const [errores, setErrores] = useState<Record<string, string[]>>({});
  const [seleccion, setSeleccion] = useState<string[]>(initial.services);
  const [principal, setPrincipal] = useState(initial.primaryService);
  const [resumen, setResumen] = useState<Record<string, unknown>>({});
  const [ultimoEstado, setUltimoEstado] = useState(state);
  const formRef = useRef<HTMLFormElement>(null);
  const edicion = !!workerId;

  // Errores del servidor: se muestran y se vuelve al primer paso con un campo inválido.
  if (state !== ultimoEstado) {
    setUltimoEstado(state);
    if (state.fieldErrors) {
      setErrores(state.fieldErrors);
      const destino = CAMPOS_POR_PASO.findIndex((c) => c.some((n) => state.fieldErrors?.[n]));
      if (destino >= 0) setPaso(destino);
    }
  }

  const categorias = useMemo(() => {
    const m = new Map<string, Opciones["services"]>();
    for (const s of opciones.services) m.set(s.category, [...(m.get(s.category) ?? []), s]);
    return [...m.entries()];
  }, [opciones.services]);

  function datosActuales() {
    return formRef.current ? workerFormFromFormData(new FormData(formRef.current)) : {};
  }

  function validarPaso(i: number): boolean {
    const schema = PASOS[i].schema;
    if (!schema) return true;
    const r = schema.safeParse(datosActuales());
    if (r.success) {
      setErrores({});
      return true;
    }
    const fe: Record<string, string[]> = {};
    for (const issue of r.error.issues) (fe[String(issue.path[0] ?? "_")] ??= []).push(issue.message);
    setErrores(fe);
    requestAnimationFrame(() => {
      const primero = formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]");
      primero?.focus();
    });
    return false;
  }

  function ir(destino: number) {
    if (destino > paso) {
      for (let i = paso; i < destino; i++) {
        if (!validarPaso(i)) {
          setPaso(i);
          return;
        }
      }
    }
    if (destino === 3) setResumen(datosActuales());
    setPaso(destino);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function alternarServicio(id: string, marcado: boolean) {
    const nueva = marcado ? [...seleccion, id] : seleccion.filter((s) => s !== id);
    setSeleccion(nueva);
    if (marcado && !principal) setPrincipal(id);
    if (!marcado && principal === id) setPrincipal(nueva[0] ?? "");
  }

  function sugerirNombre() {
    const f = formRef.current;
    if (!f) return;
    const nombre = f.elements.namedItem("publicDisplayName") as HTMLInputElement;
    if (nombre.value.trim()) return;
    const n = (f.elements.namedItem("firstNames") as HTMLInputElement).value;
    const a = (f.elements.namedItem("lastNames") as HTMLInputElement).value;
    nombre.value = sugerirNombrePublico(n, a);
  }

  const err = (n: string) => ({
    "aria-invalid": !!errores[n],
    "aria-describedby": errores[n] ? `${n}-error` : undefined,
  });
  const mensajeError = (n: string) =>
    errores[n]?.length ? (
      <p id={`${n}-error`} className="mt-1 text-sm font-semibold text-destructive">
        {errores[n].join(" ")}
      </p>
    ) : null;

  const nombreServicio = (id: unknown) => opciones.services.find((s) => s.id === id)?.name ?? "—";
  const nombreParroquia = (code: unknown) => opciones.parishes.find((p) => p.code === code)?.name ?? "—";

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="space-y-6"
      onSubmit={() => setResumen(datosActuales())}
    >
      {workerId && <input type="hidden" name="workerId" value={workerId} />}

      <ol className="grid grid-cols-4 gap-2" aria-label="Pasos del registro">
        {PASOS.map((p, i) => (
          <li key={p.titulo}>
            <button
              type="button"
              onClick={() => ir(i)}
              aria-current={i === paso ? "step" : undefined}
              className={cn(
                "flex w-full flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left text-xs font-bold transition-colors",
                i === paso ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-secondary",
              )}
            >
              <span
                className={cn(
                  "grid h-6 w-6 place-items-center rounded-full text-[11px]",
                  i < paso ? "bg-verde text-white" : i === paso ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
                aria-hidden
              >
                {i < paso ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{p.titulo}</span>
              <span className="sr-only sm:hidden">{p.titulo}</span>
            </button>
          </li>
        ))}
      </ol>

      <h2 className="text-xl font-extrabold" tabIndex={-1}>
        Paso {paso + 1}: {PASOS[paso].titulo}
      </h2>

      {/* Paso 1 — datos personales */}
      <fieldset hidden={paso !== 0} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Datos personales</legend>
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Datos privados: solo los ve el personal autorizado del GAD. El portal no registra la cédula.
        </p>
        <div>
          <label htmlFor="firstNames" className="text-sm font-bold">
            Nombres
          </label>
          <input
            id="firstNames"
            name="firstNames"
            defaultValue={initial.firstNames}
            maxLength={80}
            autoComplete="off"
            className={campo}
            {...err("firstNames")}
          />
          {mensajeError("firstNames")}
        </div>
        <div>
          <label htmlFor="lastNames" className="text-sm font-bold">
            Apellidos
          </label>
          <input
            id="lastNames"
            name="lastNames"
            defaultValue={initial.lastNames}
            maxLength={80}
            autoComplete="off"
            className={campo}
            {...err("lastNames")}
          />
          {mensajeError("lastNames")}
        </div>
        <div>
          <label htmlFor="birthDate" className="text-sm font-bold">
            Fecha de nacimiento <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="birthDate"
            name="birthDate"
            type="date"
            defaultValue={initial.birthDate}
            className={campo}
            {...err("birthDate")}
          />
          {mensajeError("birthDate")}
        </div>
      </fieldset>

      {/* Paso 2 — contacto */}
      <fieldset hidden={paso !== 1} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Contacto</legend>
        <p className="text-sm text-muted-foreground sm:col-span-2">
          El teléfono y el correo nunca se publican (los clientes escriben por el chat del portal). Registra al menos
          uno de los dos.
        </p>
        <div>
          <label htmlFor="phone" className="text-sm font-bold">
            Celular
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            placeholder="09XXXXXXXX"
            defaultValue={initial.phone}
            maxLength={14}
            className={campo}
            {...err("phone")}
          />
          {mensajeError("phone")}
        </div>
        <div>
          <label htmlFor="email" className="text-sm font-bold">
            Correo <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={initial.email}
            maxLength={254}
            className={campo}
            {...err("email")}
          />
          {mensajeError("email")}
        </div>
        <div>
          <label htmlFor="parishCode" className="text-sm font-bold">
            Parroquia donde trabaja
          </label>
          <select
            id="parishCode"
            name="parishCode"
            defaultValue={initial.parishCode}
            className={campo}
            {...err("parishCode")}
          >
            <option value="">Sin especificar</option>
            {(["URBANA", "RURAL"] as const).map((k) => (
              <optgroup key={k} label={k === "URBANA" ? "Urbanas" : "Rurales"}>
                {opciones.parishes
                  .filter((p) => p.kind === k)
                  .map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {mensajeError("parishCode")}
        </div>
        <div>
          <label htmlFor="address" className="text-sm font-bold">
            Dirección <span className="font-normal text-muted-foreground">(opcional, privada)</span>
          </label>
          <input
            id="address"
            name="address"
            defaultValue={initial.address}
            maxLength={200}
            className={campo}
            {...err("address")}
          />
          {mensajeError("address")}
        </div>
        <div>
          <label htmlFor="emergencyContactName" className="text-sm font-bold">
            Contacto de emergencia <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="emergencyContactName"
            name="emergencyContactName"
            defaultValue={initial.emergencyContactName}
            maxLength={120}
            className={campo}
            {...err("emergencyContactName")}
          />
          {mensajeError("emergencyContactName")}
        </div>
        <div>
          <label htmlFor="emergencyContactPhone" className="text-sm font-bold">
            Teléfono de emergencia <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="emergencyContactPhone"
            name="emergencyContactPhone"
            type="tel"
            inputMode="numeric"
            defaultValue={initial.emergencyContactPhone}
            maxLength={14}
            className={campo}
            {...err("emergencyContactPhone")}
          />
          {mensajeError("emergencyContactPhone")}
        </div>
      </fieldset>

      {/* Paso 3 — oficios y perfil público */}
      <div hidden={paso !== 2} className="space-y-5">
        <fieldset
          aria-describedby={
            errores.services || errores.primaryService ? "services-error primaryService-error" : undefined
          }
        >
          <legend className="text-sm font-bold">Oficios (marca el principal)</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {categorias.map(([categoria, servicios]) => (
              <div key={categoria} className="tarjeta p-4">
                <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{categoria}</p>
                <ul className="mt-2 space-y-2">
                  {servicios.map((s) => {
                    const marcado = seleccion.includes(s.id);
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-3">
                        <label className="flex min-h-11 flex-1 items-center gap-3 text-sm font-semibold">
                          <input
                            type="checkbox"
                            name="services"
                            value={s.id}
                            checked={marcado}
                            onChange={(e) => alternarServicio(s.id, e.target.checked)}
                            className="h-5 w-5 accent-primary"
                          />
                          {s.name}
                        </label>
                        <label className={cn("flex items-center gap-1.5 text-xs", !marcado && "opacity-40")}>
                          <input
                            type="radio"
                            name="primaryService"
                            value={s.id}
                            checked={principal === s.id}
                            disabled={!marcado}
                            onChange={() => setPrincipal(s.id)}
                            className="h-4 w-4 accent-primary"
                          />
                          Principal
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {/* Si ningún radio está activo, se envía vacío para que la validación lo explique. */}
          {!seleccion.includes(principal) && <input type="hidden" name="primaryService" value="" />}
          {mensajeError("services")}
          {mensajeError("primaryService")}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="publicDisplayName" className="text-sm font-bold">
              Nombre público
            </label>
            <input
              id="publicDisplayName"
              name="publicDisplayName"
              defaultValue={initial.publicDisplayName}
              onFocus={sugerirNombre}
              maxLength={80}
              placeholder="Ej.: Manuel Y."
              className={campo}
              {...err("publicDisplayName")}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Así aparece en la búsqueda. Sugerencia: nombre e inicial del apellido.
            </p>
            {mensajeError("publicDisplayName")}
          </div>
          <div>
            <label htmlFor="specialty" className="text-sm font-bold">
              Especialidad <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <input
              id="specialty"
              name="specialty"
              defaultValue={initial.specialty}
              maxLength={120}
              placeholder="Ej.: Enlucidos y contrapisos"
              className={campo}
              {...err("specialty")}
            />
            {mensajeError("specialty")}
          </div>
          <div>
            <label htmlFor="yearsExperience" className="text-sm font-bold">
              Años de experiencia
            </label>
            <input
              id="yearsExperience"
              name="yearsExperience"
              type="number"
              min={0}
              max={70}
              inputMode="numeric"
              defaultValue={initial.yearsExperience}
              className={campo}
              {...err("yearsExperience")}
            />
            {mensajeError("yearsExperience")}
          </div>
          <label className="flex min-h-11 items-center gap-3 self-end text-sm font-semibold">
            <input
              type="checkbox"
              name="isAvailable"
              defaultChecked={initial.isAvailable}
              className="h-5 w-5 accent-primary"
            />
            Disponible para nuevos trabajos
          </label>
          <div className="sm:col-span-2">
            <label htmlFor="publicBio" className="text-sm font-bold">
              Descripción pública <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              id="publicBio"
              name="publicBio"
              defaultValue={initial.publicBio}
              maxLength={800}
              rows={4}
              className={campo}
              {...err("publicBio")}
            />
            {mensajeError("publicBio")}
          </div>
        </div>
      </div>

      {/* Paso 4 — resumen */}
      <div hidden={paso !== 3} className="space-y-4">
        <dl className="grid gap-x-6 gap-y-3 tarjeta p-5 text-sm sm:grid-cols-2">
          {[
            ["Nombres", `${resumen.firstNames ?? ""} ${resumen.lastNames ?? ""}`],
            ["Fecha de nacimiento", resumen.birthDate || "—"],
            ["Celular", resumen.phone || "—"],
            ["Correo", resumen.email || "—"],
            ["Parroquia", nombreParroquia(resumen.parishCode)],
            ["Dirección", resumen.address || "—"],
            ["Nombre público", resumen.publicDisplayName || "—"],
            ["Especialidad", resumen.specialty || "—"],
            ["Oficio principal", nombreServicio(resumen.primaryService)],
            [
              "Otros oficios",
              ((resumen.services as string[] | undefined) ?? [])
                .filter((s) => s !== resumen.primaryService)
                .map(nombreServicio)
                .join(", ") || "—",
            ],
            ["Experiencia", `${resumen.yearsExperience ?? 0} años`],
            ["Disponible", resumen.isAvailable === "on" ? "Sí" : "No"],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <dt className="text-xs font-bold text-muted-foreground uppercase">{String(k)}</dt>
              <dd className="mt-0.5 font-semibold break-words">{String(v)}</dd>
            </div>
          ))}
        </dl>
        {!edicion && (
          <p className="text-sm text-muted-foreground">
            Después de registrar podrás cargar los documentos, la foto y entregar el código de activación desde la ficha
            del trabajador.
          </p>
        )}
      </div>

      {state.duplicates && state.duplicates.length > 0 && (
        <div role="alert" className="space-y-3 rounded-2xl border border-naranja/60 bg-naranja/10 p-4 text-sm">
          <p className="flex gap-2 font-bold">
            <AlertTriangle className="h-5 w-5 shrink-0 text-naranja" aria-hidden />
            Posibles duplicados: revisa si la persona ya está registrada.
          </p>
          <ul className="space-y-1">
            {state.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/trabajadores/${d.id}`} target="_blank" className="font-bold text-primary underline">
                  {d.displayName}
                </Link>{" "}
                · {ETIQUETAS_ESTADO[d.status]} · {d.reasons.map((r) => MOTIVOS[r] ?? r).join(", ")}
              </li>
            ))}
          </ul>
          <label className="flex min-h-11 items-center gap-3 font-semibold">
            <input type="checkbox" name="duplicatesConfirmed" className="h-5 w-5 accent-primary" />
            Confirmo que es una persona distinta y quiero registrarla
          </label>
        </div>
      )}

      {state.status === "error" && state.message && !state.duplicates && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex gap-2">
          {paso > 0 ? (
            <button
              type="button"
              onClick={() => ir(paso - 1)}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-border px-4 text-sm font-bold"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
            </button>
          ) : (
            <Link
              href={cancelHref}
              className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold"
            >
              Cancelar
            </Link>
          )}
        </div>
        {paso < 3 ? (
          <button
            type="button"
            onClick={() => ir(paso + 1)}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Siguiente <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-70"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {pending ? "Guardando…" : edicion ? "Guardar cambios" : "Registrar trabajador"}
          </button>
        )}
      </div>
    </form>
  );
}
