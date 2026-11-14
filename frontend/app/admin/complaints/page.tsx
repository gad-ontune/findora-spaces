"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  MessageSquareWarning,
  RotateCcw,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage, validationDetails } from "@/lib/api";
import type { Complaint } from "@/lib/types";
import { formatDateTime, titleize } from "@/lib/utils";

type ComplaintListResponse = { complaints: Complaint[]; count: number };

const STATUS_OPTIONS = [
  { value: "", label: "All complaints" },
  { value: "open", label: "Open" },
  { value: "reviewing", label: "Reviewing" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

export default function AdminComplaintsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [outcome, setOutcome] = useState("reviewing");
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);

  const complaintsQuery = useQuery({
    queryKey: ["admin-complaints", status],
    queryFn: () =>
      api.get<ComplaintListResponse>("/admin/complaints", {
        status: status || undefined,
      }),
    enabled: hasPermission("complaint:manage"),
  });

  const complaints = complaintsQuery.data?.complaints ?? [];

  function openReview(complaint: Complaint) {
    setSelected(complaint);
    setOutcome(complaint.status === "open" ? "reviewing" : complaint.status);
    setResolution(complaint.resolution ?? "");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (resolution.trim().length < 3) {
      toast({
        title: "Record the resolution",
        description: "Explain what was found and what action was taken.",
        tone: "error",
      });
      return;
    }
    setSaving(true);
    try {
      const result = await api.patch<{ message: string }>(`/admin/complaints/${selected.id}`, {
        status: outcome,
        resolution: resolution.trim(),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-complaints"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }),
      ]);
      setSelected(null);
      toast({ title: "Complaint updated", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not update the complaint",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission("complaint:manage")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Trust and safety"
          title="Complaints"
          description="Your staff role does not include complaint management permission."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only moderators, support officers and super administrators can review complaints.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trust and safety"
        title="Complaints"
        description="Handle complaints about the service, a property or an assisted search. Assign yourself, investigate, and record an honest resolution. The complainant is notified when the status changes."
        actions={
          <Badge tone={complaints.some((complaint) => ["open", "reviewing"].includes(complaint.status)) ? "sand" : "green"} dot>
            {complaints.filter((complaint) => ["open", "reviewing"].includes(complaint.status)).length} open
          </Badge>
        }
      />

      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Status" htmlFor="complaint-status" className="sm:w-64">
          <Select id="complaint-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs leading-5 text-ink-400 sm:pb-2">
          Complaints are not listing moderation. If a complaint reveals a misleading listing, suspend it through the
          property review workflow as well.
        </p>
      </div>

      {complaintsQuery.isError ? (
        <ErrorState
          title="Complaints could not load"
          description="We could not reach the complaint records."
          retry={() => complaintsQuery.refetch()}
        />
      ) : complaintsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : complaints.length ? (
        <div className="space-y-3">
          {complaints.map((complaint) => (
            <article key={complaint.id} className="surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-ink-900">{complaint.reference}</h2>
                    <StatusBadge status={complaint.status} />
                    <Badge tone="slate">{titleize(complaint.category)}</Badge>
                    <Badge tone={complaint.priority === "high" || complaint.priority === "urgent" ? "red" : "amber"}>
                      {titleize(complaint.priority)} priority
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {complaint.complainant_name ?? "Complainant not named"} · submitted {formatDateTime(complaint.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {complaint.property_id ? (
                    <Link
                      href={`/admin/properties?q=${encodeURIComponent(complaint.property_id)}`}
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      Related property
                    </Link>
                  ) : null}
                  {complaint.search_request_id ? (
                    <Link
                      href={`/admin/requests/${complaint.search_request_id}`}
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      Related request
                    </Link>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => openReview(complaint)}>
                    {complaint.status === "resolved" || complaint.status === "dismissed" ? "View outcome" : "Review complaint"}
                  </Button>
                </div>
              </div>

              <p className="mt-2 whitespace-pre-line rounded-lg bg-ivory-100 px-3 py-2 text-sm leading-6 text-ink-600">
                {complaint.description}
              </p>

              {complaint.resolution ? (
                <p className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-900">
                  <strong className="font-semibold">Resolution:</strong> {complaint.resolution}
                  {complaint.resolved_at ? (
                    <span className="ml-1 text-teal-700">· {formatDateTime(complaint.resolved_at)}</span>
                  ) : null}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
          title="No complaints in this view"
          description="Complaints submitted by users appear here. The console does not invent complaints."
        />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Review complaint"
        description="The complainant is notified with the new status and resolution."
        size="md"
      >
        {selected ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-600">
              <p className="font-semibold text-ink-800">
                {selected.reference} · {titleize(selected.category)}
              </p>
              <p className="mt-0.5">
                {selected.complainant_name ?? "Complainant not named"} · submitted {formatDateTime(selected.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-line">{selected.description}</p>
            </div>

            <Field label="Outcome" htmlFor="complaint-outcome" required>
              <Select id="complaint-outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
                <option value="reviewing">Reviewing — investigation is ongoing</option>
                <option value="resolved">Resolved — action taken</option>
                <option value="dismissed">Dismissed — no action needed</option>
              </Select>
            </Field>

            <Field
              label="Resolution notes"
              htmlFor="complaint-resolution"
              required
              hint="This is shared with the complainant. Be factual and do not expose another person's private data."
            >
              <Textarea
                id="complaint-resolution"
                required
                minLength={3}
                maxLength={3000}
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                className="min-h-28"
                placeholder="e.g. Contacted the seeker and the landlord; the viewing was rescheduled and completed."
              />
            </Field>

            {outcome === "dismissed" ? (
              <InlineNote tone="warning">
                <span className="flex items-start gap-2">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Explain why the complaint does not require action so the record is clear.</span>
                </span>
              </InlineNote>
            ) : null}

            {outcome === "reviewing" ? (
              <InlineNote tone="info">
                <span className="flex items-start gap-2">
                  <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>The complaint stays open while you investigate. Update it again when you reach a final outcome.</span>
                </span>
              </InlineNote>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-ink-900/10 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving} variant={outcome === "dismissed" ? "secondary" : "primary"}>
                Save outcome
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <InlineNote tone="info">
        <span className="flex items-start gap-2">
          <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Complaint handling is audited. Never mark a complaint resolved without a genuine investigation and a
            resolution the complainant can understand.
          </span>
        </span>
      </InlineNote>
    </div>
  );
}
