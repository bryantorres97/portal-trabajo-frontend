import type { Metadata } from "next";
import { Info } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { institucion } from "@/content/site";

export const metadata: Metadata = {
  title: "Privacidad y protección de datos",
  description:
    "Aviso de privacidad de Acolita.App: qué datos tratamos, con qué finalidad y cómo ejercer tus derechos conforme a la LOPDP.",
};

/**
 * Texto PROVISIONAL. Debe ser validado por el área jurídica del GAD (P-15,
 * docs/analysis/05-seguridad-auditoria.md §24). Se retiraron del prototipo
 * plazos y datos no confirmados (conservación del chat, antecedentes penales,
 * ubicación en jornada segura).
 */
const bloques = [
  {
    titulo: "Responsable del tratamiento",
    detalle: `${institucion.gad}, a través de la ${institucion.direccion}.`,
  },
  {
    titulo: "Datos que se tratan",
    detalle:
      "Datos de identificación y contacto, información sobre oficios, servicios y experiencia, documentación presentada para la habilitación, conversaciones y acuerdos realizados en la plataforma, calificaciones y denuncias.",
  },
  {
    titulo: "Finalidad",
    detalle:
      "Registrar y habilitar a trabajadores de oficio, facilitar el contacto y los acuerdos entre ciudadanos y trabajadores, atender denuncias y generar estadísticas institucionales.",
  },
  {
    titulo: "Base legal",
    detalle:
      "Consentimiento informado del titular y ejercicio de competencias municipales, conforme a la Ley Orgánica de Protección de Datos Personales.",
  },
  {
    titulo: "Seguridad",
    detalle:
      "Cifrado en tránsito y en reposo, control de acceso por roles y registro de auditoría de las consultas a información sensible. El personal del GAD solo accede a conversaciones cuando existe una denuncia relacionada.",
  },
  {
    titulo: "Conservación",
    detalle: "Los datos se conservan mientras el perfil esté activo y durante los plazos legales aplicables.",
  },
];

export default function PrivacidadPage() {
  return (
    <>
      <PageHeader
        titulo="Privacidad y protección de datos"
        descripcion="Acolita.App trata tus datos personales conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador."
      />

      <Section>
        <p className="mb-4 flex gap-3 rounded-2xl border border-azul/40 bg-azul/5 p-4 text-sm leading-relaxed">
          <Info className="h-5 w-5 shrink-0 text-azul" aria-hidden />
          <span>Versión preliminar del aviso de privacidad, sujeta a validación jurídica institucional.</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {bloques.map((b) => (
            <article key={b.titulo} className="tarjeta p-4">
              <h2 className="text-base font-bold">{b.titulo}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{b.detalle}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section titulo="Tus derechos como titular">
        <div className="tarjeta p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Puedes solicitar el acceso, rectificación, eliminación, oposición, portabilidad y suspensión del tratamiento
            de tus datos personales.
          </p>
          <p className="mt-4 text-sm font-semibold">Delegado de Protección de Datos</p>
          <a
            href={`mailto:${institucion.correoDpd}?subject=${encodeURIComponent("Solicitud de derechos — Acolita.App")}`}
            className="mt-3 flex min-h-13 items-center justify-center rounded-2xl bg-primary px-5 text-center text-base font-bold text-primary-foreground sm:max-w-sm"
          >
            Enviar solicitud
          </a>
          <p className="mt-3 text-sm text-muted-foreground">{institucion.correoDpd}</p>
        </div>
      </Section>
    </>
  );
}
