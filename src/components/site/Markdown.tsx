import { Fragment, type ReactNode } from "react";

/**
 * Renderizador mínimo y SEGURO de Markdown para textos legales administrados:
 * párrafos, listas numeradas o con viñetas, y **negritas**. Nunca interpreta HTML
 * (todo se renderiza como texto con React; no se usa dangerouslySetInnerHTML).
 */
function enLinea(texto: string): ReactNode[] {
  return texto
    .split(/(\*\*[^*]+\*\*)/g)
    .map((parte, i) =>
      parte.startsWith("**") && parte.endsWith("**") ? (
        <strong key={i}>{parte.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{parte}</Fragment>
      ),
    );
}

export function Markdown({ source }: { source: string }) {
  const bloques = source.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      {bloques.map((bloque, i) => {
        const lineas = bloque
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        if (lineas.every((l) => /^\d+\.\s/.test(l))) {
          return (
            <ol key={i} className="list-decimal space-y-1.5 pl-5">
              {lineas.map((l, j) => (
                <li key={j}>{enLinea(l.replace(/^\d+\.\s/, ""))}</li>
              ))}
            </ol>
          );
        }
        if (lineas.every((l) => /^[-*]\s/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5">
              {lineas.map((l, j) => (
                <li key={j}>{enLinea(l.replace(/^[-*]\s/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{enLinea(lineas.join(" "))}</p>;
      })}
    </div>
  );
}
