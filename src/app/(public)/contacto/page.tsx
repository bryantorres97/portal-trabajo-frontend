import type { Metadata } from "next";
import { Clock, Mail, MapPin, Phone } from "lucide-react";

import { FormularioContacto } from "@/components/site/FormularioContacto";
import { PageHeader, Section } from "@/components/site/SiteShell";
import { institucion, puntosDeAcopio } from "@/content/site";

export const metadata: Metadata = {
  title: "Contacto",
  description: "Canales de atención de Acolita.App y del GAD Municipalidad de Ambato.",
};

export default function ContactoPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contacto"
        titulo="Estamos para acolitarte"
        descripcion={`${institucion.direccion} del ${institucion.gad}.`}
      />

      <div className="grid lg:grid-cols-2">
        <Section>
          <ul className="divide-y divide-border tarjeta">
            <li className="flex items-start gap-3 p-4">
              <Phone className="h-5 w-5 shrink-0 text-verde" aria-hidden />
              <div>
                <p className="text-sm font-bold">Teléfono</p>
                <a href={`tel:${institucion.telefono.replace(/[^\d+]/g, "")}`} className="text-sm text-primary">
                  {institucion.telefono}
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3 p-4">
              <Mail className="h-5 w-5 shrink-0 text-azul" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-bold">Correo</p>
                <a href={`mailto:${institucion.correo}`} className="text-sm break-all text-primary">
                  {institucion.correo}
                </a>
              </div>
            </li>
            <li className="flex items-start gap-3 p-4">
              <MapPin className="h-5 w-5 shrink-0 text-magenta" aria-hidden />
              <div>
                <p className="text-sm font-bold">Sede</p>
                <p className="text-sm text-muted-foreground">{institucion.sede}</p>
              </div>
            </li>
            <li className="flex items-start gap-3 p-4">
              <Clock className="h-5 w-5 shrink-0 text-naranja" aria-hidden />
              <div>
                <p className="text-sm font-bold">Horario de atención</p>
                <p className="text-sm text-muted-foreground">{institucion.horario}</p>
              </div>
            </li>
          </ul>
        </Section>

        <Section titulo="Escríbenos">
          <FormularioContacto />
        </Section>
      </div>

      <Section titulo="Puntos de atención presencial">
        <ul className="grid gap-3 sm:grid-cols-2">
          {puntosDeAcopio.map((punto) => (
            <li key={punto.nombre} className="tarjeta p-4">
              <h3 className="text-base font-bold">{punto.nombre}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{punto.detalle}</p>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
