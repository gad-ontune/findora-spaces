"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Bookmark,
  Building2,
  CalendarDays,
  CreditCard,
  FolderHeart,
  GitCompareArrows,
  Handshake,
  Heart,
  Inbox,
  LayoutDashboard,
  SearchCheck,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/components/providers";
import { Skeleton } from "@/components/ui/feedback";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/types";
import { cn, initials, titleize } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

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
        "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition",
        active
          ? "bg-teal-700 text-ivory-50 shadow-sm"
          : "text-ink-600 hover:bg-teal-50 hover:text-teal-800",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isStaff, hasPermission } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  const { data: notifications } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ notifications: Notification[]; unread_count: number }>("/notifications", { limit: 1 }),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  if (loading || !user) {
    return (
      <div className="container-page py-10" aria-busy="true" aria-label="Loading your dashboard">
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <div className="hidden space-y-2 lg:block">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const seekerNav: NavItem[] = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/dashboard/favourites", label: "Saved spaces", icon: Heart },
    { href: "/dashboard/comparisons", label: "Comparisons", icon: GitCompareArrows },
    { href: "/dashboard/shortlists", label: "Shared shortlists", icon: FolderHeart },
    { href: "/dashboard/saved-searches", label: "Saved searches", icon: Bookmark },
    { href: "/dashboard/requests", label: "Assisted searches", icon: SearchCheck },
    { href: "/dashboard/viewings", label: "Viewings", icon: CalendarDays },
    { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
    { href: "/dashboard/payments", label: "Payments", icon: CreditCard },
    { href: "/dashboard/profile", label: "Profile and security", icon: UserRound },
  ];

  const hostNav: NavItem[] =
    hasPermission("property:create") || hasPermission("property:update")
      ? [
          { href: "/dashboard/properties", label: "My listings", icon: Building2 },
          ...(hasPermission("enquiry:manage")
            ? [{ href: "/dashboard/enquiries", label: "Enquiries", icon: Inbox } as NavItem]
            : []),
        ]
      : [];

  const isPartner = hasPermission("partner:assignment");
  const unread = notifications?.unread_count ?? 0;

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:items-start lg:gap-8">
        <aside className="hidden lg:sticky lg:top-24 lg:block">
          <div className="surface p-4">
            <div className="flex items-center gap-3 border-b border-ink-900/10 pb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-sm font-bold text-ivory-50">
                {initials(user.name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-900">{user.name}</p>
                <p className="truncate text-xs text-ink-400">
                  {user.roles.length ? user.roles.map((role) => titleize(role)).join(", ") : "Member"}
                </p>
              </div>
            </div>

            <nav className="mt-3 space-y-1" aria-label="Dashboard navigation">
              {seekerNav.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </nav>

            {hostNav.length ? (
              <div className="mt-5">
                <p className="px-3 pb-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-400">
                  Property tools
                </p>
                <nav className="space-y-1" aria-label="Landlord navigation">
                  {hostNav.map((item) => (
                    <NavLink key={item.href} item={item} pathname={pathname} />
                  ))}
                </nav>
              </div>
            ) : null}

            {isPartner || isStaff ? (
              <div className="mt-5">
                <p className="px-3 pb-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-400">
                  Workspaces
                </p>
                <nav className="space-y-1" aria-label="Workspace navigation">
                  {isPartner ? (
                    <NavLink
                      item={{ href: "/partner", label: "Partner workspace", icon: Handshake }}
                      pathname={pathname}
                    />
                  ) : null}
                  {isStaff ? (
                    <NavLink
                      item={{ href: "/admin", label: "Admin console", icon: ShieldCheck }}
                      pathname={pathname}
                    />
                  ) : null}
                </nav>
              </div>
            ) : null}

            {unread > 0 ? (
              <p className="mt-5 rounded-xl bg-sand-100 px-3 py-2.5 text-xs leading-5 text-ink-600">
                You have <strong className="font-semibold">{unread}</strong> unread notification
                {unread === 1 ? "" : "s"}.{" "}
                <Link href="/dashboard/notifications" className="font-semibold text-teal-700 hover:underline">
                  Review
                </Link>
              </p>
            ) : null}
          </div>

          <p className="mt-3 px-2 text-[12px] leading-5 text-ink-400">
            Demo environment. All listings, payments and verification records are fictional.
          </p>
        </aside>

        <div className="min-w-0">
          <nav
            className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto border-b border-ink-900/10 px-4 pb-2 lg:hidden"
            aria-label="Dashboard navigation"
          >
            {[...seekerNav, ...hostNav].map((item) => {
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
            {isPartner ? (
              <Link
                href="/partner"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 ring-1 ring-ink-900/10"
              >
                <Handshake className="h-3.5 w-3.5" aria-hidden="true" />
                Partner
              </Link>
            ) : null}
            {isStaff ? (
              <Link
                href="/admin"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 ring-1 ring-ink-900/10"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Admin
              </Link>
            ) : null}
          </nav>

          {children}
        </div>
      </div>
    </div>
  );
}
