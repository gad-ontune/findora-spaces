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
  Handshake,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  SearchCheck,
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
import type {
  AdminMatchesResponse,
  AdminPartnerListResponse,
  AdminSearchRequestDetail,
  MatchSuggestion,
  PartnerFieldReport,
} from "@/lib/types";
import { formatDate, formatDateTime, formatKes, titleize } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  received: "Received",
  under_review: "Under review",
  matching: "Matching",
  awaiting_local_investigation: "Awaiting local investigation",
  partner_assigned: "Partner assigned",
  investigation_in_progress: "Investigation in progress",
  matches_available: "Matches available",
  awaiting_seeker_response: "Awaiting seeker response",
  viewing_requested: "Viewing requested",
  viewing_confirmed: "Viewing confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  unable_to_find_suitable_match: "No suitable match",
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  submitted: ["received", "cancelled"],
  received: ["under_review", "cancelled", "unable_to_find_suitable_match"],
  under_review: ["matching", "awaiting_local_investigation", "matches_available", "unable_to_find_suitable_match", "cancelled"],
  matching: ["under_review", "awaiting_local_investigation", "matches_available", "unable_to_find_suitable_match", "cancelled"],
  awaiting_local_investigation: ["partner_assigned", "under_review", "matches_available", "unable_to_find_suitable_match", "cancelled"],
  partner_assigned: ["investigation_in_progress", "awaiting_local_investigation", "under_review", "cancelled"],
  investigation_in_progress: ["matches_available", "under_review", "awaiting_local_investigation", "unable_to_find_suitable_match", "cancelled"],
  matches_available: ["awaiting_seeker_response", "viewing_requested", "completed", "unable_to_find_suitable_match", "cancelled"],
  awaiting_seeker_response: ["matches_available", "viewing_requested", "completed", "cancelled", "unable_to_find_suitable_match"],
  viewing_requested: ["viewing_confirmed", "awaiting_seeker_response", "completed", "cancelled"],
  viewing_confirmed: ["completed", "viewing_requested", "cancelled"],
  completed: [],
  cancelled: [],
  unable_to_find_suitable_match: ["under_review"],
};

export default function AdminRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();

  const [statusOpen, setStatusOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState("");
  const [statusNotes, setStatusNotes] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const [matchesOpen, setMatchesOpen] = useState(false);
  const [matchNotes, setMatchNotes] = useState("");
  const [sendingMatches, setSendingMatches] = useState(false);

  const [externalOpen, setExternalOpen] = useState(false);
  const [externalTitle, setExternalTitle] = useState("");
  const [externalDescription, setExternalDescription] = useState("");
  const [externalRent, setExternalRent] = useState("");
  const [externalLocation, setExternalLocation] = useState("");
  const [savingExternal, setSavingExternal] = useState(false);

  const [partnerId, setPartnerId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [messageBody, setMessageBody] = useState("");
  const [internalMessage, setInternalMessage] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

  const [reportToReview, setReportToReview] = useState<PartnerFieldReport | null>(null);
  const [reportOutcome, setReportOutcome] = useState("reviewed");
  const [reportNotes, setReportNotes] = useState("");
  const [reviewingReport, setReviewingReport] = useState(false);

  const requestQuery = useQuery({
    queryKey: ["admin-request", id],
    queryFn: () => api.get<{ request: AdminSearchRequestDetail }>(`/admin/search-requests/${id}`),
    enabled: Boolean(id) && hasPermission("assisted:manage"),
  });

  const matchesQuery = useQuery({
    queryKey: ["admin-request-matches", id],
    queryFn: () => api.get<AdminMatchesResponse>(`/search-requests/${id}/matches`),
    enabled: Boolean(id) && hasPermission("assisted:manage"),
  });

  const partnersQuery = useQuery({
    queryKey: ["admin-active-partners"],
    queryFn: () => api.get<AdminPartnerListResponse>("/admin/partners", { status: "active" }),
    enabled: hasPermission("assisted:manage"),
  });

  const request = requestQuery.data?.request;
  const matches = matchesQuery.data;
  const activePartners = partnersQuery.data?.partners ?? [];

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-request", id] }),
      queryClient.invalidateQueries({ queryKey: ["admin-request-matches", id] }),
      queryClient.invalidateQueries({ queryKey: ["admin-requests"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-field-reports"] }),
    ]);
  }

  function openStatus() {
    const next = ALLOWED_TRANSITIONS[request?.status ?? ""] ?? [];
    setTargetStatus(next[0] ?? "");
    setStatusNotes("");
    setStatusOpen(true);
  }

  async function changeStatus(event: React.FormEvent) {
    event.preventDefault();
    if (!request || !targetStatus) return;
    setSavingStatus(true);
    try {
      const result = await api.post<{ message: string }>(`/admin/search-requests/${request.id}/status`, {
        status: targetStatus,
        notes: statusNotes.trim() || null,
      });
      await refresh();
      setStatusOpen(false);
      toast({ title: "Request status updated", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not update the status",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setSavingStatus(false);
    }
  }

  async function sendMatches(event: React.FormEvent) {
    event.preventDefault();
    if (!request) return;
    setSendingMatches(true);
    try {
      const result = await api.post<{ sent?: number; message: string }>(
        `/admin/search-requests/${request.id}/send-matches`,
        { notes: matchNotes.trim() || null },
      );
      await refresh();
      setMatchesOpen(false);
      setMatchNotes("");
      toast({
        title: result.sent ? "Matches shared" : "No matches shared",
        description: result.message,
        tone: result.sent ? "success" : "info",
      });
    } catch (error) {
      toast({ title: "Could not send matches", description: errorMessage(error), tone: "error" });
    } finally {
      setSendingMatches(false);
    }
  }

  async function addExternalMatch(event: React.FormEvent) {
    event.preventDefault();
    if (!request) return;
    setSavingExternal(true);
    try {
      const result = await api.post<{ message: string }>(`/admin/search-requests/${request.id}/external-match`, {
        title: externalTitle.trim(),
        description: externalDescription.trim() || null,
        rent_amount: externalRent ? Number(externalRent) : null,
        location_text: externalLocation.trim() || null,
      });
      await refresh();
      setExternalOpen(false);
      setExternalTitle("");
      setExternalDescription("");
      setExternalRent("");
      setExternalLocation("");
      toast({ title: "Partner-sourced property recorded", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not record the property",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setSavingExternal(false);
    }
  }

  async function assignPartner(event: React.FormEvent) {
    event.preventDefault();
    if (!request || !partnerId) return;
    setAssigning(true);
    try {
      const result = await api.post<{ message: string }>(`/admin/search-requests/${request.id}/assign`, {
        partner_id: partnerId,
        instructions: instructions.trim() || null,
        due_at: dueAt || null,
      });
      await refresh();
      setPartnerId("");
      setInstructions("");
      setDueAt("");
      toast({ title: "Partner assignment offered", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not assign the partner",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setAssigning(false);
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!request || !messageBody.trim()) return;
    setSendingMessage(true);
    try {
      await api.post(`/search-requests/${request.id}/messages`, {
        body: messageBody.trim(),
        is_internal: internalMessage,
      });
      await refresh();
      setMessageBody("");
      setInternalMessage(false);
      toast({ title: "Message recorded", tone: "success" });
    } catch (error) {
      toast({ title: "Could not send the message", description: errorMessage(error), tone: "error" });
    } finally {
      setSendingMessage(false);
    }
  }

  async function reviewReport(event: React.FormEvent) {
    event.preventDefault();
    if (!reportToReview) return;
    setReviewingReport(true);
    try {
      const result = await api.post<{ message: string }>(`/admin/field-reports/${reportToReview.id}/review`, {
        status: reportOutcome,
        notes: reportNotes.trim(),
      });
      await refresh();
      setReportToReview(null);
      setReportNotes("");
      toast({ title: "Field report reviewed", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not review the field report",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setReviewingReport(false);
    }
  }

  if (!hasPermission("assisted:manage")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Assisted search"
          title="Request detail"
          description="Your staff role does not include assisted-search management permission."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only support officers and super administrators can process assisted search requests.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  if (requestQuery.isError) {
    return (
      <ErrorState
        title="This request could not load"
        description="It may not exist, or your account may not have access to it."
        retry={() => requestQuery.refetch()}
      />
    );
  }

  if (requestQuery.isLoading || !request) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const nextStatuses = ALLOWED_TRANSITIONS[request.status] ?? [];
  const activeAssignment = request.assignments.find((assignment) =>
    ["offered", "accepted", "in_progress"].includes(assignment.status),
  );
  const reportsToReview = request.assignments.flatMap((assignment) =>
    assignment.reports.filter((report) => report.status === "submitted"),
  );

  return (
    <div className="space-y-6">
      <Link
        href="/admin/requests"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All requests
      </Link>

      <PageHeader
        eyebrow="Assisted search"
        title={request.reference}
        description={`${titleize(request.category)} request · created ${formatDate(request.created_at)} · updated ${formatDate(request.updated_at)}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setExternalOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              External match
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMatchesOpen(true)}>
              <Send className="h-4 w-4" aria-hidden="true" />
              Send matches
            </Button>
            <Button size="sm" onClick={openStatus} disabled={nextStatuses.length === 0}>
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              Change status
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={request.status} label={STATUS_LABELS[request.status] ?? titleize(request.status)} />
        <Badge tone="slate">{titleize(request.category)}</Badge>
        <Badge tone={request.consent_to_share ? "green" : "amber"} dot>
          {request.consent_to_share ? "Consent to share with partner" : "No partner-sharing consent"}
        </Badge>
        <Badge tone="slate">{titleize(request.priority)} priority</Badge>
        {request.assigned_support ? <Badge tone="teal">Support: {request.assigned_support}</Badge> : null}
      </div>

      {reportsToReview.length ? (
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ClipboardList className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {reportsToReview.length} field report{reportsToReview.length === 1 ? "" : "s"} awaiting review. Approving a
              report completes the assignment; review the findings before relying on them.
            </span>
          </span>
        </InlineNote>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <div className="space-y-6">
          <section className="surface p-5" aria-labelledby="brief-heading">
            <h2 id="brief-heading" className="font-display text-lg font-bold text-ink-900">
              Seeker brief
            </h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Location</dt>
                <dd className="mt-1 flex items-start gap-1.5 text-sm font-medium text-ink-800">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                  {[request.neighbourhood, request.town].filter(Boolean).join(", ") || "Not recorded"}
                  {request.landmark ? <span className="block text-xs text-ink-500">Near {request.landmark}</span> : null}
                </dd>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Budget</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">
                  {request.budget_min ? `${formatKes(request.budget_min)} – ` : "Up to "}
                  {formatKes(request.budget_max)}
                </dd>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Property requirements</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">
                  {request.property_type ? titleize(request.property_type) : "Any suitable type"}
                  {request.bedrooms_min ? ` · ${request.bedrooms_min}+ bedrooms` : ""}
                  {request.floor_area_min ? ` · ${request.floor_area_min} m²+` : ""}
                  {request.frontage_min ? ` · ${request.frontage_min} m frontage+` : ""}
                </dd>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Move-in and use</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">
                  {request.move_in_date ? `Move in ${formatDate(request.move_in_date)}` : "Move-in date flexible"}
                  {request.business_type ? ` · ${request.business_type}` : ""}
                </dd>
              </div>
            </dl>

            <div className="mt-3 rounded-xl border border-ink-900/10 p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Requirements</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-600">
                {request.requirements || "No requirements recorded."}
              </p>
            </div>

            {request.assistance_requirements ? (
              <div className="mt-2 rounded-xl border border-ink-900/10 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Assistance requested</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-600">
                  {request.assistance_requirements}
                </p>
              </div>
            ) : null}

            {request.facilities.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {request.facilities.map((facility) => (
                  <Badge key={facility} tone="slate">
                    {facility}
                  </Badge>
                ))}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                {request.guest_name ?? "Seeker name not recorded"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {request.guest_phone ?? "Phone not recorded"}
              </span>
              <span>Preferred contact: {titleize(request.contact_method)}</span>
              {request.guest_email ? <span>{request.guest_email}</span> : null}
            </div>
          </section>

          <section className="surface p-5" aria-labelledby="matches-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="matches-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
                <SearchCheck className="h-5 w-5 text-teal-600" aria-hidden="true" />
                Matches and suggestions
              </h2>
              {matches ? (
                <span className="text-xs text-ink-400">
                  {matches.strict_count} strict · {matches.alternative_count} alternative ·{" "}
                  {matches.persisted.length} recorded
                </span>
              ) : null}
            </div>

            {matchesQuery.isError ? (
              <InlineNote tone="warning">Match suggestions could not be computed right now.</InlineNote>
            ) : matchesQuery.isLoading || !matches ? (
              <Skeleton className="mt-3 h-24 w-full" />
            ) : (
              <>
                {matches.restrictions.length ? (
                  <div className="mt-3 rounded-xl border border-sand-300 bg-sand-100 p-3 text-xs leading-5 text-ink-600">
                    <p className="font-semibold text-ink-700">Search restrictions</p>
                    <ul className="mt-1 list-inside list-disc">
                      {matches.restrictions.map((restriction) => (
                        <li key={restriction}>{restriction}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Recorded matches</p>
                  {matches.persisted.length ? (
                    <ul className="mt-1.5 space-y-2">
                      {matches.persisted.map((match) => (
                        <li key={match.id} className="rounded-xl border border-ink-900/10 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink-800">
                                {match.title ?? match.property?.title ?? "Property match"}
                              </p>
                              <p className="mt-0.5 text-xs text-ink-500">
                                {match.location_text ?? match.property?.location.town ?? "Location not recorded"} ·{" "}
                                {formatKes(match.rent_amount)}
                                {match.score !== null ? ` · score ${match.score}` : ""} · source {titleize(match.source)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={match.status} />
                              {match.property ? (
                                <Link
                                  href={`/properties/${match.property.id}`}
                                  className="text-xs font-semibold text-teal-700 hover:underline"
                                >
                                  View listing
                                </Link>
                              ) : null}
                            </div>
                          </div>
                          {match.explanation.positives?.length || match.explanation.negatives?.length ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {match.explanation.positives?.map((item) => (
                                <Badge key={`p-${item}`} tone="green">
                                  {item}
                                </Badge>
                              ))}
                              {match.explanation.negatives?.map((item) => (
                                <Badge key={`n-${item}`} tone="amber">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-ink-500">No matches have been shared or recorded yet.</p>
                  )}
                </div>

                <div className="mt-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">
                    Current suggestions (not yet shared)
                  </p>
                  {matches.suggestions.length ? (
                    <ul className="mt-1.5 space-y-2">
                      {matches.suggestions.map((suggestion) => (
                        <SuggestionRow key={suggestion.property.id} suggestion={suggestion} />
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-ink-500">
                      {matches.message || "No genuine database matches were found for this request."}
                    </p>
                  )}
                </div>

                <p className="mt-3 text-[12px] leading-5 text-ink-400">{matches.message}</p>
              </>
            )}
          </section>

          <section className="surface p-5" aria-labelledby="assignments-heading">
            <h2 id="assignments-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
              <Handshake className="h-5 w-5 text-teal-600" aria-hidden="true" />
              Partner assignments
            </h2>
            {request.assignments.length ? (
              <ul className="mt-3 space-y-3">
                {request.assignments.map((assignment) => (
                  <li key={assignment.id} className="rounded-xl border border-ink-900/10 p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-ink-900">{assignment.reference}</p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {assignment.partner_name ?? "Partner"} · offered {formatDate(assignment.created_at)}
                          {assignment.due_at ? ` · due ${formatDate(assignment.due_at)}` : ""}
                        </p>
                      </div>
                      <StatusBadge status={assignment.status} />
                    </div>
                    {assignment.instructions ? (
                      <p className="mt-2 rounded-lg bg-ivory-100 px-3 py-2 text-xs leading-5 text-ink-600">
                        {assignment.instructions}
                      </p>
                    ) : null}
                    {assignment.declined_reason ? (
                      <p className="mt-1 text-xs text-terracotta-700">Declined: {assignment.declined_reason}</p>
                    ) : null}

                    <div className="mt-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">
                        Field reports ({assignment.reports.length})
                      </p>
                      {assignment.reports.length ? (
                        <ul className="mt-1 space-y-1.5">
                          {assignment.reports.map((report) => (
                            <li key={report.id} className="rounded-lg bg-ivory-100 px-3 py-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-ink-800">
                                  {titleize(report.report_type)} · submitted {formatDateTime(report.submitted_at)}
                                </p>
                                <div className="flex items-center gap-1.5">
                                  <StatusBadge status={report.status} />
                                  {report.status === "submitted" ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setReportToReview(report);
                                        setReportOutcome("reviewed");
                                        setReportNotes("");
                                      }}
                                    >
                                      Review report
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                              <p className="mt-1 whitespace-pre-line text-xs leading-5 text-ink-600">{report.summary}</p>
                              <p className="mt-0.5 text-[12px] text-ink-400">
                                Property found: {report.property_found ? "yes" : "no"} · photos: {report.photos.length} ·
                                contact: {report.contact_name ?? "not recorded"}
                              </p>
                              {report.review_notes ? (
                                <p className="mt-1 rounded bg-white px-2 py-1 text-[12px] leading-5 text-teal-900/80">
                                  <strong className="font-semibold">Review:</strong> {report.review_notes}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs text-ink-400">No field reports submitted yet.</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-500">
                No partner assignment has been made. Assign a partner only when local investigation is genuinely needed.
              </p>
            )}
          </section>

          <section className="surface p-5" aria-labelledby="messages-heading">
            <h2 id="messages-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
              <MessageSquare className="h-5 w-5 text-teal-600" aria-hidden="true" />
              Messages
            </h2>
            {request.messages.length ? (
              <ol className="mt-3 space-y-2">
                {request.messages.map((message) => (
                  <li
                    key={message.id}
                    className={
                      message.is_internal
                        ? "rounded-xl border border-sand-300 bg-sand-100 p-3"
                        : "rounded-xl border border-ink-900/10 p-3"
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-ink-800">
                        {message.sender_name}
                        {message.is_internal ? <span className="ml-1.5 text-[11px] text-amber-800">internal</span> : null}
                      </p>
                      <p className="text-[12px] text-ink-400">{formatDateTime(message.created_at)}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-600">{message.body}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-ink-500">No messages recorded yet.</p>
            )}

            <form onSubmit={sendMessage} className="mt-4 space-y-2 border-t border-ink-900/10 pt-3">
              <Field label="New message" htmlFor="request-message">
                <Textarea
                  id="request-message"
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  maxLength={3000}
                  className="min-h-20"
                  placeholder="Share a factual update with the seeker or record an internal note."
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Checkbox
                  label="Internal note (not visible to the seeker)"
                  checked={internalMessage}
                  onChange={(event) => setInternalMessage(event.target.checked)}
                />
                <Button type="submit" size="sm" loading={sendingMessage} disabled={!messageBody.trim()}>
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  Send message
                </Button>
              </div>
            </form>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="surface p-5" aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="font-display text-base font-bold text-ink-900">
              Request summary
            </h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-2 border-b border-ink-900/10 pb-2">
                <dt className="text-ink-400">Status</dt>
                <dd>
                  <StatusBadge status={request.status} label={STATUS_LABELS[request.status] ?? titleize(request.status)} />
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-ink-900/10 pb-2">
                <dt className="text-ink-400">Matches shared</dt>
                <dd className="font-medium text-ink-800">{request.match_count}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-ink-900/10 pb-2">
                <dt className="text-ink-400">Assignments</dt>
                <dd className="font-medium text-ink-800">{request.assignments.length}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-ink-900/10 pb-2">
                <dt className="text-ink-400">Active assignment</dt>
                <dd className="font-medium text-ink-800">{activeAssignment ? activeAssignment.status : "None"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-400">Consent to share</dt>
                <dd className="font-medium text-ink-800">{request.consent_to_share ? "Yes" : "No"}</dd>
              </div>
            </dl>
            {!request.consent_to_share ? (
              <InlineNote tone="warning">
                The seeker has not consented to sharing details with a local partner. Partner assignment is blocked until
                consent is recorded.
              </InlineNote>
            ) : null}
          </section>

          <section className="surface p-5" aria-labelledby="assign-heading">
            <h2 id="assign-heading" className="flex items-center gap-2 font-display text-base font-bold text-ink-900">
              <Handshake className="h-4 w-4 text-teal-600" aria-hidden="true" />
              Assign a partner
            </h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">
              The partner must be active and cover the request town. They must accept before investigating.
            </p>
            <form onSubmit={assignPartner} className="mt-3 space-y-3">
              <Field label="Active partner" htmlFor="assign-partner" required>
                <Select
                  id="assign-partner"
                  required
                  value={partnerId}
                  onChange={(event) => setPartnerId(event.target.value)}
                  disabled={!request.consent_to_share || Boolean(activeAssignment)}
                >
                  <option value="">
                    {activeAssignment
                      ? "An active assignment already exists"
                      : request.consent_to_share
                        ? "Choose a partner"
                        : "Consent required"}
                  </option>
                  {activePartners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.name}
                      {partner.company_name ? ` — ${partner.company_name}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Instructions" htmlFor="assign-instructions">
                <Textarea
                  id="assign-instructions"
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  maxLength={3000}
                  className="min-h-20"
                  placeholder="What exactly should the partner check?"
                />
              </Field>
              <Field label="Due date (optional)" htmlFor="assign-due">
                <Input
                  id="assign-due"
                  type="date"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </Field>
              <Button
                type="submit"
                size="sm"
                loading={assigning}
                disabled={!partnerId || !request.consent_to_share || Boolean(activeAssignment)}
              >
                <Handshake className="h-3.5 w-3.5" aria-hidden="true" />
                Offer assignment
              </Button>
              {!activePartners.length ? (
                <p className="text-[12px] leading-5 text-ink-400">
                  No active partners are available. Approve a partner application first.
                </p>
              ) : null}
            </form>
          </section>

          <section className="surface p-5" aria-labelledby="history-heading">
            <h2 id="history-heading" className="flex items-center gap-2 font-display text-base font-bold text-ink-900">
              <CalendarClock className="h-4 w-4 text-teal-600" aria-hidden="true" />
              Status history
            </h2>
            {request.status_history.length ? (
              <ol className="mt-3 space-y-2">
                {[...request.status_history].reverse().map((entry, index) => (
                  <li key={`${entry.to}-${entry.created_at}-${index}`} className="border-l-2 border-teal-200 pl-3">
                    <p className="text-xs font-semibold text-ink-800">
                      {entry.from ? `${STATUS_LABELS[entry.from] ?? titleize(entry.from)} → ` : ""}
                      {STATUS_LABELS[entry.to] ?? titleize(entry.to)}
                    </p>
                    <p className="text-[12px] text-ink-400">{formatDateTime(entry.created_at)}</p>
                    {entry.notes ? <p className="mt-0.5 text-[12px] leading-5 text-ink-500">{entry.notes}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-ink-500">No status changes recorded.</p>
            )}
          </section>

          <InlineNote tone="info">
            <span className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Only share properties that are genuinely available and approved. A suggestion is not a promise. Never
                mark a request complete before the seeker has what they need.
              </span>
            </span>
          </InlineNote>
        </aside>
      </div>

      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Change request status"
        description="Only valid transitions are accepted by the server. The seeker is notified of the new status."
        size="sm"
      >
        <form onSubmit={changeStatus} className="space-y-4">
          <Field label="New status" htmlFor="request-next-status" required>
            <Select
              id="request-next-status"
              required
              value={targetStatus}
              onChange={(event) => setTargetStatus(event.target.value)}
            >
              {nextStatuses.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status] ?? titleize(status)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes for the seeker (optional)" htmlFor="request-status-notes">
            <Textarea
              id="request-status-notes"
              value={statusNotes}
              onChange={(event) => setStatusNotes(event.target.value)}
              maxLength={2000}
              className="min-h-20"
              placeholder="Explain the next step honestly."
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingStatus} disabled={!targetStatus}>
              Update status
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={matchesOpen}
        onClose={() => setMatchesOpen(false)}
        title="Send computed matches"
        description="This computes genuine matches from approved, sufficiently fresh listings and shares them with the seeker. If none qualify, nothing is sent."
        size="sm"
      >
        <form onSubmit={sendMatches} className="space-y-4">
          <Field label="Note to the seeker (optional)" htmlFor="match-notes">
            <Textarea
              id="match-notes"
              value={matchNotes}
              onChange={(event) => setMatchNotes(event.target.value)}
              maxLength={2000}
              className="min-h-24"
              placeholder="Explain what you found and what the seeker should confirm."
            />
          </Field>
          <InlineNote tone="warning">
            Do not promise that a property is reserved. The seeker must confirm availability and view before paying
            anything.
          </InlineNote>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setMatchesOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={sendingMatches}>
              <Send className="h-4 w-4" aria-hidden="true" />
              Compute and send
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={externalOpen}
        onClose={() => setExternalOpen(false)}
        title="Record an external match"
        description="Use this for a property found through a genuine local investigation. It is recorded as suggested until you confirm and share it."
        size="md"
      >
        <form onSubmit={addExternalMatch} className="space-y-4">
          <Field label="Property title" htmlFor="external-title" required>
            <Input
              id="external-title"
              required
              minLength={3}
              maxLength={200}
              value={externalTitle}
              onChange={(event) => setExternalTitle(event.target.value)}
              placeholder="e.g. Two-bedroom house near Kehancha market"
            />
          </Field>
          <Field label="Description (optional)" htmlFor="external-description">
            <Textarea
              id="external-description"
              maxLength={3000}
              value={externalDescription}
              onChange={(event) => setExternalDescription(event.target.value)}
              className="min-h-20"
              placeholder="What did the partner actually confirm?"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rent (KES, optional)" htmlFor="external-rent">
              <Input
                id="external-rent"
                type="number"
                min={1}
                inputMode="numeric"
                value={externalRent}
                onChange={(event) => setExternalRent(event.target.value)}
              />
            </Field>
            <Field label="Location (optional)" htmlFor="external-location">
              <Input
                id="external-location"
                maxLength={255}
                value={externalLocation}
                onChange={(event) => setExternalLocation(event.target.value)}
                placeholder="e.g. Kehancha, near the stage"
              />
            </Field>
          </div>
          <InlineNote tone="warning">
            Do not record an external property you have not verified through an authorised source. It must be genuine
            and available before it is shared.
          </InlineNote>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setExternalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingExternal}>
              Record property
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(reportToReview)}
        onClose={() => setReportToReview(null)}
        title="Review field report"
        description="Approving the report completes the assignment and increments the partner's completed count. Reject it back to the partner if it needs correction."
        size="sm"
      >
        {reportToReview ? (
          <form onSubmit={reviewReport} className="space-y-4">
            <div className="rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-600">
              <p className="font-semibold text-ink-800">{titleize(reportToReview.report_type)}</p>
              <p className="mt-1 whitespace-pre-line">{reportToReview.summary}</p>
            </div>
            <Field label="Outcome" htmlFor="report-outcome" required>
              <Select
                id="report-outcome"
                value={reportOutcome}
                onChange={(event) => setReportOutcome(event.target.value)}
              >
                <option value="reviewed">Reviewed — accept the findings</option>
                <option value="needs_revision">Needs revision — send back to the partner</option>
              </Select>
            </Field>
            <Field label="Review notes" htmlFor="report-notes" required>
              <Textarea
                id="report-notes"
                required
                minLength={3}
                maxLength={2000}
                value={reportNotes}
                onChange={(event) => setReportNotes(event.target.value)}
                className="min-h-24"
                placeholder="What did you verify, and what should happen next?"
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setReportToReview(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={reviewingReport} variant={reportOutcome === "needs_revision" ? "danger" : "primary"}>
                {reportOutcome === "needs_revision" ? (
                  <>
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    Request revision
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Accept report
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}

function SuggestionRow({ suggestion }: { suggestion: MatchSuggestion }) {
  const property = suggestion.property;
  return (
    <li className="rounded-xl border border-ink-900/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-800">{property.title}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {[property.location.neighbourhood, property.location.town].filter(Boolean).join(", ")} ·{" "}
            {formatKes(property.rent_amount)} / {property.rent_period} · score {suggestion.score}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {suggestion.is_alternative ? <Badge tone="amber">Alternative</Badge> : <Badge tone="green">Strict match</Badge>}
          <Link href={`/properties/${property.id}`} className="text-xs font-semibold text-teal-700 hover:underline">
            View
          </Link>
        </div>
      </div>
      {suggestion.explanation.positives.length || suggestion.explanation.negatives.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {suggestion.explanation.positives.slice(0, 4).map((item) => (
            <Badge key={`p-${item}`} tone="green">
              {item}
            </Badge>
          ))}
          {suggestion.explanation.negatives.slice(0, 4).map((item) => (
            <Badge key={`n-${item}`} tone="amber">
              {item}
            </Badge>
          ))}
          {suggestion.explanation.unmet_requirements.slice(0, 3).map((item) => (
            <Badge key={`u-${item}`} tone="red">
              Unmet: {item}
            </Badge>
          ))}
        </div>
      ) : null}
      <p className="mt-1 text-[12px] text-ink-400">
        Availability: {property.availability_status.replace(/_/g, " ")} · {property.is_fresh ? "fresh" : "needs reconfirmation"} ·
        verification: {property.verification.level}
      </p>
    </li>
  );
}
