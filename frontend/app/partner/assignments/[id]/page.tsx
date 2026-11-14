"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage, validationDetails } from "@/lib/api";
import type { PartnerAssignment } from "@/lib/types";
import { formatDate, formatDateTime, formatKes, titleize } from "@/lib/utils";

const REPORT_TYPES = [
  { value: "investigation", label: "Local investigation" },
  { value: "availability_check", label: "Availability check" },
  { value: "viewing", label: "Viewing support" },
  { value: "inspection", label: "Physical inspection" },
];

const FINDING_KEYS = [
  { key: "met_contact", label: "I met or spoke with a genuine contact" },
  { key: "property_available", label: "The property was available at the time of the visit" },
  { key: "photos_matched", label: "The listing photos matched the property" },
  { key: "description_accurate", label: "The listing description was accurate" },
  { key: "rent_confirmed", label: "The advertised rent was confirmed" },
  { key: "access_issues", label: "There were access or condition issues" },
  { key: "safety_concern", label: "I observed a safety or fraud concern" },
] as const;

export default function PartnerAssignmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canReport = hasPermission("partner:reports");
  const [accepting, setAccepting] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [reportType, setReportType] = useState("investigation");
  const [summary, setSummary] = useState("");
  const [propertyFound, setPropertyFound] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [photoLinks, setPhotoLinks] = useState("");
  const [findings, setFindings] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const assignmentQuery = useQuery({
    queryKey: ["partner-assignment", id],
    queryFn: () => api.get<{ assignment: PartnerAssignment }>(`/partners/assignments/${id}`),
    enabled: Boolean(id),
  });

  const assignment = assignmentQuery.data?.assignment;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["partner-assignment", id] });
    await queryClient.invalidateQueries({ queryKey: ["partner-assignments"] });
    await queryClient.invalidateQueries({ queryKey: ["partner-performance"] });
  }

  async function accept() {
    if (!assignment) return;
    setAccepting(true);
    try {
      const result = await api.post<{ message: string }>(`/partners/assignments/${assignment.id}/accept`, {});
      await refresh();
      toast({ title: "Assignment accepted", description: result.message, tone: "success" });
    } catch (error) {
      toast({ title: "Could not accept the assignment", description: errorMessage(error), tone: "error" });
    } finally {
      setAccepting(false);
    }
  }

  async function decline(event: React.FormEvent) {
    event.preventDefault();
    if (!assignment) return;
    setDeclining(true);
    try {
      const result = await api.post<{ message: string }>(`/partners/assignments/${assignment.id}/decline`, {
        reason: declineReason.trim() || null,
      });
      await refresh();
      setDeclineOpen(false);
      setDeclineReason("");
      toast({ title: "Assignment declined", description: result.message, tone: "info" });
    } catch (error) {
      toast({ title: "Could not decline the assignment", description: errorMessage(error), tone: "error" });
    } finally {
      setDeclining(false);
    }
  }

  async function submitReport(event: React.FormEvent) {
    event.preventDefault();
    if (!assignment) return;
    if (summary.trim().length < 10) {
      toast({ title: "Describe what you found", description: "The summary must be at least 10 characters.", tone: "error" });
      return;
    }
    setSubmitting(true);
    try {
      const photos = photoLinks
        .split(/[\n,]/)
        .map((link) => link.trim())
        .filter(Boolean);
      const result = await api.post<{ message: string }>(`/partners/assignments/${assignment.id}/reports`, {
        report_type: reportType,
        summary: summary.trim(),
        findings,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
        property_found: propertyFound,
        photos,
      });
      await refresh();
      setSummary("");
      setPropertyFound(false);
      setContactName("");
      setContactPhone("");
      setPhotoLinks("");
      setFindings({});
      toast({ title: "Field report submitted", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not submit the report",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (assignmentQuery.isError) {
    return (
      <ErrorState
        title="This assignment could not load"
        description="It may belong to another partner or may no longer be available."
        retry={() => assignmentQuery.refetch()}
      />
    );
  }

  if (assignmentQuery.isLoading || !assignment) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const canAccept = assignment.status === "offered";
  const canDecline = assignment.status === "offered";
  const canSubmitReport = canReport && ["accepted", "in_progress"].includes(assignment.status);

  return (
    <div className="space-y-6">
      <Link
        href="/partner/assignments"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All assignments
      </Link>

      <PageHeader
        eyebrow="Assignment"
        title={assignment.reference}
        description={`Offered ${formatDate(assignment.created_at)}${assignment.due_at ? ` · due ${formatDate(assignment.due_at)}` : ""}`}
        actions={
          <>
            <StatusBadge status={assignment.status} />
            {canAccept ? (
              <Button onClick={accept} loading={accepting}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Accept assignment
              </Button>
            ) : null}
            {canDecline ? (
              <Button variant="outline" onClick={() => setDeclineOpen(true)}>
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Decline
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <div className="space-y-6">
          <section className="surface p-5" aria-labelledby="request-heading">
            <h2 id="request-heading" className="font-display text-lg font-bold text-ink-900">
              What the seeker needs
            </h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Location</dt>
                <dd className="mt-1 flex items-start gap-1.5 text-sm font-medium text-ink-800">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                  {[assignment.request.neighbourhood, assignment.request.town].filter(Boolean).join(", ") ||
                    "Shared by the support team"}
                </dd>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Budget</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">
                  {assignment.request.budget_min ? `${formatKes(assignment.request.budget_min)} – ` : "Up to "}
                  {formatKes(assignment.request.budget_max)}
                </dd>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Category and type</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">
                  {titleize(assignment.request.category)} ·{" "}
                  {assignment.request.property_type ? titleize(assignment.request.property_type) : "Any suitable type"}
                </dd>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Contact preference</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">{titleize(assignment.request.contact_method)}</dd>
              </div>
            </dl>

            {assignment.request.requirements ? (
              <div className="mt-3 rounded-xl border border-ink-900/10 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Seeker brief</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-600">
                  {assignment.request.requirements}
                </p>
              </div>
            ) : null}

            {assignment.instructions ? (
              <div className="mt-3 rounded-xl border border-sand-300 bg-sand-100 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">Instructions from support</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-700">{assignment.instructions}</p>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                {assignment.request.guest_name ?? "Seeker name shared by support"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {assignment.request.guest_phone ?? "Contact via support team"}
              </span>
            </div>
          </section>

          {canSubmitReport ? (
            <section className="surface p-5 sm:p-6" aria-labelledby="report-form-heading">
              <h2 id="report-form-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
                <FileText className="h-5 w-5 text-teal-600" aria-hidden="true" />
                Submit a field report
              </h2>
              <p className="mt-1 text-xs leading-5 text-ink-500">
                Record only what you actually observed. Support staff review reports before sharing anything with the
                seeker.
              </p>

              <form onSubmit={submitReport} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Report type" htmlFor="report-type" required>
                    <Select id="report-type" value={reportType} onChange={(event) => setReportType(event.target.value)}>
                      {REPORT_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Contact name (optional)" htmlFor="report-contact-name">
                    <Input
                      id="report-contact-name"
                      maxLength={160}
                      value={contactName}
                      onChange={(event) => setContactName(event.target.value)}
                      placeholder="Who did you speak to?"
                    />
                  </Field>
                </div>

                <Field label="Contact phone (optional)" htmlFor="report-contact-phone" hint="Only record a number you were given permission to share with the Findora team.">
                  <Input
                    id="report-contact-phone"
                    type="tel"
                    maxLength={20}
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                    placeholder="+254 7XX XXX XXX"
                  />
                </Field>

                <Checkbox
                  label="I found the property or a genuine representative"
                  checked={propertyFound}
                  onChange={(event) => setPropertyFound(event.target.checked)}
                />

                <fieldset>
                  <legend className="label">What did you observe?</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {FINDING_KEYS.map((item) => (
                      <Checkbox
                        key={item.key}
                        label={item.label}
                        checked={Boolean(findings[item.key])}
                        onChange={(event) =>
                          setFindings((current) => ({ ...current, [item.key]: event.target.checked }))
                        }
                      />
                    ))}
                  </div>
                </fieldset>

                <Field label="Summary" htmlFor="report-summary" required hint="At least 10 characters. Be factual and specific.">
                  <Textarea
                    id="report-summary"
                    required
                    minLength={10}
                    maxLength={5000}
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    className="min-h-32"
                    placeholder="What did you find? Who did you speak to? What is the actual availability and condition?"
                  />
                </Field>

                <Field
                  label="Photo links (optional)"
                  htmlFor="report-photos"
                  hint="One real link per line. Do not paste links to unrelated or stock images."
                >
                  <Textarea
                    id="report-photos"
                    value={photoLinks}
                    onChange={(event) => setPhotoLinks(event.target.value)}
                    className="min-h-20"
                    placeholder="https://…"
                  />
                </Field>

                <InlineNote tone="warning">
                  <span className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      Do not invent findings to complete an assignment. If the property could not be found or checked,
                      say so honestly. False reports are audited and can end the partnership.
                    </span>
                  </span>
                </InlineNote>

                <Button type="submit" loading={submitting} disabled={!summary.trim()}>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Submit field report
                </Button>
              </form>
            </section>
          ) : (
            <InlineNote tone="info">
              {canReport
                ? "Accept the assignment before submitting a field report."
                : "Your account does not include field-report submission permission. A data-collection partner can still accept assignments; contact support if you need report access."}
            </InlineNote>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="surface p-5" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="flex items-center gap-2 font-display text-base font-bold text-ink-900">
              <CalendarClock className="h-4 w-4 text-teal-600" aria-hidden="true" />
              Assignment progress
            </h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-2 border-b border-ink-900/10 pb-2">
                <dt className="text-ink-400">Status</dt>
                <dd>
                  <StatusBadge status={assignment.status} />
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-ink-900/10 pb-2">
                <dt className="text-ink-400">Offered</dt>
                <dd className="text-ink-700">{formatDate(assignment.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-ink-900/10 pb-2">
                <dt className="text-ink-400">Accepted</dt>
                <dd className="text-ink-700">{assignment.accepted_at ? formatDate(assignment.accepted_at) : "Not yet"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-400">Completed</dt>
                <dd className="text-ink-700">{assignment.completed_at ? formatDate(assignment.completed_at) : "Not yet"}</dd>
              </div>
            </dl>
            {assignment.declined_reason ? (
              <p className="mt-2 rounded-lg bg-terracotta-100 px-3 py-2 text-xs leading-5 text-terracotta-800">
                Declined: {assignment.declined_reason}
              </p>
            ) : null}
            <p className="mt-3 text-[12px] leading-5 text-ink-400">
              Completing an assignment is recorded by support after the report is reviewed. Submitting a report does not
              automatically mark the assignment complete.
            </p>
          </section>

          <section className="surface p-5" aria-labelledby="reports-heading">
            <h2 id="reports-heading" className="flex items-center gap-2 font-display text-base font-bold text-ink-900">
              <ClipboardList className="h-4 w-4 text-teal-600" aria-hidden="true" />
              Field reports ({assignment.reports.length})
            </h2>
            {assignment.reports.length ? (
              <ul className="mt-3 space-y-3">
                {assignment.reports.map((report) => (
                  <li key={report.id} className="rounded-xl border border-ink-900/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-ink-800">{titleize(report.report_type)}</p>
                      <StatusBadge status={report.status} />
                    </div>
                    <p className="mt-1 text-[12px] text-ink-400">
                      Submitted {formatDateTime(report.submitted_at)}
                      {report.reviewed_at ? ` · reviewed ${formatDateTime(report.reviewed_at)}` : ""}
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-ink-600">{report.summary}</p>
                    <p className="mt-1 text-[12px] text-ink-400">
                      Property found: {report.property_found ? "yes" : "no"} · Photos: {report.photos.length}
                    </p>
                    {report.review_notes ? (
                      <p className="mt-1.5 rounded-lg bg-teal-50 px-2.5 py-2 text-xs leading-5 text-teal-900/85">
                        <strong className="font-semibold">Support review:</strong> {report.review_notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-500">No field reports submitted for this assignment yet.</p>
            )}
          </section>

          <InlineNote>
            <span className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Keep seeker details confidential. Do not ask a seeker for payment, and do not promise that a property
                will be reserved.
              </span>
            </span>
          </InlineNote>

          <Badge tone="slate">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {assignment.request.reference}
          </Badge>
        </aside>
      </div>

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title="Decline this assignment?"
        description="The support team will see that you cannot take it and can assign another partner."
        size="sm"
      >
        <form onSubmit={decline} className="space-y-4">
          <Field label="Reason (optional)" htmlFor="decline-reason">
            <Textarea
              id="decline-reason"
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value)}
              maxLength={1000}
              className="min-h-20"
              placeholder="e.g. The area is outside my current transport range."
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setDeclineOpen(false)}>
              Keep assignment
            </Button>
            <Button type="submit" variant="danger" loading={declining}>
              Decline assignment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
