import type { Metadata, Viewport } from "next";
import { Figtree, Outfit } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { publicEnv } from "@/lib/env.public";

import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_APP_URL),
  applicationName: "Llankana",
  title: {
    default: "Llankana | Trabajo verificado en Ambato",
    template: "%s | Llankana",
  },
  description:
    "Plataforma municipal de intermediación laboral del GAD Municipalidad de Ambato: trabajadores de oficio registrados, capacitados y habilitados por el Municipio.",
  authors: [{ name: "GAD Municipalidad de Ambato" }],
  openGraph: {
    siteName: "Llankana",
    type: "website",
    locale: "es_EC",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#fbf9f4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-EC" className={`${outfit.variable} ${figtree.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
