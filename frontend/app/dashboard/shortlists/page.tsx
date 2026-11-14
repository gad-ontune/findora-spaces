"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, FolderHeart, MessageSquare, Plus, Trash2 } from "lucide-react";

import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage } from "@/lib/api";
import type { PropertySummary, Shortlist } from "@/lib/types";
import { formatDate, formatKes } from "@/lib/utils";

type FavouritesPayload = { properties: PropertySummary[] };

export default function ShortlistsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const shortlistsQuery = useQuery({
    queryKey: ["shortlists"],
    queryFn: () => api.get<{ shortlists: Shortlist[] }>("/shortlists"),
  });

  const favouritesQuery = useQuery({
    queryKey: ["favourites"],
    queryFn: () => api.get<FavouritesPayload>("/favourites"),
    enabled: createOpen,
  });

  const shortlists = shortlistsQuery.data?.shortlists ?? [];
  const favourites = favouritesQuery.data?.properties ?? [];

  async function copyLink(shortlist: Shortlist) {
    const url = `${window.location.origin}/shortlists/shared/${shortlist.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Private link copied", description: "Only share it with people you trust.", tone: "success" });
    } catch {
      toast({ title: "Could not copy automatically", description: url, tone: "info" });
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.post("/shortlists", {
        name: name.trim(),
        description: description.trim() || null,
        property_ids: selected,
      });
      await queryClient.invalidateQueries({ queryKey: ["shortlists"] });
      setCreateOpen(false);
      setName("");
      setDescription("");
      setSelected([]);
      toast({ title: "Shortlist created", tone: "success" });
    } catch (error) {
      toast({ title: "Could not create the shortlist", description: errorMessage(error), tone: "error" });
    } finally {
      setCreating(false);
    }
  }

  async function remove(shortlist: Shortlist) {
    if (!window.confirm(`Delete “${shortlist.name}”? The private link will stop working.`)) return;
    setDeleting(shortlist.id);
    try {
      await api.delete(`/shortlists/${shortlist.id}`);
      await queryClient.invalidateQueries({ queryKey: ["shortlists"] });
      toast({ title: "Shortlist deleted", tone: "success" });
    } catch (error) {
      toast({ title: "Could not delete the shortlist", description: errorMessage(error), tone: "error" });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Shared shortlists"
        title="Shortlists for the people deciding with you"
        description="Group saved spaces under a private link. Anyone with the link can view the spaces and leave comments — never publish it or share it widely."
        actions={
          <>
            <LinkButton href="/dashboard/favourites" variant="outline">
              Choose from saved spaces
            </LinkButton>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New shortlist
            </Button>
          </>
        }
      />

      {shortlistsQuery.isError ? (
        <ErrorState
          title="Shortlists could not load"
          description="We could not reach your shortlists."
          retry={() => shortlistsQuery.refetch()}
        />
      ) : shortlistsQuery.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : shortlists.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {shortlists.map((shortlist) => (
            <section key={shortlist.id} className="surface overflow-hidden" aria-labelledby={`shortlist-${shortlist.id}`}>
              <div className="border-b border-ink-900/10 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 id={`shortlist-${shortlist.id}`} className="font-display text-lg font-bold text-ink-900">
                      {shortlist.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-ink-400">
                      Created {formatDate(shortlist.created_at)} · {shortlist.properties.filter(Boolean).length} spaces ·{" "}
                      {shortlist.comments.length} comment{shortlist.comments.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge tone="sage">
                    <FolderHeart className="h-3 w-3" aria-hidden="true" />
                    Private link
                  </Badge>
                </div>
                {shortlist.description ? (
                  <p className="mt-2 text-sm leading-6 text-ink-500">{shortlist.description}</p>
                ) : null}
              </div>

              {shortlist.properties.filter(Boolean).length ? (
                <ul className="divide-y divide-ink-900/10">
                  {shortlist.properties.filter(Boolean).slice(0, 4).map((property) => (
                    <li key={property.id} className="flex items-center gap-3 p-3.5">
                      {property.primary_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={property.primary_image.url}
                          alt={property.primary_image.caption ?? ""}
                          className="h-12 w-16 shrink-0 rounded-lg object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-ivory-200 text-[10px] text-ink-400">
                          No photo
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/properties/${property.id}`}
                          className="line-clamp-1 text-sm font-semibold text-ink-800 hover:text-teal-700"
                        >
                          {property.title}
                        </Link>
                        <p className="text-xs text-ink-400">
                          {formatKes(property.rent_amount)} · {property.location.neighbourhood ?? property.location.town}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-5 text-sm text-ink-500">No spaces in this shortlist.</p>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-ink-900/10 bg-ivory-50 p-3.5">
                <Button variant="outline" size="sm" onClick={() => copyLink(shortlist)}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copy private link
                </Button>
                <LinkButton href={`/shortlists/shared/${shortlist.token}`} size="sm" variant="ghost">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Open
                </LinkButton>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-terracotta-700 hover:bg-terracotta-100"
                  onClick={() => remove(shortlist)}
                  loading={deleting === shortlist.id}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </Button>
              </div>

              {shortlist.comments.length ? (
                <div className="border-t border-ink-900/10 p-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-400">
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                    Latest comment
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-ink-600">
                    <strong className="font-semibold text-ink-800">{shortlist.comments[0].author_name}:</strong>{" "}
                    {shortlist.comments[0].body}
                  </p>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FolderHeart className="h-6 w-6" aria-hidden="true" />}
          title="No shortlists yet"
          description="Create a private shortlist to compare spaces with a partner, family member or colleague. They can comment without creating an account."
          action={<Button onClick={() => setCreateOpen(true)}>Create your first shortlist</Button>}
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New shared shortlist"
        description="Pick up to 12 saved spaces. The private link lets others view and comment without signing in."
        size="md"
      >
        <form onSubmit={create} className="space-y-4">
          <Field label="Shortlist name" htmlFor="new-shortlist-name" required>
            <Input
              id="new-shortlist-name"
              required
              minLength={2}
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Options for the Nairobi move"
            />
          </Field>
          <Field label="Note (optional)" htmlFor="new-shortlist-description">
            <Textarea
              id="new-shortlist-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={1000}
              className="min-h-20"
              placeholder="What should the group look at first?"
            />
          </Field>

          <fieldset>
            <legend className="label">Choose saved spaces ({selected.length}/12)</legend>
            {favouritesQuery.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : favourites.length ? (
              <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-ink-900/10 p-2">
                {favourites.map((property) => {
                  const checked = selected.includes(property.id);
                  return (
                    <label
                      key={property.id}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-sm transition hover:bg-ivory-100"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelected((current) =>
                            checked
                              ? current.filter((id) => id !== property.id)
                              : current.length >= 12
                                ? current
                                : [...current, property.id],
                          )
                        }
                        className="mt-0.5 h-4 w-4 rounded border-ink-300 text-teal-700 accent-teal-700"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink-800">{property.title}</span>
                        <span className="block text-xs text-ink-400">
                          {formatKes(property.rent_amount)} · {property.location.neighbourhood ?? property.location.town}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-ivory-100 p-3.5 text-sm text-ink-500">
                You have no saved spaces yet.{" "}
                <Link href="/properties" className="font-semibold text-teal-700 hover:underline">
                  Browse spaces
                </Link>{" "}
                and save a few first.
              </p>
            )}
          </fieldset>

          <Button type="submit" className="w-full" loading={creating} disabled={!name.trim()}>
            Create shortlist
          </Button>
        </form>
      </Modal>
    </div>
  );
}
