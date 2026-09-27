import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireConsentedPageAuth } from "@/server/auth/current-user";
import { getOwnWorker } from "@/server/workers/public-profile";

import { PanelTrabajador, VincularCuenta } from "./PanelTrabajador";

export const metadata: Metadata = { title: "Soy trabajador" };

export default async function TrabajadorCuentaPage() {
  const auth = await requireConsentedPageAuth("/cuenta/trabajador");
  if (auth.source === "ENTRA") redirect("/admin");
  const w = await getOwnWorker(auth.user.id);

  return w ? (
    <PanelTrabajador w={w} fotoUrl={w.photo.hasApproved ? "/cuenta/trabajador/foto" : null} />
  ) : (
    <VincularCuenta />
  );
}
