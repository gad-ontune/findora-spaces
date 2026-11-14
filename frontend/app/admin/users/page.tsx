"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldAlert,
  UserCog,
  UserRound,
  Users,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage, validationDetails } from "@/lib/api";
import type { AdminUser, AdminUserListResponse } from "@/lib/types";
import { formatDate, formatDateTime, initials, titleize } from "@/lib/utils";

const ROLE_OPTIONS = [
  "property_seeker",
  "landlord",
  "property_manager",
  "data_partner",
  "finding_partner",
  "support_officer",
  "verification_officer",
  "moderator",
  "finance_officer",
  "super_admin",
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "deleted", label: "Deleted" },
];

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user: currentUser, hasPermission } = useAuth();
  const isSuperAdmin = Boolean(currentUser?.roles.includes("super_admin"));

  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [editStatus, setEditStatus] = useState("active");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const usersQuery = useQuery({
    queryKey: ["admin-users", role, status, appliedSearch, page],
    queryFn: () =>
      api.get<AdminUserListResponse>("/admin/users", {
        role: role || undefined,
        status: status || undefined,
        q: appliedSearch || undefined,
        page,
        page_size: 25,
      }),
    enabled: hasPermission("user:manage"),
  });

  const users = usersQuery.data?.users ?? [];
  const pagination = usersQuery.data?.pagination;

  function openEdit(user: AdminUser) {
    setSelected(user);
    setEditStatus(user.status);
    setEditRoles([...user.roles]);
  }

  function toggleRole(roleCode: string) {
    setEditRoles((current) =>
      current.includes(roleCode) ? current.filter((code) => code !== roleCode) : [...current, roleCode],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!editRoles.length) {
      toast({
        title: "Keep at least one role",
        description: "A user without a role cannot use the platform.",
        tone: "error",
      });
      return;
    }
    setSaving(true);
    try {
      const result = await api.patch<{ message: string }>(`/admin/users/${selected.id}`, {
        status: editStatus,
        role_codes: editRoles,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }),
      ]);
      setSelected(null);
      toast({ title: "User updated", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not update the user",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!hasPermission("user:manage")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Administration"
          title="Users"
          description="Your staff role does not include user management permission."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only super administrators can manage user accounts and roles.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Search accounts, review roles and manage access. Every status and role change is audited. You cannot suspend your own account or remove your own super administrator role."
        actions={
          pagination ? (
            <Badge tone="slate">
              {pagination.total} account{pagination.total === 1 ? "" : "s"}
            </Badge>
          ) : undefined
        }
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setAppliedSearch(search.trim());
        }}
        className="surface grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_190px_170px_auto]"
      >
        <Field label="Search" htmlFor="user-search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
            <Input
              id="user-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, phone or email"
              className="pl-9"
            />
          </div>
        </Field>
        <Field label="Role" htmlFor="user-role">
          <Select
            id="user-role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {titleize(option)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="user-status">
          <Select
            id="user-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full lg:w-auto">
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </Button>
        </div>
      </form>

      {usersQuery.isError ? (
        <ErrorState
          title="Users could not load"
          description="We could not reach the account records for this filter."
          retry={() => usersQuery.refetch()}
        />
      ) : usersQuery.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : users.length ? (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <caption className="sr-only">Platform user accounts with roles and status</caption>
              <thead>
                <tr className="border-b border-ink-900/10 bg-ivory-100 text-[11px] uppercase tracking-wide text-ink-500">
                  <th scope="col" className="px-4 py-3 font-semibold">Account</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Roles</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Phone</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last login</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Joined</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-ink-900/5 last:border-0 hover:bg-ivory-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-800 text-xs font-bold text-ivory-50">
                          {initials(user.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-800">
                            {user.name}
                            {user.id === currentUser?.id ? <span className="ml-1.5 text-[10px] text-ink-400">(you)</span> : null}
                          </p>
                          <p className="truncate text-[11px] text-ink-400">{user.email ?? "No email recorded"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[230px] flex-wrap gap-1">
                        {user.roles.map((roleCode) => (
                          <Badge key={roleCode} tone={roleCode === "super_admin" ? "teal" : "slate"}>
                            {titleize(roleCode)}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={user.status} />
                      {user.locked_until ? (
                        <p className="mt-1 text-[10px] text-terracotta-700">Locked until {formatDateTime(user.locked_until)}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-600">
                      {user.phone}
                      <span className="mt-0.5 block text-[11px] text-ink-400">
                        {user.phone_verified ? "verified" : "not verified"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {user.last_login_at ? formatDateTime(user.last_login_at) : "Never"}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(user)}>
                        <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                        Manage
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
          icon={<Users className="h-6 w-6" aria-hidden="true" />}
          title="No users match this filter"
          description="Try a different role, status or search term. The console does not fabricate accounts."
        />
      )}

      {pagination && pagination.pages > 1 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="User pagination">
          <p className="text-xs text-ink-500">
            Page {pagination.page} of {pagination.pages} · {pagination.total} accounts
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
        title={selected ? `Manage ${selected.name}` : "Manage user"}
        description="Changes are audited. Role changes take effect on the user's next request."
        size="md"
      >
        {selected ? (
          <form onSubmit={submit} className="space-y-5">
            <div className="flex items-start gap-3 rounded-xl bg-ivory-100 px-3.5 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-800 text-sm font-bold text-ivory-50">
                {initials(selected.name)}
              </span>
              <div className="min-w-0 text-xs leading-5 text-ink-600">
                <p className="text-sm font-semibold text-ink-800">{selected.name}</p>
                <p>{selected.phone}{selected.email ? ` · ${selected.email}` : ""}</p>
                <p>
                  Joined {formatDate(selected.created_at)} · {selected.phone_verified ? "phone verified" : "phone not verified"}
                </p>
              </div>
            </div>

            <Field label="Account status" htmlFor="edit-user-status" required>
              <Select
                id="edit-user-status"
                value={editStatus}
                onChange={(event) => setEditStatus(event.target.value)}
                disabled={selected.id === currentUser?.id && selected.roles.includes("super_admin")}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="deleted">Deleted</option>
              </Select>
            </Field>
            {selected.id === currentUser?.id ? (
              <InlineNote tone="warning">
                <span className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>You cannot suspend your own account or remove your own super administrator role.</span>
                </span>
              </InlineNote>
            ) : null}

            <fieldset>
              <legend className="label">Roles</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ROLE_OPTIONS.map((roleCode) => {
                  const checked = editRoles.includes(roleCode);
                  const blocked =
                    roleCode === "super_admin" &&
                    !isSuperAdmin &&
                    !selected.roles.includes("super_admin");
                  return (
                    <label
                      key={roleCode}
                      className={
                        blocked
                          ? "flex cursor-not-allowed items-start gap-2 rounded-xl border border-ink-900/10 bg-ivory-100 p-2.5 opacity-60"
                          : "flex cursor-pointer items-start gap-2 rounded-xl border border-ink-900/10 bg-white p-2.5 transition hover:border-teal-600/30"
                      }
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 accent-teal-700"
                        checked={checked}
                        disabled={blocked}
                        onChange={() => toggleRole(roleCode)}
                      />
                      <span className="text-xs font-medium leading-5 text-ink-700">{titleize(roleCode)}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-ink-400">
                Only a super administrator can grant the super administrator role. A user needs at least one role.
              </p>
            </fieldset>

            <div className="flex flex-col-reverse gap-2 border-t border-ink-900/10 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                <UserRound className="h-4 w-4" aria-hidden="true" />
                Save changes
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
