"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { List, MapPin, SearchX } from "lucide-react";

import { PropertyMap } from "@/components/maps/property-map";
import { PropertyCard } from "@/components/property/property-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import type { ConfigPayload, PropertySearchResponse } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

type Town = { id: string; name: string; county?: string | null; county_id?: string | null };

export function MapExplorer({ config, towns }: { config: ConfigPayload | null; towns: Town[] }) {
  const [category, setCategory] = useState("");
  const [townId, setTownId] = useState("");
  const [maxRent, setMaxRent] = useState("");
  const [verified, setVerified] = useState("any");
  const [q, setQ] = useState("");
  const [showList, setShowList] = useState(true);

  const params = useMemo(() => {
    const query: Record<string, string> = { page_size: "60", sort: "recently_confirmed" };
    if (category) query.category = category;
    if (townId) query.town_id = townId;
    if (maxRent) query.max_rent = maxRent;
    if (verified !== "any") query.verified = verified;
    if (q.trim()) query.q = q.trim();
    return query;
  }, [category, townId, maxRent, verified, q]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["map-search", params],
    queryFn: () => api.get<PropertySearchResponse>("/properties", params),
  });

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

  return (
    <div>
      <div className="surface mb-5 p-3.5">
        <div className="grid gap-2.5 lg:grid-cols-[auto_1fr_180px_180px_170px]">
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-ink-900/10 bg-ivory-100 p-1">
            {[
              { value: "", label: "All" },
              { value: "residential", label: "Homes" },
              { value: "commercial", label: "Business" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategory(option.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  category === option.value ? "bg-white text-teal-800 shadow-sm" : "text-ink-500 hover:text-ink-800",
                )}
                aria-pressed={category === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search town, neighbourhood or landmark"
            aria-label="Search map results"
          />
          <Select aria-label="Filter by town" value={townId} onChange={(event) => setTownId(event.target.value)}>
            <option value="">All towns</option>
            {towns.map((town) => (
              <option key={town.id} value={town.id}>
                {town.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Maximum rent" value={maxRent} onChange={(event) => setMaxRent(event.target.value)}>
            <option value="">Any budget</option>
            <option value="5000">Up to KES 5,000</option>
            <option value="10000">Up to KES 10,000</option>
            <option value="15000">Up to KES 15,000</option>
            <option value="25000">Up to KES 25,000</option>
            <option value="50000">Up to KES 50,000</option>
            <option value="100000">Up to KES 100,000</option>
          </Select>
          <Select aria-label="Verification filter" value={verified} onChange={(event) => setVerified(event.target.value)}>
            {(config?.filters.verification_filters ?? [{ value: "any", label: "Any verification" }]).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
          <p aria-live="polite">
            {isLoading ? "Loading map results…" : `${formatNumber(data?.pagination.total ?? 0)} spaces match these filters`}
          </p>
          <div className="flex items-center gap-2">
            {markers.length !== (data?.items.length ?? 0) ? (
              <span className="text-ink-400">
                {formatNumber((data?.items.length ?? 0) - markers.length)} without a public map pin
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setShowList((value) => !value)} className="lg:hidden">
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              {showList ? "Hide list" : "Show list"}
            </Button>
          </div>
        </div>
      </div>

      {isError ? (
        <ErrorState
          title="Map search could not load"
          description="We could not reach the live listing index. No cached or invented results are shown."
          retry={() => refetch()}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <PropertyMap
              markers={markers}
              styleUrl={config?.map.style_url}
              className="h-[380px] sm:h-[520px] lg:h-[calc(100vh-9rem)]"
            />
            <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-ink-400">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Map pins are approximate areas, not exact addresses. Always confirm the location and view before paying.
            </p>
          </div>

          <div className={cn(!showList && "hidden lg:block")}>
            <div className="mb-3 flex items-center gap-2">
              <Badge tone="teal">{formatNumber(data?.pagination.total ?? 0)} results</Badge>
              <span className="text-xs text-ink-400">Newest availability confirmations first</span>
            </div>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-28 w-full" />
                ))}
              </div>
            ) : data && data.items.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {data.items.map((property) => (
                  <PropertyCard key={property.id} property={property} compact />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No spaces match this map search"
                description="Adjust the filters or ask our team to look for you. We never place invented listings on the map."
                icon={<SearchX className="h-6 w-6" aria-hidden="true" />}
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCategory("");
                      setTownId("");
                      setMaxRent("");
                      setVerified("any");
                      setQ("");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
