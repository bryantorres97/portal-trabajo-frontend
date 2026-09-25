/**
 * Datos estructurados (schema.org) para SEO. El JSON se serializa escapando `<` para que
 * ningún valor (p. ej. un nombre) pueda cerrar la etiqueta <script> (prevención de XSS).
 * Es el único uso permitido de dangerouslySetInnerHTML: contenido JSON, nunca HTML.
 */
export function serializarJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  // eslint-disable-next-line react/no-danger
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializarJsonLd(data) }} />;
}
