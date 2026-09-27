"use client";

import Link from "next/link";
import { ChevronRight, MessageCircle } from "lucide-react";

import { ContadorNoLeidos, useMensajes } from "@/components/chat/MensajesProvider";

/** Acceso grande a Mensajes con el número de no leídos en vivo (Mi cuenta). */
export function AccesoMensajes() {
  const { resumen } = useMensajes();
  const noLeidos = resumen?.unreadMessages ?? 0;
  return (
    <Link
      href="/mensajes"
      className="group flex items-center gap-4 rounded-3xl bg-primary p-5 text-primary-foreground shadow-[var(--shadow-suave)] transition-transform hover:-translate-y-0.5"
    >
      <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15">
        <MessageCircle className="h-6 w-6" aria-hidden />
        <ContadorNoLeidos valor={noLeidos} className="absolute -top-1.5 -right-1.5 ring-primary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold">Mensajes</span>
        <span className="block text-sm text-primary-foreground/85">
          {noLeidos > 0 ? `${noLeidos} ${noLeidos === 1 ? "mensaje nuevo" : "mensajes nuevos"}` : "Tus conversaciones"}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 opacity-80" aria-hidden />
    </Link>
  );
}
