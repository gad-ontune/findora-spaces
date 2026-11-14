"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  Flag,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  MessageSquareWarning,
  ScrollText,
  SearchCheck,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { api } from "@/lib/api";
import type { AdminDashboard } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  permissions?: string[];
  count?: number;
};

type NavGroup = { label: string; items: NavItem[] };

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-teal-700 text-ivory-50 shadow-sm"
          : "text-ink-600 hover:bg-teal-50 hover:text-teal-800",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none",
            active ? "bg-white/20 text-ivory-50" : "bg-sand-200 text-ink-700",
          )}
        >
          {item.count > 99 ? "99+" : item.count}
        </span>
      ) : null}
    </Link>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isStaff, hasPermission } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  const dashboardQuery = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api.get<AdminDashboard>("/admin/dashboard"),
    enabled: Boolean(user && isStaff),
    staleTime: 60_000,
  });

  if (loading || !user) {
    return (
      <div className="container-page py-8" aria-busy="true" aria-label="Loading admin console">
        <div className="grid gap-6 lg:grid-cols-[248px_1fr]">
          <Skeleton className="hidden h-[520px] w-full lg:block" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="container-page py-16">
        <div className="surface mx-auto max-w-lg p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-terracotta-100 text-terracotta-700">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-xl font-bold text-ink-900">Staff access required</h1>
          <p className="mt-2 text-sm leading-6 text-ink-500">
            This area is restricted to authorised Findora staff. Your account is signed in, but it does not have a staff
            role.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <LinkButton href="/dashboard">Go to dashboard</LinkButton>
            <LinkButton href="/" variant="outline">
              Findora home
            </LinkButton>
          </div>
        </div>
      </div>
    );
  }

  const dashboard = dashboardQuery.data;
  const groups: NavGroup[] = [
    {
      label: "Overview",
      items: [{ href: "/admin", label: "Admin dashboard", icon: LayoutDashboard, exact: true }],
    },
    {
      label: "Property operations",
      items: [
        {
          href: "/admin/moderation",
          label: "Moderation queue",
          icon: ShieldAlert,
          permissions: ["property:moderate"],
          count: dashboard?.properties.pending_moderation,
        },
        {
          href: "/admin/verification",
          label: "Verification",
          icon: BadgeCheck,
          permissions: ["verification:review"],
          count: dashboard?.properties.pending_verification_properties,
        },
        {
          href: "/admin/properties",
          label: "All properties",
          icon: Building2,
          permissions: ["property:moderate", "verification:review"],
        },
        {
          href: "/admin/viewings",
          label: "Viewings",
          icon: CalendarDays,
          permissions: ["support:view", "viewing:manage"],
          count: dashboard?.viewings.upcoming,
        },
      ],
    },
    {
      label: "Assisted search",
      items: [
        {
          href: "/admin/requests",
          label: "Search requests",
          icon: SearchCheck,
          permissions: ["assisted:manage"],
          count: dashboard?.assisted.open_requests,
        },
        {
          href: "/admin/field-reports",
          label: "Field reports",
          icon: ClipboardCheck,
          permissions: ["assisted:manage"],
          count: dashboard?.assisted.field_reports_to_review,
        },
        {
          href: "/admin/partners",
          label: "Local partners",
          icon: Handshake,
          permissions: ["partner:manage"],
        },
      ],
    },
    {
      label: "Trust and safety",
      items: [
        {
          href: "/admin/reports",
          label: "Property reports",
          icon: Flag,
          permissions: ["complaint:manage"],
          count: dashboard?.reports.open,
        },
        {
          href: "/admin/complaints",
          label: "Complaints",
          icon: MessageSquareWarning,
          permissions: ["complaint:manage"],
          count: dashboard?.reports.complaints_open,
        },
        {
          href: "/admin/support-tickets",
          label: "Support tickets",
          icon: LifeBuoy,
          permissions: ["complaint:manage"],
          count: dashboard?.reports.support_tickets_open,
        },
      ],
    },
    {
      label: "Finance",
      items: [
        {
          href: "/admin/finance",
          label: "Payments and refunds",
          icon: Wallet,
          permissions: ["payment:view", "payment:refund"],
        },
      ],
    },
    {
      label: "Administration",
      items: [
        {
          href: "/admin/users",
          label: "Users",
          icon: Users,
          permissions: ["user:manage"],
        },
        {
          href: "/admin/analytics",
          label: "Analytics",
          icon: ChartNoAxesCombined,
          permissions: ["analytics:view"],
        },
        {
          href: "/admin/audit-logs",
          label: "Audit logs",
          icon: ScrollText,
          permissions: ["audit:read"],
        },
        {
          href: "/admin/settings",
          label: "Settings",
          icon: Settings,
          permissions: ["settings:manage"],
        },
      ],
    },
  ];

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.permissions || item.permissions.some((permission) => hasPermission(permission)),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const flatItems = visibleGroups.flatMap((group) => group.items);

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="lg:grid lg:grid-cols-[248px_1fr] lg:items-start lg:gap-8">
        <aside className="hidden lg:sticky lg:top-24 lg:block">
          <div className="surface p-4">
            <div className="flex items-center gap-3 border-b border-ink-900/10 pb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-800 text-sm font-bold text-ivory-50">
                {initials(user.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-900">{user.name}</p>
                <p className="truncate text-xs text-ink-400">{user.roles[0]?.replace(/_/g, " ") ?? "Staff"}</p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Badge tone="teal">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                Staff console
              </Badge>
            </div>

            <nav className="mt-4 space-y-4" aria-label="Admin navigation">
              {visibleGroups.map((group) => (
                <div key={group.label}>
                  <p className="px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-400">{group.label}</p>
                  <div className="mt-1 space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink key={item.href} item={item} pathname={pathname} />
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-5 space-y-1 border-t border-ink-900/10 pt-3">
              <Link
                href="/dashboard"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-teal-50 hover:text-teal-800"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                My dashboard
              </Link>
              <Link
                href="/"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-teal-50 hover:text-teal-800"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Findora home
              </Link>
            </div>
          </div>

          <p className="mt-3 px-2 text-[12px] leading-5 text-ink-400">
            Admin actions are audited. Never invent verification results, availability or payment outcomes.
          </p>
        </aside>

        <div className="min-w-0">
          <nav
            className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto border-b border-ink-900/10 px-4 pb-2 lg:hidden"
            aria-label="Admin navigation"
          >
            {flatItems.map((item) => {
              const active = isActive(pathname, item);
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
          </nav>

          {children}
        </div>
      </div>
    </div>
  );
}
