"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Grid2X2, List, Map as MapIcon, SearchX } from "lucide-react";

import { PropertyMap } from "@/components/maps/property-map";
import { PropertyCard, PropertyCardSkeleton } from "@/components/property/property-card";
import {
  ActiveFilterPills,
  EMPTY_FILTERS,
  SearchFilters,
  filtersFromParams,
  filtersToQuery,
  type SearchFilterState,
} from "@/components/search/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { ConfigPayload, PropertySearchResponse } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

type TownOption = { id: string; name: string; county_id?: string; county?: string };

export function PropertiesExplorer({
  config,
  towns,
}: {
  config: ConfigPayload | null;
  towns: TownOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const [view, setView] = useState<"grid" | "map">("grid");

  const queryParams = useMemo(() => {
    const query = filtersToQuery(filters);
    query.page = String(page);
    query.page_size = "12";
    return query;
  }, [filters, page]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["property-search", queryParams],
    queryFn: () => api.get<PropertySearchResponse>("/properties", queryParams),
  });

  function update(next: SearchFilterState, nextPage = 1) {
    const query = filtersToQuery(next);
    if (nextPage > 1) query.page = String(nextPage);
    const qs = new URLSearchParams(query).toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  const markers = useMemo(
    () =>
      (data?.items ?? [])
        .filter((property) => property.location.latitude !== null && property.location.longitude !== null)
        .map((property) => ({
          id: property.id,
          title: property.title,
          rent: property.rent_amount,
          latitude: property.location.latitude as number,
          longitude: property.location.longitude as number,
          href: `/properties/${property.id}`,
          featured: property.is_featured,
        })),
    [data?.items],
  );

  const activeCategory = filters.category;
  const heading =
    activeCategory === "residential"
      ? "Homes for rent"
      : activeCategory === "commercial"
        ? "Business premises for rent"
        : "Spaces for rent";

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Discovery"
        title={heading}
        description={
          data?.visibility_note ??
          "Only approved listings with availability freshly confirmed in the last 14 days are shown."
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden rounded-xl border border-ink-900/10 bg-white p-1 sm:flex">
              <button
                type="button"
                onClick={() => setView("grid")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                  view === "grid" ? "bg-teal-700 text-white" : "text-ink-500 hover:text-ink-800",
                )}
                aria-pressed={view === "grid"}
              >
                <Grid2X2 className="h-3.5 w-3.5" aria-hidden="true" />
                Grid
              </button>
              <button
                type="button"
                onClick={() => setView("map")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                  view === "map" ? "bg-teal-700 text-white" : "text-ink-500 hover:text-ink-800",
                )}
                aria-pressed={view === "map"}
              >
                <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Map
              </button>
            </div>
            <Select
              aria-label="Sort results"
              value={filters.sort}
              onChange={(event) => update({ ...filters, sort: event.target.value })}
              className="hidden w-auto min-w-40 lg:block"
            >
              {(config?.filters.sort_options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <SearchFilters
          config={config}
          value={filters}
          onApply={(next) => update(next)}
          towns={towns}
          loading={isFetching}
        />

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <p className="text-sm text-ink-500" aria-live="polite">
                {isLoading ? (
                  "Finding spaces…"
                ) : (
                  <>
                    <span className="font-semibold text-ink-900">{formatNumber(data?.pagination.total ?? 0)}</span>{" "}
                    {(data?.pagination.total ?? 0) === 1 ? "space" : "spaces"} found
                  </>
                )}
              </p>
              {data?.facets.rent_min !== null && data?.facets.rent_min !== undefined ? (
                <Badge tone="slate">
                  {formatNumber(data.facets.rent_min)}–{formatNumber(data.facets.rent_max ?? 0)} KES
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <Select
                aria-label="Sort results"
                value={filters.sort}
                onChange={(event) => update({ ...filters, sort: event.target.value })}
                className="w-auto min-w-40"
              >
                {(config?.filters.sort_options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <ActiveFilterPills filters={filters} onRemove={(next) => update(next)} />

          {view === "map" ? (
            <div className="mb-5">
              <PropertyMap
                markers={markers}
                styleUrl={config?.map.style_url}
                className="h-[340px] sm:h-[420px]"
              />
              <p className="mt-2 text-xs text-ink-400">
                Markers show approximate locations only. Open a listing for its Property Passport.
              </p>
            </div>
          ) : null}

          {isError ? (
            <ErrorState
              title="Search could not load"
              description="We could not reach the live listing index. No fallback or invented results are shown."
              retry={() => refetch()}
            />
          ) : isLoading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <PropertyCardSkeleton key={index} />
              ))}
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {data.items.map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
              {data.pagination.pages > 1 ? (
                <nav className="mt-8 flex items-center justify-between gap-3" aria-label="Search results pages">
                  <Button
                    variant="outline"
                    disabled={!data.pagination.has_prev}
                    onClick={() => update(filters, page - 1)}
                  >
                    Previous
                  </Button>
                  <p className="text-sm text-ink-500">
                    Page <span className="font-semibold text-ink-800">{data.pagination.page}</span> of{" "}
                    {data.pagination.pages}
                  </p>
                  <Button
                    variant="outline"
                    disabled={!data.pagination.has_next}
                    onClick={() => update(filters, page + 1)}
                  >
                    Next
                  </Button>
                </nav>
              ) : null}
            </>
          ) : (
            <EmptyState
              title="No genuine matches for these filters"
              description={
                data?.empty_state?.message ??
                "No approved, freshly confirmed listing matches this search. Adjust your filters or ask our team to look for you."
              }
              icon={<SearchX className="h-6 w-6" aria-hidden="true" />}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => update({ ...EMPTY_FILTERS, q: filters.q })}>
                    Clear filters
                  </Button>
                  <Button onClick={() => router.push("/assisted")}>Find it for me</Button>
                </div>
              }
            />
          )}

          {data?.empty_state?.suggestions?.length ? (
            <div className="mt-4 rounded-2xl border border-ink-900/10 bg-ivory-100 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Try instead</p>
              <ul className="mt-2 space-y-1 text-sm text-ink-600">
                {data.empty_state.suggestions.map((suggestion) => (
                  <li key={suggestion} className="flex items-center gap-2">
                    <List className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
