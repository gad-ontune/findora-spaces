import Link from "next/link";
import { BedDouble, Bath, MapPin, ShieldCheck, Store, Trees, CalendarCheck2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { PropertySummary } from "@/lib/types";
import {
  availabilityLabel,
  cn,
  daysAgo,
  formatKes,
  propertyTypeLabel,
  titleize,
} from "@/lib/utils";

export function PropertyCard({
  property,
  className,
  compact = false,
}: {
  property: PropertySummary;
  className?: string;
  compact?: boolean;
}) {
  const image = property.primary_image;
  const confirmedDays = daysAgo(property.last_confirmed_available_at);
  const location = [property.location.neighbourhood, property.location.town]
    .filter(Boolean)
    .join(", ");

  return (
    <article
      className={cn(
        "group surface overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        className,
      )}
    >
      <Link href={`/properties/${property.id}`} className="block focus-visible:outline-none">
        <div className={cn("relative overflow-hidden bg-ivory-200", compact ? "aspect-[16/10]" : "aspect-[4/3]")}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.url}
              alt={image.caption ?? `Illustrative image for ${property.title}`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-teal-100 via-ivory-200 to-sand-200">
              {property.category === "commercial" ? (
                <Store className="h-10 w-10 text-teal-700/50" aria-hidden="true" />
              ) : (
                <Trees className="h-10 w-10 text-teal-700/50" aria-hidden="true" />
              )}
            </div>
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {property.is_featured ? <Badge tone="sand">Featured</Badge> : null}
            {property.verification.level === "strong" ? (
              <Badge tone="green">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                Strong verification
              </Badge>
            ) : null}
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
            <span className="rounded-lg bg-ink-900/80 px-2 py-1 text-[12px] font-semibold text-white backdrop-blur">
              {confirmedDays === null
                ? "Availability not confirmed"
                : confirmedDays === 0
                  ? "Availability confirmed today"
                  : `Availability confirmed ${confirmedDays}d ago`}
            </span>
          </div>
        </div>
      </Link>

      <div className={cn("p-4", compact && "p-3.5")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg font-bold tracking-tight text-ink-900">
              {formatKes(property.rent_amount)}
              <span className="ml-1 text-xs font-medium text-ink-400">
                /{property.rent_period === "monthly" ? "month" : titleize(property.rent_period)}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              {property.deposit_amount
                ? `${formatKes(property.deposit_amount)} deposit`
                : "Deposit not disclosed"}
            </p>
          </div>
          <Badge tone={property.category === "commercial" ? "teal" : "sage"}>
            {property.category === "commercial" ? "Commercial" : "Residential"}
          </Badge>
        </div>

        <h3 className="mt-2.5 line-clamp-2 font-display text-[16px] font-semibold leading-6 text-ink-800">
          <Link href={`/properties/${property.id}`} className="hover:text-teal-700">
            {property.title}
          </Link>
        </h3>

        <p className="mt-1 flex items-center gap-1 text-xs text-ink-500">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden="true" />
          <span className="truncate">{location || property.location.county}</span>
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-ink-900/10 pt-3 text-xs text-ink-500">
          <span className="font-medium text-ink-700">{propertyTypeLabel(property.property_type)}</span>
          {property.category === "residential" && property.bedrooms !== null ? (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="h-3.5 w-3.5" aria-hidden="true" />
              {property.bedrooms} bed{property.bedrooms === 1 ? "" : "s"}
            </span>
          ) : null}
          {property.category === "residential" && property.bathrooms !== null ? (
            <span className="inline-flex items-center gap-1">
              <Bath className="h-3.5 w-3.5" aria-hidden="true" />
              {property.bathrooms} bath{property.bathrooms === 1 ? "" : "s"}
            </span>
          ) : null}
          {property.floor_area_sqm ? <span>{property.floor_area_sqm} m²</span> : null}
          {property.furnishing ? <span>{titleize(property.furnishing)}</span> : null}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[12px] font-semibold",
              property.availability_status === "available" && property.is_fresh
                ? "text-teal-700"
                : "text-sand-500",
            )}
          >
            <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
            {availabilityLabel(property.availability_status, property.is_fresh)}
          </span>
          <span className="text-[12px] font-medium text-ink-400">
            {property.verification.verified_count}/{property.verification.checks.length || 8} checks
          </span>
        </div>
      </div>
    </article>
  );
}

export function PropertyCardSkeleton() {
  return (
    <div className="surface overflow-hidden">
      <div className="aspect-[4/3] animate-pulse bg-ink-100" />
      <div className="space-y-3 p-4">
        <div className="h-5 w-28 animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-full animate-pulse rounded bg-ink-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-ink-100" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-ink-100" />
      </div>
    </div>
  );
}
