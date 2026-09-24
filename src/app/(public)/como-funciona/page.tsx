import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { garantias } from "@/content/site";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "Conoce el proceso de registro, capacitación y habilitación de trabajadores de oficio y cómo contratar con respaldo municipal en Ambato.",
};

const flujoTrabajador = [
  {
    titulo: "1. Registro presencial",
    detalle: "En un punto de atención municipal, con acompañamiento de un funcionario del GAD.",
  },
  {
    titulo: "2. Revisión de documentos",
    detalle: "El personal autorizado del GAD revisa los datos y la documentación presentada.",
  },
  {
    titulo: "3. Capacitación",
    detalle: "El trabajador completa la capacitación establecida por la institución.",
  },
  {
    titulo: "4. Habilitación",
    detalle: "Con la capacitación aprobada, el GAD habilita al trabajador y su perfil aparece en el portal.",
  },
];

const flujoContratante = [
  {
    titulo: "1. Busca el oficio",
    detalle: "Elige el servicio que necesitas y revisa perfiles de trabajadores habilitados, con sus calificaciones.",
  },
  {
    titulo: "2. Conversa por el chat",
    detalle: "Escribe al trabajador desde la plataforma. La conversación queda registrada con fecha y hora.",
  },
  {
    titulo: "3. Acuerda las condiciones",
    detalle:
      "Descripción, fecha, lugar y valor. La contratación existe cuando ambas partes aceptan la misma propuesta.",
  },
  {
    titulo: "4. Califica el servicio",
    detalle: "Al terminar, califica el trabajo recibido. Solo quien contrató puede calificar.",
  },
];

function Lista({ items }: { items: { titulo: string; detalle: string }[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item) => (
        <li key={item.titulo} className="tarjeta p-4">
          <h3 className="text-base font-bold">{item.titulo}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.detalle}</p>
        </li>
      ))}
    </ol>
  );
}

export default function ComoFuncionaPage() {
  return (
    <>
      <PageHeader
        eyebrow="Proceso"
        titulo="Cómo funciona Acolita.App"
        descripcion="Un proceso municipal en dos caminos: la habilitación del trabajador de oficio y la contratación del servicio con respaldo."
      />

      <div className="grid lg:grid-cols-2">
        <Section titulo="Para el trabajador de oficio">
          <Lista items={flujoTrabajador} />
        </Section>
        <Section titulo="Para quien contrata">
          <Lista items={flujoContratante} />
        </Section>
      </div>

      <Section titulo="Qué respalda cada servicio">
        <ul className="grid gap-3 sm:grid-cols-2">
          {garantias.map((g) => (
            <li key={g.titulo} className="flex gap-3 tarjeta p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-verde" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-base font-bold">{g.titulo}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{g.detalle}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
