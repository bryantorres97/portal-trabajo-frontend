"use client";

import { Info, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { boton } from "@/components/ui/boton";
import { ayuda, campo, etiqueta } from "@/components/ui/campo";
import { cn } from "@/lib/utils";
import {
  hoyEcuador,
  MAX_CONDICIONES,
  MAX_DESCRIPCION,
  MAX_UBICACION,
  termsSchema,
  type TermsInput,
} from "@/server/domain/contracts/schemas";
import { ETIQUETAS_UNIDAD, UNIDADES_PRECIO } from "@/server/domain/contracts/state-machine";

export type OpcionesFormulario = {
  services: { id: string; name: string; priceUnit: string; isPrimary: boolean }[];
  parishes: { code: string; name: string }[];
};

/** Valores iniciales: una versión anterior (contrapropuesta o modificación) o vacío. */
export type ValoresCondiciones = Partial<{
  description: string;
  serviceId: string | null;
  scheduledStart: string;
  scheduledEnd: string | null;
  parishCode: string | null;
  locationDetail: string | null;
  priceAmount: number;
  priceUnit: string;
  conditions: string | null;
}>;

type Errores = Partial<Record<keyof TermsInput | "form", string>>;

/**
 * Formulario de condiciones (descripción, fechas, lugar, precio y modalidad). Valida con el mismo
 * esquema que el servidor; la base vuelve a verificar las reglas críticas.
 */
export function FormularioCondiciones({
  opciones,
  inicial,
  textoEnviar,
  onEnviar,
  onCancelar,
}: {
  opciones: OpcionesFormulario;
  inicial?: ValoresCondiciones;
  textoEnviar: string;
  /** Devuelve un mensaje de error para mostrar, o null si salió bien. */
  onEnviar: (terms: TermsInput) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);
  const principal = opciones.services.find((s) => s.isPrimary) ?? opciones.services[0];
  const [servicio, setServicio] = useState(inicial?.serviceId ?? (inicial ? "" : (principal?.id ?? "")));
  const [unidad, setUnidad] = useState(
    inicial?.priceUnit ?? opciones.services.find((s) => s.id === servicio)?.priceUnit ?? "OBRA",
  );
  const hoy = hoyEcuador();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const datos = Object.fromEntries(
      [
        "description",
        "serviceId",
        "scheduledStart",
        "scheduledEnd",
        "parishCode",
        "locationDetail",
        "priceAmount",
        "priceUnit",
        "conditions",
      ].map((k) => [k, String(fd.get(k) ?? "")]),
    );
    const r = termsSchema.safeParse(datos);
    if (!r.success) {
      const nuevos: Errores = {};
      for (const i of r.error.issues) {
        const k = i.path[0] as keyof TermsInput;
        nuevos[k] ??= i.message;
      }
      setErrores(nuevos);
      e.currentTarget.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
      return;
    }
    setErrores({});
    setEnviando(true);
    const error = await onEnviar(r.data);
    setEnviando(false);
    if (error) setErrores({ form: error });
  }

  const err = (k: keyof TermsInput) =>
    errores[k] ? { "aria-invalid": true as const, "aria-describedby": `err-${k}` } : {};
  const mensaje = (k: keyof TermsInput) =>
    errores[k] ? (
      <p id={`err-${k}`} className="mt-1.5 text-sm font-semibold text-destructive">
        {errores[k]}
      </p>
    ) : null;

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-5">
      {opciones.services.length > 0 && (
        <div>
          <label htmlFor="serviceId" className={etiqueta}>
            Servicio
          </label>
          <select
            id="serviceId"
            name="serviceId"
            value={servicio}
            onChange={(e) => {
              setServicio(e.target.value);
              const s = opciones.services.find((x) => x.id === e.target.value);
              if (s && !inicial) setUnidad(s.priceUnit);
            }}
            className={campo}
            {...err("serviceId")}
          >
            {opciones.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="">Otro trabajo</option>
          </select>
          {mensaje("serviceId")}
        </div>
      )}

      <div>
        <label htmlFor="description" className={etiqueta}>
          ¿Qué trabajo se hará?
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          required
          maxLength={MAX_DESCRIPCION}
          defaultValue={inicial?.description ?? ""}
          placeholder="Ej.: cambiar la tubería del baño y revisar las llaves de paso"
          className={cn(campo, "min-h-24 resize-y")}
          {...err("description")}
        />
        {mensaje("description")}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="scheduledStart" className={etiqueta}>
            Fecha de inicio
          </label>
          <input
            id="scheduledStart"
            name="scheduledStart"
            type="date"
            required
            min={hoy}
            defaultValue={inicial?.scheduledStart && inicial.scheduledStart >= hoy ? inicial.scheduledStart : ""}
            className={campo}
            {...err("scheduledStart")}
          />
          {mensaje("scheduledStart")}
        </div>
        <div>
          <label htmlFor="scheduledEnd" className={etiqueta}>
            Fecha de fin <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="scheduledEnd"
            name="scheduledEnd"
            type="date"
            min={hoy}
            defaultValue={inicial?.scheduledEnd ?? ""}
            className={campo}
            {...err("scheduledEnd")}
          />
          {mensaje("scheduledEnd")}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="parishCode" className={etiqueta}>
            Parroquia
          </label>
          <select
            id="parishCode"
            name="parishCode"
            defaultValue={inicial?.parishCode ?? ""}
            className={campo}
            {...err("parishCode")}
          >
            <option value="">Sin especificar</option>
            {opciones.parishes.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
          {mensaje("parishCode")}
        </div>
        <div>
          <label htmlFor="locationDetail" className={etiqueta}>
            Dirección o referencia <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="locationDetail"
            name="locationDetail"
            maxLength={MAX_UBICACION}
            defaultValue={inicial?.locationDetail ?? ""}
            autoComplete="street-address"
            className={campo}
            aria-describedby="ayuda-ubicacion"
            {...err("locationDetail")}
          />
          <p id="ayuda-ubicacion" className={ayuda}>
            Solo la ven ustedes dos.
          </p>
          {mensaje("locationDetail")}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <div>
          <label htmlFor="priceAmount" className={etiqueta}>
            Precio (USD)
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 mt-0.75 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <input
              id="priceAmount"
              name="priceAmount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              defaultValue={inicial?.priceAmount ?? ""}
              className={cn(campo, "pl-8 tabular-nums")}
              {...err("priceAmount")}
            />
          </div>
          {mensaje("priceAmount")}
        </div>
        <div>
          <label htmlFor="priceUnit" className={etiqueta}>
            Modalidad de pago
          </label>
          <select
            id="priceUnit"
            name="priceUnit"
            value={unidad}
            onChange={(e) => setUnidad(e.target.value)}
            className={campo}
            {...err("priceUnit")}
          >
            {UNIDADES_PRECIO.map((u) => (
              <option key={u} value={u}>
                {ETIQUETAS_UNIDAD[u]}
              </option>
            ))}
          </select>
          {mensaje("priceUnit")}
        </div>
      </div>

      <div>
        <label htmlFor="conditions" className={etiqueta}>
          Otras condiciones <span className="font-normal text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          id="conditions"
          name="conditions"
          rows={2}
          maxLength={MAX_CONDICIONES}
          defaultValue={inicial?.conditions ?? ""}
          placeholder="Ej.: los materiales los compra el cliente; se paga la mitad al empezar"
          className={cn(campo, "min-h-20 resize-y")}
          {...err("conditions")}
        />
        {mensaje("conditions")}
      </div>

      <p className="flex gap-2.5 rounded-2xl bg-secondary p-3.5 text-sm leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>
          Al enviarla, quedas de acuerdo con estas condiciones. La otra parte puede aceptarlas, rechazarlas o proponer
          cambios. El pago se hace directo entre ustedes: la plataforma no cobra ni retiene dinero.
        </span>
      </p>

      {errores.form && (
        <p role="alert" className="rounded-2xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {errores.form}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancelar} className={boton({ variante: "secundario" })}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className={boton()}>
          {enviando && <Loader2 className="animate-spin" aria-hidden />}
          {enviando ? "Enviando…" : textoEnviar}
        </button>
      </div>
    </form>
  );
}
