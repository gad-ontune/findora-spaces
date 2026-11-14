"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CalendarCheck2,
  CalendarClock,
  Eye,
  Inbox,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Store,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader, StatCard } from "@/components/ui/page";
import { api, errorMessage } from "@/lib/api";
import type { PropertyListResponse, PropertySummary } from "@/lib/types";
import {
  availabilityLabel,
  cn,
  formatDate,
  formatKes,
  propertyTypeLabel,
  titleize,
} from "@/lib/utils";

type Filter = "all" | "attention" | "approved";

const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Available now" },
  { value: "occupied", label: "Occupied" },
  { value: "temporarily_unavailable", label: "Temporarily unavailable" },
  { value: "unconfirmed", label: "Unconfirmed" },
];

export default function MyPropertiesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [availabilityTarget, setAvailabilityTarget] = useState<PropertySummary | null>(null);
  const [availabilityStatus, setAvailabilityStatus] = useState("available");
  const [availabilityNotes, setAvailabilityNotes] = useState("");
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const canConfirm = hasPermission("availability:manage");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-properties"],
    queryFn: () => api.get<PropertyListResponse>("/properties/mine"),
  });

  const properties = data?.properties ?? [];
  const overview = data?.overview;

  const filtered = useMemo(() => {
    if (filter === "approved") return properties.filter((property) => property.status === "approved");
    if (filter === "attention") {
      return properties.filter(
        (property) =>
          property.status === "pending" ||
          property.status === "rejected" ||
          property.status === "suspended" ||
          !property.is_fresh ||
          property.availability_status === "unconfirmed",
      );
    }
    return properties;
  }, [properties, filter]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["my-properties"] });
    await queryClient.invalidateQueries({ queryKey: ["seeker-overview"] });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function confirmAvailability(property: PropertySummary) {
    setConfirmingId(property.id);
    try {
      const result = await api.post<{ message: string }>(`/properties/${property.id}/confirm-availability`);
      await refresh();
      toast({ title: "Availability confirmed", description: result.message, tone: "success" });
    } catch (error) {
      toast({ title: "Could not confirm availability", description: errorMessage(error), tone: "error" });
    } finally {
      setConfirmingId(null);
    }
  }

  function openAvailability(property: PropertySummary) {
    setAvailabilityTarget(property);
    setAvailabilityStatus(property.stored_availability_status || "available");
    setAvailabilityNotes("");
  }

  async function saveAvailability(event: React.FormEvent) {
    event.preventDefault();
    if (!availabilityTarget) return;
    setSavingAvailability(true);
    try {
      const result = await api.patch<{ message: string }>(
        `/properties/${availabilityTarget.id}/availability`,
        { status: availabilityStatus, notes: availabilityNotes.trim() || null },
      );
      await refresh();
      setAvailabilityTarget(null);
      toast({ title: "Availability updated", description: result.message, tone: "success" });
    } catch (error) {
      toast({ title: "Could not update availability", description: errorMessage(error), tone: "error" });
    } finally {
      setSavingAvailability(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property tools"
        title="Your listings"
        description="Manage the properties you own, manage or submitted. Public visibility depends on moderation and fresh availability — both are shown honestly here."
        actions={
          <>
            <LinkButton href="/dashboard/enquiries" variant="outline">
              <Inbox className="h-4 w-4" aria-hidden="true" />
              Enquiries
            </LinkButton>
            <LinkButton href="/dashboard/properties/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a property
            </LinkButton>
          </>
        }
      />

      {overview ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total listings"
            value={overview.total}
            hint={`${overview.active} approved · ${overview.pending} awaiting moderation`}
            icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
          />
          <StatCard
            label="Publicly available"
            value={overview.available}
            hint="Approved and freshly confirmed"
            icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
            tone="sage"
          />
          <StatCard
            label="Need reconfirmation"
            value={overview.unconfirmed}
            hint="Availability is unconfirmed or stale"
            icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
            tone="sand"
          />
          <StatCard
            label="Seeker interest"
            value={overview.views}
            hint={`${overview.contact_requests} contact request${overview.contact_requests === 1 ? "" : "s"}`}
            icon={<Eye className="h-5 w-5" aria-hidden="true" />}
          />
        </div>
      ) : null}

      {overview && overview.unconfirmed > 0 ? (
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {overview.unconfirmed} listing{overview.unconfirmed === 1 ? " needs" : "s need"} an availability
              reconfirmation. Stale listings are not shown as available to seekers until you confirm them.
            </span>
          </span>
        </InlineNote>
      ) : null}

      <div className="inline-flex flex-wrap rounded-xl border border-ink-900/10 bg-white p-1" role="tablist" aria-label="Listing filters">
        {(
          [
            { value: "all" as Filter, label: `All (${properties.length})` },
            {
              value: "attention" as Filter,
              label: `Needs attention (${properties.filter((property) => property.status === "pending" || property.status === "rejected" || property.status === "suspended" || !property.is_fresh).length})`,
            },
            {
              value: "approved" as Filter,
              label: `Approved (${properties.filter((property) => property.status === "approved").length})`,
            },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              "rounded-lg px-3.5 py-2 text-sm font-semibold transition",
              filter === option.value ? "bg-teal-700 text-ivory-50" : "text-ink-500 hover:text-ink-800",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isError ? (
        <ErrorState
          title="Your listings could not load"
          description="We could not reach your property records. Nothing is guessed or cached."
          retry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : filtered.length ? (
        <div className="space-y-3">
          {filtered.map((property) => {
            const place = [property.location.neighbourhood, property.location.town].filter(Boolean).join(", ");
            const needsAttention =
              property.status === "pending" ||
              property.status === "rejected" ||
              property.status === "suspended" ||
              !property.is_fresh;
            return (
              <article key={property.id} className="surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  {property.primary_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={property.primary_image.url}
                      alt={property.primary_image.caption ?? ""}
                      className="h-20 w-28 shrink-0 rounded-xl object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-20 w-28 shrink-0 items-center justify-center rounded-xl bg-ivory-200 text-ink-300">
                      {property.category === "commercial" ? (
                        <Store className="h-7 w-7" aria-hidden="true" />
                      ) : (
                        <Building2 className="h-7 w-7" aria-hidden="true" />
                      )}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-base font-bold text-ink-900">
                        {property.status === "approved" ? (
                          <Link href={`/properties/${property.id}`} className="hover:text-teal-700">
                            {property.title}
                          </Link>
                        ) : (
                          property.title
                        )}
                      </h2>
                      <StatusBadge status={property.status} />
                      <StatusBadge
                        status={property.availability_status}
                        label={availabilityLabel(property.availability_status, property.is_fresh)}
                      />
                      {needsAttention ? (
                        <Badge tone="amber" dot>
                          Action needed
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                        {place || "Location not set"}
                      </span>
                      <span>{propertyTypeLabel(property.property_type)}</span>
                      <span>{formatKes(property.rent_amount)} / {property.rent_period}</span>
                      <span>Ref {property.reference}</span>
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
                      {property.status === "approved"
                        ? `${property.views_count} view${property.views_count === 1 ? "" : "s"} · published ${formatDate(property.published_at)}`
                        : `Submitted ${formatDate(property.created_at)} · ${property.verification.verified_count} verification check${property.verification.verified_count === 1 ? "" : "s"}`}
                      {property.last_confirmed_available_at
                        ? ` · availability confirmed ${formatDate(property.last_confirmed_available_at)}`
                        : " · availability never confirmed"}
                    </p>
                    {property.rejection_reason ? (
                      <p className="mt-2 rounded-lg bg-terracotta-100 px-3 py-2 text-xs leading-5 text-terracotta-800">
                        <strong className="font-semibold">Moderation note:</strong> {property.rejection_reason}
                      </p>
                    ) : null}
                    {property.suspension_reason ? (
                      <p className="mt-2 rounded-lg bg-terracotta-100 px-3 py-2 text-xs leading-5 text-terracotta-800">
                        <strong className="font-semibold">Suspended:</strong> {property.suspension_reason}
                      </p>
                    ) : null}
                    {!property.is_fresh && property.availability_status !== "occupied" ? (
                      <p className="mt-2 rounded-lg bg-sand-100 px-3 py-2 text-xs leading-5 text-ink-600">
                        This listing is not shown as available because its availability confirmation is stale. Reconfirm
                        it if it is still available.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-900/10 pt-3">
                  <LinkButton href={`/dashboard/properties/${property.id}/edit`} size="sm" variant="outline">
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Manage listing
                  </LinkButton>
                  {property.status === "approved" ? (
                    <LinkButton href={`/properties/${property.id}`} size="sm" variant="ghost">
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      View public page
                    </LinkButton>
                  ) : null}
                  {canConfirm ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => confirmAvailability(property)}
                        loading={confirmingId === property.id}
                        disabled={property.availability_status === "occupied"}
                      >
                        <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Confirm available
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openAvailability(property)}>
                        Change availability
                      </Button>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Building2 className="h-6 w-6" aria-hidden="true" />}
          title={filter === "all" ? "No listings yet" : "Nothing in this view"}
          description={
            filter === "all"
              ? "Add the first property you own or manage. It stays private until moderation approves it and availability is fresh."
              : "No listings match this filter right now."
          }
          action={<LinkButton href="/dashboard/properties/new">Add a property</LinkButton>}
        />
      )}

      <Modal
        open={Boolean(availabilityTarget)}
        onClose={() => setAvailabilityTarget(null)}
        title="Update availability"
        description="Availability is separate from moderation. Seekers see the honest status, and only a fresh available confirmation keeps the listing in available results."
        size="sm"
      >
        <form onSubmit={saveAvailability} className="space-y-4">
          <Field label="Status" htmlFor="availability-status" required>
            <Select
              id="availability-status"
              value={availabilityStatus}
              onChange={(event) => setAvailabilityStatus(event.target.value)}
            >
              {AVAILABILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Internal note (optional)" htmlFor="availability-note">
            <Textarea
              id="availability-note"
              value={availabilityNotes}
              onChange={(event) => setAvailabilityNotes(event.target.value)}
              maxLength={1000}
              className="min-h-20"
              placeholder="e.g. New tenant moves in next week"
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setAvailabilityTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingAvailability}>
              Save availability
            </Button>
          </div>
        </form>
      </Modal>

      <p className="text-xs leading-5 text-ink-400">
        Need help with a listing?{" "}
        <Link href="/trust" className="font-semibold text-teal-700 hover:underline">
          Read the trust and safety guidance
        </Link>{" "}
        or contact support. Findora never marks a listing verified or available on your behalf without a recorded check.
      </p>
    </div>
  );
}
