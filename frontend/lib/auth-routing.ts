import type { User } from "@/lib/types";

const STAFF_ROLES = new Set([
  "super_admin",
  "moderator",
  "verification_officer",
  "support_officer",
  "finance_officer",
]);

export function dashboardForUser(user: User | null): string {
  if (!user) return "/dashboard";
  if (user.roles.some((role) => STAFF_ROLES.has(role))) return "/admin";
  if (user.roles.includes("finding_partner") || user.roles.includes("data_partner")) return "/partner";
  if (user.permissions.includes("property:create") || user.permissions.includes("property:update")) {
    return "/dashboard/properties";
  }
  return "/dashboard";
}

export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
