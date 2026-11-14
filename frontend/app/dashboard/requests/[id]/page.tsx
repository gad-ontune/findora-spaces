"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Home,
  MapPin,
  MessageSquare,
  Send,
  ShieldCheck,
  Store,
  XCircle,
} from "lucide-react";

import { useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage } from "@/lib/api";
import type { Payment, RequestMatch, SearchRequest } from "@/lib/types";
import { formatDate, formatDateTime, formatKes, titleize } from "@/lib/utils";

type MatchesPayload = {
  matches: RequestMatch[];
  sent_count: number;
  message: string;
};

export default function AssistedRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const requestQuery = useQuery({
    queryKey: ["search-request", id],
    queryFn: () => api.get<{ request: SearchRequest }>(`/search-requests/${id}`),
    enabled: Boolean(id),
  });

  const matchesQuery = useQuery({
    queryKey: ["search-request-matches", id],
    queryFn: () => api.get<MatchesPayload>(`/search-requests/${id}/matches`),
    enabled: Boolean(id),
  });

  const paymentsQuery = useQuery({
    queryKey: ["payments"],
    queryFn: () => api.get<{ payments: Payment[]; count: number }>("/payments"),
  });

  const request = requestQuery.data?.request;
  const matches = matchesQuery.data?.matches ?? [];
  const paid = (paymentsQuery.data?.payments ?? []).some(
    (payment) => payment.purpose === "assisted_search" && payment.related_id === id && payment.status === "success",
  );

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim() || !id) return;
    setSending(true);
    try {
      await api.post(`/search-requests/${id}/messages`, { body: message.trim() });
      setMessage("");
      await queryClient.invalidateQueries({ queryKey: ["search-request", id] });
      toast({ title: "Message sent to the team", tone: "success" });
    } catch (error) {
      toast({ title: "Could not send the message", description: errorMessage(error), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  async function cancel(event: React.FormEvent) {
    event.preventDefault();
    if (!id) return;
    setCancelling(true);
    try {
      await api.post(`/search-requests/${id}/cancel`, { reason: cancelReason.trim() });
      setCancelOpen(false);
      setCancelReason("");
      await queryClient.invalidateQueries({ queryKey: ["search-request", id] });
      await queryClient.invalidateQueries({ queryKey: ["search-requests"] });
      toast({ title: "Request cancelled", tone: "success" });
    } catch (error) {
      toast({ title: "Could not cancel the request", description: errorMessage(error), tone: "error" });
    } finally {
      setCancelling(false);
    }
  }

  async function accept(match: RequestMatch) {
    if (!id) return;
    setAccepting(match.id);
    try {
      await api.post(`/search-requests/${id}/matches/${match.id}/accept`);
      await queryClient.invalidateQueries({ queryKey: ["search-request", id] });
      await queryClient.invalidateQueries({ queryKey: ["search-request-matches", id] });
      toast({ title: "Match selected", description: "Our team will coordinate the next step.", tone: "success" });
    } catch (error) {
      toast({ title: "Could not select the match", description: errorMessage(error), tone: "error" });
    } finally {
      setAccepting(null);
    }
  }

  async function pay() {
    if (!id) return;
    setPaying(true);
    try {
      const payload = await api.post<{ payment: Payment; message: string }>("/payments/initiate", {
        purpose: "assisted_search",
        related_id: id,
        idempotency_key: `assisted-${id}-${Date.now()}`,
      });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
      toast({
        title: payload.payment.status === "success" ? "Payment completed" : "Payment not completed",
        description: payload.message,
        tone: payload.payment.status === "success" ? "success" : "info",
      });
    } catch (error) {
      toast({ title: "Payment could not start", description: errorMessage(error), tone: "error" });
    } finally {
      setPaying(false);
    }
  }

  if (requestQuery.isError) {
    return (
      <ErrorState
        title="This request could not load"
        description="It may belong to another account or the link may be out of date."
        retry={() => requestQuery.refetch()}
      />
    );
  }

  if (requestQuery.isLoading || !request) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const place = [request.neighbourhood, request.town].filter(Boolean).join(", ");
  const canCancel = !["completed", "cancelled"].includes(request.status);
  const timeline = [...request.status_history].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/requests"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All assisted searches
      </Link>

      <PageHeader
        eyebrow="Assisted search"
        title={`Request ${request.reference}`}
        description={`Submitted ${formatDate(request.created_at)} · last updated ${formatDateTime(request.updated_at)}`}
        actions={
          <>
            {canCancel ? (
              <Button variant="outline" onClick={() => setCancelOpen(true)}>
                Cancel request
              </Button>
            ) : null}
            <StatusBadge status={request.status} />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface p-4">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-400">
            {request.category === "commercial" ? <Store className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}
            Looking for
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-800">
            {request.category === "commercial" ? "Commercial space" : "A home"}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {place || "Location to be discussed"}
          </p>
        </div>
        <div className="surface p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">Budget</p>
          <p className="mt-1 text-sm font-semibold text-ink-800">
            {request.budget_min ? `${formatKes(request.budget_min)} – ` : "Up to "}
            {formatKes(request.budget_max)}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">per month</p>
        </div>
        <div className="surface p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">Genuine matches</p>
          <p className="mt-1 font-display text-2xl font-bold text-teal-700">{request.match_count}</p>
          <p className="mt-0.5 text-xs text-ink-500">shared with you</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <div className="space-y-6">
          <section className="surface p-5" aria-labelledby="matches-heading">
            <h2 id="matches-heading" className="font-display text-lg font-bold text-ink-900">
              Matches shared with you
            </h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">
              {matchesQuery.data?.message ??
                "Matches are properties that genuinely exist in the platform. Confirm availability before paying anything."}
            </p>

            {matchesQuery.isLoading ? (
              <Skeleton className="mt-3 h-28 w-full" />
            ) : matches.length ? (
              <ul className="mt-3 space-y-3">
                {matches.map((match) => {
                  const property = match.property;
                  return (
                    <li key={match.id} className="rounded-xl border border-ink-900/10 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-ink-900">
                            {property?.title ?? match.title ?? "Property shared by our team"}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {property
                              ? [property.location.neighbourhood, property.location.town].filter(Boolean).join(", ")
                              : match.location_text ?? "Location shared by our team"}
                          </p>
                          <p className="mt-1 text-sm font-bold text-teal-700">
                            {formatKes(property?.rent_amount ?? match.rent_amount)}
                            <span className="text-xs font-normal text-ink-400"> /month</span>
                          </p>
                          {match.explanation?.positives?.length ? (
                            <ul className="mt-2 space-y-1">
                              {match.explanation.positives.slice(0, 3).map((point) => (
                                <li key={point} className="flex items-start gap-1.5 text-xs leading-5 text-ink-500">
                                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-teal-600" aria-hidden="true" />
                                  {point}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                        <Badge tone={match.status === "accepted" ? "green" : "teal"}>{titleize(match.status)}</Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {property ? (
                          <LinkButton href={`/properties/${property.id}`} size="sm" variant="outline">
                            Property Passport
                          </LinkButton>
                        ) : null}
                        {match.status === "sent" || match.status === "suggested" ? (
                          <Button size="sm" onClick={() => accept(match)} loading={accepting === match.id}>
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Select this match
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="mt-3 rounded-xl bg-ivory-100 p-4 text-sm leading-6 text-ink-500">
                No matches have been shared yet. Our team only shares properties that genuinely exist and fit your
                requirements. This page updates when real matches are available.
              </div>
            )}
          </section>

          <section className="surface p-5" aria-labelledby="requirements-heading">
            <h2 id="requirements-heading" className="font-display text-lg font-bold text-ink-900">
              Your brief
            </h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex flex-wrap justify-between gap-2 border-b border-ink-900/10 pb-2">
                <dt className="text-ink-400">Category</dt>
                <dd className="font-medium text-ink-800">{titleize(request.category)}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-ink-900/10 pb-2">
                <dt className="text-ink-400">Property type</dt>
                <dd className="font-medium text-ink-800">
                  {request.property_type ? titleize(request.property_type) : "Any suitable type"}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-ink-900/10 pb-2">
                <dt className="text-ink-400">Move-in date</dt>
                <dd className="font-medium text-ink-800">{request.move_in_date ? formatDate(request.move_in_date) : "Flexible"}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-ink-900/10 pb-2">
                <dt className="text-ink-400">Contact method</dt>
                <dd className="font-medium text-ink-800">{titleize(request.contact_method)}</dd>
              </div>
              {request.facilities.length ? (
                <div className="border-b border-ink-900/10 pb-2">
                  <dt className="text-ink-400">Must-have facilities</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {request.facilities.map((facility) => (
                      <span key={facility} className="chip">
                        {titleize(facility)}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
            {request.requirements ? (
              <div className="mt-3 rounded-xl bg-ivory-100 p-3.5">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-400">What you told us</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-600">{request.requirements}</p>
              </div>
            ) : null}
            {request.assistance_requirements ? (
              <div className="mt-2 rounded-xl bg-ivory-100 p-3.5">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Help requested</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-600">
                  {request.assistance_requirements}
                </p>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <section className="surface p-5" aria-labelledby="status-heading">
            <h2 id="status-heading" className="font-display text-base font-bold text-ink-900">
              Progress
            </h2>
            <ol className="mt-3 space-y-0">
              {timeline.map((event, index) => {
                const isLatest = index === timeline.length - 1;
                return (
                  <li key={`${event.to}-${event.created_at}`} className="relative flex gap-3 pb-4 last:pb-0">
                    {index < timeline.length - 1 ? (
                      <span className="absolute left-[11px] top-6 h-full w-px bg-ink-200" aria-hidden="true" />
                    ) : null}
                    <span
                      className={
                        isLatest
                          ? "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white"
                          : "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-400"
                      }
                    >
                      {isLatest ? (
                        <Clock3 className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-xs font-semibold text-ink-800">{titleize(event.to)}</p>
                      <p className="text-[12px] text-ink-400">{formatDateTime(event.created_at)}</p>
                      {event.notes ? <p className="mt-1 text-xs leading-5 text-ink-500">{event.notes}</p> : null}
                    </div>
                  </li>
                );
              })}
              {timeline.length === 0 ? (
                <li className="rounded-lg bg-ivory-100 px-3 py-2 text-xs text-ink-500">
                  Received. Status updates will appear here.
                </li>
              ) : null}
            </ol>
          </section>

          <section className="surface p-5" aria-labelledby="payment-heading">
            <h2 id="payment-heading" className="flex items-center gap-2 font-display text-base font-bold text-ink-900">
              <CreditCard className="h-4 w-4 text-teal-600" aria-hidden="true" />
              Service fee
            </h2>
            {paid ? (
              <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-teal-50 px-3 py-2.5 text-xs font-semibold text-teal-800">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Paid — KES 300
              </p>
            ) : (
              <>
                <p className="mt-1.5 text-sm leading-6 text-ink-600">
                  KES 300 covers review, genuine matching and coordination. It does not guarantee a match.
                </p>
                <Button className="mt-3 w-full" onClick={pay} loading={paying}>
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  Pay KES 300
                </Button>
                <p className="mt-2 text-[12px] leading-5 text-ink-400">
                  Demo mode: M-Pesa is simulated. A payment is only shown as successful when the backend confirms it.
                </p>
              </>
            )}
          </section>

          <section className="surface p-5" aria-labelledby="messages-heading">
            <h2 id="messages-heading" className="flex items-center gap-2 font-display text-base font-bold text-ink-900">
              <MessageSquare className="h-4 w-4 text-teal-600" aria-hidden="true" />
              Messages
            </h2>
            <ul className="mt-3 space-y-2.5">
              {request.messages.map((item) => (
                <li key={item.id} className="rounded-xl bg-ivory-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-bold text-ink-700">{item.sender_name}</p>
                    <p className="text-[11px] text-ink-400">{formatDateTime(item.created_at)}</p>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm leading-6 text-ink-600">{item.body}</p>
                </li>
              ))}
              {request.messages.length === 0 ? (
                <li className="rounded-xl bg-ivory-100 p-3 text-xs leading-5 text-ink-500">
                  No messages yet. Ask a question about the brief or a shared match.
                </li>
              ) : null}
            </ul>
            <form onSubmit={sendMessage} className="mt-3 space-y-2">
              <Field label="Message the team" htmlFor="request-message">
                <Textarea
                  id="request-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  className="min-h-20"
                  maxLength={3000}
                  placeholder="e.g. Is the Amani apartment still available for a viewing next week?"
                />
              </Field>
              <Button type="submit" size="sm" loading={sending} disabled={!message.trim()}>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Send
              </Button>
            </form>
          </section>

          <InlineNote>
            <ShieldCheck className="mr-1 inline h-4 w-4" aria-hidden="true" />
            Findora will never ask you to send a deposit to a personal number before you have viewed and verified a
            property.
          </InlineNote>
        </aside>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this assisted search?"
        description="This stops the search. Any recorded payment is handled under the published refund terms."
        size="sm"
      >
        <form onSubmit={cancel} className="space-y-4">
          <Field label="Reason for cancelling" htmlFor="cancel-reason" required>
            <Textarea
              id="cancel-reason"
              required
              minLength={3}
              maxLength={1000}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              className="min-h-20"
              placeholder="e.g. I found a place through a friend."
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep request
            </Button>
            <Button type="submit" variant="danger" loading={cancelling} disabled={!cancelReason.trim()}>
              <XCircle className="h-4 w-4" aria-hidden="true" />
              Cancel request
            </Button>
          </div>
        </form>
      </Modal>

      <p className="flex items-center gap-1.5 text-xs text-ink-400">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        Need to share progress with someone? Use the secure tracking link from your request confirmation.
      </p>
    </div>
  );
}
