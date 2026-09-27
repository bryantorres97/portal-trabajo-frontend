"use client";

import { useRouter } from "next/navigation";
import { FileText, Loader2, Paperclip, Send } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";

import { boton } from "@/components/ui/boton";
import { ayuda, campo, etiqueta } from "@/components/ui/campo";
import { cn } from "@/lib/utils";

/** Aportar información o adjuntar archivos a una denuncia propia abierta. */
export function AportarDenuncia({ reportId, pideInfo }: { reportId: string; pideInfo: boolean }) {
  const router = useRouter();
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<"nota" | "archivo" | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  async function responder(res: Response, ok: string) {
    if (res.ok) {
      setAviso({ tipo: "ok", texto: ok });
      router.refresh();
      return true;
    }
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    setAviso({ tipo: "error", texto: err.detail ?? "No pudimos enviarlo. Inténtalo de nuevo." });
    return false;
  }

  async function enviarNota(e: FormEvent) {
    e.preventDefault();
    if (!nota.trim()) return;
    setOcupado("nota");
    const res = await fetch(`/api/v1/reports/${reportId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: nota }),
    });
    if (await responder(res, "Enviamos tu información al GAD.")) setNota("");
    setOcupado(null);
  }

  async function subir(archivo: File) {
    setOcupado("archivo");
    const fd = new FormData();
    fd.set("file", archivo);
    const res = await fetch(`/api/v1/reports/${reportId}/evidence`, { method: "POST", body: fd });
    await responder(res, `Adjuntamos «${archivo.name}».`);
    setOcupado(null);
    if (archivoRef.current) archivoRef.current.value = "";
  }

  return (
    <section aria-labelledby="aportar" className={cn("panel p-5 sm:p-6", pideInfo && "ring-2 ring-naranja/60")}>
      <h2 id="aportar" className="text-xl font-extrabold">
        {pideInfo ? "El GAD necesita más información" : "Aportar información"}
      </h2>
      <form onSubmit={(e) => void enviarNota(e)} className="mt-4 space-y-3">
        <label htmlFor="nota-denuncia" className={etiqueta}>
          {pideInfo ? "Tu respuesta" : "Algo más que debamos saber"}
        </label>
        <textarea
          id="nota-denuncia"
          rows={3}
          maxLength={1000}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className={cn(campo, "min-h-24 resize-y")}
        />
        <button type="submit" disabled={!nota.trim() || ocupado !== null} className={boton()}>
          {ocupado === "nota" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          Enviar
        </button>
      </form>
      <div className="mt-5 border-t border-border pt-5">
        <label htmlFor="archivo-denuncia" className={etiqueta}>
          Adjuntar captura o documento
        </label>
        <p id="archivo-ayuda" className={ayuda}>
          PDF, JPG, PNG o WEBP de hasta 4 MB (máximo 5 archivos). Solo lo ve el personal del GAD.
        </p>
        <input
          ref={archivoRef}
          id="archivo-denuncia"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          aria-describedby="archivo-ayuda"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void subir(f);
          }}
        />
        <button
          type="button"
          onClick={() => archivoRef.current?.click()}
          disabled={ocupado !== null}
          className={cn(boton({ variante: "secundario" }), "mt-3")}
        >
          {ocupado === "archivo" ? <Loader2 className="animate-spin" aria-hidden /> : <Paperclip aria-hidden />}
          Elegir archivo
        </button>
      </div>
      {aviso && (
        <p
          role={aviso.tipo === "error" ? "alert" : "status"}
          className={cn(
            "mt-4 flex gap-2 rounded-2xl p-3 text-sm font-semibold",
            aviso.tipo === "error" ? "bg-destructive/10 text-destructive" : "bg-verde/15",
          )}
        >
          {aviso.tipo === "ok" && <FileText className="h-4 w-4 shrink-0" aria-hidden />}
          {aviso.texto}
        </p>
      )}
    </section>
  );
}
