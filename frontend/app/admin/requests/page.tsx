"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, ChevronRight, MapPin, SearchCheck, ShieldAlert, Users } from "lucide-react";

import { useAuth } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { AdminSearchRequestListResponse } from "@/lib/types";
import { formatDate, formatKes, titleize } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "received", label: "Received" },
  { value: "under_review", label: "Under review" },
  { value: "matching", label: "Matching" },
  { value: "awaiting_local_investigation", label: "Awaiting local investigation" },
  { value: "partner_assigned", label: "Partner assigned" },
  { value: "investigation_in_progress", label: "Investigation in progress" },
  { value: "matches_available", label: "Matches available" },
  { value: "awaiting_seeker_response", label: "Awaiting seeker response" },
  { value: "viewing_requested", label: "Viewing requested" },
  { value: "viewing_confirmed", label: "Viewing confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "unable_to_find_suitable_match", label: "No suitable match" },
];

export default function AdminRequestsPage() {
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const requestsQuery = useQuery({
    queryKey: ["admin-requests", status, page],
    queryFn: () =>
      api.get<AdminSearchRequestListResponse>("/admin/search-requests", {
        status: status || undefined,
        page,
        page_size: 25,
      }),
    enabled: hasPermission("assisted:manage"),
  });

  const requests = requestsQuery.data?.requests ?? [];
  const pagination = requestsQuery.data?.pagination;

  if (!hasPermission("assisted:manage")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Assisted search"
          title="Search requests"
          description="Your staff role does not include assisted-search management permission."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only support officers and super administrators can process assisted search requests.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assisted search"
        title="Search requests"
        description="Progress genuine assisted-search requests, record local investigations and share only real, available properties. Never promise a match before supply is confirmed."
        actions={
          pagination ? (
            <Badge tone="slate">
              {pagination.total} request{pagination.total === 1 ? "" : "s"}
            </Badge>
          ) : undefined
        }
      />

      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Status" htmlFor="request-status" className="sm:w-72">
          <Select
            id="request-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs leading-5 text-ink-400 sm:pb-2">
          Status transitions are validated by the server. Invalid jumps are rejected rather than hidden.
        </p>
      </div>

      {requestsQuery.isError ? (
        <ErrorState
          title="Search requests could not load"
          description="We could not reach the assisted-search records for this filter."
          retry={() => requestsQuery.refetch()}
        />
      ) : requestsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : requests.length ? (
        <div className="space-y-3">
          {requests.map((request) => (
            <article key={request.id} className="surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-ink-900">{request.reference}</h2>
                    <StatusBadge status={request.status} />
                    <Badge tone="slate">{titleize(request.category)}</Badge>
                    {request.priority !== "normal" ? <Badge tone="amber">{titleize(request.priority)} priority</Badge> : null}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                      {[request.neighbourhood, request.town].filter(Boolean).join(", ") || "Location not recorded"}
                    </span>
                    <span>
                      {request.budget_min ? `${formatKes(request.budget_min)} – ` : "Up to "}
                      {formatKes(request.budget_max)}
                    </span>
                    <span>{request.property_type ? titleize(request.property_type) : "Any type"}</span>
                    {request.bedrooms_min ? <span>{request.bedrooms_min}+ bedrooms</span> : null}
                  </p>
                  <p className="mt-1 text-xs text-ink-400">
                    Created {formatDate(request.created_at)} · {request.match_count} match
                    {request.match_count === 1 ? "" : "es"} shared · {request.assignment_count} assignment
                    {request.assignment_count === 1 ? "" : "s"}
                    {request.assigned_support ? ` · support: ${request.assigned_support}` : ""}
                  </p>
                </div>
                <Link
                  href={`/admin/requests/${request.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-ivory-50 transition hover:bg-teal-800"
                >
                  Open request
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>

              <p className="mt-2 line-clamp-2 rounded-lg bg-ivory-100 px-3 py-2 text-xs leading-5 text-ink-600">
                {request.requirements || "No seeker brief recorded."}
              </p>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-400">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  {request.contact_method}
                </span>
                <span>Updated {formatDate(request.updated_at)}</span>
                {request.landmark ? <span>Landmark: {request.landmark}</span> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<SearchCheck className="h-6 w-6" aria-hidden="true" />}
          title="No search requests in this view"
          description="Requests appear when a seeker submits an assisted search. The console does not create placeholder requests."
        />
      )}

      {pagination && pagination.pages > 1 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Request pagination">
          <p className="text-xs text-ink-500">
            Page {pagination.page} of {pagination.pages} · {pagination.total} requests
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
