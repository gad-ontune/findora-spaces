import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Home,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Store,
} from "lucide-react";

import { Badge, StatusBadge } from "@/components/ui/badge";
import { InlineNote } from "@/components/ui/feedback";
import { serverFetch } from "@/lib/server-api";
import { formatDate, formatDateTime, formatKes, titleize } from "@/lib/utils";

type TrackPayload = {
  request: {
    reference: string;
    status: string;
    category: "residential" | "commercial";
    town: string | null;
    neighbourhood: string | null;
    budget_min: number | null;
    budget_max: number | null;
    created_at: string;
    updated_at: string;
    status_history: { to: string; notes: string | null; created_at: string }[];
    match_count: number;
    messages: { body: string; sender_name: string; created_at: string }[];
  };
  matches: {
    id: string;
    title: string | null;
    rent_amount: number | null;
    location_text: string | null;
    property_id: string | null;
    status: string;
  }[];
  note: string;
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Track your assisted search",
  description: "Follow the genuine status of your Findora assisted property search.",
  robots: { index: false, follow: false },
};

export default async function TrackRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = await serverFetch<TrackPayload>(`/search-requests/track/${encodeURIComponent(token)}`);
  if (!payload) notFound();

  const request = payload.request;
  const place = [request.neighbourhood, request.town].filter(Boolean).join(", ");
  const timeline = [...request.status_history].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Assisted search</p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
              Request {request.reference}
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              Submitted {formatDate(request.created_at)} · last updated {formatDateTime(request.updated_at)}
            </p>
          </div>
          <StatusBadge status={request.status} />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink-900/10 bg-white p-4">
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
          <div className="rounded-2xl border border-ink-900/10 bg-white p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">Budget</p>
            <p className="mt-1 text-sm font-semibold text-ink-800">
              {request.budget_min ? `${formatKes(request.budget_min)} – ` : "Up to "}
              {formatKes(request.budget_max)}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">per month</p>
          </div>
          <div className="rounded-2xl border border-ink-900/10 bg-white p-4">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">Genuine matches</p>
            <p className="mt-1 font-display text-2xl font-bold text-teal-700">{request.match_count}</p>
            <p className="mt-0.5 text-xs text-ink-500">shared with you</p>
          </div>
        </div>

        <section className="mt-8" aria-labelledby="timeline-heading">
          <h2 id="timeline-heading" className="font-display text-xl font-bold text-ink-900">
            Progress
          </h2>
          <ol className="mt-4 space-y-0">
            {timeline.map((event, index) => {
              const isLatest = index === timeline.length - 1;
              return (
                <li key={`${event.to}-${event.created_at}`} className="relative flex gap-4 pb-6 last:pb-0">
                  {index < timeline.length - 1 ? (
                    <span className="absolute left-[15px] top-8 h-full w-px bg-ink-200" aria-hidden="true" />
                  ) : null}
                  <span
                    className={
                      isLatest
                        ? "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white"
                        : "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-400"
                    }
                  >
                    {isLatest ? <Clock3 className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 pt-1">
                    <p className="text-sm font-semibold text-ink-800">{titleize(event.to)}</p>
                    <p className="mt-0.5 text-xs text-ink-400">{formatDateTime(event.created_at)}</p>
                    {event.notes ? <p className="mt-1.5 text-sm leading-6 text-ink-600">{event.notes}</p> : null}
                  </div>
                </li>
              );
            })}
            {timeline.length === 0 ? (
              <li className="rounded-xl bg-ivory-100 px-4 py-3 text-sm text-ink-500">
                Your request has been received. Status updates will appear here.
              </li>
            ) : null}
          </ol>
        </section>

        <section className="mt-6" aria-labelledby="matches-heading">
          <h2 id="matches-heading" className="font-display text-xl font-bold text-ink-900">
            Matches shared with you
          </h2>
          {payload.matches.length ? (
            <ul className="mt-3 space-y-3">
              {payload.matches.map((match) => (
                <li key={match.id} className="rounded-2xl border border-ink-900/10 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">
                        {match.title ?? "Property shared by our team"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                        {match.location_text ?? "Location details shared by our team"}
                      </p>
                      {match.rent_amount ? (
                        <p className="mt-1 text-sm font-bold text-teal-700">
                          {formatKes(match.rent_amount)}
                          <span className="text-xs font-normal text-ink-400"> /month</span>
                        </p>
                      ) : null}
                    </div>
                    <Badge tone="teal">{titleize(match.status)}</Badge>
                  </div>
                  {match.property_id ? (
                    <Link
                      href={`/properties/${match.property_id}`}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline"
                    >
                      View the Property Passport
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-2xl border border-ink-900/10 bg-ivory-100 p-5">
              <p className="text-sm font-semibold text-ink-800">No matches have been shared yet</p>
              <p className="mt-1 text-sm leading-6 text-ink-500">
                Our team only shares properties that genuinely exist and meet your requirements. This page will update
                when real matches are available — we never fill it with invented listings.
              </p>
            </div>
          )}
        </section>

        {request.messages.length ? (
          <section className="mt-6" aria-labelledby="messages-heading">
            <h2 id="messages-heading" className="font-display text-xl font-bold text-ink-900">
              Messages
            </h2>
            <ul className="mt-3 space-y-2">
              {request.messages.map((message, index) => (
                <li key={`${message.created_at}-${index}`} className="rounded-2xl border border-ink-900/10 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-ink-700">{message.sender_name}</p>
                    <p className="text-[12px] text-ink-400">{formatDateTime(message.created_at)}</p>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-ink-600">{message.body}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <InlineNote>
          <ShieldCheck className="mr-1 inline h-4 w-4" aria-hidden="true" />
          {payload.note} Keep this link private. Findora will never ask you to send a deposit to a personal number
          before you have viewed and verified a property.
        </InlineNote>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/assisted"
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink-900/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Submit another request
          </Link>
          <Link
            href="/properties"
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Browse available spaces
          </Link>
        </div>
      </div>
    </div>
  );
}
