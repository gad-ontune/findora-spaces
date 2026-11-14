"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Bookmark, Plus, Search, Trash2 } from "lucide-react";

import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage } from "@/lib/api";
import type { ConfigPayload, OptionsPayload, SavedSearch } from "@/lib/types";
import { formatDate, formatKes, titleize } from "@/lib/utils";

const FILTER_LABELS: Record<string, string> = {
  category: "Category",
  town_id: "Town",
  county_id: "County",
  property_type: "Property type",
  max_rent: "Maximum rent",
  min_rent: "Minimum rent",
  bedrooms_min: "Minimum bedrooms",
  q: "Keyword",
  verified: "Verification",
  furnishing: "Furnishing",
};

function describeFilters(filters: Record<string, unknown>, towns: OptionsPayload["towns"]) {
  return Object.entries(filters)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => {
      if (key === "town_id") {
        const town = towns.find((item) => item.id === value);
        return { key, label: "Town", value: town ? `${town.name}${town.county ? ` (${town.county})` : ""}` : "Selected town" };
      }
      if (key === "max_rent" || key === "min_rent") {
        return { key, label: FILTER_LABELS[key], value: formatKes(Number(value)) };
      }
      if (Array.isArray(value)) {
        return { key, label: FILTER_LABELS[key] ?? titleize(key), value: value.join(", ") };
      }
      return {
        key,
        label: FILTER_LABELS[key] ?? titleize(key),
        value: typeof value === "boolean" ? (value ? "Yes" : "No") : String(value),
      };
    });
}

function searchHref(search: SavedSearch) {
  const params = new URLSearchParams();
  params.set("category", search.category);
  for (const [key, value] of Object.entries(search.filters)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
    } else {
      params.set(key, String(value));
    }
  }
  return `/properties?${params.toString()}`;
}

export default function SavedSearchesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"residential" | "commercial">("residential");
  const [countyId, setCountyId] = useState("");
  const [townId, setTownId] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [maxRent, setMaxRent] = useState("");
  const [bedroomsMin, setBedroomsMin] = useState("");
  const [keyword, setKeyword] = useState("");
  const [notify, setNotify] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const searchesQuery = useQuery({
    queryKey: ["saved-searches"],
    queryFn: () => api.get<{ saved_searches: SavedSearch[] }>("/saved-searches"),
  });

  const optionsQuery = useQuery({
    queryKey: ["location-options"],
    queryFn: () => api.get<OptionsPayload>("/locations/options"),
    staleTime: 5 * 60_000,
  });

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<ConfigPayload>("/config"),
    staleTime: 5 * 60_000,
  });

  const towns = useMemo(() => {
    const all = optionsQuery.data?.towns ?? [];
    return countyId ? all.filter((town) => town.county_id === countyId) : all;
  }, [optionsQuery.data?.towns, countyId]);

  const types = configQuery.data?.property_types[category] ?? [];
  const searches = searchesQuery.data?.saved_searches ?? [];

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const filters: Record<string, unknown> = {};
    if (townId) filters.town_id = townId;
    else if (countyId) filters.county_id = countyId;
    if (propertyType) filters.property_type = propertyType;
    if (maxRent) filters.max_rent = Number(maxRent);
    if (category === "residential" && bedroomsMin) filters.bedrooms_min = Number(bedroomsMin);
    if (keyword.trim()) filters.q = keyword.trim();

    try {
      await api.post("/saved-searches", {
        name: name.trim(),
        category,
        filters,
        notify,
      });
      await queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
      setOpen(false);
      setName("");
      setTownId("");
      setPropertyType("");
      setMaxRent("");
      setBedroomsMin("");
      setKeyword("");
      setNotify(false);
      toast({ title: "Search saved", description: "Run it again whenever you want.", tone: "success" });
    } catch (error) {
      toast({ title: "Could not save the search", description: errorMessage(error), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(search: SavedSearch) {
    setDeleting(search.id);
    try {
      await api.delete(`/saved-searches/${search.id}`);
      await queryClient.invalidateQueries({ queryKey: ["saved-searches"] });
      toast({ title: "Saved search removed", tone: "success" });
    } catch (error) {
      toast({ title: "Could not remove the search", description: errorMessage(error), tone: "error" });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Saved searches"
        title="Keep a search ready"
        description="Store the filters that matter to you. Saved searches never create listings or alerts for properties that do not exist."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Save a search
          </Button>
        }
      />

      {searchesQuery.isError ? (
        <ErrorState
          title="Saved searches could not load"
          description="We could not reach your saved filters."
          retry={() => searchesQuery.refetch()}
        />
      ) : searchesQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : searches.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {searches.map((search) => {
            const filters = describeFilters(search.filters, optionsQuery.data?.towns ?? []);
            return (
              <article key={search.id} className="surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-bold text-ink-900">{search.name}</h2>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {titleize(search.category)} · saved {formatDate(search.created_at)}
                    </p>
                  </div>
                  <Badge tone={search.category === "commercial" ? "teal" : "sage"}>
                    {search.category === "commercial" ? "Commercial" : "Residential"}
                  </Badge>
                </div>

                {filters.length ? (
                  <dl className="mt-3 flex flex-wrap gap-1.5">
                    {filters.map((filter) => (
                      <div key={filter.key} className="chip">
                        <dt className="font-semibold text-ink-700">{filter.label}:</dt>
                        <dd>{filter.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-ink-500">Any approved space in this category.</p>
                )}

                <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
                  <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                  {search.notify ? "Notifications requested for this search" : "Notifications off"}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <LinkButton href={searchHref(search)} size="sm">
                    <Search className="h-3.5 w-3.5" aria-hidden="true" />
                    Run search
                  </LinkButton>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-terracotta-700 hover:bg-terracotta-100"
                    onClick={() => remove(search)}
                    loading={deleting === search.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Bookmark className="h-6 w-6" aria-hidden="true" />}
          title="No saved searches"
          description="Save a set of filters so you can return to the same search later. Results still reflect live approved and freshly confirmed supply."
          action={<Button onClick={() => setOpen(true)}>Save your first search</Button>}
        />
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Save a property search"
        description="Choose the filters that matter. You can run the search any time from this page."
        size="md"
      >
        <form onSubmit={create} className="space-y-4">
          <Field label="Search name" htmlFor="saved-search-name" required>
            <Input
              id="saved-search-name"
              required
              minLength={2}
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Two-bedroom near Amani under 20k"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="saved-search-category" required>
              <Select
                id="saved-search-category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as typeof category);
                  setPropertyType("");
                  setBedroomsMin("");
                }}
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </Select>
            </Field>
            <Field label="Property type" htmlFor="saved-search-type">
              <Select
                id="saved-search-type"
                value={propertyType}
                onChange={(event) => setPropertyType(event.target.value)}
              >
                <option value="">Any type</option>
                {types.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="County" htmlFor="saved-search-county">
              <Select
                id="saved-search-county"
                value={countyId}
                onChange={(event) => {
                  setCountyId(event.target.value);
                  setTownId("");
                }}
              >
                <option value="">Any county</option>
                {(optionsQuery.data?.counties ?? []).map((county) => (
                  <option key={county.id} value={county.id}>
                    {county.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Town" htmlFor="saved-search-town">
              <Select id="saved-search-town" value={townId} onChange={(event) => setTownId(event.target.value)}>
                <option value="">Any town</option>
                {towns.map((town) => (
                  <option key={town.id} value={town.id}>
                    {town.name}
                    {town.county ? ` (${town.county})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Maximum rent (KES)" htmlFor="saved-search-max-rent">
              <Input
                id="saved-search-max-rent"
                type="number"
                min={0}
                inputMode="numeric"
                value={maxRent}
                onChange={(event) => setMaxRent(event.target.value)}
                placeholder="e.g. 20000"
              />
            </Field>
            {category === "residential" ? (
              <Field label="Minimum bedrooms" htmlFor="saved-search-beds">
                <Select
                  id="saved-search-beds"
                  value={bedroomsMin}
                  onChange={(event) => setBedroomsMin(event.target.value)}
                >
                  <option value="">Any</option>
                  {[1, 2, 3, 4, 5].map((count) => (
                    <option key={count} value={count}>
                      {count}+
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>

          <Field label="Keyword (optional)" htmlFor="saved-search-keyword">
            <Input
              id="saved-search-keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="e.g. balcony, borehole, market"
              maxLength={160}
            />
          </Field>

          <Checkbox
            label="Notify me when matching supply appears"
            description="We only notify you about real approved listings that pass the availability freshness check."
            checked={notify}
            onChange={(event) => setNotify(event.target.checked)}
          />

          <Button type="submit" className="w-full" loading={saving} disabled={!name.trim()}>
            Save search
          </Button>
        </form>
      </Modal>

      <p className="text-xs leading-5 text-ink-400">
        Need something you cannot filter?{" "}
        <Link href="/assisted" className="font-semibold text-teal-700 hover:underline">
          Ask our local team to search for you
        </Link>
        .
      </p>
    </div>
  );
}
