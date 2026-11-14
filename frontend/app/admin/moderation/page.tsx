"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eye, Inbox, MapPin, ShieldAlert } from "lucide-react";

import { PropertyReviewModal } from "@/components/admin/property-review";
import { useAuth } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { ModerationQueueItem, ModerationQueueResponse } from "@/lib/types";
import { availabilityLabel, formatDate, formatKes, propertyTypeLabel, titleize } from "@/lib/utils";

export default function ModerationQueuePage() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const [selected, setSelected] = useState<ModerationQueueItem | null>(null);

  const queueQuery = useQuery({
    queryKey: ["admin-moderation-queue"],
    queryFn: () => api.get<ModerationQueueResponse>("/admin/moderation-queue"),
    enabled: hasPermission("property:moderate"),
  });

  const queue = queueQuery.data?.queue ?? [];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-moderation-queue"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-properties"] });
  }

  if (!hasPermission("property:moderate")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Property operations"
          title="Moderation queue"
          description="Your staff role does not include listing moderation permission."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Ask a super administrator to review your role if you need access to this queue.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property operations"
        title="Moderation queue"
        description="Review listings submitted for public display. Approve only listings that are accurate, complete and not duplicates. Approval never confirms availability or verification."
        actions={
          <Badge tone={queue.length ? "sand" : "green"} dot>
            {queue.length} waiting
          </Badge>
        }
      />

      <InlineNote tone="info">
        <span className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Check the description against the photos, the location against the town, and the disclosed costs for
            completeness. Reject with a specific reason when something is materially wrong. Do not invent a verification
            outcome.
          </span>
        </span>
      </InlineNote>

      {queueQuery.isError ? (
        <ErrorState
          title="The moderation queue could not load"
          description="We could not reach the pending listing records."
          retry={() => queueQuery.refetch()}
        />
      ) : queueQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : queue.length ? (
        <div className="space-y-3">
          {queue.map((property) => (
            <article key={property.id} className="surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start gap-3">
                {property.primary_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={property.primary_image.url}
                    alt={property.primary_image.caption ?? ""}
                    className="h-20 w-28 shrink-0 rounded-xl object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-20 w-28 shrink-0 items-center justify-center rounded-xl bg-ivory-200 text-ink-300">
                    <Inbox className="h-7 w-7" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-ink-900">{property.title}</h2>
                    <StatusBadge status={property.status} />
                    <StatusBadge
                      status={property.availability_status}
                      label={availabilityLabel(property.availability_status, property.is_fresh)}
                    />
                    {property.duplicate_candidates.length ? (
                      <Badge tone="amber">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        Possible duplicate
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                      {[property.location.neighbourhood, property.location.town].filter(Boolean).join(", ") ||
                        "Location not recorded"}
                    </span>
                    <span>{titleize(property.category)}</span>
                    <span>{propertyTypeLabel(property.property_type)}</span>
                    <span>
                      {formatKes(property.rent_amount)} / {property.rent_period}
                    </span>
                    <span>Ref {property.reference}</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-400">
                    Submitted {formatDate(property.created_at)} · {property.media_count} media item
                    {property.media_count === 1 ? "" : "s"} · {property.verification.verified_count} verified check
                    {property.verification.verified_count === 1 ? "" : "s"} · owner{" "}
                    {property.recorded_owner_name ?? "not recorded"}
                  </p>
                  {property.duplicate_candidates.length ? (
                    <p className="mt-2 rounded-lg bg-sand-100 px-3 py-2 text-xs leading-5 text-ink-600">
                      <strong className="font-semibold">Duplicate signal:</strong>{" "}
                      {property.duplicate_candidates
                        .slice(0, 2)
                        .map((candidate) => `${candidate.reference} (${candidate.reasons.join(", ")})`)
                        .join("; ")}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-900/10 pt-3">
                <Button size="sm" onClick={() => setSelected(property)}>
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  Review listing
                </Button>
                <Link
                  href={`/admin/properties?q=${encodeURIComponent(property.reference)}`}
                  className="text-xs font-semibold text-teal-700 hover:underline"
                >
                  Find in all properties
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
          title="The moderation queue is clear"
          description="No listings are waiting for review right now. New submissions will appear here. Nothing is fabricated to fill the queue."
        />
      )}

      <PropertyReviewModal
        propertyId={selected?.id ?? null}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onChanged={async () => {
          await refresh();
          setSelected(null);
        }}
        duplicates={selected?.duplicate_candidates ?? []}
      />
    </div>
  );
}
