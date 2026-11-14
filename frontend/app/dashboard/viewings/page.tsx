"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  MessageSquare,
  Star,
  XCircle,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { StatusBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage } from "@/lib/api";
import type { Viewing } from "@/lib/types";
import { cn, formatDate, formatDateTime, titleize } from "@/lib/utils";

type Tab = "upcoming" | "past";

function localInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export default function ViewingsPage() {
  const { user, hasPermission, isStaff } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [selected, setSelected] = useState<Viewing | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [status, setStatus] = useState("confirmed");
  const [scheduledAt, setScheduledAt] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [notes, setNotes] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({
    matched_photos: true,
    matched_description: true,
    rent_matched: true,
    property_available: true,
    representative_reachable: true,
    suspected_fraud: false,
    rating: 4,
    comments: "",
  });

  const viewingsQuery = useQuery({
    queryKey: ["viewings"],
    queryFn: () => api.get<{ viewings: Viewing[]; count: number }>("/viewings"),
  });

  const canManage = hasPermission("viewing:manage");
  const viewings = viewingsQuery.data?.viewings ?? [];

  const upcoming = useMemo(
    () => viewings.filter((viewing) => ["requested", "proposed", "confirmed"].includes(viewing.status)),
    [viewings],
  );
  const past = useMemo(
    () => viewings.filter((viewing) => ["completed", "cancelled", "missed"].includes(viewing.status)),
    [viewings],
  );

  function openUpdate(viewing: Viewing) {
    setSelected(viewing);
    setStatus(
      viewing.status === "requested"
        ? "proposed"
        : viewing.status === "proposed"
          ? "confirmed"
          : viewing.status === "confirmed"
            ? "completed"
            : "cancelled",
    );
    setScheduledAt(
      localInputValue(
        viewing.scheduled_at ??
          (viewing.preferred_date ? `${viewing.preferred_date}T10:00:00` : null),
      ),
    );
    setMeetingPoint(viewing.meeting_point ?? "");
    setNotes("");
    setCancellationReason("");
    setUpdateOpen(true);
  }

  function openFeedback(viewing: Viewing) {
    setSelected(viewing);
    setFeedback({
      matched_photos: true,
      matched_description: true,
      rent_matched: true,
      property_available: true,
      representative_reachable: true,
      suspected_fraud: false,
      rating: 4,
      comments: "",
    });
    setFeedbackOpen(true);
  }

  async function updateViewing(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { status };
      if (scheduledAt) body.scheduled_at = new Date(scheduledAt).toISOString();
      if (meetingPoint.trim()) body.meeting_point = meetingPoint.trim();
      if (notes.trim()) body.notes = notes.trim();
      if (status === "cancelled") {
        if (!cancellationReason.trim()) {
          toast({ title: "Give a short reason for cancelling", tone: "error" });
          setSaving(false);
          return;
        }
        body.cancellation_reason = cancellationReason.trim();
      }
      await api.patch(`/viewings/${selected.id}`, body);
      await queryClient.invalidateQueries({ queryKey: ["viewings"] });
      setUpdateOpen(false);
      toast({ title: `Viewing ${status}`, tone: "success" });
    } catch (error) {
      toast({ title: "Could not update the viewing", description: errorMessage(error), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function submitFeedback(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/viewings/${selected.id}/feedback`, {
        ...feedback,
        comments: feedback.comments.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["viewings"] });
      setFeedbackOpen(false);
      toast({
        title: "Thank you for the feedback",
        description: "It helps other seekers and our moderation team.",
        tone: "success",
      });
    } catch (error) {
      toast({ title: "Could not submit feedback", description: errorMessage(error), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const list = tab === "upcoming" ? upcoming : past;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Viewings"
        title={canManage ? "Viewing requests and appointments" : "Your property viewings"}
        description={
          canManage
            ? "Confirm real appointment times, record outcomes and keep seekers informed. Only confirmed viewings should be presented as scheduled."
            : "Track requested, confirmed and completed viewings. After a viewing, tell us whether the property matched its listing."
        }
        actions={<LinkButton href="/properties" variant="outline">Find a space</LinkButton>}
      />

      {isStaff && !canManage ? (
        <InlineNote tone="warning">
          Staff view: you can see viewings across the platform. Only the seeker can submit feedback, and only the host or
          authorised staff can confirm appointments.
        </InlineNote>
      ) : null}

      <div className="inline-flex rounded-xl border border-ink-900/10 bg-white p-1" role="tablist" aria-label="Viewing filters">
        {[
          { value: "upcoming" as Tab, label: `Upcoming (${upcoming.length})` },
          { value: "past" as Tab, label: `Past (${past.length})` },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={tab === option.value}
            onClick={() => setTab(option.value)}
            className={cn(
              "rounded-lg px-3.5 py-2 text-sm font-semibold transition",
              tab === option.value ? "bg-teal-700 text-ivory-50" : "text-ink-500 hover:text-ink-800",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {viewingsQuery.isError ? (
        <ErrorState
          title="Viewings could not load"
          description="We could not reach your viewing records."
          retry={() => viewingsQuery.refetch()}
        />
      ) : viewingsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : list.length ? (
        <div className="space-y-3">
          {list.map((viewing) => {
            const feedbackRecord = viewing.feedback[0];
            const canGiveFeedback =
              Boolean(user) &&
              !canManage &&
              ["confirmed", "completed"].includes(viewing.status) &&
              !feedbackRecord;
            return (
              <article key={viewing.id} className="surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-base font-bold text-ink-900">
                        {viewing.property?.title ?? "Property viewing"}
                      </h2>
                      <StatusBadge status={viewing.status} />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                        {viewing.property
                          ? [viewing.property.location.neighbourhood, viewing.property.location.town]
                              .filter(Boolean)
                              .join(", ")
                          : "Location shared by the property team"}
                      </span>
                      <span>Ref {viewing.reference}</span>
                    </p>
                  </div>
                  {viewing.property ? (
                    <LinkButton href={`/properties/${viewing.property.id}`} size="sm" variant="outline">
                      View listing
                    </LinkButton>
                  ) : null}
                </div>

                <dl className="mt-3 grid gap-3 rounded-xl bg-ivory-100 p-3.5 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-ink-400">Appointment</dt>
                    <dd className="mt-0.5 font-medium text-ink-700">
                      {viewing.scheduled_at
                        ? formatDateTime(viewing.scheduled_at)
                        : viewing.preferred_date
                          ? `Preferred ${formatDate(viewing.preferred_date)}`
                          : "Not scheduled"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-ink-400">Meeting point</dt>
                    <dd className="mt-0.5 font-medium text-ink-700">{viewing.meeting_point ?? "Shared on confirmation"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold uppercase tracking-wide text-ink-400">Contact</dt>
                    <dd className="mt-0.5 font-medium text-ink-700">
                      {viewing.seeker_name} · {viewing.seeker_phone}
                    </dd>
                  </div>
                </dl>

                {viewing.notes ? (
                  <p className="mt-2 text-sm leading-6 text-ink-600">{viewing.notes}</p>
                ) : null}
                {viewing.cancellation_reason ? (
                  <p className="mt-2 rounded-lg bg-terracotta-100 px-3 py-2 text-xs leading-5 text-terracotta-800">
                    Cancelled: {viewing.cancellation_reason}
                  </p>
                ) : null}

                {feedbackRecord ? (
                  <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3.5">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-teal-900">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Viewing feedback
                      {feedbackRecord.rating ? (
                        <span className="ml-1 inline-flex items-center gap-0.5 font-semibold">
                          <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                          {feedbackRecord.rating}/5
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-teal-900/80">
                      Photos matched: {feedbackRecord.matched_photos ? "yes" : "no"} · Description matched:{" "}
                      {feedbackRecord.matched_description ? "yes" : "no"} · Rent matched:{" "}
                      {feedbackRecord.rent_matched ? "yes" : "no"} · Property available:{" "}
                      {feedbackRecord.property_available ? "yes" : "no"}
                    </p>
                    {feedbackRecord.comments ? (
                      <p className="mt-1.5 text-sm leading-6 text-teal-900/85">{feedbackRecord.comments}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canManage && ["requested", "proposed", "confirmed"].includes(viewing.status) ? (
                    <Button size="sm" onClick={() => openUpdate(viewing)}>
                      <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {viewing.status === "requested" ? "Propose a time" : "Update viewing"}
                    </Button>
                  ) : null}
                  {!canManage && ["requested", "proposed", "confirmed"].includes(viewing.status) ? (
                    <Button size="sm" variant="outline" onClick={() => openUpdate(viewing)}>
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      Cancel viewing
                    </Button>
                  ) : null}
                  {canGiveFeedback ? (
                    <Button size="sm" variant="secondary" onClick={() => openFeedback(viewing)}>
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      Submit feedback
                    </Button>
                  ) : null}
                  {viewing.status === "completed" && !feedbackRecord && canManage ? (
                    <span className="text-xs text-ink-400">Awaiting seeker feedback.</span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />}
          title={tab === "upcoming" ? "No upcoming viewings" : "No past viewings"}
          description={
            tab === "upcoming"
              ? "When you request a viewing, the property representative must confirm the appointment. Nothing is shown as confirmed until they do."
              : "Completed, cancelled and missed viewings will be listed here."
          }
          action={<LinkButton href="/properties">Browse spaces</LinkButton>}
        />
      )}

      <Modal
        open={updateOpen}
        onClose={() => setUpdateOpen(false)}
        title={canManage ? "Update this viewing" : "Cancel this viewing"}
        description={
          canManage
            ? "A confirmed viewing needs a real date and time. The seeker is notified when the status changes."
            : "Tell the property team why you cannot attend. The slot can then be offered to someone else."
        }
        size="sm"
      >
        <form onSubmit={updateViewing} className="space-y-4">
          {canManage ? (
            <>
              <Field label="Status" htmlFor="viewing-status" required>
                <Select id="viewing-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="proposed">Proposed — waiting for seeker</option>
                  <option value="confirmed">Confirmed — appointment agreed</option>
                  <option value="completed">Completed</option>
                  <option value="missed">Missed</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </Field>
              {status !== "cancelled" ? (
                <>
                  <Field label="Date and time" htmlFor="viewing-scheduled" required={status === "confirmed"}>
                    <Input
                      id="viewing-scheduled"
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(event) => setScheduledAt(event.target.value)}
                      required={status === "confirmed"}
                    />
                  </Field>
                  <Field label="Meeting point" htmlFor="viewing-meeting">
                    <Input
                      id="viewing-meeting"
                      value={meetingPoint}
                      onChange={(event) => setMeetingPoint(event.target.value)}
                      maxLength={255}
                      placeholder="e.g. Main gate, near the water tank"
                    />
                  </Field>
                  <Field label="Note to the seeker (optional)" htmlFor="viewing-notes">
                    <Textarea
                      id="viewing-notes"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      maxLength={2000}
                      className="min-h-20"
                    />
                  </Field>
                </>
              ) : null}
            </>
          ) : null}

          {status === "cancelled" || !canManage ? (
            <Field label="Reason for cancelling" htmlFor="viewing-cancel-reason" required>
              <Textarea
                id="viewing-cancel-reason"
                required
                minLength={3}
                maxLength={1000}
                value={cancellationReason}
                onChange={(event) => setCancellationReason(event.target.value)}
                className="min-h-20"
                placeholder="e.g. I am no longer available at that time."
              />
            </Field>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setUpdateOpen(false)}>
              Close
            </Button>
            <Button
              type="submit"
              variant={status === "cancelled" || !canManage ? "danger" : "primary"}
              loading={saving}
            >
              {status === "cancelled" || !canManage ? "Cancel viewing" : "Save update"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        title="How was the viewing?"
        description="Your honest feedback helps other seekers and flags listings that do not match reality. It does not publish your personal details."
        size="md"
      >
        <form onSubmit={submitFeedback} className="space-y-3">
          {[
            { key: "matched_photos" as const, label: "The photos matched the property" },
            { key: "matched_description" as const, label: "The description was accurate" },
            { key: "rent_matched" as const, label: "The advertised rent matched" },
            { key: "property_available" as const, label: "The property was genuinely available" },
            { key: "representative_reachable" as const, label: "The representative was reachable" },
          ].map((item) => (
            <Checkbox
              key={item.key}
              label={item.label}
              checked={feedback[item.key]}
              onChange={(event) => setFeedback({ ...feedback, [item.key]: event.target.checked })}
            />
          ))}
          <Checkbox
            label="I suspect fraud or a serious misrepresentation"
            description="This creates a high-priority complaint for the moderation team."
            checked={feedback.suspected_fraud}
            onChange={(event) => setFeedback({ ...feedback, suspected_fraud: event.target.checked })}
          />
          <Field label="Overall rating" htmlFor="feedback-rating">
            <Select
              id="feedback-rating"
              value={feedback.rating}
              onChange={(event) => setFeedback({ ...feedback, rating: Number(event.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((rating) => (
                <option key={rating} value={rating}>
                  {rating} star{rating === 1 ? "" : "s"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Comments (optional)" htmlFor="feedback-comments">
            <Textarea
              id="feedback-comments"
              value={feedback.comments}
              onChange={(event) => setFeedback({ ...feedback, comments: event.target.value })}
              maxLength={3000}
              className="min-h-24"
              placeholder="What should other seekers know?"
            />
          </Field>
          <Button type="submit" className="w-full" loading={saving}>
            Submit feedback
          </Button>
        </form>
      </Modal>

      <p className="flex items-start gap-1.5 text-xs leading-5 text-ink-400">
        <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        A viewing request is not a confirmed appointment. Only the property representative can confirm a time. Always
        meet safely and never pay before verifying the property and the recipient.
      </p>
    </div>
  );
}
