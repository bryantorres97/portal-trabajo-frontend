"use client";

import { useRouter } from "next/navigation";

import {
  FormularioCondiciones,
  type OpcionesFormulario,
  type ValoresCondiciones,
} from "@/components/contracts/FormularioCondiciones";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { TermsInput } from "@/server/domain/contracts/schemas";

type Modo =
  | { tipo: "nueva"; conversationId: string }
  | { tipo: "contrapropuesta" | "modificacion" | "editar"; contractId: string; baseVersion: number };

const TEXTOS: Record<Modo["tipo"], { titulo: string; descripcion: string; enviar: string }> = {
  nueva: {
    titulo: "Proponer condiciones",
    descripcion: "Deja por escrito lo que acordaron en el chat. La contratación existe cuando ambos aceptan.",
    enviar: "Enviar propuesta",
  },
  contrapropuesta: {
    titulo: "Proponer cambios",
    descripcion: "Ajusta lo que necesites. Se enviará como una nueva versión para que la otra parte la acepte.",
    enviar: "Enviar contrapropuesta",
  },
  editar: {
    titulo: "Corregir mi propuesta",
    descripcion: "Se enviará una nueva versión que reemplaza a la anterior.",
    enviar: "Enviar nueva versión",
  },
  modificacion: {
    titulo: "Modificar lo acordado",
    descripcion:
      "Lo acordado sigue vigente hasta que la otra parte acepte la modificación. Si la rechaza, no cambia nada.",
    enviar: "Proponer modificación",
  },
};

/** Diálogo con el formulario de condiciones: primera propuesta, contrapropuesta o modificación. */
export function ProponerCondiciones({
  modo,
  opciones,
  inicial,
  abierto,
  onAbiertoChange,
}: {
  modo: Modo;
  opciones: OpcionesFormulario;
  inicial?: ValoresCondiciones;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}) {
  const router = useRouter();
  const textos = TEXTOS[modo.tipo];

  async function enviar(terms: TermsInput): Promise<string | null> {
    const res =
      modo.tipo === "nueva"
        ? await fetch("/api/v1/contracts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId: modo.conversationId, terms }),
          })
        : await fetch(`/api/v1/contracts/${modo.contractId}/terms`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ baseVersion: modo.baseVersion, terms }),
          });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string };
      if (res.status === 409) router.refresh();
      return err.detail ?? "No pudimos enviar la propuesta. Inténtalo de nuevo.";
    }
    onAbiertoChange(false);
    if (modo.tipo === "nueva") {
      const { id } = (await res.json()) as { id: string };
      router.push(`/contrataciones/${id}`);
    } else {
      router.refresh();
    }
    return null;
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold">{textos.titulo}</DialogTitle>
          <DialogDescription>{textos.descripcion}</DialogDescription>
        </DialogHeader>
        {abierto && (
          <FormularioCondiciones
            opciones={opciones}
            inicial={inicial}
            textoEnviar={textos.enviar}
            onEnviar={enviar}
            onCancelar={() => onAbiertoChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
