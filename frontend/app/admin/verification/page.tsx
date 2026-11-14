"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  ShieldAlert,
  ShieldQuestion,
  XCircle,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage, validationDetails } from "@/lib/api";
import type { VerificationQueueItem } from "@/lib/types";
import { formatDate, formatDateTime, titleize } from "@/lib/utils";

type QueueResponse = { queue: VerificationQueueItem[]; count: number };

const OUTCOMES = [
  { value: "verified", label: "Verified — evidence supports the check" },
  { value: "failed", label: "Failed — the check did not pass" },
  { value: "pending", label: "Still pending — more information needed" },
  { value: "expired", label: "Expired — the evidence is no longer current" },
];

export default function VerificationQueuePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const [selected, setSelected] = useState<VerificationQueueItem | null>(null);
  const [status, setStatus] = useState("verified");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [notes, setNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [saving, setSaving] = useState(false);

  const queueQuery = useQuery({
    queryKey: ["admin-verification-queue"],
    queryFn: () => api.get<QueueResponse>("/verification/queue"),
    enabled: hasPermission("verification:review"),
  });

  const queue = queueQuery.data?.queue ?? [];

  function openReview(item: VerificationQueueItem) {
    setSelected(item);
    setStatus("verified");
    setEvidenceReference(item.evidence_reference ?? "");
    setNotes(item.notes ?? "");
    setRejectionReason("");
    setExpiresInDays("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (status === "verified" && !evidenceReference.trim() && !notes.trim() && !(selected.evidence?.length)) {
      toast({
        title: "Record the evidence",
        description: "A verified outcome requires an evidence reference or review notes.",
        tone: "error",
      });
      return;
    }
    if (status === "failed" && rejectionReason.trim().length < 3) {
      toast({
        title: "Add a rejection reason",
        description: "A failed verification must explain what did not pass.",
        tone: "error",
      });
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{ message: string }>(`/verification/${selected.id}/review`, {
        status,
        notes: notes.trim() || null,
        rejection_reason: status === "failed" ? rejectionReason.trim() : null,
        evidence_reference: evidenceReference.trim() || null,
        expires_in_days: expiresInDays ? Number(expiresInDays) : null,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-verification-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["property-verification"] });
      setSelected(null);
      toast({ title: "Verification review recorded", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not record the review",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission("verification:review")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Property operations"
          title="Verification queue"
          description="Your staff role does not include verification review permission."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only verification officers and super administrators can review verification evidence.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property operations"
        title="Verification queue"
        description="Review pending identity, ownership, authority, inspection, rent and detail checks. Record only what the evidence actually supports. You cannot review a submission you created."
        actions={
          <Badge tone={queue.length ? "sand" : "green"} dot>
            {queue.length} pending
          </Badge>
        }
      />

      <InlineNote tone="info">
        <span className="flex items-start gap-2">
          <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Verification is independent. A verified outcome needs an evidence reference, uploaded evidence, or review
            notes that describe what was checked. Never mark a check verified because a listing looks convincing.
          </span>
        </span>
      </InlineNote>

      {queueQuery.isError ? (
        <ErrorState
          title="The verification queue could not load"
          description="We could not reach pending verification records."
          retry={() => queueQuery.refetch()}
        />
      ) : queueQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : queue.length ? (
        <div className="space-y-3">
          {queue.map((item) => (
            <article key={item.id} className="surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-ink-900">
                      {item.property_title ?? "Account-level verification"}
                    </h2>
                    <Badge tone="teal">
                      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                      {titleize(item.type)}
                    </Badge>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {item.property_reference ? `Property ${item.property_reference} · ` : ""}
                    Requested {formatDateTime(item.created_at)}
                  </p>
                  {item.notes ? (
                    <p className="mt-2 rounded-lg bg-ivory-100 px-3 py-2 text-xs leading-5 text-ink-600">
                      <strong className="font-semibold">Requester notes:</strong> {item.notes}
                    </p>
                  ) : null}
                  {item.evidence_reference ? (
                    <p className="mt-1 text-xs text-ink-500">
                      <strong className="font-semibold text-ink-700">Evidence reference:</strong>{" "}
                      {item.evidence_reference}
                    </p>
                  ) : null}
                  {item.evidence?.length ? (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.evidence.map((evidence) => (
                        <li key={evidence.id}>
                          <Badge tone="sage">
                            <FileCheck2 className="h-3 w-3" aria-hidden="true" />
                            {titleize(evidence.kind)}
                            {evidence.description ? `: ${evidence.description}` : ""}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-ink-400">No uploaded evidence files attached to this request.</p>
                  )}
                </div>
                <Button size="sm" onClick={() => openReview(item)}>
                  <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Review check
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
          title="No verification checks are pending"
          description="New verification requests will appear here. The queue is not padded with sample checks."
        />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Record a verification outcome"
        description="This outcome appears on the Property Passport only as the specific check recorded. It is not a structural survey or a guarantee."
        size="md"
      >
        {selected ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-600">
              <p className="font-semibold text-ink-800">
                {selected.property_title ?? "Account-level check"} · {titleize(selected.type)}
              </p>
              <p className="mt-0.5">
                {selected.property_reference ? `${selected.property_reference} · ` : ""}
                Requested {formatDate(selected.created_at)}
              </p>
            </div>

            <Field label="Outcome" htmlFor="verification-outcome" required>
              <Select id="verification-outcome" value={status} onChange={(event) => setStatus(event.target.value)}>
                {OUTCOMES.map((outcome) => (
                  <option key={outcome.value} value={outcome.value}>
                    {outcome.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Evidence reference (optional)"
              htmlFor="verification-evidence-reference"
              hint="A record number, document reference or inspection reference. Do not paste sensitive personal data."
            >
              <Input
                id="verification-evidence-reference"
                maxLength={255}
                value={evidenceReference}
                onChange={(event) => setEvidenceReference(event.target.value)}
                placeholder="e.g. INSP-2026-0142"
              />
            </Field>

            <Field
              label={status === "verified" ? "Review notes (required if no evidence reference)" : "Review notes"}
              htmlFor="verification-notes"
              hint="Describe what was checked and what the evidence showed. Be factual."
            >
              <Textarea
                id="verification-notes"
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-24"
                placeholder="e.g. Visited the property, met the caretaker and confirmed the advertised unit is vacant."
              />
            </Field>

            {status === "failed" ? (
              <Field label="Rejection reason" htmlFor="verification-rejection" required>
                <Textarea
                  id="verification-rejection"
                  required
                  minLength={3}
                  maxLength={2000}
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  className="min-h-20"
                  placeholder="e.g. The ownership document did not match the recorded owner."
                />
              </Field>
            ) : null}

            {status === "verified" ? (
              <Field
                label="Valid for (days, optional)"
                htmlFor="verification-expiry"
                hint="Set a review window if the evidence can go stale. Leave blank if it does not expire."
              >
                <Input
                  id="verification-expiry"
                  type="number"
                  min={1}
                  max={730}
                  inputMode="numeric"
                  value={expiresInDays}
                  onChange={(event) => setExpiresInDays(event.target.value)}
                  placeholder="e.g. 180"
                />
              </Field>
            ) : null}

            {status === "verified" ? (
              <InlineNote tone="warning">
                <span className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Confirm that the evidence is genuine, belongs to this property or person, and actually supports the
                    selected check. A verified badge must never be used to imply more than this check covers.
                  </span>
                </span>
              </InlineNote>
            ) : null}

            {status === "failed" ? (
              <InlineNote tone="warning">
                <span className="flex items-start gap-2">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    The owner will be notified that the check failed. The reason should be specific enough to act on
                    without exposing private evidence.
                  </span>
                </span>
              </InlineNote>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} variant={status === "failed" ? "danger" : "primary"}>
                Record outcome
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
