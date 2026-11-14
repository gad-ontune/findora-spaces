"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  Eye,
  Handshake,
  MessageSquare,
  SearchCheck,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";

import { useAuth } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { PageHeader, StatCard } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { AdminAnalytics } from "@/lib/types";
import { formatKes, formatNumber, titleize } from "@/lib/utils";

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{title}</p>
      {entries.length ? (
        <ul className="mt-1.5 space-y-1.5">
          {entries.map(([key, value]) => (
            <li key={key}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-ink-600">{titleize(key)}</span>
                <span className="font-semibold text-ink-800">{formatNumber(value)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ivory-200" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-teal-600"
                  style={{ width: total ? `${Math.max(4, Math.round((value / total) * 100))}%` : "0%" }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-ink-500">No records in this category yet.</p>
      )}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { hasPermission } = useAuth();
  const analyticsQuery = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => api.get<AdminAnalytics>("/admin/analytics/overview"),
    enabled: hasPermission("analytics:view"),
  });

  const data = analyticsQuery.data;

  if (!hasPermission("analytics:view")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Administration"
          title="Analytics"
          description="Your staff role does not include analytics permission."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only finance officers and super administrators can view operational analytics.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Analytics"
        description="Operational metrics computed from actual platform records. Small samples are not a market survey, and no metric is estimated to fill a gap."
        actions={<Badge tone="slate">Live records</Badge>}
      />

      {analyticsQuery.isError ? (
        <ErrorState
          title="Analytics could not load"
          description="We could not compute the operational summary."
          retry={() => analyticsQuery.refetch()}
        />
      ) : analyticsQuery.isLoading || !data ? (
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
              label="Property views"
              value={formatNumber(data.discovery.total_property_views)}
              hint={`${formatNumber(data.discovery.contact_requests)} contact request${data.discovery.contact_requests === 1 ? "" : "s"}`}
              icon={<Eye className="h-5 w-5" aria-hidden="true" />}
              tone="teal"
            />
            <StatCard
              label="Contact rate"
              value={data.discovery.contact_rate_percent !== null ? `${data.discovery.contact_rate_percent}%` : "Not enough data"}
              hint={`${formatNumber(data.discovery.favourites)} favourite${data.discovery.favourites === 1 ? "" : "s"} · ${formatNumber(data.discovery.comparisons)} comparison${data.discovery.comparisons === 1 ? "" : "s"}`}
              icon={<MessageSquare className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Fresh and available"
              value={formatNumber(data.supply.fresh_and_available)}
              hint="Approved listings with confirmed fresh availability"
              icon={<BadgeCheck className="h-5 w-5" aria-hidden="true" />}
              tone="sage"
            />
            <StatCard
              label="Assisted requests"
              value={formatNumber(data.assisted.requests_total)}
              hint={`${formatNumber(data.assisted.completed)} completed`}
              icon={<SearchCheck className="h-5 w-5" aria-hidden="true" />}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <section className="surface p-5" aria-labelledby="supply-heading">
              <h2 id="supply-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
                <Building2 className="h-5 w-5 text-teal-600" aria-hidden="true" />
                Supply
              </h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Breakdown title="By listing status" data={data.supply.by_status} />
                <Breakdown title="Approved by category" data={data.supply.approved_by_category} />
                <Breakdown title="By availability" data={data.supply.by_availability} />
                <div className="rounded-xl bg-ivory-100 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Visibility rule</p>
                  <p className="mt-1 text-xs leading-5 text-ink-600">
                    Public listings require approval, genuine availability and freshness within the configured window.
                    &ldquo;Fresh and available&rdquo; counts exactly that intersection.
                  </p>
                </div>
              </div>
            </section>

            <section className="surface p-5" aria-labelledby="landlords-heading">
              <h2 id="landlords-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
                <Users className="h-5 w-5 text-teal-600" aria-hidden="true" />
                Landlords and enquiries
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-ivory-100 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Active landlords</p>
                  <p className="mt-1 font-display text-xl font-bold text-ink-900">
                    {formatNumber(data.landlords.active_landlords)}
                  </p>
                  <p className="text-[12px] text-ink-400">Distinct owners with property records</p>
                </div>
                <div className="rounded-xl bg-ivory-100 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Enquiries received</p>
                  <p className="mt-1 font-display text-xl font-bold text-ink-900">
                    {formatNumber(data.landlords.enquiries_received)}
                  </p>
                  <p className="text-[12px] text-ink-400">
                    {data.landlords.enquiry_response_rate_percent !== null
                      ? `${data.landlords.enquiry_response_rate_percent}% responded`
                      : "Response rate not available"}
                  </p>
                </div>
                <div className="rounded-xl bg-ivory-100 p-3 sm:col-span-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Total property records</p>
                  <p className="mt-1 font-display text-xl font-bold text-ink-900">
                    {formatNumber(data.landlords.total_properties)}
                  </p>
                  <p className="text-[12px] text-ink-400">
                    All records, including pending and archived. Not the public listing count.
                  </p>
                </div>
              </div>
            </section>

            <section className="surface p-5" aria-labelledby="assisted-heading">
              <h2 id="assisted-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
                <Handshake className="h-5 w-5 text-teal-600" aria-hidden="true" />
                Assisted search
              </h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Breakdown title="By request status" data={data.assisted.by_status} />
                <div className="space-y-2">
                  <div className="rounded-xl bg-ivory-100 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Average time to first match</p>
                    <p className="mt-1 font-display text-xl font-bold text-ink-900">
                      {data.assisted.average_hours_to_first_match !== null
                        ? `${data.assisted.average_hours_to_first_match} hrs`
                        : "Not enough data"}
                    </p>
                    <p className="text-[12px] text-ink-400">
                      Computed only from requests that have a recorded match.
                    </p>
                  </div>
                  <div className="rounded-xl bg-ivory-100 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Completed</p>
                    <p className="mt-1 font-display text-xl font-bold text-ink-900">{formatNumber(data.assisted.completed)}</p>
                    <p className="text-[12px] text-ink-400">
                      Requests closed as completed, not cancelled or unmatched.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="surface p-5" aria-labelledby="viewings-heading">
              <h2 id="viewings-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
                <CalendarDays className="h-5 w-5 text-teal-600" aria-hidden="true" />
                Viewings and feedback
              </h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Breakdown title="By viewing status" data={data.viewings.by_status} />
                <div className="space-y-2">
                  <div className="rounded-xl bg-ivory-100 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Total viewings</p>
                    <p className="mt-1 font-display text-xl font-bold text-ink-900">{formatNumber(data.viewings.total)}</p>
                  </div>
                  <div className="rounded-xl bg-ivory-100 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Feedback submitted</p>
                    <p className="mt-1 font-display text-xl font-bold text-ink-900">
                      {formatNumber(data.viewings.feedback_submitted)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-terracotta-100 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-terracotta-700">Negative outcomes</p>
                    <p className="mt-1 font-display text-xl font-bold text-terracotta-800">
                      {formatNumber(data.viewings.negative_outcomes)}
                    </p>
                    <p className="text-[12px] text-terracotta-700">
                      Photos, description, rent or fraud flags. Investigate; do not treat as proof.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="surface p-5" aria-labelledby="finance-heading">
            <h2 id="finance-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
              <Wallet className="h-5 w-5 text-teal-600" aria-hidden="true" />
              Finance
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(data.finance.payments).map(([status, totals]) => (
                <div key={status} className="rounded-xl bg-ivory-100 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{titleize(status)}</p>
                  <p className="mt-1 font-display text-lg font-bold text-ink-900">{formatKes(totals.amount)}</p>
                  <p className="text-[12px] text-ink-400">
                    {formatNumber(totals.count)} payment{totals.count === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
              <div className="rounded-xl bg-ivory-100 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Refunded total</p>
                <p className="mt-1 font-display text-lg font-bold text-ink-900">{formatKes(data.finance.refunded_total)}</p>
                <p className="text-[12px] text-ink-400">Completed refunds only</p>
              </div>
            </div>
            {Object.keys(data.finance.payments).length === 0 ? (
              <EmptyState
                icon={<ChartNoAxesCombined className="h-6 w-6" aria-hidden="true" />}
                title="No payment records yet"
                description="Finance metrics appear after genuine payments are initiated."
                className="mt-3 border-0 bg-transparent py-8"
              />
            ) : null}
          </section>

          <InlineNote tone="info">
            <span className="flex items-start gap-2">
              <ChartNoAxesCombined className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{data.note}</span>
            </span>
          </InlineNote>
        </>
      )}
    </div>
  );
}
