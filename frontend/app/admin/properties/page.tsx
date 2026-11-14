"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Eye, Search, ShieldAlert, Sparkles, Star } from "lucide-react";

import { PropertyReviewModal } from "@/components/admin/property-review";
import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage } from "@/lib/api";
import type { AdminPropertyListResponse, PropertySummary } from "@/lib/types";
import { availabilityLabel, formatDate, formatKes, propertyTypeLabel, titleize } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending moderation" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
  { value: "archived", label: "Archived" },
];

const AVAILABILITY_OPTIONS = [
  { value: "", label: "All availability" },
  { value: "available", label: "Available" },
  { value: "occupied", label: "Occupied" },
  { value: "temporarily_unavailable", label: "Temporarily unavailable" },
  { value: "unconfirmed", label: "Unconfirmed" },
];

export default function AdminPropertiesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canView = hasPermission("property:moderate") || hasPermission("verification:review");
  const canFeature = hasPermission("promotion:manage") || hasPermission("property:moderate");
  const [status, setStatus] = useState("");
  const [availability, setAvailability] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PropertySummary | null>(null);
  const [featuringId, setFeaturingId] = useState<string | null>(null);

  const propertiesQuery = useQuery({
    queryKey: ["admin-properties", status, availability, appliedSearch, page],
    queryFn: () =>
      api.get<AdminPropertyListResponse>("/admin/properties", {
        status: status || undefined,
        availability: availability || undefined,
        q: appliedSearch || undefined,
        page,
        page_size: 25,
      }),
    enabled: canView,
  });

  const properties = propertiesQuery.data?.properties ?? [];
  const pagination = propertiesQuery.data?.pagination;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-properties"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-moderation-queue"] });
  }

  async function toggleFeatured(property: PropertySummary) {
    setFeaturingId(property.id);
    try {
      const result = await api.post<{ message: string }>(`/admin/properties/${property.id}/feature`, {
        featured: !property.is_featured,
        days: 14,
      });
      await refresh();
      toast({ title: "Promotion updated", description: result.message, tone: "success" });
    } catch (error) {
      toast({ title: "Could not update the promotion", description: errorMessage(error), tone: "error" });
    } finally {
      setFeaturingId(null);
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Property operations"
          title="All properties"
          description="Your staff role does not include property moderation or verification access."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Ask a super administrator to review your role if you need access to property records.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property operations"
        title="All properties"
        description="Search every property record, including pending, rejected and suspended listings. Public visibility still depends on approval and fresh availability."
        actions={
          pagination ? (
            <Badge tone="slate">
              {pagination.total} propert{pagination.total === 1 ? "y" : "ies"}
            </Badge>
          ) : undefined
        }
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setAppliedSearch(search.trim());
        }}
        className="surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_180px_200px_auto]"
      >
        <Field label="Search" htmlFor="property-search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <Input
              id="property-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title or reference"
              className="pl-9"
            />
          </div>
        </Field>
        <Field label="Status" htmlFor="property-status">
          <Select
            id="property-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Availability" htmlFor="property-availability">
          <Select
            id="property-availability"
            value={availability}
            onChange={(event) => {
              setAvailability(event.target.value);
              setPage(1);
            }}
          >
            {AVAILABILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full lg:w-auto">
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </Button>
        </div>
      </form>

      {propertiesQuery.isError ? (
        <ErrorState
          title="Properties could not load"
          description="We could not reach the property records for this filter."
          retry={() => propertiesQuery.refetch()}
        />
      ) : propertiesQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : properties.length ? (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <caption className="sr-only">Property records with moderation and availability status</caption>
              <thead>
                <tr className="border-b border-ink-900/10 bg-ivory-100 text-[11px] uppercase tracking-wide text-ink-500">
                  <th scope="col" className="px-4 py-3 font-semibold">Property</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Location</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Rent</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Owner</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {properties.map((property) => (
                  <tr key={property.id} className="border-b border-ink-900/5 last:border-0 hover:bg-ivory-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {property.primary_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={property.primary_image.url}
                            alt=""
                            className="h-10 w-14 shrink-0 rounded-lg object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="h-10 w-14 shrink-0 rounded-lg bg-ivory-200" aria-hidden="true" />
                        )}
                        <div className="min-w-0">
                          <p className="max-w-[220px] truncate font-semibold text-ink-800">{property.title}</p>
                          <p className="text-[11px] text-ink-400">
                            {property.reference} · {propertyTypeLabel(property.property_type)}
                            {property.is_featured ? " · featured" : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={property.status} />
                        <StatusBadge
                          status={property.availability_status}
                          label={availabilityLabel(property.availability_status, property.is_fresh)}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-600">
                      {[property.location.neighbourhood, property.location.town].filter(Boolean).join(", ") ||
                        "Not recorded"}
                      <span className="mt-0.5 block text-[11px] text-ink-400">
                        {titleize(property.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-700">
                      {formatKes(property.rent_amount)}
                      <span className="block text-[11px] text-ink-400">per {property.rent_period}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-600">
                      {property.recorded_owner_name ?? "Not recorded"}
                      <span className="mt-0.5 block text-[11px] text-ink-400">
                        {property.verification.verified_count} verified check
                        {property.verification.verified_count === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">{formatDate(property.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setSelected(property)}>
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          Review
                        </Button>
                        {canFeature && property.status === "approved" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={featuringId === property.id}
                            onClick={() => toggleFeatured(property)}
                          >
                            {property.is_featured ? (
                              <>
                                <Star className="h-3.5 w-3.5" aria-hidden="true" />
                                Unfeature
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                Feature
                              </>
                            )}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Search className="h-6 w-6" aria-hidden="true" />}
          title="No properties match this filter"
          description="Try another status, availability or search term. The console never fabricates a matching record."
        />
      )}

      {pagination && pagination.pages > 1 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Property pagination">
          <p className="text-xs text-ink-500">
            Page {pagination.page} of {pagination.pages} · {pagination.total} records
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      ) : null}

      <PropertyReviewModal
        propertyId={selected?.id ?? null}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onChanged={async () => {
          await refresh();
          setSelected(null);
        }}
      />
    </div>
  );
}
