"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, RotateCcw, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import type { ConfigPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SearchFilterState = {
  category: string;
  q: string;
  county_id: string;
  town_id: string;
  min_rent: string;
  max_rent: string;
  property_type: string;
  bedrooms_min: string;
  bathrooms_min: string;
  furnishing: string;
  amenities: string[];
  verified: string;
  recently_confirmed_days: string;
  sort: string;
  featured: string;
};

export const EMPTY_FILTERS: SearchFilterState = {
  category: "",
  q: "",
  county_id: "",
  town_id: "",
  min_rent: "",
  max_rent: "",
  property_type: "",
  bedrooms_min: "",
  bathrooms_min: "",
  furnishing: "",
  amenities: [],
  verified: "any",
  recently_confirmed_days: "",
  sort: "newest",
  featured: "",
};

export function filtersFromParams(params: URLSearchParams): SearchFilterState {
  return {
    category: params.get("category") ?? "",
    q: params.get("q") ?? "",
    county_id: params.get("county_id") ?? "",
    town_id: params.get("town_id") ?? "",
    min_rent: params.get("min_rent") ?? "",
    max_rent: params.get("max_rent") ?? "",
    property_type: params.get("property_type") ?? "",
    bedrooms_min: params.get("bedrooms_min") ?? "",
    bathrooms_min: params.get("bathrooms_min") ?? "",
    furnishing: params.get("furnishing") ?? "",
    amenities: (params.get("amenities") ?? "").split(",").filter(Boolean),
    verified: params.get("verified") ?? "any",
    recently_confirmed_days: params.get("recently_confirmed_days") ?? "",
    sort: params.get("sort") ?? "newest",
    featured: params.get("featured") ?? "",
  };
}

export function filtersToQuery(filters: SearchFilterState): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      if (value.length) query[key] = value.join(",");
      continue;
    }
    if (value && value !== "any") query[key] = value;
  }
  return query;
}

export function countActiveFilters(filters: SearchFilterState): number {
  let count = 0;
  if (filters.category) count += 1;
  if (filters.q) count += 1;
  if (filters.county_id || filters.town_id) count += 1;
  if (filters.min_rent || filters.max_rent) count += 1;
  if (filters.property_type) count += 1;
  if (filters.bedrooms_min) count += 1;
  if (filters.bathrooms_min) count += 1;
  if (filters.furnishing) count += 1;
  if (filters.amenities.length) count += 1;
  if (filters.verified && filters.verified !== "any") count += 1;
  if (filters.recently_confirmed_days) count += 1;
  if (filters.featured) count += 1;
  return count;
}

type TownOption = { id: string; name: string; county_id?: string; county?: string };

export function SearchFilters({
  config,
  value,
  onApply,
  towns = [],
  loading,
}: {
  config: ConfigPayload | null;
  value: SearchFilterState;
  onApply: (filters: SearchFilterState) => void;
  towns?: TownOption[];
  loading?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setDraft(value), [value]);

  const townsForCounty = useMemo(() => {
    if (!draft.county_id) return towns;
    return towns.filter((town) => town.county_id === draft.county_id);
  }, [draft.county_id, towns]);

  const propertyTypes = config?.property_types
    ? draft.category === "commercial"
      ? config.property_types.commercial
      : draft.category === "residential"
        ? config.property_types.residential
        : [...config.property_types.residential, ...config.property_types.commercial]
    : [];

  const visibleAmenities = (config?.amenities ?? []).filter(
    (amenity) =>
      !draft.category ||
      amenity.applies_to === "both" ||
      amenity.applies_to === draft.category,
  );

  function set<K extends keyof SearchFilterState>(key: K, next: SearchFilterState[K]) {
    setDraft((current) => ({ ...current, [key]: next }));
  }

  function apply(next = draft) {
    onApply(next);
    setMobileOpen(false);
  }

  function reset() {
    const next = { ...EMPTY_FILTERS, category: draft.category, q: draft.q, sort: draft.sort };
    setDraft(next);
    onApply(next);
    setMobileOpen(false);
  }

  const panel = (
    <div className="space-y-5">
      <div>
        <p className="label">Category</p>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-ink-900/10 bg-ivory-100 p-1">
          {[
            { value: "", label: "All" },
            { value: "residential", label: "Homes" },
            { value: "commercial", label: "Business" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                const next = {
                  ...draft,
                  category: option.value,
                  property_type: "",
                  amenities: [],
                };
                setDraft(next);
              }}
              className={cn(
                "rounded-lg px-2 py-2 text-xs font-semibold transition",
                draft.category === option.value
                  ? "bg-white text-teal-800 shadow-sm"
                  : "text-ink-500 hover:text-ink-800",
              )}
              aria-pressed={draft.category === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <Field label="Search words" htmlFor="filter-q">
        <Input
          id="filter-q"
          value={draft.q}
          onChange={(event) => set("q", event.target.value)}
          placeholder="e.g. two bedroom near market"
          onKeyDown={(event) => {
            if (event.key === "Enter") apply();
          }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="County" htmlFor="filter-county">
          <Select
            id="filter-county"
            value={draft.county_id}
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                county_id: event.target.value,
                town_id: "",
              }));
            }}
          >
            <option value="">All counties</option>
            {config?.counties.map((county) => (
              <option key={county.id} value={county.id}>
                {county.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Town" htmlFor="filter-town">
          <Select
            id="filter-town"
            value={draft.town_id}
            onChange={(event) => set("town_id", event.target.value)}
          >
            <option value="">All towns</option>
            {townsForCounty.map((town) => (
              <option key={town.id} value={town.id}>
                {town.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Min rent (KES)" htmlFor="filter-min-rent">
          <Input
            id="filter-min-rent"
            type="number"
            min={0}
            inputMode="numeric"
            value={draft.min_rent}
            onChange={(event) => set("min_rent", event.target.value)}
            placeholder="3,000"
          />
        </Field>
        <Field label="Max rent (KES)" htmlFor="filter-max-rent">
          <Input
            id="filter-max-rent"
            type="number"
            min={0}
            inputMode="numeric"
            value={draft.max_rent}
            onChange={(event) => set("max_rent", event.target.value)}
            placeholder="25,000"
          />
        </Field>
      </div>

      <Field label="Property type" htmlFor="filter-type">
        <Select
          id="filter-type"
          value={draft.property_type}
          onChange={(event) => set("property_type", event.target.value)}
        >
          <option value="">Any type</option>
          {propertyTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
              {type.count !== undefined ? ` (${type.count})` : ""}
            </option>
          ))}
        </Select>
      </Field>

      {draft.category !== "commercial" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bedrooms (min)" htmlFor="filter-beds">
            <Select
              id="filter-beds"
              value={draft.bedrooms_min}
              onChange={(event) => set("bedrooms_min", event.target.value)}
            >
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map((count) => (
                <option key={count} value={count}>
                  {count}+
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bathrooms (min)" htmlFor="filter-baths">
            <Select
              id="filter-baths"
              value={draft.bathrooms_min}
              onChange={(event) => set("bathrooms_min", event.target.value)}
            >
              <option value="">Any</option>
              {[1, 2, 3, 4].map((count) => (
                <option key={count} value={count}>
                  {count}+
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}

      {draft.category !== "commercial" ? (
        <Field label="Furnishing" htmlFor="filter-furnishing">
          <Select
            id="filter-furnishing"
            value={draft.furnishing}
            onChange={(event) => set("furnishing", event.target.value)}
          >
            <option value="">Any</option>
            <option value="furnished">Furnished</option>
            <option value="semi_furnished">Semi-furnished</option>
            <option value="unfurnished">Unfurnished</option>
          </Select>
        </Field>
      ) : null}

      <Field label="Verification" htmlFor="filter-verified">
        <Select
          id="filter-verified"
          value={draft.verified}
          onChange={(event) => set("verified", event.target.value)}
        >
          {(config?.filters.verification_filters ?? [{ value: "any", label: "Any completed verification" }]).map(
            (option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ),
          )}
        </Select>
      </Field>

      <Field label="Availability confirmed" htmlFor="filter-fresh">
        <Select
          id="filter-fresh"
          value={draft.recently_confirmed_days}
          onChange={(event) => set("recently_confirmed_days", event.target.value)}
        >
          <option value="">Any fresh listing</option>
          <option value="3">In the last 3 days</option>
          <option value="7">In the last 7 days</option>
          <option value="14">In the last 14 days</option>
        </Select>
      </Field>

      <fieldset>
        <legend className="label">Amenities</legend>
        <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
          {visibleAmenities.map((amenity) => (
            <label
              key={amenity.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink-600 transition hover:bg-ivory-100"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-ink-300 accent-teal-700"
                checked={draft.amenities.includes(amenity.slug)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...draft.amenities, amenity.slug]
                    : draft.amenities.filter((slug) => slug !== amenity.slug);
                  set("amenities", next);
                }}
              />
              {amenity.name}
            </label>
          ))}
        </div>
      </fieldset>

      <Checkbox
        label="Featured listings only"
        description="Promoted listings are still approved and freshly confirmed."
        checked={draft.featured === "true"}
        onChange={(event) => set("featured", event.target.checked ? "true" : "")}
      />

      <div className="flex gap-2 pt-1">
        <Button onClick={() => apply()} loading={loading} className="flex-1">
          Show results
        </Button>
        <Button variant="outline" onClick={reset} aria-label="Reset filters">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  const activeCount = countActiveFilters(draft);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
        <Button variant="outline" onClick={() => setMobileOpen(true)} className="w-full">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {activeCount > 0 ? (
            <span className="ml-1 rounded-full bg-teal-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          ) : null}
        </Button>
        <Select
          aria-label="Sort results"
          value={draft.sort}
          onChange={(event) => {
            const next = { ...draft, sort: event.target.value };
            setDraft(next);
            apply(next);
          }}
          className="w-auto min-w-36"
        >
          {(config?.filters.sort_options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <aside className="surface sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto p-5 lg:block">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink-900">
            <Filter className="h-4 w-4 text-teal-600" aria-hidden="true" />
            Filters
          </h2>
          {activeCount > 0 ? (
            <button type="button" onClick={reset} className="text-xs font-semibold text-teal-700 hover:underline">
              Clear all
            </button>
          ) : null}
        </div>
        {panel}
      </aside>

      <Modal
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        title="Filter spaces"
        description="Only approved, genuinely available and freshly confirmed listings are shown."
        size="md"
      >
        <div className="max-h-[70vh] overflow-y-auto pr-1">{panel}</div>
      </Modal>
    </>
  );
}

export function ActiveFilterPills({
  filters,
  onRemove,
}: {
  filters: SearchFilterState;
  onRemove: (next: SearchFilterState) => void;
}) {
  const pills: { key: keyof SearchFilterState; label: string }[] = [];
  if (filters.category) pills.push({ key: "category", label: filters.category === "residential" ? "Homes" : "Business" });
  if (filters.q) pills.push({ key: "q", label: `“${filters.q}”` });
  if (filters.min_rent) pills.push({ key: "min_rent", label: `Min ${filters.min_rent}` });
  if (filters.max_rent) pills.push({ key: "max_rent", label: `Max ${filters.max_rent}` });
  if (filters.bedrooms_min) pills.push({ key: "bedrooms_min", label: `${filters.bedrooms_min}+ beds` });
  if (filters.verified !== "any") pills.push({ key: "verified", label: filters.verified });
  if (filters.amenities.length) pills.push({ key: "amenities", label: `${filters.amenities.length} amenities` });

  if (!pills.length) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {pills.map((pill) => (
        <button
          key={pill.key}
          type="button"
          onClick={() => {
            const next = { ...filters };
            if (pill.key === "amenities") next.amenities = [];
            else if (pill.key === "verified") next.verified = "any";
            else (next[pill.key] as string) = "";
            onRemove(next);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 transition hover:bg-teal-100"
        >
          {pill.label}
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
