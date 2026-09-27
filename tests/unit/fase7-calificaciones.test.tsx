// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { modulosVisibles } from "@/components/admin/navegacion";
import { SeccionCalificacion } from "@/components/reviews/SeccionCalificacion";
import { SelectorEstrellas } from "@/components/reviews/SelectorEstrellas";
import { countWords, hideReviewSchema, MAX_PALABRAS, reviewSchema } from "@/server/domain/reviews/schemas";
import type { ContractReviews } from "@/server/reviews/reviews";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

afterEach(cleanup);

const palabras = (n: number) => Array.from({ length: n }, () => "palabra").join(" ");

describe("RN-07: 200 palabras (misma regla que private.word_count)", () => {
  it("cuenta palabras separadas por cualquier espacio", () => {
    expect(countWords("  uno   dos\ntres\t cuatro ")).toBe(4);
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords(null)).toBe(0);
  });

  it("acepta 200 palabras y rechaza 201", () => {
    expect(reviewSchema.safeParse({ rating: 4, comment: palabras(MAX_PALABRAS) }).success).toBe(true);
    const r = reviewSchema.safeParse({ rating: 4, comment: palabras(MAX_PALABRAS + 1) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/200 palabras/);
  });

  it("la calificación va de 1 a 5 y el comentario vacío se omite", () => {
    expect(reviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 3.5 }).success).toBe(false);
    expect(reviewSchema.parse({ rating: "5", comment: "   " })).toEqual({ rating: 5, comment: undefined });
  });

  it("ocultar o restaurar exige un motivo", () => {
    const base = { reviewId: "00000000-0000-4000-8000-000000000001", hidden: "true" };
    expect(hideReviewSchema.safeParse({ ...base, reason: "corto" }).success).toBe(false);
    expect(hideReviewSchema.parse({ ...base, reason: "Contiene datos personales" }).hidden).toBe(true);
  });
});

describe("selector de estrellas", () => {
  it("usa radios accesibles y avisa el valor elegido", () => {
    const onChange = vi.fn();
    render(<SelectorEstrellas valor={0} onChange={onChange} />);
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    fireEvent.click(screen.getByLabelText("4 estrellas: Bueno"));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});

const sinCalificar: ContractReviews = {
  canCreate: true,
  windowEndsAt: "2026-10-26T12:00:00Z",
  mine: null,
  theirs: null,
};

describe("sección de calificación en la contratación", () => {
  it("el trabajador sabe que el cliente no verá su calificación (RN-20)", () => {
    render(<SeccionCalificacion contractId="c1" miRol="TRABAJADOR" otra="Carla M." r={sinCalificar} />);
    expect(screen.getByText(/Carla M\. no la verá/)).toBeTruthy();
  });

  it("el cliente sabe que se publicará en el perfil", () => {
    render(<SeccionCalificacion contractId="c1" miRol="CLIENTE" otra="Walter P." r={sinCalificar} />);
    expect(screen.getByText(/Se publicará en el perfil de Walter P\./)).toBeTruthy();
  });

  it("el contador avisa al pasar de 200 palabras y bloquea el envío", () => {
    render(<SeccionCalificacion contractId="c1" miRol="CLIENTE" otra="Walter P." r={sinCalificar} />);
    fireEvent.change(screen.getByLabelText(/Comentario/), { target: { value: palabras(201) } });
    expect(screen.getByText("201 de 200 palabras")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Enviar calificación" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("muestra la calificación propia sin edición cuando venció el plazo", () => {
    render(
      <SeccionCalificacion
        contractId="c1"
        miRol="CLIENTE"
        otra="Walter P."
        r={{
          canCreate: false,
          windowEndsAt: null,
          theirs: null,
          mine: {
            id: "r1",
            direction: "CLIENTE_A_TRABAJADOR",
            rating: 5,
            comment: "Excelente trabajo",
            status: "PUBLICADA",
            isMine: true,
            createdAt: "2026-09-01T12:00:00Z",
            editedAt: null,
            editableUntil: "2026-09-08T12:00:00Z",
            canEdit: false,
          },
        }}
      />,
    );
    expect(screen.getByText("Excelente trabajo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
    expect(screen.getByText(/pasaron 7 días/)).toBeTruthy();
  });
});

describe("arquitectura y panel", () => {
  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }
  const src = path.resolve(import.meta.dirname, "../../src");

  it("solo el módulo de reseñas consulta la tabla y sus funciones", () => {
    const lectores = archivos(src).filter((f) =>
      /fn_(review_save|contract_reviews|public_worker_reviews|client_reputation|report_review|admin_list_reviews|admin_set_review_hidden)|from\("reviews"\)/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(lectores.map((f) => path.relative(src, f).replaceAll("\\", "/"))).toEqual(["server/reviews/reviews.ts"]);
  });

  it("RN-20: las páginas públicas nunca piden la reputación de un cliente", () => {
    const publicas = archivos(path.join(src, "app", "(public)"));
    for (const f of publicas) expect(readFileSync(f, "utf8")).not.toMatch(/getClientReputation/);
  });

  it("el módulo «Reseñas» del panel aparece con moderation.act", () => {
    expect(modulosVisibles(["admin.access", "moderation.act"]).map((m) => m.titulo)).toContain("Reseñas");
    expect(modulosVisibles(["admin.access"]).map((m) => m.titulo)).not.toContain("Reseñas");
  });
});
