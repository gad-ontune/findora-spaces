"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitCompareArrows, Heart, Share2, Trash2 } from "lucide-react";

import { useToast } from "@/components/providers";
import { PropertyCard } from "@/components/property/property-card";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage } from "@/lib/api";
import type { PropertySummary, Shortlist } from "@/lib/types";
import { cn } from "@/lib/utils";

type FavouritesPayload = { properties: PropertySummary[]; count: number };

export default function FavouritesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [shortlistOpen, setShortlistOpen] = useState(false);
  const [shortlistName, setShortlistName] = useState("");
  const [shortlistDescription, setShortlistDescription] = useState("");
  const [creatingShortlist, setCreatingShortlist] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["favourites"],
    queryFn: () => api.get<FavouritesPayload>("/favourites"),
  });

  const properties = useMemo(
    () => (data?.properties ?? []).filter((property) => Boolean(property.favourite_id)),
    [data?.properties],
  );

  function toggle(id: string, limit: number) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= limit) {
        toast({
          title: `Select up to ${limit} spaces`,
          description: "Remove one before adding another.",
          tone: "info",
        });
        return current;
      }
      return [...current, id];
    });
  }

  async function remove(property: PropertySummary) {
    if (!property.favourite_id) return;
    setRemoving(property.id);
    try {
      await api.delete(`/favourites/${property.favourite_id}`);
      setSelected((current) => current.filter((id) => id !== property.id));
      await queryClient.invalidateQueries({ queryKey: ["favourites"] });
      await queryClient.invalidateQueries({ queryKey: ["seeker-overview"] });
      toast({ title: "Removed from saved spaces", tone: "success" });
    } catch (error) {
      toast({ title: "Could not remove this space", description: errorMessage(error), tone: "error" });
    } finally {
      setRemoving(null);
    }
  }

  async function compare() {
    if (selected.length < 2) return;
    setComparing(true);
    try {
      await api.post("/comparisons", {
        property_ids: selected,
        name: "Saved spaces comparison",
      });
      await queryClient.invalidateQueries({ queryKey: ["comparisons"] });
      toast({ title: "Comparison saved", description: "Review the trade-offs side by side.", tone: "success" });
      router.push("/dashboard/comparisons");
    } catch (error) {
      toast({ title: "Could not compare these spaces", description: errorMessage(error), tone: "error" });
    } finally {
      setComparing(false);
    }
  }

  async function createShortlist(event: React.FormEvent) {
    event.preventDefault();
    if (!shortlistName.trim()) return;
    setCreatingShortlist(true);
    try {
      const payload = await api.post<{ shortlist: Shortlist; share_url: string }>("/shortlists", {
        name: shortlistName.trim(),
        description: shortlistDescription.trim() || null,
        property_ids: selected,
      });
      await queryClient.invalidateQueries({ queryKey: ["shortlists"] });
      setShortlistOpen(false);
      setShortlistName("");
      setShortlistDescription("");
      setSelected([]);
      toast({
        title: "Shortlist created",
        description: "Share the private link from your shortlists page.",
        tone: "success",
      });
      router.push("/dashboard/shortlists");
      return payload;
    } catch (error) {
      toast({ title: "Could not create the shortlist", description: errorMessage(error), tone: "error" });
    } finally {
      setCreatingShortlist(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Saved spaces"
        title="Your saved spaces"
        description="Keep the homes and business spaces you want to revisit. Saved listings still have to pass moderation and the availability freshness check to stay public."
        actions={
          <LinkButton href="/properties" variant="outline">
            Browse more spaces
          </LinkButton>
        }
      />

      {isError ? (
        <ErrorState
          title="Saved spaces could not load"
          description="We could not reach your saved list. Nothing is shown unless it comes from the platform."
          retry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-80 w-full" />
          ))}
        </div>
      ) : properties.length ? (
        <>
          <div className="sticky top-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-900/10 bg-white/95 p-3 shadow-card backdrop-blur">
            <p className="text-xs text-ink-500" aria-live="polite">
              <strong className="font-semibold text-ink-800">{properties.length}</strong> saved ·{" "}
              <strong className="font-semibold text-ink-800">{selected.length}</strong> selected for comparison or sharing
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={compare}
                loading={comparing}
                disabled={selected.length < 2 || selected.length > 4}
              >
                <GitCompareArrows className="h-4 w-4" aria-hidden="true" />
                Compare selected
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShortlistOpen(true)}
                disabled={selected.length === 0 || selected.length > 12}
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
                Create shortlist
              </Button>
              {selected.length ? (
                <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {properties.map((property) => {
              const checked = selected.includes(property.id);
              return (
                <div key={property.id} className="space-y-2">
                  <div className={cn("rounded-2xl transition", checked && "ring-2 ring-teal-500 ring-offset-2")}>
                    <PropertyCard property={property} />
                  </div>
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-ink-900/10 bg-white px-3 py-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-600">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(property.id, 4)}
                        className="h-4 w-4 rounded border-ink-300 text-teal-700 accent-teal-700"
                      />
                      Select to compare
                    </label>
                    <button
                      type="button"
                      onClick={() => remove(property)}
                      disabled={removing === property.id}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-terracotta-700 transition hover:bg-terracotta-100 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {removing === property.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<Heart className="h-6 w-6" aria-hidden="true" />}
          title="No saved spaces yet"
          description="Tap the heart on any listing to keep it here. Saved spaces are private to your account."
          action={<LinkButton href="/properties">Find a space</LinkButton>}
        />
      )}

      <Modal
        open={shortlistOpen}
        onClose={() => setShortlistOpen(false)}
        title="Create a shared shortlist"
        description="Anyone with the private link can view these spaces and leave comments. Only share it with people you trust."
        size="sm"
      >
        <form onSubmit={createShortlist} className="space-y-4">
          <Field label="Shortlist name" htmlFor="shortlist-name" required>
            <Input
              id="shortlist-name"
              required
              minLength={2}
              maxLength={160}
              value={shortlistName}
              onChange={(event) => setShortlistName(event.target.value)}
              placeholder="e.g. Family shortlist for Amani"
            />
          </Field>
          <Field label="Note for the group (optional)" htmlFor="shortlist-description">
            <Textarea
              id="shortlist-description"
              value={shortlistDescription}
              onChange={(event) => setShortlistDescription(event.target.value)}
              maxLength={1000}
              placeholder="e.g. Please look at water and security before we decide."
              className="min-h-20"
            />
          </Field>
          <p className="rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-500">
            {selected.length} space{selected.length === 1 ? "" : "s"} will be added. You can remove the shortlist later
            from your dashboard.
          </p>
          <Button type="submit" className="w-full" loading={creatingShortlist} disabled={!shortlistName.trim()}>
            Create shortlist
          </Button>
        </form>
      </Modal>
    </div>
  );
}
