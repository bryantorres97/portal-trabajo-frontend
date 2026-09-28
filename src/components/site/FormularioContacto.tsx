"use client";

import { useState } from "react";

import { institucion } from "@/content/site";

const motivos = [
  "Quiero registrarme como trabajador",
  "Necesito contratar un servicio",
  "Consulta sobre mi perfil",
  "Reportar un problema",
  "Protección de datos personales",
];

const campo =
  "mt-1 w-full rounded-xl border border-input bg-card px-4 py-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/30";

/**
 * Abre WhatsApp o el correo con el mensaje ya escrito; no almacena nada.
 * [PENDIENTE] Evaluar un formulario con persistencia y protección anti-spam (post-MVP).
 */
export function FormularioContacto() {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [motivo, setMotivo] = useState(motivos[0]);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cuerpo = () => `Nombre: ${nombre}\nTeléfono: ${telefono}\nMotivo: ${motivo}\n\n${mensaje}`;

  const validar = () => {
    if (nombre.trim().length < 3) return "Escribe tu nombre completo.";
    if (telefono.replace(/\D/g, "").length < 9) return "Escribe un número de teléfono válido.";
    if (mensaje.trim().length < 10) return "Cuéntanos brevemente tu solicitud.";
    return null;
  };

  const enviar = (canal: "whatsapp" | "correo") => {
    const problema = validar();
    setError(problema);
    if (problema) return;
    const url =
      canal === "whatsapp"
        ? `https://wa.me/${institucion.whatsapp}?text=${encodeURIComponent(cuerpo())}`
        : `mailto:${institucion.correo}?subject=${encodeURIComponent(`Acolita.App — ${motivo}`)}&body=${encodeURIComponent(cuerpo())}`;
    window.open(url, canal === "whatsapp" ? "_blank" : "_self", "noopener");
  };

  return (
    <form
      className="space-y-4 tarjeta p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        enviar("whatsapp");
      }}
    >
      <div>
        <label htmlFor="nombre" className="text-sm font-bold">
          Nombre completo
        </label>
        <input
          id="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={campo}
          autoComplete="name"
          required
        />
      </div>
      <div>
        <label htmlFor="telefono" className="text-sm font-bold">
          Teléfono celular
        </label>
        <input
          id="telefono"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          className={campo}
          inputMode="tel"
          autoComplete="tel"
          placeholder="09XXXXXXXX"
          required
        />
      </div>
      <div>
        <label htmlFor="motivo" className="text-sm font-bold">
          Motivo
        </label>
        <select id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo}>
          {motivos.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="mensaje" className="text-sm font-bold">
          Mensaje
        </label>
        <textarea
          id="mensaje"
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          rows={4}
          className={campo}
          required
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="submit"
          className="flex min-h-13 w-full items-center justify-center rounded-2xl bg-primary px-5 text-base font-bold text-primary-foreground"
        >
          Enviar por WhatsApp
        </button>
        <button
          type="button"
          onClick={() => enviar("correo")}
          className="flex min-h-13 w-full items-center justify-center rounded-2xl border border-border bg-card px-5 text-base font-bold text-foreground"
        >
          Enviar por correo
        </button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Al enviar, se abre WhatsApp o tu correo con el mensaje ya escrito. Este formulario no almacena información en el
        sitio web.
      </p>
    </form>
  );
}
