"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Braces,
  Pencil,
  Plus,
  Save,
  Settings,
  ShieldAlert,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage, validationDetails } from "@/lib/api";
import type { SystemSetting } from "@/lib/types";
import { formatDateTime, titleize } from "@/lib/utils";

type SettingsResponse = { settings: SystemSetting[] };

function pretty(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();

  const [selected, setSelected] = useState<SystemSetting | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("{}");
  const [creating, setCreating] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => api.get<SettingsResponse>("/admin/settings"),
    enabled: hasPermission("settings:manage"),
  });

  const settings = settingsQuery.data?.settings ?? [];

  function openEdit(setting: SystemSetting) {
    setSelected(setting);
    setEditValue(pretty(setting.value));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(editValue);
    } catch {
      toast({
        title: "Invalid JSON",
        description: "The setting value must be valid JSON. Check quotes, commas and brackets.",
        tone: "error",
      });
      return;
    }
    setSaving(true);
    try {
      const result = await api.put<{ message: string }>(`/admin/settings/${encodeURIComponent(selected.key)}`, {
        value: parsed,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      setSelected(null);
      toast({ title: "Setting updated", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not update the setting",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const key = newKey.trim();
    if (!key) return;
    if (settings.some((setting) => setting.key === key)) {
      toast({
        title: "This key already exists",
        description: "Edit the existing setting instead of creating a duplicate.",
        tone: "error",
      });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(newValue);
    } catch {
      toast({
        title: "Invalid JSON",
        description: "The setting value must be valid JSON.",
        tone: "error",
      });
      return;
    }
    setCreating(true);
    try {
      const result = await api.put<{ message: string }>(`/admin/settings/${encodeURIComponent(key)}`, {
        value: parsed,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      setCreateOpen(false);
      setNewKey("");
      setNewValue("{}");
      toast({ title: "Setting created", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not create the setting",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  if (!hasPermission("settings:manage")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Administration"
          title="Settings"
          description="Your staff role does not include platform configuration permission."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only super administrators can change system settings.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Platform configuration stored as JSON. Changes are audited and can affect listing visibility immediately. Never change a threshold to make an unverified listing public."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add setting
          </Button>
        }
      />

      <InlineNote tone="warning">
        <span className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Settings affect real behaviour. For example, the availability freshness window controls when a listing stops
            being treated as fresh. Change values deliberately and record why.
          </span>
        </span>
      </InlineNote>

      {settingsQuery.isError ? (
        <ErrorState
          title="Settings could not load"
          description="We could not reach the system settings."
          retry={() => settingsQuery.refetch()}
        />
      ) : settingsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : settings.length ? (
        <div className="space-y-3">
          {settings.map((setting) => (
            <article key={setting.key} className="surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-mono text-sm font-bold text-ink-900">{setting.key}</h2>
                    <Badge tone="slate">
                      <Braces className="h-3 w-3" aria-hidden="true" />
                      JSON
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    {setting.description ?? "No description recorded"} · updated {formatDateTime(setting.updated_at)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openEdit(setting)}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Edit
                </Button>
              </div>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-ivory-100 px-3 py-2 text-[12px] leading-5 text-ink-700">
                {pretty(setting.value)}
              </pre>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Settings className="h-6 w-6" aria-hidden="true" />}
          title="No system settings recorded"
          description="The platform is using its built-in defaults. Add a setting only when the configuration genuinely needs to be overridden."
          action={
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add setting
            </Button>
          }
        />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Edit ${selected.key}` : "Edit setting"}
        description="The value must be valid JSON. The change is audited with your account."
        size="md"
      >
        {selected ? (
          <form onSubmit={save} className="space-y-4">
            <div className="rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-600">
              <p className="font-mono font-semibold text-ink-800">{selected.key}</p>
              <p className="mt-0.5">{selected.description ?? "No description recorded"}</p>
              <p className="mt-0.5">Last updated {formatDateTime(selected.updated_at)}</p>
            </div>
            <Field
              label="Value (JSON)"
              htmlFor="setting-value"
              required
              hint="Use valid JSON: objects, arrays, strings, numbers, booleans or null."
            >
              <Textarea
                id="setting-value"
                required
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                className="min-h-40 font-mono text-xs"
                spellCheck={false}
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 border-t border-ink-900/10 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                <Save className="h-4 w-4" aria-hidden="true" />
                Save setting
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add a system setting"
        description="Use the exact key the application reads. Creating a setting with an unused key has no effect."
        size="md"
      >
        <form onSubmit={create} className="space-y-4">
          <Field label="Key" htmlFor="new-setting-key" required hint="e.g. availability.freshness_days">
            <Input
              id="new-setting-key"
              required
              maxLength={100}
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
              placeholder="availability.freshness_days"
            />
          </Field>
          <Field label="Value (JSON)" htmlFor="new-setting-value" required>
            <Textarea
              id="new-setting-value"
              required
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              className="min-h-36 font-mono text-xs"
              spellCheck={false}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 border-t border-ink-900/10 pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create setting
            </Button>
          </div>
        </form>
      </Modal>

      <InlineNote tone="info">
        <span className="flex items-start gap-2">
          <Settings className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Setting changes do not bypass moderation, verification or availability confirmation. Those rules stay
            enforced by the application.
          </span>
        </span>
      </InlineNote>
    </div>
  );
}
