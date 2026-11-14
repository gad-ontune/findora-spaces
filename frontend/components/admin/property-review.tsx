"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, CalendarClock, Image as ImageIcon, MapPin, ShieldCheck } from "lucide-react";

import { Badge, StatusBadge } from "@/components/ui/badge";
import { InlineNote, Skeleton } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import type { PropertyDetail } from "@/lib/types";
import { availabilityLabel, formatDate, formatKes, propertyTypeLabel, titleize } from "@/lib/utils";

import { ModerationActions } from "./moderation";

type DuplicateCandidate = {
  property_id: string;
  reference: string;
  title: string;
  score: number;
  reasons: string[];
};

export function PropertyReviewModal({
  propertyId,
  open,
  onClose,
  onChanged,
  duplicates = [],
}: {
  propertyId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  duplicates?: DuplicateCandidate[];
}) {
  const propertyQuery = useQuery({
    queryKey: ["admin-property", propertyId],
    queryFn: () => api.get<{ property: PropertyDetail }>(`/properties/${propertyId}`),
    enabled: open && Boolean(propertyId),
  });

  const property = propertyQuery.data?.property;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={property ? property.title : "Listing review"}
      description={
        property
          ? `${property.reference} · ${titleize(property.category)} · ${propertyTypeLabel(property.property_type)}`
          : "Loading the full listing record for review."
      }
      size="lg"
    >
      {propertyQuery.isLoading || !property ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={property.status} />
            <StatusBadge
              status={property.availability_status}
              label={availabilityLabel(property.availability_status, property.is_fresh)}
            />
            <Badge tone={property.is_fresh ? "green" : "amber"} dot>
              {property.is_fresh ? "Fresh availability" : "Availability stale"}
            </Badge>
            <Badge tone={property.verification.verified_count ? "green" : "slate"}>
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              {property.verification.verified_count} verified
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-ivory-100 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Location</p>
              <p className="mt-1 flex items-start gap-1.5 text-sm font-medium text-ink-800">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                {[property.location.neighbourhood, property.location.town, property.location.county]
                  .filter(Boolean)
                  .join(", ") || "Location not recorded"}
              </p>
              {property.location.address_line ? (
                <p className="mt-1 text-xs text-ink-500">{property.location.address_line}</p>
              ) : null}
            </div>
            <div className="rounded-xl bg-ivory-100 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Advertised rent</p>
              <p className="mt-1 text-sm font-bold text-ink-900">
                {formatKes(property.rent_amount)} / {property.rent_period}
              </p>
              <p className="mt-1 text-xs text-ink-500">
                Deposit {formatKes(property.deposit_amount)} · move-in total {formatKes(property.move_in_cost.initial_total)}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Description</p>
            <p className="mt-1 whitespace-pre-line rounded-xl border border-ink-900/10 px-3.5 py-3 text-sm leading-6 text-ink-600">
              {property.description}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-900/10 p-3.5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                Availability and listing record
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-600">
                Created {formatDate(property.created_at)}
                {property.published_at ? ` · published ${formatDate(property.published_at)}` : ""}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-ink-600">
                Last confirmed available:{" "}
                {property.last_confirmed_available_at
                  ? formatDate(property.last_confirmed_available_at)
                  : "never"}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-ink-600">
                Owner: {property.management?.recorded_owner_name ?? "Not recorded"}
                {property.management?.recorded_owner_phone ? ` · ${property.management.recorded_owner_phone}` : ""}
              </p>
            </div>
            <div className="rounded-xl border border-ink-900/10 p-3.5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Media and amenities
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-600">
                {property.media.length} media item{property.media.length === 1 ? "" : "s"} ·{" "}
                {property.amenities.length} amenit{property.amenities.length === 1 ? "y" : "ies"}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-ink-600">
                {property.commercial_uses.length
                  ? property.commercial_uses.map((use) => use.name).join(", ")
                  : property.category === "commercial"
                    ? "No business uses recorded"
                    : "Residential listing"}
              </p>
            </div>
          </div>

          {property.media.length ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Photos</p>
              <ul className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {property.media.slice(0, 8).map((item) => (
                  <li key={item.id} className="overflow-hidden rounded-lg border border-ink-900/10 bg-ivory-200">
                    {item.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt={item.caption ?? "Listing media"} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                    ) : (
                      <span className="flex aspect-[4/3] items-center justify-center text-[10px] font-semibold text-ink-400">
                        Video
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <InlineNote tone="warning">
              This listing has no photos. Approval is still possible, but consider asking for genuine photos before the
              listing goes public.
            </InlineNote>
          )}

          {duplicates.length ? (
            <div className="rounded-xl border border-sand-300 bg-sand-100 p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-ink-700">
                <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden="true" />
                Possible duplicate listings
              </p>
              <ul className="mt-2 space-y-1.5">
                {duplicates.map((candidate) => (
                  <li key={candidate.property_id} className="rounded-lg bg-white/70 px-2.5 py-2 text-xs text-ink-600">
                    <span className="font-semibold text-ink-800">{candidate.title}</span> · {candidate.reference} ·
                    score {candidate.score} · {candidate.reasons.join(", ")}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-5 text-ink-500">
                Duplicate signals are not proof. Compare the records before approving.
              </p>
            </div>
          ) : null}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Verification checks</p>
            {property.verification.checks.length ? (
              <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {property.verification.checks.map((check) => (
                  <li key={check.type} className="rounded-lg border border-ink-900/10 px-2.5 py-2 text-xs">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink-700">{check.label}</span>
                      <StatusBadge status={check.status} />
                    </span>
                    {check.summary ? <span className="mt-0.5 block leading-5 text-ink-500">{check.summary}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-500">No verification checks recorded.</p>
            )}
          </div>

          {property.management?.rejection_reason ? (
            <InlineNote tone="warning">
              <strong className="font-semibold">Previous rejection reason:</strong> {property.management.rejection_reason}
            </InlineNote>
          ) : null}
          {property.management?.suspension_reason ? (
            <InlineNote tone="warning">
              <strong className="font-semibold">Suspension reason:</strong> {property.management.suspension_reason}
            </InlineNote>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-900/10 pt-4">
            <p className="flex items-start gap-1.5 text-xs leading-5 text-ink-400">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Approval does not verify the property or confirm availability.
            </p>
            <ModerationActions
              property={property}
              onChanged={async () => {
                await propertyQuery.refetch();
                await onChanged();
              }}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
