"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ScrollText,
  Search,
  ShieldAlert,
} from "lucide-react";

import { useAuth } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { AuditLog } from "@/lib/types";
import { formatDateTime, titleize } from "@/lib/utils";

type AuditLogResponse = {
  logs: AuditLog[];
  pagination: { total: number; page: number; page_size: number; pages: number };
  note: string;
};

const RESOURCE_TYPES = [
  { value: "", label: "All resources" },
  { value: "property", label: "Property" },
  { value: "user", label: "User" },
  { value: "search_request", label: "Search request" },
  { value: "partner_profile", label: "Partner profile" },
  { value: "property_report", label: "Property report" },
  { value: "complaint", label: "Complaint" },
  { value: "reconciliation", label: "Reconciliation" },
  { value: "system_setting", label: "System setting" },
  { value: "amenity", label: "Amenity" },
  { value: "landmark", label: "Landmark" },
];

function JsonBlock({ value }: { value: Record<string, unknown> | null }) {
  if (!value) return <p className="text-xs text-ink-400">Not recorded</p>;
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-ink-900 px-3 py-2 text-[11px] leading-5 text-ivory-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function AdminAuditLogsPage() {
  const { hasPermission } = useAuth();
  const [action, setAction] = useState("");
  const [appliedAction, setAppliedAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const logsQuery = useQuery({
    queryKey: ["admin-audit-logs", appliedAction, resourceType, page],
    queryFn: () =>
      api.get<AuditLogResponse>("/admin/audit-logs", {
        action: appliedAction || undefined,
        resource_type: resourceType || undefined,
        page,
        page_size: 50,
      }),
    enabled: hasPermission("audit:read"),
  });

  const logs = logsQuery.data?.logs ?? [];
  const pagination = logsQuery.data?.pagination;

  if (!hasPermission("audit:read")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Administration"
          title="Audit logs"
          description="Your staff role does not include audit log access."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only super administrators can read the audit trail.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Audit logs"
        description="Append-only records of sensitive platform actions. Each entry identifies the actor, the resource and the before/after values where recorded."
        actions={
          pagination ? (
            <Badge tone="slate">
              {pagination.total} entr{pagination.total === 1 ? "y" : "ies"}
            </Badge>
          ) : undefined
        }
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setAppliedAction(action.trim());
        }}
        className="surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_220px_auto]"
      >
        <Field label="Action" htmlFor="audit-action" hint="Exact action code, e.g. property.created.">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <Input
              id="audit-action"
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder="property.created"
              className="pl-9"
            />
          </div>
        </Field>
        <Field label="Resource type" htmlFor="audit-resource">
          <Select
            id="audit-resource"
            value={resourceType}
            onChange={(event) => {
              setResourceType(event.target.value);
              setPage(1);
            }}
          >
            {RESOURCE_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full lg:w-auto">
            <Search className="h-4 w-4" aria-hidden="true" />
            Filter
          </Button>
        </div>
      </form>

      {logsQuery.isError ? (
        <ErrorState
          title="Audit logs could not load"
          description="We could not reach the audit records for this filter."
          retry={() => logsQuery.refetch()}
        />
      ) : logsQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : logs.length ? (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <caption className="sr-only">Audited platform actions</caption>
              <thead>
                <tr className="border-b border-ink-900/10 bg-ivory-100 text-[11px] uppercase tracking-wide text-ink-500">
                  <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Resource</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Actor</th>
                  <th scope="col" className="px-4 py-3 font-semibold">IP</th>
                  <th scope="col" className="px-4 py-3 font-semibold">When</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-ink-900/5 last:border-0 hover:bg-ivory-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-800">{log.action}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-600">
                      {titleize(log.resource_type)}
                      <span className="mt-0.5 block max-w-[190px] truncate font-mono text-[10px] text-ink-400">
                        {log.resource_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-600">
                      {log.actor_name ?? (log.actor_id ? `${log.actor_id.slice(0, 8)}…` : "System")}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">{log.ip_address ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-ink-500">{formatDateTime(log.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelected(log)}>
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<ScrollText className="h-6 w-6" aria-hidden="true" />}
          title="No audit entries match this filter"
          description="Audit records are written by real platform actions. The console does not fabricate log entries."
        />
      )}

      {pagination && pagination.pages > 1 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Audit log pagination">
          <p className="text-xs text-ink-500">
            Page {pagination.page} of {pagination.pages} · {pagination.total} entries
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      ) : null}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.action ?? "Audit entry"}
        description={selected ? `${titleize(selected.resource_type)} · ${formatDateTime(selected.created_at)}` : undefined}
        size="lg"
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Actor</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">
                  {selected.actor_name ?? "System"}
                  {selected.actor_id ? (
                    <span className="mt-0.5 block break-all font-mono text-[10px] text-ink-400">{selected.actor_id}</span>
                  ) : null}
                </dd>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Resource</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">
                  {titleize(selected.resource_type)}
                  <span className="mt-0.5 block break-all font-mono text-[10px] text-ink-400">{selected.resource_id}</span>
                </dd>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">IP address</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">{selected.ip_address ?? "Not recorded"}</dd>
              </div>
              <div className="rounded-xl bg-ivory-100 p-3">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Recorded</dt>
                <dd className="mt-1 text-sm font-medium text-ink-800">{formatDateTime(selected.created_at)}</dd>
              </div>
            </dl>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Before</p>
              <div className="mt-1">
                <JsonBlock value={selected.before} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">After</p>
              <div className="mt-1">
                <JsonBlock value={selected.after} />
              </div>
            </div>

            <div className="flex justify-end border-t border-ink-900/10 pt-4">
              <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <InlineNote tone="info">
        <span className="flex items-start gap-2">
          <ScrollText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{logsQuery.data?.note ?? "Audit records are append-only through application workflows."}</span>
        </span>
      </InlineNote>
    </div>
  );
}
