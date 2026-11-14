"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  Handshake,
  MapPin,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage, validationDetails } from "@/lib/api";
import type { AdminFieldReport, AdminFieldReportListResponse } from "@/lib/types";
import { formatDateTime, titleize } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "", label: "All reports" },
  { value: "submitted", label: "Awaiting review" },
  { value: "reviewed", label: "Reviewed" },
  { value: "needs_revision", label: "Needs revision" },
];

export default function AdminFieldReportsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<AdminFieldReport | null>(null);
  const [outcome, setOutcome] = useState("reviewed");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reportsQuery = useQuery({
    queryKey: ["admin-field-reports", status],
    queryFn: () =>
      api.get<AdminFieldReportListResponse>("/admin/field-reports", {
        status: status || undefined,
      }),
    enabled: hasPermission("assisted:manage"),
  });

  const reports = reportsQuery.data?.reports ?? [];

  function openReview(report: AdminFieldReport) {
    setSelected(report);
    setOutcome("reviewed");
    setNotes("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (notes.trim().length < 3) {
      toast({
        title: "Add review notes",
        description: "Record what you checked before accepting or returning the report.",
        tone: "error",
      });
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{ message: string }>(`/admin/field-reports/${selected.id}/review`, {
        status: outcome,
        notes: notes.trim(),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-field-reports"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-requests"] }),
      ]);
      setSelected(null);
      setNotes("");
      toast({ title: "Field report reviewed", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not review the field report",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission("assisted:manage")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Assisted search"
          title="Field reports"
          description="Your staff role does not include assisted-search management permission."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only support officers and super administrators can review local investigation reports.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assisted search"
        title="Field reports"
        description="Review findings submitted by local partners after an assigned investigation. Accept a report only when the evidence and notes support it; accepting completes the assignment."
        actions={
          <Badge tone={reports.some((report) => report.status === "submitted") ? "sand" : "green"} dot>
            {reports.filter((report) => report.status === "submitted").length} awaiting review
          </Badge>
        }
      />

      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Status" htmlFor="field-report-status" className="sm:w-64">
          <Select
            id="field-report-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs leading-5 text-ink-400 sm:pb-2">
          Field reports describe what a partner observed. They are not verification evidence until reviewed and recorded
          against the correct property check.
        </p>
      </div>

      {reportsQuery.isError ? (
        <ErrorState
          title="Field reports could not load"
          description="We could not reach the local investigation records."
          retry={() => reportsQuery.refetch()}
        />
      ) : reportsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : reports.length ? (
        <div className="space-y-3">
          {reports.map((report) => (
            <article key={report.id} className="surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-ink-900">
                      {titleize(report.report_type)} report
                    </h2>
                    <StatusBadge status={report.status} />
                    <Badge tone={report.property_found ? "green" : "amber"} dot>
                      {report.property_found ? "Property found" : "Property not found"}
                    </Badge>
                    {report.photos.length ? <Badge tone="slate">{report.photos.length} photos</Badge> : null}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <Handshake className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                      {report.partner_name ?? "Partner not recorded"}
                    </span>
                    {report.assignment_reference ? <span>Assignment {report.assignment_reference}</span> : null}
                    {report.request_reference ? <span>Request {report.request_reference}</span> : null}
                    <span>Submitted {formatDateTime(report.submitted_at)}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {report.request_id ? (
                    <Link
                      href={`/admin/requests/${report.request_id}`}
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      Open request
                    </Link>
                  ) : null}
                  {report.status === "submitted" ? (
                    <Button size="sm" onClick={() => openReview(report)}>
                      <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Review report
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => openReview(report)}>
                      <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                      View details
                    </Button>
                  )}
                </div>
              </div>

              <p className="mt-2 whitespace-pre-line rounded-lg bg-ivory-100 px-3 py-2 text-sm leading-6 text-ink-600">
                {report.summary}
              </p>

              <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-lg border border-ink-900/10 px-2.5 py-2">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Contact recorded</dt>
                  <dd className="mt-0.5 font-medium text-ink-700">
                    {report.contact_name ?? "Not recorded"}
                    {report.contact_phone ? ` · ${report.contact_phone}` : ""}
                  </dd>
                </div>
                <div className="rounded-lg border border-ink-900/10 px-2.5 py-2">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Findings</dt>
                  <dd className="mt-0.5 font-medium text-ink-700">
                    {Object.keys(report.findings).length
                      ? Object.keys(report.findings).map((key) => titleize(key)).join(", ")
                      : "No structured findings"}
                  </dd>
                </div>
                <div className="rounded-lg border border-ink-900/10 px-2.5 py-2">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Reviewed</dt>
                  <dd className="mt-0.5 font-medium text-ink-700">
                    {report.reviewed_at ? formatDateTime(report.reviewed_at) : "Not yet reviewed"}
                  </dd>
                </div>
              </dl>

              {report.review_notes ? (
                <p className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-900">
                  <strong className="font-semibold">Review notes:</strong> {report.review_notes}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
          title="No field reports in this view"
          description="Reports appear when an assigned local partner submits their investigation. The console does not invent field findings."
        />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${titleize(selected.report_type)} field report` : "Field report"}
        description="Review the partner's findings. Accepting completes the assignment and increments the partner's completed count."
        size="md"
      >
        {selected ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-600">
              <p className="font-semibold text-ink-800">
                {selected.partner_name ?? "Partner"} · {selected.assignment_reference ?? "No assignment reference"}
              </p>
              <p className="mt-0.5">
                {selected.request_reference ? `Request ${selected.request_reference} · ` : ""}
                Submitted {formatDateTime(selected.submitted_at)}
              </p>
              <p className="mt-0.5">Contact: {selected.contact_name ?? "not recorded"}{selected.contact_phone ? ` · ${selected.contact_phone}` : ""}</p>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Summary</p>
              <p className="mt-1 whitespace-pre-line rounded-xl border border-ink-900/10 px-3.5 py-3 text-sm leading-6 text-ink-600">
                {selected.summary}
              </p>
            </div>

            {Object.keys(selected.findings).length ? (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Structured findings</p>
                <dl className="mt-1.5 space-y-1.5">
                  {Object.entries(selected.findings).map(([key, value]) => (
                    <div key={key} className="flex flex-wrap gap-x-2 rounded-lg bg-ivory-100 px-2.5 py-1.5 text-xs">
                      <dt className="font-semibold text-ink-700">{titleize(key)}</dt>
                      <dd className="text-ink-600">
                        {typeof value === "object" ? JSON.stringify(value) : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {selected.photos.length ? (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Photos</p>
                <ul className="mt-1.5 grid grid-cols-3 gap-2">
                  {selected.photos.map((photo, index) => (
                    <li key={`${photo}-${index}`} className="overflow-hidden rounded-lg border border-ink-900/10 bg-ivory-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt={`Field report photo ${index + 1}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <InlineNote tone="warning">
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>This report has no photos. Consider whether the written findings are enough before accepting it.</span>
                </span>
              </InlineNote>
            )}

            {selected.review_notes ? (
              <InlineNote tone="info">
                <strong className="font-semibold">Previous review:</strong> {selected.review_notes}
              </InlineNote>
            ) : null}

            {selected.status === "submitted" ? (
              <form onSubmit={submit} className="space-y-4 border-t border-ink-900/10 pt-4">
                <Field label="Outcome" htmlFor="field-report-outcome" required>
                  <Select
                    id="field-report-outcome"
                    value={outcome}
                    onChange={(event) => setOutcome(event.target.value)}
                  >
                    <option value="reviewed">Reviewed — accept the findings</option>
                    <option value="needs_revision">Needs revision — send back to the partner</option>
                  </Select>
                </Field>
                <Field label="Review notes" htmlFor="field-report-notes" required>
                  <Textarea
                    id="field-report-notes"
                    required
                    minLength={3}
                    maxLength={2000}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="min-h-24"
                    placeholder="What did you check, and what should happen next?"
                  />
                </Field>
                {outcome === "needs_revision" ? (
                  <InlineNote tone="warning">
                    <span className="flex items-start gap-2">
                      <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>The partner will see your notes and can resubmit the report. Be specific about what is missing.</span>
                    </span>
                  </InlineNote>
                ) : (
                  <InlineNote tone="warning">
                    <span className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        Accepting does not verify the property. Record any verified outcomes separately against the correct
                        verification check.
                      </span>
                    </span>
                  </InlineNote>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={saving}
                    variant={outcome === "needs_revision" ? "danger" : "primary"}
                  >
                    {outcome === "needs_revision" ? "Request revision" : "Accept report"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex justify-end border-t border-ink-900/10 pt-4">
                <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <InlineNote tone="info">
        <span className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Field reports are one input into assisted search. They do not replace the seeker&apos;s own viewing and do
            not confirm availability after the report date.
          </span>
        </span>
      </InlineNote>
    </div>
  );
}
