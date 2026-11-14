import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Bath,
  BedDouble,
  Building2,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Clock3,
  DoorOpen,
  Droplets,
  FileCheck2,
  Flag,
  Handshake,
  Info,
  MapPin,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Store,
  Trees,
  UserCheck,
  Wallet,
  XCircle,
} from "lucide-react";

import { PropertyMap } from "@/components/maps/property-map";
import { PropertyCard } from "@/components/property/property-card";
import { ContactActions } from "@/components/property/contact-actions";
import { PropertyGallery } from "@/components/property/property-gallery";
import { FavouriteButton, ShareButton } from "@/components/property/property-actions";
import { Badge } from "@/components/ui/badge";
import { InlineNote } from "@/components/ui/feedback";
import { SectionHeading } from "@/components/ui/page";
import { serverFetch } from "@/lib/server-api";
import type { PropertyDetail, PropertySummary } from "@/lib/types";
import {
  availabilityLabel,
  cn,
  daysAgo,
  formatDate,
  formatKes,
  propertyTypeLabel,
  timeAgo,
  titleize,
} from "@/lib/utils";

type DetailResponse = { property: PropertyDetail; similar: PropertySummary[] };

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const payload = await serverFetch<DetailResponse>(`/properties/${id}`);
  if (!payload) return { title: "Property not found" };
  const property = payload.property;
  const location = [property.location.neighbourhood, property.location.town]
    .filter(Boolean)
    .join(", ");
  return {
    title: `${property.title} — ${formatKes(property.rent_amount)}/month`,
    description: `${propertyTypeLabel(property.property_type)} in ${location}. ${property.description.slice(0, 150)}`,
    robots: { index: true, follow: true },
  };
}

const CHECK_ICONS: Record<string, React.ReactNode> = {
  phone: <UserCheck className="h-4 w-4" />,
  identity: <BadgeCheck className="h-4 w-4" />,
  ownership: <FileCheck2 className="h-4 w-4" />,
  authority: <Handshake className="h-4 w-4" />,
  inspection: <Building2 className="h-4 w-4" />,
  rent: <Wallet className="h-4 w-4" />,
  availability: <CalendarCheck2 className="h-4 w-4" />,
  duplicate: <ShieldCheck className="h-4 w-4" />,
};

function CheckStatusIcon({ status }: { status: string }) {
  if (status === "verified") {
    return <CheckCircle2 className="h-5 w-5 text-teal-600" aria-hidden="true" />;
  }
  if (status === "pending") {
    return <Clock3 className="h-5 w-5 text-sand-500" aria-hidden="true" />;
  }
  if (status === "failed" || status === "expired") {
    return <XCircle className="h-5 w-5 text-terracotta-500" aria-hidden="true" />;
  }
  return <CircleDashed className="h-5 w-5 text-ink-300" aria-hidden="true" />;
}

function checkTone(status: string): "green" | "amber" | "red" | "slate" {
  if (status === "verified") return "green";
  if (status === "pending") return "amber";
  if (status === "failed" || status === "expired") return "red";
  return "slate";
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const payload = await serverFetch<DetailResponse>(`/properties/${id}`, { auth: true });
  if (!payload) notFound();

  const property = payload.property;
  const location = property.location;
  const confirmedDays = daysAgo(property.last_confirmed_available_at);
  const place = [location.neighbourhood, location.town].filter(Boolean).join(", ");
  const isCommercial = property.category === "commercial";
  const moveIn = property.move_in_cost;
  const verifiedChecks = property.verification.checks.filter((check) => check.status === "verified");
  const outstandingChecks = property.verification.checks.filter((check) => check.status !== "verified");

  const details: { label: string; value: string | number | null }[] = isCommercial
    ? [
        { label: "Property type", value: propertyTypeLabel(property.property_type) },
        { label: "Floor area", value: property.commercial?.floor_area_sqm ? `${property.commercial.floor_area_sqm} m²` : null },
        { label: "Frontage", value: property.commercial?.frontage_m ? `${property.commercial.frontage_m} m` : null },
        { label: "Floor level", value: property.commercial?.floor_level ?? null },
        { label: "Power capacity", value: property.commercial?.power_capacity_kva ? `${property.commercial.power_capacity_kva} kVA` : null },
        { label: "Parking", value: property.commercial?.parking_spaces ?? null },
        { label: "Loading access", value: property.commercial?.loading_access === null || property.commercial?.loading_access === undefined ? null : property.commercial.loading_access ? "Yes" : "No" },
        { label: "Lease duration", value: property.commercial?.lease_duration_months ? `${property.commercial.lease_duration_months} months` : null },
      ]
    : [
        { label: "Property type", value: propertyTypeLabel(property.property_type) },
        { label: "Bedrooms", value: property.residential?.bedrooms ?? property.bedrooms },
        { label: "Bathrooms", value: property.residential?.bathrooms ?? property.bathrooms },
        { label: "Furnishing", value: property.residential?.furnishing ? titleize(property.residential.furnishing) : property.furnishing ? titleize(property.furnishing) : null },
        { label: "House style", value: property.residential?.house_style ? titleize(property.residential.house_style) : null },
        { label: "Floor number", value: property.residential?.floor_number ?? null },
        { label: "Parking spaces", value: property.residential?.parking_spaces ?? null },
        { label: "Outdoor space", value: property.residential?.outdoor_space ? titleize(property.residential.outdoor_space) : null },
        { label: "Water source", value: property.residential?.water_source ? titleize(property.residential.water_source) : null },
        { label: "Electricity", value: property.residential?.electricity_supply ? titleize(property.residential.electricity_supply) : null },
      ];

  const visibleDetails = details.filter((detail) => detail.value !== null && detail.value !== undefined && detail.value !== "");

  const safetyPoints = [
    "View the property in person, or ask Findora to arrange a trusted local partner, before paying anything.",
    "Confirm the person showing you the property is the owner or is authorised to let it.",
    "Never send a deposit to a mobile number that does not match the authorised contact on this listing.",
    "Get a written agreement showing rent, deposit, fees and the payment schedule before you pay.",
  ];

  return (
    <div className="container-page py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
        <Link href="/" className="hover:text-teal-700">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="/properties" className="hover:text-teal-700">Spaces</Link>
        <span aria-hidden="true">/</span>
        <Link
          href={`/properties?category=${property.category}`}
          className="hover:text-teal-700"
        >
          {isCommercial ? "Commercial" : "Residential"}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate text-ink-600">{property.reference}</span>
      </nav>

      <Link
        href="/properties"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to search
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1.55fr_0.85fr] lg:items-start">
        <div className="min-w-0">
          <PropertyGallery media={property.media} title={property.title} />

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {property.is_featured ? <Badge tone="sand">Featured</Badge> : null}
            <Badge tone={property.verification.level === "strong" ? "green" : property.verification.level === "moderate" ? "teal" : "slate"}>
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              {property.verification.summary}
            </Badge>
            <Badge tone={property.is_fresh ? "green" : "amber"} dot>
              {availabilityLabel(property.availability_status, property.is_fresh)}
            </Badge>
            <Badge tone={isCommercial ? "teal" : "sage"}>
              {isCommercial ? "Commercial" : "Residential"}
            </Badge>
          </div>

          <h1 className="mt-3 text-balance font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
            {property.title}
          </h1>

          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-teal-600" aria-hidden="true" />
              {place || location.county}
              {location.county ? <span className="text-ink-400">· {location.county} County</span> : null}
            </span>
            {location.landmark ? (
              <span className="inline-flex items-center gap-1.5 text-ink-400">
                <Trees className="h-4 w-4" aria-hidden="true" />
                Near {location.landmark}
              </span>
            ) : null}
          </p>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-ink-900/10 bg-white p-5 shadow-card">
            <div>
              <p className="font-display text-3xl font-extrabold tracking-tight text-ink-900">
                {formatKes(property.rent_amount)}
                <span className="ml-1.5 text-sm font-medium text-ink-400">
                  /{property.rent_period === "monthly" ? "month" : titleize(property.rent_period)}
                </span>
              </p>
              <p className="mt-1 text-xs text-ink-500">
                {property.deposit_amount ? `${formatKes(property.deposit_amount)} deposit` : "Deposit not disclosed"}
                {moveIn.disclosed ? ` · ${formatKes(moveIn.initial_total)} total move-in` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <FavouriteButton propertyId={property.id} />
              <ShareButton title={property.title} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-ink-900/10 bg-ivory-100 px-4 py-3 text-xs text-ink-600">
            <CalendarCheck2 className="h-4 w-4 text-teal-600" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-ink-800">
                {confirmedDays === null
                  ? "Availability has not been confirmed"
                  : confirmedDays === 0
                    ? "Availability confirmed today"
                    : `Availability confirmed ${confirmedDays} day${confirmedDays === 1 ? "" : "s"} ago`}
              </strong>
              {property.is_fresh
                ? " · Reconfirmed within the freshness window."
                : " · This listing is not shown publicly until availability is reconfirmed."}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-sand-300 bg-sand-100 px-4 py-3 text-xs leading-5 text-ink-700">
            <Info className="h-4 w-4 shrink-0 text-sand-500" aria-hidden="true" />
            {property.detail_confidence}
          </div>

          {/* Description */}
          <section className="mt-8" aria-labelledby="description-heading">
            <h2 id="description-heading" className="font-display text-xl font-bold text-ink-900">
              About this space
            </h2>
            <p className="prose-findora mt-3 whitespace-pre-line">{property.description}</p>
          </section>

          {/* Key details */}
          <section className="mt-8" aria-labelledby="details-heading">
            <h2 id="details-heading" className="font-display text-xl font-bold text-ink-900">
              Key details
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visibleDetails.map((detail) => (
                <div key={detail.label} className="rounded-xl border border-ink-900/10 bg-white p-3.5">
                  <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">{detail.label}</dt>
                  <dd className="mt-1 text-sm font-semibold text-ink-800">{detail.value}</dd>
                </div>
              ))}
              <div className="rounded-xl border border-ink-900/10 bg-white p-3.5">
                <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">Reference</dt>
                <dd className="mt-1 text-sm font-semibold text-ink-800">{property.reference}</dd>
              </div>
              <div className="rounded-xl border border-ink-900/10 bg-white p-3.5">
                <dt className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">Available from</dt>
                <dd className="mt-1 text-sm font-semibold text-ink-800">
                  {property.terms.available_from ? formatDate(property.terms.available_from) : "Now, subject to confirmation"}
                </dd>
              </div>
            </dl>

            {property.category === "residential" && property.residential ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {property.residential.has_private_bathroom ? (
                  <span className="chip"><Bath className="h-3.5 w-3.5" aria-hidden="true" /> Private bathroom</span>
                ) : null}
                {property.residential.shared_accommodation ? (
                  <span className="chip"><DoorOpen className="h-3.5 w-3.5" aria-hidden="true" /> Shared accommodation</span>
                ) : null}
                {property.residential.security_features.map((feature) => (
                  <span key={feature} className="chip"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {titleize(feature)}</span>
                ))}
                {property.residential.outdoor_space ? (
                  <span className="chip"><Trees className="h-3.5 w-3.5" aria-hidden="true" /> {titleize(property.residential.outdoor_space)}</span>
                ) : null}
              </div>
            ) : null}

            {property.category === "commercial" && property.commercial ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {property.commercial.water_supply ? (
                  <span className="chip"><Droplets className="h-3.5 w-3.5" aria-hidden="true" /> {titleize(property.commercial.water_supply)} water</span>
                ) : null}
                {property.commercial.sanitation ? (
                  <span className="chip">{titleize(property.commercial.sanitation)} sanitation</span>
                ) : null}
                {property.commercial.loading_access ? (
                  <span className="chip"><Ruler className="h-3.5 w-3.5" aria-hidden="true" /> Loading access</span>
                ) : null}
                {property.commercial_uses.length ? (
                  <span className="chip"><Store className="h-3.5 w-3.5" aria-hidden="true" /> Suitable for {property.commercial_uses.map((use) => use.name.toLowerCase()).join(", ")}</span>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* Amenities */}
          {property.amenities.length ? (
            <section className="mt-8" aria-labelledby="amenities-heading">
              <h2 id="amenities-heading" className="font-display text-xl font-bold text-ink-900">
                Amenities and nearby facilities
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {property.amenities.map((amenity) => (
                  <div key={amenity.id} className="flex items-center gap-2 rounded-xl border border-ink-900/10 bg-white px-3.5 py-2.5 text-sm text-ink-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                    <span className="truncate">{amenity.name}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Move-in costs */}
          <section className="mt-8" aria-labelledby="costs-heading">
            <h2 id="costs-heading" className="font-display text-xl font-bold text-ink-900">
              Move-in costs
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-500">
              The figures below come from the property team. Confirm them in writing before paying. Findora does not
              collect rent or deposits for listings.
            </p>
            <div className="mt-3 overflow-hidden rounded-2xl border border-ink-900/10 bg-white">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Disclosed move-in costs for this property</caption>
                <tbody className="divide-y divide-ink-900/10">
                  {moveIn.line_items.map((item) => (
                    <tr key={`${item.label}-${item.amount}`}>
                      <th scope="row" className="px-4 py-3 font-medium text-ink-600">{item.label}</th>
                      <td className="px-4 py-3 text-right font-semibold text-ink-800">{formatKes(item.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-ivory-100">
                    <th scope="row" className="px-4 py-3 font-semibold text-ink-800">Initial total</th>
                    <td className="px-4 py-3 text-right font-display text-base font-bold text-teal-800">{formatKes(moveIn.initial_total)}</td>
                  </tr>
                </tbody>
              </table>
              <p className="border-t border-ink-900/10 bg-ivory-50 px-4 py-3 text-xs leading-5 text-ink-500">
                {moveIn.note}
              </p>
            </div>
            {!moveIn.disclosed ? (
              <InlineNote tone="warning">
                Some mandatory costs have not been disclosed. Ask the property team for a full written breakdown before
                you commit.
              </InlineNote>
            ) : null}
          </section>

          {/* Location */}
          <section className="mt-8" aria-labelledby="location-heading">
            <h2 id="location-heading" className="font-display text-xl font-bold text-ink-900">
              Approximate location
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-500">
              {location.map_note ?? "The map shows an approximate area, not the exact address. This protects current occupants from unwanted visits."}
            </p>
            {location.latitude !== null && location.longitude !== null ? (
              <div className="mt-3">
                <PropertyMap
                  markers={[
                    {
                      id: property.id,
                      title: property.title,
                      rent: property.rent_amount,
                      latitude: location.latitude,
                      longitude: location.longitude,
                      href: `/properties/${property.id}`,
                      featured: property.is_featured,
                    },
                  ]}
                  approximateRadiusM={250}
                  singleMarker
                  className="h-[300px] sm:h-[360px]"
                />
                <p className="mt-2 text-xs text-ink-400">
                  Location precision: {titleize(location.precision)}.
                  {location.directions ? ` Directions: ${location.directions}` : ""}
                </p>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-ink-900/10 bg-ivory-100 p-5 text-sm text-ink-500">
                A public map pin has not been provided for this listing. Ask the property team for directions when you
                arrange a viewing.
              </div>
            )}
          </section>

          {/* Property Passport */}
          <section className="mt-10" aria-labelledby="passport-heading">
            <div className="rounded-3xl border border-ink-900/10 bg-white p-5 shadow-card sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-900/10 pb-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Property Passport</p>
                  <h2 id="passport-heading" className="mt-1 font-display text-xl font-bold text-ink-900">
                    What has been checked
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-ink-500">
                    {property.verification.summary}. Every check is recorded separately with its status and date.
                  </p>
                </div>
                <Badge tone={property.verification.level === "strong" ? "green" : property.verification.level === "moderate" ? "teal" : "slate"}>
                  {property.verification.verified_count} of {property.verification.checks.length || 8} verified
                </Badge>
              </div>

              <ul className="mt-5 space-y-2.5">
                {property.verification.checks.map((check) => (
                  <li
                    key={check.type}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-3",
                      check.status === "verified" ? "border-teal-200 bg-teal-50/60" : "border-ink-900/10 bg-ivory-50",
                    )}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-teal-700">
                      {CHECK_ICONS[check.type] ?? <ShieldCheck className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink-800">{check.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-ink-500">
                        {check.summary ?? (check.status === "verified" ? "Checked by Findora" : "Not yet completed")}
                        {check.verified_at ? ` · ${formatDate(check.verified_at)}` : ""}
                        {check.expires_at ? ` · valid until ${formatDate(check.expires_at)}` : ""}
                        {typeof check.evidence_count === "number" && check.evidence_count > 0
                          ? ` · ${check.evidence_count} evidence item${check.evidence_count === 1 ? "" : "s"} on file`
                          : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CheckStatusIcon status={check.status} />
                      <Badge tone={checkTone(check.status)}>{titleize(check.status)}</Badge>
                    </span>
                  </li>
                ))}
              </ul>

              {outstandingChecks.length ? (
                <p className="mt-4 rounded-xl bg-sand-100 px-3.5 py-3 text-xs leading-5 text-ink-600">
                  {outstandingChecks.length} check{outstandingChecks.length === 1 ? " has" : "s have"} not been completed.
                  Findora does not present those items as verified. Ask the property team what is still outstanding.
                </p>
              ) : null}

              <p className="mt-3 text-xs leading-5 text-ink-400">{property.verification.disclaimer}</p>
            </div>
          </section>

          {/* Availability history */}
          {property.availability_history.length ? (
            <section className="mt-8" aria-labelledby="availability-heading">
              <h2 id="availability-heading" className="font-display text-xl font-bold text-ink-900">
                Availability record
              </h2>
              <ol className="mt-3 space-y-2">
                {property.availability_history.map((item, index) => (
                  <li key={`${item.confirmed_at}-${index}`} className="flex items-start gap-3 rounded-xl border border-ink-900/10 bg-white px-4 py-3">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-800">{titleize(item.status)}</p>
                      <p className="text-xs text-ink-400">
                        Confirmed {timeAgo(item.confirmed_at)} · source: {titleize(item.source)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* Inspection */}
          {property.inspections.length ? (
            <section className="mt-8" aria-labelledby="inspection-heading">
              <h2 id="inspection-heading" className="font-display text-xl font-bold text-ink-900">
                Field inspection notes
              </h2>
              <div className="mt-3 space-y-3">
                {property.inspections.map((inspection) => (
                  <div key={inspection.id} className="rounded-2xl border border-ink-900/10 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink-800">
                        Inspected {formatDate(inspection.inspection_date)}
                      </p>
                      <Badge tone="teal">Field report</Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                      {[
                        ["Exterior", inspection.exterior_condition],
                        ["Interior", inspection.interior_condition],
                        ["Water", inspection.water_facilities],
                        ["Electricity", inspection.electricity],
                        ["Doors and windows", inspection.doors_windows],
                        ["Plumbing", inspection.plumbing],
                        ["Access", inspection.access],
                      ]
                        .filter(([, value]) => Boolean(value))
                        .map(([label, value]) => (
                          <div key={label}>
                            <dt className="font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
                            <dd className="mt-0.5 text-ink-600">{value}</dd>
                          </div>
                        ))}
                    </dl>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-ink-400">{property.inspection_note}</p>
            </section>
          ) : null}

          {/* Safety */}
          <section className="mt-8 rounded-2xl border border-sand-300 bg-sand-100 p-5" aria-labelledby="safety-heading">
            <h2 id="safety-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
              <ShieldAlert className="h-5 w-5 text-terracotta-600" aria-hidden="true" />
              Before you pay
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-ink-700">
              {safetyPoints.map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta-500" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-5 text-ink-500">
              {property.report_count > 0
                ? `${property.report_count} open report${property.report_count === 1 ? " is" : "s are"} being reviewed for this listing.`
                : "No open reports are recorded for this listing."}{" "}
              <Link href="/trust#safety" className="font-semibold text-teal-700 hover:underline">
                Read the full safety guide
              </Link>
              .
            </p>
          </section>

          {/* History */}
          {property.history.length ? (
            <section className="mt-8" aria-labelledby="history-heading">
              <h2 id="history-heading" className="font-display text-xl font-bold text-ink-900">
                Listing history
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-ink-600">
                {property.history.map((event, index) => (
                  <li key={`${event.created_at}-${index}`} className="flex items-start gap-3 rounded-xl bg-ivory-100 px-4 py-2.5">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden="true" />
                    <span>
                      <span className="font-medium text-ink-700">{event.summary}</span>
                      <span className="ml-1.5 text-xs text-ink-400">{formatDate(event.created_at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-ink-900/10 bg-white p-5 shadow-card">
            <div className="flex items-center gap-3 border-b border-ink-900/10 pb-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 font-display text-sm font-bold text-white">
                {property.contact.name
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join("") || "FS"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-900">{property.contact.name}</p>
                <p className="text-xs text-ink-400">
                  {property.contact.role}
                  {property.contact.phone_verified ? " · phone verified" : " · phone not verified"}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm text-ink-600">
              <p className="flex items-center justify-between gap-2">
                <span className="text-ink-400">Contact</span>
                <span className="font-semibold text-ink-800">{property.contact.phone_masked}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span className="text-ink-400">On Findora since</span>
                <span className="font-medium">{formatDate(property.contact.member_since)}</span>
              </p>
              {property.contact.manager_name ? (
                <p className="flex items-center justify-between gap-2">
                  <span className="text-ink-400">Managed by</span>
                  <span className="font-medium">{property.contact.manager_name}</span>
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <ContactActions propertyId={property.id} propertyTitle={property.title} />
            </div>

            <p className="mt-4 rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-500">
              {property.contact.contact_note}
            </p>
          </div>

          <div className="rounded-2xl border border-ink-900/10 bg-white p-5">
            <h2 className="font-display text-base font-bold text-ink-900">Verification at a glance</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {verifiedChecks.slice(0, 6).map((check) => (
                <li key={check.type} className="flex items-center gap-2 text-ink-600">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                  <span className="flex-1">{check.label}</span>
                  <span className="text-xs font-semibold text-teal-700">Verified</span>
                </li>
              ))}
              {verifiedChecks.length === 0 ? (
                <li className="text-sm leading-6 text-ink-500">
                  No verification checks have been completed yet. Treat all details as landlord-provided.
                </li>
              ) : null}
            </ul>
            <a href="#passport-heading" className="mt-3 inline-block text-xs font-semibold text-teal-700 hover:underline">
              See the full Property Passport
            </a>
          </div>

          <div className="rounded-2xl border border-sage-300 bg-sage-100 p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-teal-900">
              <Handshake className="h-4 w-4" aria-hidden="true" />
              Can&apos;t visit yet?
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-teal-900/80">
              A local Findora partner can inspect a property and send a factual field report for staff review before
              you travel.
            </p>
            <Link href="/assisted" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-800 hover:underline">
              Ask Findora to help
              <ArrowLeft className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
            </Link>
          </div>
        </aside>
      </div>

      {payload.similar.length ? (
        <section className="mt-14" aria-labelledby="similar-heading">
          <SectionHeading
            eyebrow="Keep looking"
            title="Similar freshly confirmed spaces"
            description="These listings also passed moderation and the availability freshness check."
            href={`/properties?category=${property.category}&town_id=${location.town_id}`}
            hrefLabel="Browse more"
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {payload.similar.slice(0, 3).map((item) => (
              <PropertyCard key={item.id} property={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
