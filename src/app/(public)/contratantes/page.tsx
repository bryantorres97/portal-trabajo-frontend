import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Flag, MessageSquare, ShieldCheck, Wallet } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";

export const metadata: Metadata = {
  title: "Contrata con seguridad",
  description:
    "Encuentra trabajadores de oficio habilitados por el GAD Municipalidad de Ambato, con acuerdos registrados y canal de denuncias.",
};

const puntos = [
  {
    icono: ShieldCheck,
    color: "text-verde",
    titulo: "Habilitación municipal",
    detalle: "Cada trabajador visible fue registrado, capacitado y habilitado por el GAD Municipalidad de Ambato.",
  },
  {
    icono: MessageSquare,
    color: "text-azul",
    titulo: "Acuerda por el chat",
    detalle: "Alcance, fecha y valor por escrito en la plataforma. Las condiciones aceptadas no pueden modificarse.",
  },
  {
    icono: Flag,
    color: "text-magenta",
    titulo: "Canal de denuncias",
    detalle: "Si algo sale mal, puedes denunciar el perfil, un mensaje o el incumplimiento; el GAD revisa cada caso.",
  },
  {
    icono: Wallet,
    color: "text-naranja",
    titulo: "Pago directo",
    detalle: "Tú pagas al trabajador el valor acordado. La plataforma no cobra comisiones ni retiene dinero.",
  },
];

export default function ContratantesPage() {
  return (
    <>
      <PageHeader
        titulo="Contrata con seguridad"
        descripcion="Acolita.App te permite encontrar trabajadores de oficio de Ambato habilitados por el Municipio, con acuerdos registrados y respaldo institucional."
      />

      <Section>
        <ul className="grid gap-3 sm:grid-cols-2">
          {puntos.map((p) => (
            <li key={p.titulo} className="flex gap-3 tarjeta p-4">
              <p.icono className={`h-6 w-6 shrink-0 ${p.color}`} aria-hidden />
              <div className="min-w-0">
                <h2 className="text-base font-bold">{p.titulo}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.detalle}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section titulo="Tus responsabilidades">
        <ul className="divide-y divide-border tarjeta">
          {[
            "Acordar con claridad el alcance del trabajo, la modalidad (jornal u obra cierta) y el valor antes de iniciar.",
            "Pagar el valor acordado directamente al trabajador al finalizar el servicio.",
            "Brindar condiciones seguras en el lugar de trabajo.",
            "Calificar el servicio recibido para fortalecer la reputación del trabajador.",
          ].map((item) => (
            <li key={item} className="p-4 text-sm leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <p className="flex gap-3 rounded-2xl border border-amarillo/50 bg-amarillo/10 p-4 text-sm leading-relaxed">
          <AlertTriangle className="h-5 w-5 shrink-0 text-naranja" aria-hidden />
          <span>
            Acolita.App es un servicio de intermediación. No existe relación de dependencia laboral entre el trabajador
            y el contratante, ni entre el trabajador y el GAD Municipalidad de Ambato.
          </span>
        </p>
      </Section>

      <Section>
        <Link
          href="/oficios"
          className="flex min-h-13 items-center justify-center rounded-2xl bg-primary px-5 text-base font-bold text-primary-foreground"
        >
          Ver oficios disponibles
        </Link>
      </Section>
    </>
  );
}
