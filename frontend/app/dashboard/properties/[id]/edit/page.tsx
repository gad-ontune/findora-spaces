"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  CalendarClock,
  Eye,
  Image as ImageIcon,
  ListChecks,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { MediaManager } from "@/components/dashboard/media-manager";
import { AvailabilityPanel, VerificationPanel } from "@/components/dashboard/property-panels";
import { PropertyForm } from "@/components/dashboard/property-form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage } from "@/lib/api";
import type { PropertyDetail } from "@/lib/types";
import { availabilityLabel, cn, formatDate, titleize } from "@/lib/utils";

type Tab = "details" | "media" | "availability" | "verification";

type PropertyPayload = { property: PropertyDetail; similar: unknown[] };

export default function EditPropertyPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, loading, hasPermission } = useAuth();
  const [tab, setTab] = useState<Tab>("details");
  const [archiving, setArchiving] = useState(false);

  const propertyQuery = useQuery({
    queryKey: ["property", id],
    queryFn: () => api.get<PropertyPayload>(`/properties/${id}`),
    enabled: Boolean(id) && Boolean(user),
  });

  const property = propertyQuery.data?.property;

  async function archive() {
    if (!property) return;
    if (
      !window.confirm(
        "Archive this listing? It will be removed from public view. This cannot be undone from this screen.",
      )
    ) {
      return;
    }
    setArchiving(true);
    try {
      await api.delete(`/properties/${property.id}`);
      await queryClient.invalidateQueries({ queryKey: ["my-properties"] });
      await queryClient.invalidateQueries({ queryKey: ["seeker-overview"] });
      toast({ title: "Listing archived", tone: "success" });
      router.push("/dashboard/properties");
    } catch (error) {
      toast({ title: "Could not archive the listing", description: errorMessage(error), tone: "error" });
    } finally {
      setArchiving(false);
    }
  }

  if (loading || !user || propertyQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (propertyQuery.isError || !property) {
    return (
      <ErrorState
        title="This listing could not load"
        description="It may have been archived, or your account may not have permission to manage it."
        retry={() => propertyQuery.refetch()}
      />
    );
  }

  const canManage =
    Boolean(property.management) &&
    (hasPermission("property:update") || hasPermission("property:create"));

  if (!canManage) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Property tools"
          title="Manage listing"
          description="This listing is public, but your account does not have permission to edit it."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only the owner, assigned manager, creator or authorised staff can manage this property.</span>
          </span>
        </InlineNote>
        <div className="flex gap-2">
          <LinkButton href="/dashboard/properties" variant="outline">
            My listings
          </LinkButton>
          <LinkButton href={`/properties/${property.id}`} variant="ghost">
            View public page
          </LinkButton>
        </div>
      </div>
    );
  }

  const tabs: { value: Tab; label: string; icon: typeof ListChecks; count?: number }[] = [
    { value: "details", label: "Listing details", icon: ListChecks },
    { value: "media", label: "Photos and video", icon: ImageIcon, count: property.media.length },
    { value: "availability", label: "Availability", icon: CalendarClock },
    { value: "verification", label: "Verification", icon: ShieldCheck, count: property.verification.verified_count },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/properties"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All listings
      </Link>

      <PageHeader
        eyebrow="Property tools"
        title={property.title}
        description={`Reference ${property.reference} · ${titleize(property.category)} · ${titleize(property.property_type)}`}
        actions={
          <>
            {property.status === "approved" ? (
              <LinkButton href={`/properties/${property.id}`} variant="outline" size="sm">
                <Eye className="h-4 w-4" aria-hidden="true" />
                Public page
              </LinkButton>
            ) : null}
            <Button variant="ghost" size="sm" onClick={archive} loading={archiving}>
              <Archive className="h-4 w-4" aria-hidden="true" />
              Archive
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={property.status} />
        <StatusBadge
          status={property.availability_status}
          label={availabilityLabel(property.availability_status, property.is_fresh)}
        />
        <Badge tone={property.is_fresh ? "green" : "amber"} dot>
          {property.is_fresh ? "Fresh availability" : "Availability stale"}
        </Badge>
        <span className="text-xs text-ink-400">
          Created {formatDate(property.created_at)}
          {property.published_at ? ` · published ${formatDate(property.published_at)}` : ""}
        </span>
      </div>

      {property.management?.rejection_reason ? (
        <InlineNote tone="warning">
          <strong className="font-semibold">Moderation note:</strong> {property.management.rejection_reason}
        </InlineNote>
      ) : null}
      {property.management?.suspension_reason ? (
        <InlineNote tone="warning">
          <strong className="font-semibold">Suspended:</strong> {property.management.suspension_reason}
        </InlineNote>
      ) : null}

      <div
        className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-ink-900/10 bg-white p-1"
        role="tablist"
        aria-label="Listing management sections"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition",
                active ? "bg-teal-700 text-ivory-50" : "text-ink-500 hover:text-ink-800",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
              {item.count ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                    active ? "bg-white/20 text-ivory-50" : "bg-ivory-200 text-ink-500",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "details" ? <PropertyForm mode="edit" property={property} /> : null}

      {tab === "media" ? (
        <section className="surface p-5 sm:p-6" aria-labelledby="media-heading">
          <h2 id="media-heading" className="font-display text-lg font-bold text-ink-900">
            Photos and video
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-500">
            Upload current photos of the actual property. The first image becomes the primary photo when no primary is
            set. Misleading media can lead to suspension.
          </p>
          <div className="mt-4">
            <MediaManager propertyId={property.id} media={property.media} />
          </div>
        </section>
      ) : null}

      {tab === "availability" ? (
        <section className="surface p-5 sm:p-6" aria-labelledby="availability-heading">
          <h2 id="availability-heading" className="font-display text-lg font-bold text-ink-900">
            Availability
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-500">
            Keep the status honest. Only a fresh available confirmation appears in available search results.
          </p>
          <div className="mt-4">
            <AvailabilityPanel property={property} />
          </div>
        </section>
      ) : null}

      {tab === "verification" ? (
        <section className="surface p-5 sm:p-6" aria-labelledby="verification-heading">
          <h2 id="verification-heading" className="font-display text-lg font-bold text-ink-900">
            Verification
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-500">
            Verification checks are completed independently by a Findora officer. The public Property Passport shows
            only checks that were actually verified.
          </p>
          <div className="mt-4">
            <VerificationPanel property={property} />
          </div>
        </section>
      ) : null}

      <p className="text-xs leading-5 text-ink-400">
        Need to report a problem with this listing?{" "}
        <Link href="/trust" className="font-semibold text-teal-700 hover:underline">
          Contact trust and safety
        </Link>
        . All demo listings and verification records in this environment are fictional.
      </p>
    </div>
  );
}
