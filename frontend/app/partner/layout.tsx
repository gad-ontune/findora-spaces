import type { Metadata } from "next";

import { PartnerShell } from "@/components/partner/shell";

export const metadata: Metadata = {
  title: "Partner workspace",
  description: "Manage local property-finding and data-collection assignments.",
  robots: { index: false, follow: false },
};

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <PartnerShell>{children}</PartnerShell>;
}
