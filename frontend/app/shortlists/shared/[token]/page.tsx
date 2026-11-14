import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lock, MessageSquare, Users } from "lucide-react";

import { PropertyCard } from "@/components/property/property-card";
import { ShortlistCommentForm } from "@/components/shortlists/comment-form";
import { EmptyState } from "@/components/ui/feedback";
import { serverFetch } from "@/lib/server-api";
import type { Shortlist } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type SharedShortlistPayload = { shortlist: Shortlist };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared shortlist",
  description: "A private Findora Spaces shortlist shared with you for comparison and comments.",
  robots: { index: false, follow: false },
};

export default async function SharedShortlistPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = await serverFetch<SharedShortlistPayload>(
    `/shortlists/shared/${encodeURIComponent(token)}`,
  );
  if (!payload) notFound();

  const shortlist = payload.shortlist;
  const properties = shortlist.properties.filter(Boolean);

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-ink-900/10 bg-white p-6 shadow-card sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-teal-600">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                Shared shortlist
              </p>
              <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
                {shortlist.name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">
                {shortlist.description ??
                  "A private collection of spaces shared for comparison. Open a listing to review its Property Passport before deciding."}
              </p>
              <p className="mt-2 text-xs text-ink-400">
                Shared {formatDateTime(shortlist.created_at)} · {properties.length}{" "}
                {properties.length === 1 ? "space" : "spaces"}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-900/10 bg-ivory-100 px-3 py-1.5 text-xs font-semibold text-ink-500">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Private link
            </span>
          </div>
        </div>

        {properties.length ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              title="This shortlist has no available spaces"
              description="The properties may have been removed, suspended or are no longer freshly confirmed. Ask the person who shared this list, or start a new search."
            />
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <section aria-labelledby="comments-heading">
            <h2 id="comments-heading" className="flex items-center gap-2 font-display text-xl font-bold text-ink-900">
              <MessageSquare className="h-5 w-5 text-teal-600" aria-hidden="true" />
              Comments ({shortlist.comments.length})
            </h2>
            <ul className="mt-3 space-y-3">
              {shortlist.comments.map((comment) => (
                <li key={comment.id} className="rounded-2xl border border-ink-900/10 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink-800">{comment.author_name}</p>
                    <p className="text-[12px] text-ink-400">{formatDateTime(comment.created_at)}</p>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-ink-600">{comment.body}</p>
                </li>
              ))}
              {shortlist.comments.length === 0 ? (
                <li className="rounded-2xl border border-ink-900/10 bg-ivory-100 p-4 text-sm leading-6 text-ink-500">
                  No comments yet. Add the first note to discuss these spaces with the group.
                </li>
              ) : null}
            </ul>
          </section>
          <ShortlistCommentForm token={token} />
        </div>

        <p className="mt-6 rounded-xl bg-ivory-100 px-4 py-3 text-xs leading-5 text-ink-500">
          Findora does not publish this shortlist in search results. Always confirm availability and view a property
          before paying any money. Verification reduces risk but does not guarantee a property.
        </p>
      </div>
    </div>
  );
}
