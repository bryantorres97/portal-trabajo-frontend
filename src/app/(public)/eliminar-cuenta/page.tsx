import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Mail, Smartphone, Trash2 } from "lucide-react";

import { PageHeader, Section } from "@/components/site/SiteShell";
import { boton } from "@/components/ui/boton";
import { institucion } from "@/content/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Eliminar tu cuenta",
  description: "Cómo eliminar tu cuenta de Llankana y qué pasa con tus datos.",
};

/**
 * Página pública de eliminación de cuenta (ADR-018). Google Play exige una URL donde pedir la
 * eliminación sin tener la app instalada; también confirma la eliminación hecha desde el web.
 */
export default async function EliminarCuentaPublicaPage({ searchParams }: PageProps<"/eliminar-cuenta">) {
  const { hecho } = await searchParams;

  if (hecho === "1") {
    return (
      <Section className="mx-auto max-w-2xl py-16 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-verde-fuerte" aria-hidden />
        <h1 className="mt-5 text-3xl font-extrabold">Tu cuenta fue eliminada</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Borramos tus datos personales de Llankana y cerramos tus sesiones. Gracias por haber usado la plataforma.
        </p>
        <Link href="/" className={cn(boton({ tamano: "lg" }), "mt-8")}>
          Ir al inicio
        </Link>
      </Section>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Eliminar tu cuenta"
        descripcion="Puedes eliminar tu cuenta de Llankana cuando quieras. Es inmediato y no se puede deshacer."
      />

      <div className="grid lg:grid-cols-2">
        <Section titulo="Cómo hacerlo">
          <ol className="space-y-4">
            <li className="flex gap-3 tarjeta p-4">
              <Trash2 className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
              <div>
                <p className="font-bold">En la web</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ingresa con tu cuenta y confirma la eliminación. Te mostraremos antes qué se borra.
                </p>
                <Link href="/cuenta/eliminar" className={cn(boton({ variante: "peligro", tamano: "sm" }), "mt-3")}>
                  Ingresar y eliminar mi cuenta
                </Link>
              </div>
            </li>
            <li className="flex gap-3 tarjeta p-4">
              <Smartphone className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="font-bold">En la app Llankana</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Abre Cuenta y toca «Eliminar mi cuenta», al final de la pantalla.
                </p>
              </div>
            </li>
            <li className="flex gap-3 tarjeta p-4">
              <Mail className="h-5 w-5 shrink-0 text-azul" aria-hidden />
              <div className="min-w-0">
                <p className="font-bold">Si no puedes ingresar</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Escribe desde el correo de tu cuenta a{" "}
                  <a href={`mailto:${institucion.correoDpd}`} className="break-all text-primary">
                    {institucion.correoDpd}
                  </a>{" "}
                  pidiendo la eliminación de tu cuenta de Llankana.
                </p>
              </div>
            </li>
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            Si tienes contrataciones en marcha, primero termínalas o cancélalas: así protegemos a la otra parte.
          </p>
        </Section>

        <Section titulo="Qué pasa con tus datos">
          <h3 className="font-bold">Se borran de inmediato</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Tu nombre, correo, teléfono y formas de ingreso a Llankana.</li>
            <li>Tus notificaciones y los dispositivos que reciben avisos.</li>
            <li>
              Si eres trabajador: tu perfil sale del buscador y se borran tu foto, descripción, oficios y documentos.
            </li>
          </ul>
          <h3 className="mt-5 font-bold">Se conservan sin tus datos personales</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              Los mensajes y reseñas que escribiste, firmados como «Cuenta eliminada», porque forman parte de la
              conversación de otra persona.
            </li>
            <li>El registro de contrataciones, denuncias y auditoría que exige la ley, identificado con un código.</li>
          </ul>
          <p className="mt-5 text-sm text-muted-foreground">
            Tu cuenta ciudadana del GAD Municipalidad de Ambato no se elimina, porque la usan otros servicios
            municipales. Más detalles en la{" "}
            <Link href="/privacidad" className="text-primary underline underline-offset-4">
              política de privacidad
            </Link>
            .
          </p>
        </Section>
      </div>
    </>
  );
}
