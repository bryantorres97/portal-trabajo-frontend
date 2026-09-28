import type { Metadata } from "next";
import Link from "next/link";
import { EyeOff, Flag, MessageSquareQuote } from "lucide-react";

import { AdminHeader, Insignia } from "@/components/admin/AdminHeader";
import { Estrellas } from "@/components/site/Estrellas";
import { Paginacion } from "@/components/site/Paginacion";
import { formatearFechaHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/server/auth/current-user";
import type { FiltroModeracion } from "@/server/domain/reviews/schemas";
import { listReviewsForModeration, RESENAS_MODERACION_POR_PAGINA } from "@/server/reviews/reviews";

import { AccionModeracion } from "./AccionModeracion";

export const metadata: Metadata = { title: "Reseñas · Panel GAD" };

const PESTANAS: { valor: FiltroModeracion; etiqueta: string }[] = [
  { valor: "denunciadas", etiqueta: "Denunciadas" },
  { valor: "ocultas", etiqueta: "Ocultas" },
  { valor: "todas", etiqueta: "Todas" },
];

/** Moderación de reseñas (moderation.act): ocultar o restaurar con motivo. Ve ambas direcciones (RN-20). */
export default async function ResenasPage({ searchParams }: PageProps<"/admin/resenas">) {
  const actor = await requirePagePermission("moderation.act", "/admin/resenas");
  const sp = await searchParams;
  const pagina = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;
  const { items, total, filtro } = await listReviewsForModeration(
    actor,
    typeof sp.ver === "string" ? sp.ver : undefined,
    pagina,
  );
  const paginas = Math.max(1, Math.ceil(total / RESENAS_MODERACION_POR_PAGINA));

  return (
    <>
      <AdminHeader
        titulo="Reseñas"
        descripcion="Calificaciones de contrataciones finalizadas. Oculta las que incumplen las normas: dejan de contar en el promedio. Cada acción queda en la auditoría."
      />

      <nav aria-label="Filtrar reseñas" className="inline-flex gap-1 rounded-2xl bg-secondary p-1">
        {PESTANAS.map((p) => (
          <Link
            key={p.valor}
            href={`/admin/resenas?ver=${p.valor}`}
            aria-current={filtro === p.valor ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-bold",
              filtro === p.valor ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.etiqueta}
          </Link>
        ))}
      </nav>

      <p className="mt-5 mb-3 text-sm text-muted-foreground" aria-live="polite">
        {total === 0 ? "No hay reseñas en esta lista." : `${total} reseña${total === 1 ? "" : "s"}`}
      </p>

      {items.length === 0 ? (
        <div className="grid place-items-center tarjeta px-6 py-14 text-center">
          <MessageSquareQuote className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-bold">
            {filtro === "denunciadas" ? "No hay reseñas denunciadas pendientes" : "Sin reseñas"}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((r) => (
            <li key={r.id} className={cn("tarjeta p-5", r.status === "OCULTA" && "opacity-90")}>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Estrellas valor={r.rating} />
                    <Insignia
                      className={
                        r.direction === "CLIENTE_A_TRABAJADOR"
                          ? "bg-azul/12 [--punto:var(--azul)]"
                          : "bg-magenta/12 [--punto:var(--magenta)]"
                      }
                    >
                      {r.direction === "CLIENTE_A_TRABAJADOR"
                        ? "Cliente → trabajador (pública)"
                        : "Trabajador → cliente (restringida)"}
                    </Insignia>
                    {r.status === "OCULTA" && (
                      <Insignia className="bg-muted text-muted-foreground">
                        <EyeOff className="h-3 w-3" aria-hidden /> Oculta
                      </Insignia>
                    )}
                  </div>
                  <p className="mt-2 text-sm">
                    <strong>{r.authorName}</strong> sobre <strong>{r.subjectName}</strong>
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatearFechaHora(r.createdAt)}
                      {r.editedAt ? " · editada" : ""}
                    </span>
                  </p>
                  {r.comment ? (
                    <blockquote className="mt-3 rounded-xl bg-secondary p-3 text-sm break-words whitespace-pre-wrap">
                      {r.comment}
                    </blockquote>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground italic">Sin comentario</p>
                  )}
                  {r.openReports > 0 && (
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-destructive">
                      <Flag className="h-4 w-4" aria-hidden />
                      {r.openReports} {r.openReports === 1 ? "denuncia abierta" : "denuncias abiertas"}:{" "}
                      {r.reportReasons.join(", ")}
                    </p>
                  )}
                  {r.status === "OCULTA" && r.hiddenReason && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Oculta el {formatearFechaHora(r.hiddenAt)}. Motivo: {r.hiddenReason}
                    </p>
                  )}
                </div>
                <AccionModeracion reviewId={r.id} oculta={r.status === "OCULTA"} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Paginacion
        actual={pagina}
        total={paginas}
        enlace={(p) => `/admin/resenas?${new URLSearchParams({ ver: filtro, page: String(p) })}`}
      />
    </>
  );
}
