"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Inbox, Mail, MessageSquare, Send, ShieldAlert } from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage } from "@/lib/api";
import type { Enquiry } from "@/lib/types";
import { cn, formatDateTime, titleize } from "@/lib/utils";

type Role = "received" | "sent";

export default function EnquiriesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("enquiry:manage");
  const [role, setRole] = useState<Role>(canManage ? "received" : "sent");
  const [selected, setSelected] = useState<Enquiry | null>(null);
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState("responded");
  const [sending, setSending] = useState(false);

  const enquiriesQuery = useQuery({
    queryKey: ["enquiries", role],
    queryFn: () => api.get<{ enquiries: Enquiry[] }>("/enquiries", { role }),
  });

  const enquiries = enquiriesQuery.data?.enquiries ?? [];
  const open = enquiries.filter((enquiry) => enquiry.status === "open" || enquiry.status === "new");
  const handled = enquiries.filter((enquiry) => !["open", "new"].includes(enquiry.status));

  function openResponse(enquiry: Enquiry) {
    setSelected(enquiry);
    setResponse(enquiry.response ?? "");
    setStatus(enquiry.status === "closed" ? "closed" : "responded");
  }

  async function submitResponse(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSending(true);
    try {
      await api.patch(`/enquiries/${selected.id}`, {
        response: response.trim(),
        status,
      });
      await queryClient.invalidateQueries({ queryKey: ["enquiries"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setSelected(null);
      setResponse("");
      toast({ title: "Response sent", description: "The seeker can see your reply in their account.", tone: "success" });
    } catch (error) {
      toast({ title: "Could not send the response", description: errorMessage(error), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Enquiries"
        title={role === "received" ? "Enquiries about your properties" : "Enquiries you sent"}
        description={
          role === "received"
            ? "Respond to genuine seeker questions. Contact details stay masked until the platform shares them through an authorised flow."
            : "Review the enquiries you sent to property teams and any responses recorded on the platform."
        }
        actions={<LinkButton href="/properties" variant="outline">Browse spaces</LinkButton>}
      />

      {canManage ? (
        <div className="inline-flex rounded-xl border border-ink-900/10 bg-white p-1" role="tablist" aria-label="Enquiry direction">
          {(
            [
              { value: "received" as Role, label: "Received" },
              { value: "sent" as Role, label: "Sent" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={role === option.value}
              onClick={() => setRole(option.value)}
              className={cn(
                "rounded-lg px-3.5 py-2 text-sm font-semibold transition",
                role === option.value ? "bg-teal-700 text-ivory-50" : "text-ink-500 hover:text-ink-800",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {enquiriesQuery.isError ? (
        <ErrorState
          title="Enquiries could not load"
          description="We could not reach your enquiry records."
          retry={() => enquiriesQuery.refetch()}
        />
      ) : enquiriesQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : enquiries.length ? (
        <div className="space-y-6">
          {[
            { title: "Needs a response", items: open },
            { title: "Handled", items: handled },
          ].map((group) =>
            group.items.length ? (
              <section key={group.title} aria-labelledby={`enquiries-${group.title}`}>
                <h2 id={`enquiries-${group.title}`} className="font-display text-lg font-bold text-ink-900">
                  {group.title} ({group.items.length})
                </h2>
                <div className="mt-3 space-y-3">
                  {group.items.map((enquiry) => (
                    <article key={enquiry.id} className="surface p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-base font-bold text-ink-900">
                              {enquiry.property?.title ?? "Property enquiry"}
                            </h3>
                            <StatusBadge status={enquiry.status} />
                            <Badge tone="slate">{titleize(enquiry.type)}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-ink-500">
                            From <strong className="font-semibold text-ink-700">{enquiry.name}</strong> ·{" "}
                            {enquiry.phone}
                            {enquiry.email ? ` · ${enquiry.email}` : ""} · {formatDateTime(enquiry.created_at)}
                          </p>
                        </div>
                        {enquiry.property ? (
                          <LinkButton href={`/properties/${enquiry.property.id}`} size="sm" variant="ghost">
                            View listing
                          </LinkButton>
                        ) : null}
                      </div>

                      <p className="mt-3 whitespace-pre-line rounded-xl bg-ivory-100 px-3.5 py-3 text-sm leading-6 text-ink-700">
                        {enquiry.message}
                      </p>

                      {enquiry.response ? (
                        <div className="mt-2 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-3">
                          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-teal-800">
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                            {role === "received" ? "Your response" : "Property team response"}
                          </p>
                          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-teal-900/85">{enquiry.response}</p>
                          {enquiry.responded_at ? (
                            <p className="mt-1 text-[11px] text-teal-900/60">
                              {formatDateTime(enquiry.responded_at)}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {role === "received" && canManage ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button size="sm" onClick={() => openResponse(enquiry)}>
                            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                            {enquiry.response ? "Update response" : "Respond"}
                          </Button>
                          {enquiry.status === "closed" ? (
                            <span className="text-xs text-ink-400">This enquiry is closed.</span>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      ) : (
        <EmptyState
          icon={<Inbox className="h-6 w-6" aria-hidden="true" />}
          title={role === "received" ? "No enquiries yet" : "No enquiries sent yet"}
          description={
            role === "received"
              ? "When a seeker asks about one of your listings, it appears here. Respond honestly and never ask for a deposit before a viewing and verification."
              : "Questions you send to property teams will appear here with their responses."
          }
          action={<LinkButton href="/properties">Browse spaces</LinkButton>}
        />
      )}

      <InlineNote tone="warning">
        <span className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Never request a deposit or personal payment through an enquiry reply before the seeker has viewed the
            property and confirmed who they are paying. Report suspicious requests to Findora.
          </span>
        </span>
      </InlineNote>

      <p className="flex items-center gap-1.5 text-xs text-ink-400">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to{" "}
        <Link href="/dashboard/properties" className="font-semibold text-teal-700 hover:underline">
          my listings
        </Link>
      </p>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Respond to this enquiry"
        description="Your response is recorded against the enquiry. Keep it factual and do not promise availability you cannot confirm."
        size="md"
      >
        <form onSubmit={submitResponse} className="space-y-4">
          {selected ? (
            <p className="rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-500">
              <strong className="font-semibold text-ink-700">{selected.name}</strong> asked about{" "}
              {selected.property?.title ?? "a property"}.
            </p>
          ) : null}
          <Field label="Your response" htmlFor="enquiry-response" required>
            <Textarea
              id="enquiry-response"
              required
              minLength={2}
              maxLength={3000}
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              className="min-h-32"
              placeholder="Answer the question, confirm what you can verify and suggest a safe next step."
            />
          </Field>
          <Field label="Set status" htmlFor="enquiry-status">
            <Select id="enquiry-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="responded">Responded</option>
              <option value="closed">Closed</option>
            </Select>
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={sending} disabled={!response.trim()}>
              <Send className="h-4 w-4" aria-hidden="true" />
              Send response
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
