import type { Metadata } from "next";

import { SiteShell } from "@/components/site/SiteShell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PrivadoLayout({ children }: LayoutProps<"/">) {
  return <SiteShell>{children}</SiteShell>;
}
