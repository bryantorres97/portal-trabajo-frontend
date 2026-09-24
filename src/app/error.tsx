"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // El detalle se registra en el servidor; aquí solo se deja rastro para depuración local.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">No pudimos cargar esta página</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocurrió un problema de nuestro lado. Puedes intentarlo de nuevo o volver al inicio.
        </p>
        {error.digest && <p className="mt-2 text-xs text-muted-foreground">Código de referencia: {error.digest}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Intentar de nuevo
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-input bg-background px-4 py-2 text-sm font-bold hover:bg-accent"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
