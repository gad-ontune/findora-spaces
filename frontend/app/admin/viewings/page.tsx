"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  MapPin,
  MessageSquare,
  ShieldAlert,
  Star,
  UserRound,
} from "lucide-react";

import { useAuth } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { AdminViewingListResponse, Viewing } from "@/lib/types";
import { formatDate, formatDateTime, formatKes, titleize } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "", label: "All viewings" },
  { value: "requested", label: "Requested" },
  { value: "proposed", label: "Proposed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "missed", label: "Missed" },
];

function feedbackFlag(label: string, value: boolean | null) {
  if (value === null) {
    return (
      <Badge key={label} tone="slate">
        {label}: not recorded
      </Badge>
    );
  }
  return (
    <Badge key={label} tone={value ? "green" : "red"} dot>
      {label}: {value ? "yes" : "no"}
    </Badge>
  );
}

export default function AdminViewingsPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission("support:view") || hasPermission("viewing:manage");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Viewing | null>(null);

  const viewingsQuery = useQuery({
    queryKey: ["admin-viewings", status],
    queryFn: () =>
      api.get<AdminViewingListResponse>("/admin/viewings", {
        status: status || undefined,
      }),
    enabled: canView,
  });

  const viewings = viewingsQuery.data?.viewings ?? [];

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Property operations"
          title="Viewings"
          description="Your staff role does not include viewing coordination access."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only support officers, moderators, landlord representatives and super administrators can view this queue.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property operations"
        title="Viewings"
        description="Review viewing requests and the feedback seekers recorded after visiting. Negative feedback may indicate a listing that needs investigation — it is not proof of fraud by itself."
        actions={<Badge tone="slate">{viewings.length} shown</Badge>}
      />

      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Status" htmlFor="viewing-status" className="sm:w-64">
          <Select id="viewing-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs leading-5 text-ink-400 sm:pb-2">
          Viewing feedback is recorded by the seeker. Use it to prioritise investigations, not to mark a listing verified.
        </p>
      </div>

      {viewingsQuery.isError ? (
        <ErrorState
          title="Viewings could not load"
          description="We could not reach the viewing records."
          retry={() => viewingsQuery.refetch()}
        />
      ) : viewingsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : viewings.length ? (
        <div className="space-y-3">
          {viewings.map((viewing) => {
            const feedback = viewing.feedback[0];
            const hasNegative =
              feedback &&
              (feedback.matched_photos === false ||
                feedback.matched_description === false ||
                feedback.rent_matched === false ||
                feedback.suspected_fraud);
            return (
              <article key={viewing.id} className="surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-base font-bold text-ink-900">{viewing.reference}</h2>
                      <StatusBadge status={viewing.status} />
                      {hasNegative ? (
                        <Badge tone="red">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          Negative feedback
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      {viewing.property?.title ?? "Property not recorded"}
                      {viewing.property ? ` · ${viewing.property.reference}` : ""} ·{" "}
                      {viewing.property?.location.town ?? "Location not recorded"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setSelected(viewing)}>
                    View details
                  </Button>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500">
                  <span className="inline-flex items-center gap-1">
                    <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                    {viewing.seeker_name} · {viewing.seeker_phone}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {viewing.scheduled_at
                      ? `Scheduled ${formatDateTime(viewing.scheduled_at)}`
                      : viewing.preferred_date
                        ? `Preferred ${formatDate(viewing.preferred_date)}`
                        : "No date recorded"}
                  </span>
                  {viewing.meeting_point ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {viewing.meeting_point}
                    </span>
                  ) : null}
                </div>

                {feedback ? (
                  <div className="mt-2 rounded-lg bg-ivory-100 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">
                      Seeker feedback · {formatDateTime(feedback.created_at)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {feedbackFlag("Photos matched", feedback.matched_photos)}
                      {feedbackFlag("Description matched", feedback.matched_description)}
                      {feedbackFlag("Rent matched", feedback.rent_matched)}
                      {feedbackFlag("Available", feedback.property_available)}
                      {feedbackFlag("Representative reachable", feedback.representative_reachable)}
                      {feedback.suspected_fraud ? (
                        <Badge tone="red" dot>
                          Suspected fraud
                        </Badge>
                      ) : null}
                    </div>
                    {feedback.comments ? (
                      <p className="mt-1.5 text-xs leading-5 text-ink-600">{feedback.comments}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-ink-400">No feedback submitted.</p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
          title="No viewings in this view"
          description="Viewing requests appear when a seeker asks to visit a property. The console does not fabricate viewings."
        />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Viewing ${selected.reference}` : "Viewing"}
        description={selected?.property ? `${selected.property.title} · ${selected.property.reference}` : undefined}
        size="md"
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              <Badge tone="slate">Created {formatDate(selected.created_at)}</Badge>
              {selected.completed_at ? <Badge tone="green">Completed {formatDate(selected.completed_at)}</Badge> : null}
            </div>

            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Seeker</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">
                  {selected.seeker_name}
                  <span className="block text-xs text-ink-500">{selected.seeker_phone}</span>
                </dd>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Property</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">
                  {selected.property?.title ?? "Not recorded"}
                  {selected.property ? (
                    <span className="block text-xs text-ink-500">
                      {[selected.property.location.neighbourhood, selected.property.location.town]
                        .filter(Boolean)
                        .join(", ")}{" "}
                      · {formatKes(selected.property.rent_amount)} / {selected.property.rent_period}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Timing</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">
                  {selected.scheduled_at
                    ? formatDateTime(selected.scheduled_at)
                    : selected.preferred_date
                      ? `Preferred ${formatDate(selected.preferred_date)}`
                      : "No date recorded"}
                </dd>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Meeting point</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">{selected.meeting_point ?? "Not recorded"}</dd>
              </div>
            </dl>

            {selected.notes ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Seeker notes</p>
                <p className="mt-1 whitespace-pre-line rounded-xl border border-ink-900/10 px-3.5 py-3 text-sm leading-6 text-ink-600">
                  {selected.notes}
                </p>
              </div>
            ) : null}

            {selected.cancellation_reason ? (
              <InlineNote tone="warning">
                <strong className="font-semibold">Cancellation reason:</strong> {selected.cancellation_reason}
              </InlineNote>
            ) : null}

            <div>
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                Feedback
              </p>
              {selected.feedback.length ? (
                <ul className="mt-1.5 space-y-2">
                  {selected.feedback.map((feedback, index) => (
                    <li key={`${feedback.created_at}-${index}`} className="rounded-xl border border-ink-900/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {feedbackFlag("Photos matched", feedback.matched_photos)}
                          {feedbackFlag("Description matched", feedback.matched_description)}
                          {feedbackFlag("Rent matched", feedback.rent_matched)}
                          {feedbackFlag("Available", feedback.property_available)}
                          {feedbackFlag("Representative reachable", feedback.representative_reachable)}
                          {feedback.suspected_fraud ? (
                            <Badge tone="red" dot>
                              Suspected fraud
                            </Badge>
                          ) : null}
                        </div>
                        {feedback.rating !== null ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-600">
                            <Star className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                            {feedback.rating}/5
                          </span>
                        ) : null}
                      </div>
                      {feedback.comments ? (
                        <p className="mt-1.5 whitespace-pre-line text-xs leading-5 text-ink-600">{feedback.comments}</p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-ink-400">Recorded {formatDateTime(feedback.created_at)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-ink-500">No feedback submitted for this viewing.</p>
              )}
            </div>

            {selected.status_history.length ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Status history</p>
                <ol className="mt-1.5 space-y-1.5">
                  {selected.status_history.map((entry, index) => (
                    <li key={`${entry.to}-${entry.created_at}-${index}`} className="border-l-2 border-teal-200 pl-3">
                      <p className="text-xs font-semibold text-ink-800">
                        {entry.from ? `${titleize(entry.from)} → ` : ""}
                        {titleize(entry.to)}
                      </p>
                      <p className="text-[10px] text-ink-400">{formatDateTime(entry.created_at)}</p>
                      {entry.notes ? <p className="text-[11px] leading-5 text-ink-500">{entry.notes}</p> : null}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <div className="flex justify-end border-t border-ink-900/10 pt-4">
              <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
