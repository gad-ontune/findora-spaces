"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, GitCompareArrows, MapPin, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { ComparisonRecord } from "@/lib/types";
import {
  availabilityLabel,
  formatDate,
  formatKes,
  propertyTypeLabel,
  titleize,
} from "@/lib/utils";

export default function ComparisonsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["comparisons"],
    queryFn: () => api.get<{ comparisons: ComparisonRecord[] }>("/comparisons"),
  });

  const comparisons = data?.comparisons ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compare"
        title="Property comparisons"
        description="Side-by-side facts from the listings you compared. Advertised rent is not a negotiated rent — confirm costs, availability and what was actually verified before deciding."
        actions={
          <LinkButton href="/dashboard/favourites" variant="outline">
            Compare saved spaces
          </LinkButton>
        }
      />

      {isError ? (
        <ErrorState
          title="Comparisons could not load"
          description="We could not reach your saved comparisons."
          retry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : comparisons.length ? (
        <div className="space-y-8">
          {comparisons.map((comparison) => (
            <section key={comparison.id} className="surface overflow-hidden" aria-labelledby={`comparison-${comparison.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-900/10 p-5">
                <div>
                  <h2 id={`comparison-${comparison.id}`} className="font-display text-lg font-bold text-ink-900">
                    {comparison.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-400">
                    Saved {formatDate(comparison.created_at)} · {comparison.properties.length} spaces
                  </p>
                </div>
                <Badge tone="teal">
                  <GitCompareArrows className="h-3 w-3" aria-hidden="true" />
                  Comparison
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <caption className="sr-only">
                    Comparison of {comparison.properties.map((property) => property.title).join(", ")}
                  </caption>
                  <thead>
                    <tr className="border-b border-ink-900/10 bg-ivory-100">
                      <th scope="col" className="w-40 px-4 py-3 text-xs font-bold uppercase tracking-wide text-ink-500">
                        Detail
                      </th>
                      {comparison.properties.map((property) => (
                        <th key={property.id} scope="col" className="min-w-48 px-4 py-3 align-top">
                          <Link
                            href={`/properties/${property.id}`}
                            className="font-display text-sm font-bold text-ink-900 hover:text-teal-700"
                          >
                            {property.title}
                          </Link>
                          <p className="mt-1 flex items-center gap-1 text-xs font-normal text-ink-400">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {[property.neighbourhood, property.town].filter(Boolean).join(", ") || "Location shared on listing"}
                          </p>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-900/10">
                    {[
                      {
                        label: "Monthly rent",
                        value: (property: ComparisonRecord["properties"][number]) => (
                          <span className="font-display text-base font-bold text-ink-900">
                            {formatKes(property.rent)}
                          </span>
                        ),
                      },
                      {
                        label: "Deposit",
                        value: (property: ComparisonRecord["properties"][number]) =>
                          property.deposit ? formatKes(property.deposit) : "Not disclosed",
                      },
                      {
                        label: "Move-in total",
                        value: (property: ComparisonRecord["properties"][number]) =>
                          formatKes(property.move_in_total),
                      },
                      {
                        label: "Type",
                        value: (property: ComparisonRecord["properties"][number]) =>
                          propertyTypeLabel(property.property_type),
                      },
                      {
                        label: "Bedrooms / bathrooms",
                        value: (property: ComparisonRecord["properties"][number]) =>
                          property.category === "residential"
                            ? `${property.bedrooms ?? "—"} bed · ${property.bathrooms ?? "—"} bath`
                            : "Commercial space",
                      },
                      {
                        label: "Floor area",
                        value: (property: ComparisonRecord["properties"][number]) =>
                          property.floor_area_sqm ? `${property.floor_area_sqm} m²` : "Not recorded",
                      },
                      {
                        label: "Furnishing",
                        value: (property: ComparisonRecord["properties"][number]) =>
                          property.furnishing ? titleize(property.furnishing) : "Not stated",
                      },
                      {
                        label: "Availability",
                        value: (property: ComparisonRecord["properties"][number]) => (
                          <Badge tone={property.is_fresh ? "green" : "amber"}>
                            {availabilityLabel(
                              property.is_fresh ? "available" : "unconfirmed",
                              property.is_fresh,
                            )}
                          </Badge>
                        ),
                      },
                      {
                        label: "Verification",
                        value: (property: ComparisonRecord["properties"][number]) => (
                          <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
                            <ShieldCheck className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                            {property.verified_count} checks · {titleize(property.verification_level)}
                          </span>
                        ),
                      },
                      {
                        label: "Amenities",
                        value: (property: ComparisonRecord["properties"][number]) =>
                          property.amenities.length ? property.amenities.slice(0, 4).join(", ") : "None listed",
                      },
                      {
                        label: "Near a landmark",
                        value: (property: ComparisonRecord["properties"][number]) =>
                          property.landmark
                            ? `${property.landmark}${
                                property.distance_to_landmark_km !== null
                                  ? ` · ${property.distance_to_landmark_km} km`
                                  : ""
                              }`
                            : "Not recorded",
                      },
                    ].map((row) => (
                      <tr key={row.label}>
                        <th scope="row" className="px-4 py-3 align-top text-xs font-semibold text-ink-500">
                          {row.label}
                        </th>
                        {comparison.properties.map((property) => (
                          <td key={property.id} className="px-4 py-3 align-top text-sm text-ink-700">
                            {row.value(property)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <th scope="row" className="px-4 py-3 align-top text-xs font-semibold text-ink-500">
                        Full listing
                      </th>
                      {comparison.properties.map((property) => (
                        <td key={property.id} className="px-4 py-3 align-top">
                          <Link
                            href={`/properties/${property.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
                          >
                            Open Property Passport
                            <ArrowRight className="h-3 w-3" aria-hidden="true" />
                          </Link>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {comparison.trade_offs.length ? (
                <div className="border-t border-ink-900/10 bg-ivory-50 p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-ink-500">What the facts suggest</h3>
                  <ul className="mt-2.5 space-y-2">
                    {comparison.trade_offs.map((note) => (
                      <li key={note} className="flex items-start gap-2 text-sm leading-6 text-ink-600">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                        {note}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs leading-5 text-ink-400">
                    These notes are derived from recorded listing facts only. They are not a recommendation and do not
                    replace a viewing or a written agreement.
                  </p>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<GitCompareArrows className="h-6 w-6" aria-hidden="true" />}
          title="No comparisons saved yet"
          description="Select two to four saved spaces and compare them. The comparison records only facts from the listings, never invented scores."
          action={<LinkButton href="/dashboard/favourites">Choose saved spaces</LinkButton>}
        />
      )}
    </div>
  );
}
