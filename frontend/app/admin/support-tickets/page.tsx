"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, LifeBuoy, ShieldAlert } from "lucide-react";

import { useAuth } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { SupportTicket } from "@/lib/types";
import { formatDateTime, titleize } from "@/lib/utils";

type TicketListResponse = { tickets: SupportTicket[] };

const STATUS_OPTIONS = [
  { value: "", label: "All tickets" },
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export default function AdminSupportTicketsPage() {
  const { hasPermission } = useAuth();
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<SupportTicket | null>(null);

  const ticketsQuery = useQuery({
    queryKey: ["admin-support-tickets", status],
    queryFn: () =>
      api.get<TicketListResponse>("/admin/support-tickets", {
        status: status || undefined,
      }),
    enabled: hasPermission("complaint:manage"),
  });

  const tickets = ticketsQuery.data?.tickets ?? [];

  if (!hasPermission("complaint:manage")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Trust and safety"
          title="Support tickets"
          description="Your staff role does not include support ticket access."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only moderators, support officers and super administrators can view support tickets.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trust and safety"
        title="Support tickets"
        description="Review support requests raised from the platform. This console view is read-only; ticket status and resolution are managed through the support workflow."
        actions={<Badge tone="slate">{tickets.length} shown</Badge>}
      />

      <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Status" htmlFor="ticket-status" className="sm:w-64">
          <Select id="ticket-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs leading-5 text-ink-400 sm:pb-2">
          Ticket records are shown exactly as recorded. No update endpoint is exposed in this console.
        </p>
      </div>

      {ticketsQuery.isError ? (
        <ErrorState
          title="Support tickets could not load"
          description="We could not reach the support ticket records."
          retry={() => ticketsQuery.refetch()}
        />
      ) : ticketsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : tickets.length ? (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-ink-900">{ticket.subject}</h2>
                    <StatusBadge status={ticket.status} />
                    <Badge tone="slate">{titleize(ticket.category)}</Badge>
                    <Badge tone={ticket.priority === "high" || ticket.priority === "urgent" ? "red" : "amber"}>
                      {titleize(ticket.priority)} priority
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {ticket.reference} · opened {formatDateTime(ticket.created_at)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setSelected(ticket)}>
                  View ticket
                </Button>
              </div>
              <p className="mt-2 line-clamp-2 rounded-lg bg-ivory-100 px-3 py-2 text-sm leading-6 text-ink-600">
                {ticket.description}
              </p>
              {ticket.resolution ? (
                <p className="mt-2 text-xs leading-5 text-teal-800">
                  <strong className="font-semibold">Resolution:</strong> {ticket.resolution}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
          title="No support tickets in this view"
          description="Support requests raised by users appear here. The console does not invent tickets."
        />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.subject ?? "Support ticket"}
        description={selected ? `${selected.reference} · opened ${formatDateTime(selected.created_at)}` : undefined}
        size="md"
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              <Badge tone="slate">{titleize(selected.category)}</Badge>
              <Badge tone={selected.priority === "high" || selected.priority === "urgent" ? "red" : "amber"}>
                {titleize(selected.priority)} priority
              </Badge>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Description</p>
              <p className="mt-1 whitespace-pre-line rounded-xl border border-ink-900/10 px-3.5 py-3 text-sm leading-6 text-ink-600">
                {selected.description}
              </p>
            </div>
            {selected.resolution ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Resolution</p>
                <p className="mt-1 whitespace-pre-line rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-3 text-sm leading-6 text-teal-900">
                  {selected.resolution}
                </p>
              </div>
            ) : (
              <InlineNote tone="info">
                <span className="flex items-start gap-2">
                  <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>This ticket has no recorded resolution yet. Follow the support workflow to respond.</span>
                </span>
              </InlineNote>
            )}
            <div className="flex justify-end border-t border-ink-900/10 pt-4">
              <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
