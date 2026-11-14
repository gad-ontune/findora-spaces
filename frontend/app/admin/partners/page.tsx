"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Handshake,
  MapPin,
  ShieldAlert,
  Star,
  UserCog,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage, validationDetails } from "@/lib/api";
import type { AdminPartner, AdminPartnerListResponse } from "@/lib/types";
import { formatDate, titleize } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "", label: "All partners" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected", label: "Rejected" },
];

export default function AdminPartnersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canView = hasPermission("partner:manage") || hasPermission("assisted:manage");
  const canManage = hasPermission("partner:manage");

  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<AdminPartner | null>(null);
  const [editStatus, setEditStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const partnersQuery = useQuery({
    queryKey: ["admin-partners", status],
    queryFn: () =>
      api.get<AdminPartnerListResponse>("/admin/partners", {
        status: status || undefined,
      }),
    enabled: canView,
  });

  const partners = partnersQuery.data?.partners ?? [];

  function openEdit(partner: AdminPartner) {
    setSelected(partner);
    setEditStatus(partner.status);
    setNotes("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    try {
      const result = await api.patch<{ message: string }>(`/admin/partners/${selected.id}`, {
        status: editStatus,
        notes: notes.trim() || null,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-partners"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-active-partners"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }),
      ]);
      setSelected(null);
      setNotes("");
      toast({ title: "Partner updated", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not update the partner",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Assisted search"
          title="Local partners"
          description="Your staff role does not include partner access."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only partner managers, support officers and super administrators can view local partners.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assisted search"
        title="Local partners"
        description="Approve and manage the local property-finding and data-collection network. Active partners can be assigned assisted searches in the towns they cover."
        actions={<Badge tone="slate">{partners.length} shown</Badge>}
      />

      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Status" htmlFor="partner-status" className="sm:w-64">
          <Select id="partner-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs leading-5 text-ink-400 sm:pb-2">
          Only active partners who cover the request town can be assigned. Assignment also requires the seeker&apos;s
          consent to share.
        </p>
      </div>

      {partnersQuery.isError ? (
        <ErrorState
          title="Partners could not load"
          description="We could not reach the partner records."
          retry={() => partnersQuery.refetch()}
        />
      ) : partnersQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : partners.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {partners.map((partner) => (
            <article key={partner.id} className="surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-ink-900">
                      {partner.name ?? "Unnamed partner"}
                    </h2>
                    <StatusBadge status={partner.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {partner.company_name ?? "Individual partner"} · {titleize(partner.partner_type)}
                  </p>
                </div>
                {canManage ? (
                  <Button size="sm" variant="outline" onClick={() => openEdit(partner)}>
                    <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                    Manage
                  </Button>
                ) : null}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-ivory-100 px-2.5 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Contact</dt>
                  <dd className="mt-0.5 font-medium text-ink-700">{partner.phone ?? "Not recorded"}</dd>
                </div>
                <div className="rounded-lg bg-ivory-100 px-2.5 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Service areas</dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-medium text-ink-700">
                    <MapPin className="h-3 w-3 text-teal-600" aria-hidden="true" />
                    {partner.service_areas.length} town{partner.service_areas.length === 1 ? "" : "s"}
                  </dd>
                </div>
                <div className="rounded-lg bg-ivory-100 px-2.5 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Assignments</dt>
                  <dd className="mt-0.5 font-medium text-ink-700">{partner.assignments}</dd>
                </div>
                <div className="rounded-lg bg-ivory-100 px-2.5 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Completed</dt>
                  <dd className="mt-0.5 font-medium text-ink-700">{partner.completed_assignments}</dd>
                </div>
              </dl>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-400">
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3 text-amber-600" aria-hidden="true" />
                  {partner.rating !== null ? `${partner.rating.toFixed(1)} rating` : "No rating yet"}
                </span>
                <span>
                  Response rate:{" "}
                  {partner.response_rate !== null ? `${partner.response_rate.toFixed(0)}%` : "not enough data"}
                </span>
                <span>
                  Accuracy:{" "}
                  {partner.accuracy_score !== null ? `${partner.accuracy_score.toFixed(0)}%` : "not enough data"}
                </span>
                <span>Joined {formatDate(partner.created_at)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Handshake className="h-6 w-6" aria-hidden="true" />}
          title="No partners in this view"
          description="Partner applications appear here once submitted. The console does not fabricate partner profiles."
        />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Manage ${selected.name ?? "partner"}` : "Manage partner"}
        description="Status changes are audited and the partner is notified. Suspending a partner does not cancel an assignment already in progress."
        size="md"
      >
        {selected ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-600">
              <p className="font-semibold text-ink-800">
                {selected.name ?? "Unnamed partner"} · {selected.company_name ?? "Individual partner"}
              </p>
              <p className="mt-0.5">
                {titleize(selected.partner_type)} · {selected.service_areas.length} service area
                {selected.service_areas.length === 1 ? "" : "s"} · joined {formatDate(selected.created_at)}
              </p>
            </div>

            <Field label="Partner status" htmlFor="partner-edit-status" required>
              <Select
                id="partner-edit-status"
                value={editStatus}
                onChange={(event) => setEditStatus(event.target.value)}
              >
                <option value="pending">Pending — application awaiting review</option>
                <option value="active">Active — eligible for assignments</option>
                <option value="suspended">Suspended — not eligible for new assignments</option>
                <option value="rejected">Rejected — application declined</option>
              </Select>
            </Field>

            <Field
              label="Notes (optional)"
              htmlFor="partner-edit-notes"
              hint="Included in the notification to the partner and the audit record. Do not include private evidence."
            >
              <Textarea
                id="partner-edit-notes"
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-24"
                placeholder="e.g. Approved after confirming coverage of Kehancha and Migori town."
              />
            </Field>

            {editStatus === "active" ? (
              <InlineNote tone="warning">
                <span className="flex items-start gap-2">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Activating a partner makes them eligible for assisted-search assignments. Confirm that their identity
                    and coverage were genuinely checked.
                  </span>
                </span>
              </InlineNote>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-ink-900/10 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save partner status
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
