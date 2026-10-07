"use client";

import { FileUp, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";

import { formatBytes } from "@/server/domain/documents/files";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  /** Tipos MIME admitidos, como en `accept` (p. ej. "application/pdf,image/png"). */
  accept: string;
  maxBytes: number;
  /** Texto de los formatos para la ayuda, p. ej. "PDF, JPG, PNG o WEBP". */
  formatos: string;
  id?: string;
  required?: boolean;
};

/**
 * Selector de archivo con arrastrar y soltar. Por debajo es un `<input type="file">` normal: el
 * formulario lo envía igual y funciona con teclado (la zona es su etiqueta). El servidor vuelve a
 * validar el tipo (por firma binaria) y el tamaño.
 */
export function ZonaArchivo({ name, accept, maxBytes, formatos, id, required }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [encima, setEncima] = useState(false);
  const tipos = accept.split(",").map((t) => t.trim());

  // Tras un envío correcto, React reinicia el formulario: se limpia también la selección.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const limpiar = () => {
      setArchivo(null);
      setError(null);
    };
    form.addEventListener("reset", limpiar);
    return () => form.removeEventListener("reset", limpiar);
  }, []);

  function elegir(files: FileList | null) {
    const f = files?.[0] ?? null;
    const input = inputRef.current;
    if (!input) return;
    if (!f) {
      setArchivo(null);
      return;
    }
    let problema: string | null = null;
    if (files && files.length > 1) problema = "Suelta un solo archivo.";
    else if (!tipos.includes(f.type)) problema = `Formato no admitido. Usa ${formatos}.`;
    else if (f.size > maxBytes)
      problema = `El archivo pesa ${formatBytes(f.size)}; el máximo es ${formatBytes(maxBytes)}.`;
    if (problema) {
      input.value = "";
      setArchivo(null);
      setError(problema);
      return;
    }
    // Lo soltado se pasa al input para que el formulario lo envíe como cualquier archivo elegido.
    if (input.files !== files) {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.files = dt.files;
    }
    setArchivo(f);
    setError(null);
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setEncima(false);
    elegir(e.dataTransfer.files);
  }

  function quitar() {
    if (inputRef.current) inputRef.current.value = "";
    setArchivo(null);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div className="mt-1">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setEncima(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEncima(false);
        }}
        onDrop={soltar}
        className={cn(
          "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition-colors",
          "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring/40",
          encima
            ? "border-primary bg-primary/10"
            : error
              ? "border-destructive/60 bg-destructive/5"
              : "border-input bg-card hover:border-primary/50 hover:bg-secondary/60",
        )}
      >
        <FileUp className={cn("h-6 w-6", encima ? "text-primary" : "text-muted-foreground")} aria-hidden />
        {archivo ? (
          <span className="max-w-full font-bold break-all">
            {archivo.name} <span className="font-normal text-muted-foreground">· {formatBytes(archivo.size)}</span>
          </span>
        ) : (
          <span>
            <span className="font-bold text-primary">Arrastra el archivo aquí</span> o haz clic para elegirlo
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {formatos}; máximo {formatBytes(maxBytes)}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="file"
          accept={accept}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          onChange={(e) => elegir(e.currentTarget.files)}
          className="sr-only"
        />
      </label>
      {archivo && (
        <button
          type="button"
          onClick={quitar}
          className="mt-1.5 inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden /> Quitar archivo
        </button>
      )}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="mt-1 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
