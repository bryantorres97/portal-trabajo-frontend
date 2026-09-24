import { SiteShell } from "@/components/site/SiteShell";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <SiteShell>{children}</SiteShell>;
}
