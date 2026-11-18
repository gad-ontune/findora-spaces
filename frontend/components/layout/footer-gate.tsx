"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useAuth } from "@/components/providers";

const WORKSPACE_PREFIXES = ["/dashboard", "/admin", "/partner"];

/**
 * The public marketing footer is for visitors. Signed-in accounts work inside
 * the app, so the footer is removed everywhere once a session is present. It is
 * also always hidden inside dashboard, admin and partner workspaces, even while
 * the session is still being restored after a full page load.
 */
export function FooterGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const inWorkspace = WORKSPACE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (user || inWorkspace) return null;
  return <>{children}</>;
}
