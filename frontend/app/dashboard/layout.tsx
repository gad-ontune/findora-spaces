import type { Metadata } from "next";

import { DashboardShell } from "@/components/dashboard/shell";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Manage your saved spaces, viewings, assisted searches and property listings.",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
