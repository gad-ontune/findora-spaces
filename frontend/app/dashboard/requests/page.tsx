"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPin, Plus, SearchCheck, Sparkles } from "lucide-react";

import { StatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { SearchRequest } from "@/lib/types";
import { formatDate, formatKes } from "@/lib/utils";

export default function AssistedRequestsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["search-requests"],
    queryFn: () => api.get<{ requests: SearchRequest[] }>("/search-requests"),
  });

  const requests = data?.requests ?? [];
  const active = requests.filter((request) => !["completed", "cancelled"].includes(request.status));
  const past = requests.filter((request) => ["completed", "cancelled"].includes(request.status));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assisted search"
        title="Your assisted searches"
        description="Follow the real status of each request, review matches our team actually shared and message the team. We never invent matches or progress."
        actions={
          <LinkButton href="/assisted">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New request
          </LinkButton>
        }
      />

      {isError ? (
        <ErrorState
          title="Assisted searches could not load"
          description="We could not reach your request list."
          retry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : requests.length ? (
        <>
          <section aria-labelledby="active-requests">
            <h2 id="active-requests" className="font-display text-lg font-bold text-ink-900">
              Active requests ({active.length})
            </h2>
            <div className="mt-3 space-y-3">
              {active.length ? (
                active.map((request) => <RequestRow key={request.id} request={request} />)
              ) : (
                <p className="rounded-2xl bg-ivory-100 p-4 text-sm text-ink-500">
                  No active assisted searches. Start one when you want a local team to look for you.
                </p>
              )}
            </div>
          </section>

          {past.length ? (
            <section aria-labelledby="past-requests">
              <h2 id="past-requests" className="font-display text-lg font-bold text-ink-900">
                Past requests ({past.length})
              </h2>
              <div className="mt-3 space-y-3">
                {past.map((request) => (
                  <RequestRow key={request.id} request={request} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={<SearchCheck className="h-6 w-6" aria-hidden="true" />}
          title="No assisted searches yet"
          description="Tell us your budget, area and must-haves. A local team reviews genuine available supply and shares only real matches."
          action={
            <LinkButton href="/assisted">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Ask Findora to help
            </LinkButton>
          }
        />
      )}

      <div className="rounded-2xl border border-sand-300 bg-sand-100 p-4 text-xs leading-5 text-ink-600">
        <strong className="font-semibold text-ink-800">What the fee covers:</strong> review, genuine matching and
        coordination. It does not buy a guaranteed match, and payments in this demo are simulated. If our team cannot
        find suitable supply, they record that honestly.
      </div>
    </div>
  );
}

function RequestRow({ request }: { request: SearchRequest }) {
  const place = [request.neighbourhood, request.town].filter(Boolean).join(", ");
  return (
    <article className="surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold text-ink-900">{request.reference}</h3>
            <StatusBadge status={request.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
              {place || "Any location"}
            </span>
            <span>
              {request.category === "commercial" ? "Commercial" : "Residential"} · up to {formatKes(request.budget_max)}
            </span>
            <span>Requested {formatDate(request.created_at)}</span>
          </p>
        </div>
        <LinkButton href={`/dashboard/requests/${request.id}`} size="sm" variant="outline">
          Open
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </LinkButton>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-ivory-100 px-3 py-2.5 text-center">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Matches shared</dt>
          <dd className="mt-0.5 font-display text-lg font-bold text-teal-700">{request.match_count}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Local partners</dt>
          <dd className="mt-0.5 font-display text-lg font-bold text-ink-800">{request.assignment_count}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Messages</dt>
          <dd className="mt-0.5 font-display text-lg font-bold text-ink-800">{request.messages.length}</dd>
        </div>
      </dl>

      {request.requirements ? (
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-600">{request.requirements}</p>
      ) : null}
      <p className="mt-2 text-xs text-ink-400">
        Track this request:{" "}
        <Link href={`/dashboard/requests/${request.id}`} className="font-semibold text-teal-700 hover:underline">
          full status, matches and messages
        </Link>
        .
      </p>
    </article>
  );
}
