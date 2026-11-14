"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  Flag,
  Handshake,
  MessageSquareWarning,
  SearchCheck,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";

import { useAuth } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { PageHeader, StatCard } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { AdminDashboard } from "@/lib/types";
import { formatDateTime, formatKes, titleize } from "@/lib/utils";

export default function AdminDashboardPage() {
  const { hasPermission, user } = useAuth();
  const dashboardQuery = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api.get<AdminDashboard>("/admin/dashboard"),
  });

  const data = dashboardQuery.data;

  const quickLinks = [
    {
      href: "/admin/moderation",
      label: "Moderation queue",
      description: "Review listings waiting to go public.",
      icon: ShieldAlert,
      count: data?.properties.pending_moderation,
      permissions: ["property:moderate"],
    },
    {
      href: "/admin/verification",
      label: "Verification queue",
      description: "Review identity, authority and inspection evidence.",
      icon: BadgeCheck,
      count: data?.properties.pending_verification_properties,
      permissions: ["verification:review"],
    },
    {
      href: "/admin/requests",
      label: "Assisted searches",
      description: "Progress requests, send matches and assign partners.",
      icon: SearchCheck,
      count: data?.assisted.open_requests,
      permissions: ["assisted:manage"],
    },
    {
      href: "/admin/field-reports",
      label: "Field reports",
      description: "Review local investigation findings before use.",
      icon: ClipboardCheck,
      count: data?.assisted.field_reports_to_review,
      permissions: ["assisted:manage"],
    },
    {
      href: "/admin/reports",
      label: "Property reports",
      description: "Investigate misleading or unavailable listings.",
      icon: Flag,
      count: data?.reports.open,
      permissions: ["complaint:manage"],
    },
    {
      href: "/admin/partners",
      label: "Local partners",
      description: "Approve and manage the partner network.",
      icon: Handshake,
      count: undefined,
      permissions: ["partner:manage"],
    },
  ].filter((item) => item.permissions.some((permission) => hasPermission(permission)));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Admin dashboard"
        description={`Signed in as ${user?.name ?? "staff"}. Use this console to moderate listings, verify evidence, run assisted searches and keep platform records honest.`}
        actions={
          <>
            {hasPermission("analytics:view") ? (
              <LinkButton href="/admin/analytics" variant="outline">
                <ChartNoAxesCombined className="h-4 w-4" aria-hidden="true" />
                Analytics
              </LinkButton>
            ) : null}
            {hasPermission("audit:read") ? (
              <LinkButton href="/admin/audit-logs" variant="outline">
                Audit trail
              </LinkButton>
            ) : null}
          </>
        }
      />

      {dashboardQuery.isError ? (
        <ErrorState
          title="The admin dashboard could not load"
          description="We could not reach the operational summary. Nothing on this page is estimated or cached as live data."
          retry={() => dashboardQuery.refetch()}
        />
      ) : dashboardQuery.isLoading || !data ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Pending moderation"
              value={data.properties.pending_moderation}
              hint={`${data.properties.total} properties in the platform`}
              icon={<ShieldAlert className="h-5 w-5" aria-hidden="true" />}
              tone={data.properties.pending_moderation ? "sand" : "ivory"}
            />
            <StatCard
              label="Verification queue"
              value={data.properties.pending_verification_properties}
              hint="Properties with pending checks"
              icon={<BadgeCheck className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Open assisted searches"
              value={data.assisted.open_requests}
              hint={`${data.assisted.field_reports_to_review} field report${data.assisted.field_reports_to_review === 1 ? "" : "s"} to review`}
              icon={<SearchCheck className="h-5 w-5" aria-hidden="true" />}
              tone="sage"
            />
            <StatCard
              label="Revenue this month"
              value={formatKes(data.finance.revenue_this_month)}
              hint={`${data.finance.successful_payments_month} successful payment${data.finance.successful_payments_month === 1 ? "" : "s"} · ${formatKes(data.finance.revenue_today)} today`}
              icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
              tone="teal"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Open reports"
              value={data.reports.open}
              hint={`${data.reports.complaints_open} complaint${data.reports.complaints_open === 1 ? "" : "s"} · ${data.reports.support_tickets_open} support ticket${data.reports.support_tickets_open === 1 ? "" : "s"}`}
              icon={<Flag className="h-5 w-5" aria-hidden="true" />}
              tone={data.reports.open ? "sand" : "ivory"}
            />
            <StatCard
              label="Upcoming viewings"
              value={data.viewings.upcoming}
              hint="Requested, proposed or confirmed"
              icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Users"
              value={data.users.total}
              hint={`${data.users.active} active · ${data.users.verified_phones} phone-verified`}
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Pending assignments"
              value={data.assisted.pending_assignments}
              hint="Offered, accepted or in progress"
              icon={<Handshake className="h-5 w-5" aria-hidden="true" />}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <section className="surface p-5" aria-labelledby="quick-actions-heading">
              <h2 id="quick-actions-heading" className="font-display text-lg font-bold text-ink-900">
                Queues that need attention
              </h2>
              <p className="mt-1 text-xs leading-5 text-ink-500">
                Counts come from live platform records. Empty queues stay empty — no demo items are inserted to fill
                them.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {quickLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex items-start gap-3 rounded-xl border border-ink-900/10 p-3.5 transition hover:border-teal-600/40 hover:bg-teal-50"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ivory-200 text-teal-700 transition group-hover:bg-teal-100">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink-800">{item.label}</span>
                          {item.count ? <Badge tone="sand">{item.count}</Badge> : null}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-ink-500">{item.description}</span>
                      </span>
                      <ArrowRight
                        className="mt-1 h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-teal-700"
                        aria-hidden="true"
                      />
                    </Link>
                  );
                })}
                {quickLinks.length === 0 ? (
                  <p className="text-sm text-ink-500">Your staff role has no queue permissions assigned.</p>
                ) : null}
              </div>
            </section>

            <section className="surface p-5" aria-labelledby="recent-activity-heading">
              <div className="flex items-center justify-between gap-2">
                <h2 id="recent-activity-heading" className="font-display text-lg font-bold text-ink-900">
                  Recent audited activity
                </h2>
                {hasPermission("audit:read") ? (
                  <Link href="/admin/audit-logs" className="text-xs font-semibold text-teal-700 hover:underline">
                    Full log
                  </Link>
                ) : null}
              </div>
              {data.recent_audit.length ? (
                <ol className="mt-3 space-y-1.5">
                  {data.recent_audit.map((log, index) => (
                    <li
                      key={`${log.action}-${log.created_at}-${index}`}
                      className="rounded-lg border border-ink-900/10 px-3 py-2"
                    >
                      <p className="text-xs font-semibold text-ink-800">{titleize(log.action.replace(/\./g, " "))}</p>
                      <p className="mt-0.5 text-[12px] text-ink-400">
                        {log.resource_type} · {formatDateTime(log.created_at)}
                        {log.actor_id ? ` · actor ${log.actor_id.slice(0, 8)}` : " · system"}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-ink-500">No audit activity recorded yet.</p>
              )}
            </section>
          </div>

          <InlineNote tone="info">
            <span className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                All seeded properties, people and verification records in this environment are fictional demo data.
                Approving a listing does not confirm its availability; availability must be freshly confirmed
                separately. Verification outcomes require recorded evidence or review notes.
              </span>
            </span>
          </InlineNote>
        </>
      )}
    </div>
  );
}
