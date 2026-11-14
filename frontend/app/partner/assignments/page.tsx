"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, MapPin, Navigation, ShieldAlert } from "lucide-react";

import { useAuth } from "@/components/providers";
import { StatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { PartnerAssignment } from "@/lib/types";
import { cn, formatDate, formatKes, titleize } from "@/lib/utils";

type AssignmentPayload = {
  assignments: PartnerAssignment[];
  counts: { offered: number; accepted: number; in_progress: number; completed: number };
};

type Filter = "all" | "offered" | "accepted" | "in_progress" | "completed";

export default function PartnerAssignmentsPage() {
  const { hasPermission } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");

  const assignmentsQuery = useQuery({
    queryKey: ["partner-assignments"],
    queryFn: () => api.get<AssignmentPayload>("/partners/assignments"),
    enabled: hasPermission("partner:assignment"),
  });

  const assignments = assignmentsQuery.data?.assignments ?? [];
  const counts = assignmentsQuery.data?.counts;

  const filtered = useMemo(() => {
    if (filter === "all") return assignments;
    return assignments.filter((assignment) => assignment.status === filter);
  }, [assignments, filter]);

  if (!hasPermission("partner:assignment")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Local partner"
          title="Assignments"
          description="You need an active partner profile before assignments can be offered to you."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Apply to become a local partner first.{" "}
              <Link href="/partner" className="font-semibold underline">
                Open the partner application
              </Link>
              .
            </span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Local partner"
        title="Your assignments"
        description="Review the real assisted-search work assigned to you. Accept only what you can genuinely complete, and submit findings that reflect what you actually observed."
        actions={<LinkButton href="/partner" variant="outline">Partner overview</LinkButton>}
      />

      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-ink-900/10 bg-white p-1" role="tablist" aria-label="Assignment filters">
        {(
          [
            { value: "all" as Filter, label: `All (${assignments.length})` },
            { value: "offered" as Filter, label: `Offered (${counts?.offered ?? 0})` },
            { value: "accepted" as Filter, label: `Accepted (${counts?.accepted ?? 0})` },
            { value: "in_progress" as Filter, label: `In progress (${counts?.in_progress ?? 0})` },
            { value: "completed" as Filter, label: `Completed (${counts?.completed ?? 0})` },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm",
              filter === option.value ? "bg-teal-700 text-ivory-50" : "text-ink-500 hover:text-ink-800",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {assignmentsQuery.isError ? (
        <ErrorState
          title="Assignments could not load"
          description="We could not reach your assignment list. You may need an active partner profile."
          retry={() => assignmentsQuery.refetch()}
        />
      ) : assignmentsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : filtered.length ? (
        <div className="space-y-3">
          {filtered.map((assignment) => (
            <article key={assignment.id} className="surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-ink-900">{assignment.reference}</h2>
                    <StatusBadge status={assignment.status} />
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                      {[assignment.request.neighbourhood, assignment.request.town].filter(Boolean).join(", ") ||
                        "Location shared on assignment"}
                    </span>
                    <span>{titleize(assignment.request.category)}</span>
                    <span>
                      {formatKes(assignment.request.budget_min)} – {formatKes(assignment.request.budget_max)}
                    </span>
                    <span>{assignment.request.property_type ? titleize(assignment.request.property_type) : "Any type"}</span>
                  </p>
                </div>
                <LinkButton href={`/partner/assignments/${assignment.id}`} size="sm">
                  Open assignment
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </LinkButton>
              </div>

              {assignment.instructions ? (
                <p className="mt-3 line-clamp-2 rounded-xl bg-ivory-100 px-3.5 py-2.5 text-sm leading-6 text-ink-600">
                  {assignment.instructions}
                </p>
              ) : null}

              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-400">
                <div className="flex gap-1">
                  <dt>Offered:</dt>
                  <dd>{formatDate(assignment.created_at)}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Due:</dt>
                  <dd>{assignment.due_at ? formatDate(assignment.due_at) : "Not set"}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Reports:</dt>
                  <dd>{assignment.reports.length}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Seeker contact:</dt>
                  <dd>{assignment.request.guest_name ?? "Via support team"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />}
          title={filter === "all" ? "No assignments yet" : "No assignments in this view"}
          description={
            filter === "all"
              ? "Support staff assign local investigations when an assisted search needs on-the-ground verification. Keep your service areas accurate."
              : "Try another filter to see your other assignments."
          }
          action={<LinkButton href="/partner" variant="outline">Partner overview</LinkButton>}
        />
      )}

      <InlineNote>
        <span className="flex items-start gap-2">
          <Navigation className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Before visiting, confirm the assignment details with the support team. Identify yourself to occupants, do not
            enter without permission, and record only what you genuinely observed.
          </span>
        </span>
      </InlineNote>
    </div>
  );
}
