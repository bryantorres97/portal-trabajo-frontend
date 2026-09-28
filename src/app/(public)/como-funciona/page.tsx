import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { cn } from "@/lib/utils";
import { garantias } from "@/content/site";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "Conoce el proceso de registro, capacitación y habilitación de trabajadores de oficio y cómo contratar con respaldo municipal en Ambato.",
};

const flujoTrabajador = [
  {
    titulo: "Registro presencial",
    detalle: "En un punto de atención municipal, con acompañamiento de un funcionario del GAD.",
  },
  {
    titulo: "Revisión de documentos",
    detalle: "El personal autorizado del GAD revisa los datos y la documentación presentada.",
  },
  {
    titulo: "Capacitación",
    detalle: "El trabajador completa la capacitación establecida por la institución.",
  },
  {
    titulo: "Habilitación",
    detalle: "Con la capacitación aprobada, el GAD habilita al trabajador y su perfil aparece en el portal.",
  },
];

const flujoContratante = [
  {
    titulo: "Busca el oficio",
    detalle: "Elige el servicio que necesitas y revisa perfiles de trabajadores habilitados, con sus calificaciones.",
  },
  {
    titulo: "Conversa por el chat",
    detalle: "Escribe al trabajador desde la plataforma. La conversación queda registrada con fecha y hora.",
  },
  {
    titulo: "Acuerda las condiciones",
    detalle:
      "Descripción, fecha, lugar y valor. La contratación existe cuando ambas partes aceptan la misma propuesta.",
  },
  {
    titulo: "Califica el servicio",
    detalle: "Al terminar, califica el trabajo recibido. Solo quien contrató puede calificar.",
  },
];

function Lista({ items, color }: { items: { titulo: string; detalle: string }[]; color: string }) {
  return (
    <ol className="relative space-y-7 before:absolute before:top-2 before:bottom-2 before:left-5 before:w-0.5 before:bg-border">
      {items.map((item, i) => (
        <li key={item.titulo} className="relative flex gap-4">
          <span
            className={cn(
              "relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full font-display font-extrabold text-white ring-4 ring-background",
              color,
            )}
            aria-hidden
          >
            {i + 1}
          </span>
          <div className="pt-1.5">
            <h3 className="text-lg font-bold">{item.titulo}</h3>
            <p className="mt-1 leading-relaxed text-muted-foreground">{item.detalle}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function ComoFuncionaPage() {
  return (
    <>
      <PageHeader
        titulo="Cómo funciona Llankana"
        descripcion="Un proceso municipal en dos caminos: la habilitación del trabajador de oficio y la contratación del servicio con respaldo."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section titulo="Para el trabajador de oficio" className="lg:pr-10">
          <Lista items={flujoTrabajador} color="bg-verde" />
        </Section>
        <Section titulo="Para quien contrata">
          <Lista items={flujoContratante} color="bg-primary" />
        </Section>
      </div>

      <Section titulo="Qué respalda cada servicio" className="mt-6">
        <ul className="grid gap-x-10 gap-y-6 rounded-3xl superficie p-6 sm:grid-cols-2 sm:p-8">
          {garantias.map((g) => (
            <li key={g.titulo} className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-verde-fuerte shadow-[var(--shadow-suave)]">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold">{g.titulo}</h3>
                <p className="mt-1 text-muted-foreground">{g.detalle}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
