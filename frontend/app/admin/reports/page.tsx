"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  Flag,
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
import type { PropertyReport } from "@/lib/types";
import { formatDateTime, titleize } from "@/lib/utils";

type ReportListResponse = { reports: PropertyReport[]; count: number };

const STATUS_OPTIONS = [
  { value: "", label: "All reports" },
  { value: "open", label: "Open" },
  { value: "reviewing", label: "Reviewing" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

export default function AdminReportsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<PropertyReport | null>(null);
  const [outcome, setOutcome] = useState("reviewing");
  const [resolution, setResolution] = useState("");
  const [saving, setSaving] = useState(false);

  const reportsQuery = useQuery({
    queryKey: ["admin-reports", status],
    queryFn: () =>
      api.get<ReportListResponse>("/admin/reports", {
        status: status || undefined,
      }),
    enabled: hasPermission("complaint:manage"),
  });

  const reports = reportsQuery.data?.reports ?? [];

  function openReview(report: PropertyReport) {
    setSelected(report);
    setOutcome(report.status === "open" ? "reviewing" : report.status === "resolved" ? "resolved" : report.status);
    setResolution(report.resolution ?? "");
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
      const result = await api.patch<{ message: string }>(`/admin/reports/${selected.id}`, {
        status: outcome,
        resolution: resolution.trim(),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-reports"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-properties"] }),
      ]);
      setSelected(null);
      toast({ title: "Report updated", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not update the report",
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
          title="Property reports"
          description="Your staff role does not include report management permission."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only moderators, support officers and super administrators can review property reports.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trust and safety"
        title="Property reports"
        description="Investigate reports about misleading, unavailable or fraudulent listings. A report is a signal, not a proven fact. Record what you actually found."
        actions={
          <Badge tone={reports.some((report) => ["open", "reviewing"].includes(report.status)) ? "sand" : "green"} dot>
            {reports.filter((report) => ["open", "reviewing"].includes(report.status)).length} open
          </Badge>
        }
      />

      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Status" htmlFor="report-status" className="sm:w-64">
          <Select id="report-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs leading-5 text-ink-400 sm:pb-2">
          Resolving a report notifies the reporter. Suspending or rejecting a listing is a separate moderation action
          with its own reason and audit record.
        </p>
      </div>

      {reportsQuery.isError ? (
        <ErrorState
          title="Reports could not load"
          description="We could not reach the property report records."
          retry={() => reportsQuery.refetch()}
        />
      ) : reportsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : reports.length ? (
        <div className="space-y-3">
          {reports.map((report) => (
            <article key={report.id} className="surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-ink-900">{report.property_title}</h2>
                    <StatusBadge status={report.status} />
                    <Badge tone="amber">
                      <Flag className="h-3 w-3" aria-hidden="true" />
                      {titleize(report.reason)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {report.property_reference} · reported {formatDateTime(report.created_at)}
                    {report.reporter_phone ? ` · reporter ${report.reporter_phone}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {report.property_id ? (
                    <Link
                      href={`/admin/properties?q=${encodeURIComponent(report.property_reference ?? "")}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
                    >
                      Find listing
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => openReview(report)}>
                    {report.status === "resolved" || report.status === "dismissed" ? "View outcome" : "Review report"}
                  </Button>
                </div>
              </div>

              <p className="mt-2 whitespace-pre-line rounded-lg bg-ivory-100 px-3 py-2 text-sm leading-6 text-ink-600">
                {report.details}
              </p>

              {report.resolution ? (
                <p className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-900">
                  <strong className="font-semibold">Outcome:</strong> {report.resolution}
                  {report.resolved_at ? <span className="ml-1 text-teal-700">· {formatDateTime(report.resolved_at)}</span> : null}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
          title="No property reports in this view"
          description="Reports submitted by seekers and the public appear here. The console does not invent reports to fill the queue."
        />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Review property report"
        description="Record the factual outcome. The reporter is notified with the status and resolution."
        size="md"
      >
        {selected ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-600">
              <p className="font-semibold text-ink-800">{selected.property_title}</p>
              <p className="mt-0.5">
                {selected.property_reference} · {titleize(selected.reason)} · reported {formatDateTime(selected.created_at)}
              </p>
              <p className="mt-1 whitespace-pre-line text-ink-600">{selected.details}</p>
            </div>

            <Field label="Outcome" htmlFor="report-outcome" required>
              <Select id="report-outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
                <option value="reviewing">Reviewing — investigation is ongoing</option>
                <option value="resolved">Resolved — action taken or issue confirmed</option>
                <option value="dismissed">Dismissed — no action needed</option>
              </Select>
            </Field>

            <Field
              label="Resolution notes"
              htmlFor="report-resolution"
              required
              hint="This is shared with the reporter. Be factual and avoid exposing private information."
            >
              <Textarea
                id="report-resolution"
                required
                minLength={3}
                maxLength={2000}
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                className="min-h-28"
                placeholder="e.g. Visited the property with the owner and confirmed the advertised rent. Listing corrected."
              />
            </Field>

            {outcome === "dismissed" ? (
              <InlineNote tone="warning">
                <span className="flex items-start gap-2">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Dismiss only when the report has no basis. If the listing needs attention, use moderation actions instead.</span>
                </span>
              </InlineNote>
            ) : null}

            {outcome === "reviewing" ? (
              <InlineNote tone="info">
                <span className="flex items-start gap-2">
                  <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>The report stays open while you investigate. Add notes again when you have a final outcome.</span>
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
    </div>
  );
}
