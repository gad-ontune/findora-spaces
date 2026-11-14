import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/shell";

export const metadata: Metadata = {
  title: "Admin console",
  description: "Moderation, verification, assisted search and platform operations.",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
