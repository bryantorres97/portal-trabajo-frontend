"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useRealtimeChannel } from "@/components/chat/useRealtimeChannel";

/** Refresca la bandeja cuando llega un mensaje a cualquiera de las conversaciones del usuario. */
export function InboxLive({ userId }: { userId: string }) {
  const router = useRouter();
  const estado = useRealtimeChannel(`user:${userId}`, { inbox: () => router.refresh() }, () => router.refresh());

  // Sin tiempo real: se actualiza cada 15 segundos.
  useEffect(() => {
    if (estado === "en-linea" || estado === "conectando") return;
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [estado, router]);

  return null;
}
