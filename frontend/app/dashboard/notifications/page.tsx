"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, CheckCheck } from "lucide-react";

import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Checkbox } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage } from "@/lib/api";
import type { Notification, NotificationPreferences } from "@/lib/types";
import { cn, formatDateTime, titleize } from "@/lib/utils";

type NotificationPayload = { notifications: Notification[]; unread_count: number };

function notificationHref(notification: Notification): string | null {
  const data = notification.data ?? {};
  const propertyId = typeof data.property_id === "string" ? data.property_id : null;
  const requestId = typeof data.request_id === "string" ? data.request_id : null;
  const viewingId = typeof data.viewing_id === "string" ? data.viewing_id : null;
  if (propertyId) return `/properties/${propertyId}`;
  if (requestId) return `/dashboard/requests/${requestId}`;
  if (viewingId) return "/dashboard/viewings";
  return null;
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [marking, setMarking] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: ["notifications", unreadOnly],
    queryFn: () =>
      api.get<NotificationPayload>("/notifications", { limit: 100, unread_only: unreadOnly }),
  });

  const preferencesQuery = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api.get<{ preferences: NotificationPreferences }>("/notification-preferences"),
  });

  const notifications = notificationsQuery.data?.notifications ?? [];
  const unread = notificationsQuery.data?.unread_count ?? 0;
  const preferences = preferencesQuery.data?.preferences;

  async function markAllRead() {
    setMarking(true);
    try {
      await api.patch("/notifications/read-all");
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "All notifications marked as read", tone: "success" });
    } catch (error) {
      toast({ title: "Could not update notifications", description: errorMessage(error), tone: "error" });
    } finally {
      setMarking(false);
    }
  }

  async function markRead(notification: Notification) {
    if (notification.read) return;
    try {
      await api.patch(`/notifications/${notification.id}`);
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      toast({ title: "Could not mark as read", description: errorMessage(error), tone: "error" });
    }
  }

  async function updatePreference(key: keyof NotificationPreferences, value: boolean) {
    if (!preferences) return;
    setSavingPrefs(true);
    try {
      await api.patch("/notification-preferences", { [key]: value });
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    } catch (error) {
      toast({ title: "Could not save preferences", description: errorMessage(error), tone: "error" });
    } finally {
      setSavingPrefs(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notifications"
        title="Your notification inbox"
        description="Status changes, genuine matches, viewing updates and account messages. Findora only sends notifications about real platform activity."
        actions={
          <Button variant="outline" onClick={markAllRead} loading={marking} disabled={unread === 0}>
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            Mark all read
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr] lg:items-start">
        <section className="surface overflow-hidden" aria-labelledby="inbox-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-900/10 p-4">
            <h2 id="inbox-heading" className="font-display text-lg font-bold text-ink-900">
              Inbox
              {unread ? (
                <Badge tone="teal" className="ml-2">
                  {unread} unread
                </Badge>
              ) : null}
            </h2>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-600">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => setUnreadOnly(event.target.checked)}
                className="h-4 w-4 rounded border-ink-300 text-teal-700 accent-teal-700"
              />
              Unread only
            </label>
          </div>

          {notificationsQuery.isError ? (
            <div className="p-4">
              <ErrorState
                title="Notifications could not load"
                description="We could not reach your notification inbox."
                retry={() => notificationsQuery.refetch()}
              />
            </div>
          ) : notificationsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : notifications.length ? (
            <ul className="divide-y divide-ink-900/10">
              {notifications.map((notification) => {
                const href = notificationHref(notification);
                return (
                  <li
                    key={notification.id}
                    className={cn("p-4 transition", !notification.read && "bg-teal-50/40")}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          notification.read ? "bg-ink-200" : "bg-teal-600",
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-ink-900">{notification.title}</p>
                          <span className="text-[11px] text-ink-400">{formatDateTime(notification.created_at)}</span>
                        </div>
                        <p className="mt-0.5 text-sm leading-6 text-ink-500">{notification.body}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3">
                          <Badge tone="slate">{titleize(notification.type)}</Badge>
                          {href ? (
                            <Link
                              href={href}
                              onClick={() => markRead(notification)}
                              className="text-xs font-semibold text-teal-700 hover:underline"
                            >
                              Open
                            </Link>
                          ) : null}
                          {!notification.read ? (
                            <button
                              type="button"
                              onClick={() => markRead(notification)}
                              className="text-xs font-semibold text-ink-500 hover:text-ink-800 hover:underline"
                            >
                              Mark as read
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-4">
              <EmptyState
                icon={<BellOff className="h-6 w-6" aria-hidden="true" />}
                title={unreadOnly ? "No unread notifications" : "Your inbox is empty"}
                description="Updates about saved spaces, assisted searches, viewings and payments will appear here."
              />
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="surface p-5" aria-labelledby="preferences-heading">
            <h2 id="preferences-heading" className="flex items-center gap-2 font-display text-base font-bold text-ink-900">
              <Bell className="h-4 w-4 text-teal-600" aria-hidden="true" />
              Delivery preferences
            </h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">
              Choose which optional channels Findora may use. Critical account and security messages may still be
              delivered.
            </p>
            {preferencesQuery.isLoading || !preferences ? (
              <Skeleton className="mt-3 h-40 w-full" />
            ) : (
              <div className="mt-3 space-y-2">
                {(
                  [
                    ["in_app", "In-app notifications", "Status changes inside Findora"],
                    ["sms", "SMS", "Short updates to your verified phone"],
                    ["email", "Email", "Updates to your account email"],
                    ["whatsapp", "WhatsApp", "Updates to your WhatsApp number"],
                    ["marketing", "Product and market updates", "Optional news, never property spam"],
                  ] as [keyof NotificationPreferences, string, string][]
                ).map(([key, label, description]) => (
                  <Checkbox
                    key={key}
                    label={label}
                    description={description}
                    checked={Boolean(preferences[key])}
                    disabled={savingPrefs}
                    onChange={(event) => updatePreference(key, event.target.checked)}
                  />
                ))}
                <InlineNote>{preferences.note}</InlineNote>
              </div>
            )}
          </section>

          <p className="rounded-xl bg-ivory-100 px-4 py-3 text-xs leading-5 text-ink-500">
            Notifications are not a guarantee that a property is still available. Always check the live listing and
            confirm availability with the property team before paying.
          </p>
        </aside>
      </div>
    </div>
  );
}
