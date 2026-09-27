import type { Metadata } from "next";
import { Check, GraduationCap, MapPin } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { puntosDeAcopio, requisitos } from "@/content/site";

export const metadata: Metadata = {
  title: "Regístrate como trabajador",
  description:
    "Requisitos, proceso de habilitación y puntos de atención para trabajadores de oficio del cantón Ambato.",
};

/**
 * Página informativa para trabajadores. Del prototipo se retiraron:
 * - el formulario de datos bancarios (la plataforma no procesa pagos, P-07);
 * - los niveles de "Score" (post-MVP, sin fórmula definida).
 * Ver docs/analysis/06-frontend-existente.md.
 */
export default function TrabajadoresPage() {
  return (
    <>
      <PageHeader
        titulo="Tu oficio, con respaldo municipal"
        descripcion="Regístrate gratis en Acolita.App y muestra a toda la ciudad que fuiste capacitado y habilitado por el Municipio de Ambato."
      />

      <div className="grid lg:grid-cols-2">
        <Section titulo="Qué necesitas para registrarte">
          <ul className="divide-y divide-border tarjeta">
            {requisitos.map((r) => (
              <li key={r} className="flex gap-3 p-4">
                <Check className="h-5 w-5 shrink-0 text-verde" aria-hidden />
                <span className="text-sm leading-relaxed">{r}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section titulo="Dónde registrarse en persona">
          <ul className="space-y-3">
            {puntosDeAcopio.map((punto) => (
              <li key={punto.nombre} className="flex gap-3 tarjeta p-4">
                <MapPin className="h-5 w-5 shrink-0 text-magenta" aria-hidden />
                <div className="min-w-0">
                  <h3 className="text-base font-bold">{punto.nombre}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{punto.detalle}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">
            Si no tienes celular o internet, un funcionario municipal registra tus datos por ti.
          </p>
        </Section>
      </div>

      <Section titulo="Capacitación y habilitación">
        <div className="flex gap-3 tarjeta p-5">
          <GraduationCap className="h-6 w-6 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Después del registro, completarás la capacitación establecida por el GAD. Cuando la apruebes, el personal
              municipal habilitará tu perfil y aparecerás en el portal para que los ciudadanos puedan contactarte.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Con tu cuenta podrás responder mensajes, acordar condiciones y consultar tus contrataciones.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
