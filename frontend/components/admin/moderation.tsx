"use client";

import { useState } from "react";
import { Archive, CheckCircle2, RotateCcw, ShieldOff, XCircle } from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { InlineNote } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { api, errorMessage } from "@/lib/api";
import type { PropertySummary } from "@/lib/types";

type Action = "approve" | "reject" | "suspend" | "archive" | "reactivate";

const COPY: Record<Action, { title: string; description: string; confirm: string; reasonRequired: boolean }> = {
  approve: {
    title: "Approve this listing?",
    description:
      "Approval makes the listing eligible for public view. It does not confirm availability — a fresh availability confirmation is still required before it appears as available.",
    confirm: "Approve listing",
    reasonRequired: false,
  },
  reject: {
    title: "Reject this listing?",
    description:
      "The landlord or manager will see your reason. Reject only for a clear policy, accuracy or evidence problem.",
    confirm: "Reject listing",
    reasonRequired: true,
  },
  suspend: {
    title: "Suspend this listing?",
    description:
      "Suspension removes the listing from public view immediately. Record the specific reason so the owner can respond.",
    confirm: "Suspend listing",
    reasonRequired: true,
  },
  archive: {
    title: "Archive this listing?",
    description:
      "Archiving removes the listing from public view and from active management. The record remains in the audit trail.",
    confirm: "Archive listing",
    reasonRequired: false,
  },
  reactivate: {
    title: "Reactivate this listing?",
    description:
      "Reactivation returns the listing to approved status. It will only show as available if its availability is genuinely fresh.",
    confirm: "Reactivate listing",
    reasonRequired: false,
  },
};

export function ModerationActions({
  property,
  onChanged,
  compact = false,
}: {
  property: PropertySummary;
  onChanged: () => void | Promise<void>;
  compact?: boolean;
}) {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  if (!hasPermission("property:moderate")) return null;

  const available: Action[] = [];
  if (property.status === "pending") available.push("approve", "reject");
  if (property.status === "approved") available.push("suspend");
  if (property.status === "rejected" || property.status === "suspended") available.push("reactivate");
  if (property.status !== "archived") available.push("archive");

  function open(next: Action) {
    setAction(next);
    setReason("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action) return;
    if (COPY[action].reasonRequired && reason.trim().length < 3) {
      toast({ title: "Add a reason", description: "This action requires a clear reason.", tone: "error" });
      return;
    }
    setSaving(true);
    try {
      const result = await api.patch<{ message: string }>(`/properties/${property.id}/moderate`, {
        action,
        reason: reason.trim() || null,
      });
      await onChanged();
      setAction(null);
      setReason("");
      toast({ title: "Moderation recorded", description: result.message, tone: "success" });
    } catch (error) {
      toast({ title: "Could not record the moderation action", description: errorMessage(error), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  const buttons: { action: Action; label: string; icon: typeof CheckCircle2; variant: "primary" | "outline" | "danger" | "ghost" }[] = [
    { action: "approve", label: "Approve", icon: CheckCircle2, variant: "primary" },
    { action: "reject", label: "Reject", icon: XCircle, variant: "danger" },
    { action: "suspend", label: "Suspend", icon: ShieldOff, variant: "danger" },
    { action: "reactivate", label: "Reactivate", icon: RotateCcw, variant: "outline" },
    { action: "archive", label: "Archive", icon: Archive, variant: "ghost" },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {buttons
          .filter((button) => available.includes(button.action))
          .map((button) => {
            const Icon = button.icon;
            return (
              <Button
                key={button.action}
                type="button"
                size="sm"
                variant={button.variant}
                onClick={() => open(button.action)}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {compact ? <span className="sr-only">{button.label}</span> : button.label}
              </Button>
            );
          })}
      </div>

      <Modal
        open={Boolean(action)}
        onClose={() => setAction(null)}
        title={action ? COPY[action].title : "Moderation"}
        description={action ? COPY[action].description : undefined}
        size="sm"
      >
        {action ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-600">
              <p className="font-semibold text-ink-800">{property.title}</p>
              <p className="mt-0.5">
                {property.reference} · {property.status.replace(/_/g, " ")} · {property.availability_status.replace(/_/g, " ")}
              </p>
            </div>

            <Field
              label={COPY[action].reasonRequired ? "Reason (required)" : "Internal note (optional)"}
              htmlFor="moderation-reason"
              required={COPY[action].reasonRequired}
              hint={
                COPY[action].reasonRequired
                  ? "This reason is shared with the owner or manager and recorded in the audit trail."
                  : "Recorded in the audit trail."
              }
            >
              <Textarea
                id="moderation-reason"
                required={COPY[action].reasonRequired}
                minLength={COPY[action].reasonRequired ? 3 : undefined}
                maxLength={2000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="min-h-24"
                placeholder={
                  action === "reject"
                    ? "e.g. The photos do not match the described property."
                    : action === "suspend"
                      ? "e.g. A seeker reported that the advertised rent is not honoured."
                      : "Optional note for the audit record."
                }
              />
            </Field>

            {action === "approve" ? (
              <InlineNote tone="warning">
                Approval does not verify the property. Do not approve a listing you believe is fraudulent, duplicated or
                materially misleading.
              </InlineNote>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setAction(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={action === "reject" || action === "suspend" ? "danger" : "primary"}
                loading={saving}
              >
                {COPY[action].confirm}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </>
  );
}
