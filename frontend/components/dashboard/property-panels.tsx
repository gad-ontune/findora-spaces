"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  ShieldCheck,
  ShieldQuestion,
  XCircle,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Select, Textarea } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import type {
  AvailabilityHistoryItem,
  PropertyDetail,
  PropertyVerification,
} from "@/lib/types";
import { availabilityLabel, formatDateTime, titleize } from "@/lib/utils";

const AVAILABILITY_OPTIONS = [
  { value: "available", label: "Available now" },
  { value: "occupied", label: "Occupied" },
  { value: "temporarily_unavailable", label: "Temporarily unavailable" },
  { value: "unconfirmed", label: "Unconfirmed — needs a check" },
];

export function AvailabilityPanel({ property }: { property: PropertyDetail }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("availability:manage");
  const [status, setStatus] = useState(property.stored_availability_status || "available");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const historyQuery = useQuery({
    queryKey: ["availability-history", property.id],
    queryFn: () => api.get<{ history: AvailabilityHistoryItem[] }>(`/properties/${property.id}/availability-history`),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["property", property.id] });
    await queryClient.invalidateQueries({ queryKey: ["my-properties"] });
    await queryClient.invalidateQueries({ queryKey: ["availability-history", property.id] });
    await queryClient.invalidateQueries({ queryKey: ["seeker-overview"] });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api.patch<{ message: string }>(`/properties/${property.id}/availability`, {
        status,
        notes: notes.trim() || null,
      });
      await refresh();
      setNotes("");
      toast({ title: "Availability updated", description: result.message, tone: "success" });
    } catch (error) {
      toast({ title: "Could not update availability", description: errorMessage(error), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function confirmNow() {
    setConfirming(true);
    try {
      const result = await api.post<{ message: string }>(`/properties/${property.id}/confirm-availability`);
      await refresh();
      toast({ title: "Availability reconfirmed", description: result.message, tone: "success" });
    } catch (error) {
      toast({ title: "Could not reconfirm availability", description: errorMessage(error), tone: "error" });
    } finally {
      setConfirming(false);
    }
  }

  const history = historyQuery.data?.history ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ivory-100 p-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Public availability</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge
              status={property.availability_status}
              label={availabilityLabel(property.availability_status, property.is_fresh)}
            />
            <Badge tone={property.is_fresh ? "green" : "amber"} dot>
              {property.is_fresh ? "Fresh" : "Needs reconfirmation"}
            </Badge>
          </div>
          <p className="mt-1.5 text-xs text-ink-500">
            Last confirmed{" "}
            {property.last_confirmed_available_at
              ? formatDateTime(property.last_confirmed_available_at)
              : "never"}
            . Stored status: {titleize(property.stored_availability_status)}.
          </p>
        </div>
        {canManage ? (
          <Button onClick={confirmNow} loading={confirming} disabled={property.availability_status === "occupied"}>
            <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
            Confirm available now
          </Button>
        ) : null}
      </div>

      <InlineNote tone="warning">
        Confirming availability restarts the freshness clock. Only confirm when the property is genuinely available
        today. Occupied or unavailable listings can remain public with an honest status.
      </InlineNote>

      {canManage ? (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
          <Field label="New status" htmlFor="availability-status">
            <Select id="availability-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              {AVAILABILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Internal note (optional)" htmlFor="availability-notes">
            <Textarea
              id="availability-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={1000}
              className="min-h-11"
              placeholder="e.g. Tenant moves out at the end of the month"
            />
          </Field>
          <Button type="submit" variant="outline" loading={saving}>
            Save status
          </Button>
        </form>
      ) : null}

      <div>
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-400">
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          Availability history
        </p>
        {historyQuery.isLoading ? (
          <Skeleton className="mt-2 h-20 w-full" />
        ) : history.length ? (
          <ol className="mt-2 space-y-1.5">
            {history.slice(0, 8).map((item, index) => (
              <li
                key={`${item.status}-${item.created_at}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-900/10 px-3 py-2 text-xs"
              >
                <span className="flex items-center gap-2">
                  <StatusBadge status={item.status} />
                  <span className="text-ink-400">{titleize(item.source)}</span>
                </span>
                <span className="text-ink-500">
                  {item.confirmed_at ? formatDateTime(item.confirmed_at) : formatDateTime(item.created_at)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-ink-500">No availability history recorded yet.</p>
        )}
      </div>
    </div>
  );
}

const VERIFICATION_TYPES = [
  { value: "identity", label: "Identity of the owner or representative" },
  { value: "ownership", label: "Ownership of the property" },
  { value: "authority", label: "Authority to list the property" },
  { value: "inspection", label: "Physical inspection" },
  { value: "rent", label: "Advertised rent confirmation" },
  { value: "details", label: "Property details confirmation" },
];

export function VerificationPanel({ property }: { property: PropertyDetail }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canRequest = hasPermission("verification:submit");
  const [type, setType] = useState("inspection");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const verificationQuery = useQuery({
    queryKey: ["property-verification", property.id],
    queryFn: () => api.get<PropertyVerification>(`/properties/${property.id}/verification`),
  });

  async function request(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await api.post<{ message: string }>(`/properties/${property.id}/verification-requests`, {
        verification_type: type,
        notes: notes.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["property-verification", property.id] });
      await queryClient.invalidateQueries({ queryKey: ["property", property.id] });
      setNotes("");
      toast({ title: "Verification requested", description: result.message, tone: "success" });
    } catch (error) {
      toast({ title: "Could not request verification", description: errorMessage(error), tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  const checks = verificationQuery.data?.checks ?? property.verification.checks ?? [];
  const records = verificationQuery.data?.records ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={property.verification.verified_count > 0 ? "green" : "slate"}>
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
          {titleize(property.verification.level)}
        </Badge>
        <span className="text-xs text-ink-500">
          {property.verification.verified_count} verified check
          {property.verification.verified_count === 1 ? "" : "s"} of {checks.length || 0}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {checks.map((check) => (
          <div key={check.type} className="rounded-xl border border-ink-900/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-ink-800">{check.label}</p>
              <StatusBadge status={check.status} />
            </div>
            {check.summary ? <p className="mt-1 text-xs leading-5 text-ink-500">{check.summary}</p> : null}
            <p className="mt-1 text-[11px] text-ink-400">
              {check.verified_at ? `Verified ${formatDateTime(check.verified_at)}` : "Not yet verified"}
              {check.expires_at ? ` · expires ${formatDateTime(check.expires_at)}` : ""}
            </p>
          </div>
        ))}
        {checks.length === 0 ? (
          <p className="text-sm text-ink-500">No verification checks recorded yet.</p>
        ) : null}
      </div>

      {records.length ? (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-400">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            Requests and outcomes
          </p>
          <ul className="mt-2 space-y-2">
            {records.map((record) => (
              <li key={record.id} className="rounded-xl border border-ink-900/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-800">{titleize(record.type)}</p>
                  <StatusBadge status={record.status} />
                </div>
                <p className="mt-1 text-xs text-ink-400">
                  Requested {formatDateTime(record.created_at)}
                  {record.verified_at ? ` · verified ${formatDateTime(record.verified_at)}` : ""}
                  {record.expires_at ? ` · expires ${formatDateTime(record.expires_at)}` : ""}
                </p>
                {record.notes ? <p className="mt-1 text-xs leading-5 text-ink-500">{record.notes}</p> : null}
                {record.rejection_reason ? (
                  <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-terracotta-700">
                    <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    {record.rejection_reason}
                  </p>
                ) : null}
                {record.evidence.length ? (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-400">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    {record.evidence.length} evidence item{record.evidence.length === 1 ? "" : "s"} recorded
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canRequest ? (
        <form onSubmit={request} className="rounded-xl border border-ink-900/10 bg-ivory-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
            <ShieldQuestion className="h-4 w-4 text-teal-600" aria-hidden="true" />
            Request a verification check
          </p>
          <p className="mt-0.5 text-xs leading-5 text-ink-500">
            Verification is performed independently by a Findora officer. Requesting a check does not guarantee it will
            pass.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
            <Field label="Check type" htmlFor="verification-type">
              <Select id="verification-type" value={type} onChange={(event) => setType(event.target.value)}>
                {VERIFICATION_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes for the officer (optional)" htmlFor="verification-notes">
              <Textarea
                id="verification-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={2000}
                className="min-h-11"
                placeholder="e.g. Please call the caretaker before visiting"
              />
            </Field>
            <Button type="submit" variant="outline" loading={submitting}>
              Request check
            </Button>
          </div>
        </form>
      ) : null}

      <p className="flex items-start gap-1.5 text-xs leading-5 text-ink-400">
        <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        A verified badge describes only the checks shown. It is not a structural survey, a guarantee of condition or a
        substitute for a viewing.
      </p>
    </div>
  );
}
