"use client";

import type { ReactNode } from "react";

import { useAuth } from "@/components/providers";

/** Renders visitor-only content, such as account creation prompts. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user) return null;
  return <>{children}</>;
}
