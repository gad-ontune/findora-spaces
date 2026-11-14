"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ClipboardList,
  Handshake,
  LayoutDashboard,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/feedback";
import { api } from "@/lib/api";
import type { PartnerProfile } from "@/lib/types";
import { cn, initials, titleize } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition",
        active ? "bg-teal-700 text-ivory-50 shadow-sm" : "text-ink-600 hover:bg-teal-50 hover:text-teal-800",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

export function PartnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isStaff } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  const partnerQuery = useQuery({
    queryKey: ["partner-me"],
    queryFn: () => api.get<{ partner: PartnerProfile | null; message?: string }>("/partners/me"),
    enabled: Boolean(user),
  });

  if (loading || !user) {
    return (
      <div className="container-page py-10" aria-busy="true" aria-label="Loading partner workspace">
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <Skeleton className="hidden h-56 w-full lg:block" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const partner = partnerQuery.data?.partner ?? null;
  const nav: NavItem[] = [
    { href: "/partner", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/partner/assignments", label: "Assignments", icon: ClipboardList },
  ];

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:items-start lg:gap-8">
        <aside className="hidden lg:sticky lg:top-24 lg:block">
          <div className="surface p-4">
            <div className="flex items-center gap-3 border-b border-ink-900/10 pb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-300 text-sm font-bold text-teal-900">
                {initials(user.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-900">{user.name}</p>
                <p className="truncate text-xs text-ink-400">
                  {partner ? "Local partner" : "Partner applicant"}
                </p>
              </div>
            </div>

            <div className="mt-3">
              {partner ? (
                <Badge tone={partner.status === "active" ? "green" : "amber"} dot>
                  {titleize(partner.status)}
                </Badge>
              ) : (
                <Badge tone="slate">Application required</Badge>
              )}
            </div>

            <nav className="mt-4 space-y-1" aria-label="Partner navigation">
              {nav.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </nav>

            <div className="mt-5 border-t border-ink-900/10 pt-3">
              <nav className="space-y-1" aria-label="Workspace links">
                <NavLink
                  item={{ href: "/dashboard", label: "Seeker dashboard", icon: LayoutDashboard }}
                  pathname={pathname}
                />
                {isStaff ? (
                  <NavLink item={{ href: "/admin", label: "Admin console", icon: ShieldCheck }} pathname={pathname} />
                ) : null}
                <Link
                  href="/"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-600 transition hover:bg-teal-50 hover:text-teal-800"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Findora home
                </Link>
              </nav>
            </div>
          </div>

          <p className="mt-3 px-2 text-[11px] leading-5 text-ink-400">
            Field reports and assignments are part of the demo. Submit only genuine findings.
          </p>
        </aside>

        <div className="min-w-0">
          <nav
            className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto border-b border-ink-900/10 px-4 pb-2 lg:hidden"
            aria-label="Partner navigation"
          >
            {nav.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    active ? "bg-teal-700 text-ivory-50" : "bg-white text-ink-600 ring-1 ring-ink-900/10",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/dashboard"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 ring-1 ring-ink-900/10"
            >
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
              Dashboard
            </Link>
          </nav>

          {children}
        </div>
      </div>
    </div>
  );
}
