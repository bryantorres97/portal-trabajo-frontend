import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Panel del GAD: sin el encabezado ni el pie del portal ciudadano. Cada sección define su propio marco. */
export default function PanelLayout({ children }: LayoutProps<"/">) {
  return children;
}
