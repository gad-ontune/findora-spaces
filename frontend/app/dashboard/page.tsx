"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  CalendarPlus,
  Heart,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/components/providers";
import { StatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { PageHeader, StatCard } from "@/components/ui/page";
import { api } from "@/lib/api";
import type {
  Notification,
  PropertyListResponse,
  SearchRequest,
  SeekerOverview,
  Viewing,
} from "@/lib/types";
import { formatDateTime, formatKes, titleize } from "@/lib/utils";

export default function DashboardOverviewPage() {
  const { user, hasPermission } = useAuth();
  const isHost = hasPermission("property:create") || hasPermission("property:update");

  const overviewQuery = useQuery({
    queryKey: ["seeker-overview"],
    queryFn: () => api.get<{ overview: SeekerOverview }>("/seeker/overview"),
  });

  const viewingsQuery = useQuery({
    queryKey: ["viewings"],
    queryFn: () => api.get<{ viewings: Viewing[]; count: number }>("/viewings"),
  });

  const requestsQuery = useQuery({
    queryKey: ["search-requests"],
    queryFn: () => api.get<{ requests: SearchRequest[] }>("/search-requests"),
  });

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => api.get<{ notifications: Notification[]; unread_count: number }>("/notifications", { limit: 5 }),
  });

  const propertiesQuery = useQuery({
    queryKey: ["my-properties"],
    queryFn: () => api.get<PropertyListResponse>("/properties/mine"),
    enabled: isHost,
  });

  const overview = overviewQuery.data?.overview;
  const firstName = user?.name.split(" ")[0] ?? "there";

  const upcoming = (viewingsQuery.data?.viewings ?? [])
    .filter((viewing) => ["requested", "proposed", "confirmed"].includes(viewing.status))
    .sort((a, b) => {
      const left = a.scheduled_at ?? a.preferred_date ?? "";
      const right = b.scheduled_at ?? b.preferred_date ?? "";
      return left.localeCompare(right);
    })
    .slice(0, 3);

  const activeRequests = (requestsQuery.data?.requests ?? [])
    .filter((request) => !["completed", "cancelled"].includes(request.status))
    .slice(0, 3);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Your dashboard"
        title={`Karibu, ${firstName}`}
        description="Track saved spaces, assisted searches and viewings in one place. Availability shown here is always read live from the platform."
        actions={
          <>
            <LinkButton href="/properties" variant="outline">
              Browse spaces
            </LinkButton>
            <LinkButton href="/assisted">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Find it for me
            </LinkButton>
          </>
        }
      />

      {overviewQuery.isError ? (
        <ErrorState
          title="Your overview could not load"
          description="We could not reach your account summary. Nothing is guessed or cached."
          retry={() => overviewQuery.refetch()}
        />
      ) : overviewQuery.isLoading || !overview ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <>
          {!overview.profile_complete ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sand-300 bg-sand-100 px-4 py-3 text-sm text-ink-700">
              <ShieldCheck className="h-5 w-5 shrink-0 text-sand-500" aria-hidden="true" />
              <p className="min-w-0 flex-1">
                Complete your profile so property teams know how to reach you and assisted search runs smoothly.
              </p>
              <LinkButton href="/dashboard/profile" size="sm" variant="outline">
                Complete profile
              </LinkButton>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Saved spaces"
              value={overview.saved_properties}
              hint="Properties you can revisit"
              icon={<Heart className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Assisted searches"
              value={overview.active_requests}
              hint={`${overview.assisted_requests} total request${overview.assisted_requests === 1 ? "" : "s"}`}
              icon={<SearchCheck className="h-5 w-5" aria-hidden="true" />}
              tone="sage"
            />
            <StatCard
              label="Upcoming viewings"
              value={overview.upcoming_viewings}
              hint={`${overview.viewings} viewing${overview.viewings === 1 ? "" : "s"} recorded`}
              icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Unread notifications"
              value={overview.unread_notifications}
              hint="Status changes and messages"
              icon={<Bell className="h-5 w-5" aria-hidden="true" />}
              tone="sand"
            />
          </div>
        </>
      )}

      {isHost ? (
        <section className="rounded-2xl border border-teal-200 bg-teal-50 p-4 sm:p-5" aria-labelledby="host-summary">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="host-summary" className="flex items-center gap-2 font-display text-base font-bold text-teal-900">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                Your listings
              </h2>
              <p className="mt-0.5 text-xs leading-5 text-teal-900/75">
                {propertiesQuery.data
                  ? `${propertiesQuery.data.overview.available} available · ${propertiesQuery.data.overview.pending} awaiting moderation · ${propertiesQuery.data.overview.unconfirmed} need availability reconfirmation`
                  : "Loading your listing summary…"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <LinkButton href="/dashboard/properties" size="sm" variant="outline">
                Manage listings
              </LinkButton>
              <LinkButton href="/dashboard/properties/new" size="sm">
                Add a property
              </LinkButton>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-5" aria-labelledby="upcoming-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="upcoming-heading" className="font-display text-lg font-bold text-ink-900">
              Next viewings
            </h2>
            <Link href="/dashboard/viewings" className="text-xs font-semibold text-teal-700 hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-3">
            {viewingsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : upcoming.length ? (
              <ul className="space-y-2.5">
                {upcoming.map((viewing) => (
                  <li key={viewing.id} className="rounded-xl border border-ink-900/10 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-800">
                          {viewing.property?.title ?? "Property viewing"}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-400">
                          {viewing.scheduled_at
                            ? formatDateTime(viewing.scheduled_at)
                            : viewing.preferred_date
                              ? `Preferred ${viewing.preferred_date}`
                              : "Date to be agreed"}
                        </p>
                      </div>
                      <StatusBadge status={viewing.status} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl bg-ivory-100 p-4 text-sm leading-6 text-ink-500">
                No upcoming viewings.{" "}
                <Link href="/properties" className="font-semibold text-teal-700 hover:underline">
                  Find a space
                </Link>{" "}
                and request a viewing when you are ready.
              </div>
            )}
          </div>
        </section>

        <section className="surface p-5" aria-labelledby="requests-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="requests-heading" className="font-display text-lg font-bold text-ink-900">
              Assisted searches
            </h2>
            <Link href="/dashboard/requests" className="text-xs font-semibold text-teal-700 hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-3">
            {requestsQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : activeRequests.length ? (
              <ul className="space-y-2.5">
                {activeRequests.map((request) => (
                  <li key={request.id} className="rounded-xl border border-ink-900/10 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-800">{request.reference}</p>
                        <p className="mt-0.5 text-xs text-ink-400">
                          {request.category === "commercial" ? "Commercial" : "Residential"} ·{" "}
                          {request.town ?? "Any town"} · up to {formatKes(request.budget_max)}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-400">
                          {request.match_count} genuine match{request.match_count === 1 ? "" : "es"} shared
                        </p>
                      </div>
                      <StatusBadge status={request.status} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl bg-ivory-100 p-4 text-sm leading-6 text-ink-500">
                No active assisted searches.{" "}
                <Link href="/assisted" className="font-semibold text-teal-700 hover:underline">
                  Ask our local team
                </Link>{" "}
                to look for you.
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="surface p-5" aria-labelledby="notifications-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="notifications-heading" className="font-display text-lg font-bold text-ink-900">
            Recent notifications
          </h2>
          <Link href="/dashboard/notifications" className="text-xs font-semibold text-teal-700 hover:underline">
            Open inbox
          </Link>
        </div>
        <div className="mt-3">
          {notificationsQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : notificationsQuery.data?.notifications.length ? (
            <ul className="divide-y divide-ink-900/10">
              {notificationsQuery.data.notifications.map((notification) => (
                <li key={notification.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    className={
                      notification.read
                        ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink-200"
                        : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-600"
                    }
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-800">{notification.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-ink-500">{notification.body}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-400">{formatDateTime(notification.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-ivory-100 p-4 text-sm text-ink-500">
              No notifications yet. Status changes, matches and viewing updates will appear here.
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            href: "/dashboard/favourites",
            icon: <Heart className="h-5 w-5" aria-hidden="true" />,
            title: "Review saved spaces",
            body: "Compare the homes and business spaces you kept.",
          },
          {
            href: "/dashboard/saved-searches",
            icon: <CalendarPlus className="h-5 w-5" aria-hidden="true" />,
            title: "Save a search",
            body: "Keep your filters and return when new supply appears.",
          },
          {
            href: "/dashboard/requests",
            icon: <SearchCheck className="h-5 w-5" aria-hidden="true" />,
            title: "Track assisted searches",
            body: "See the genuine status and matches shared by our team.",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="surface group p-4 transition hover:-translate-y-0.5 hover:shadow-lift"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              {item.icon}
            </span>
            <h3 className="mt-2.5 flex items-center gap-1.5 text-sm font-bold text-ink-900">
              {item.title}
              <ArrowRight className="h-3.5 w-3.5 text-teal-600 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </h3>
            <p className="mt-1 text-xs leading-5 text-ink-500">{item.body}</p>
          </Link>
        ))}
      </div>

      <p className="text-xs leading-5 text-ink-400">
        Signed in as {user?.name} · {titleize(user?.roles[0] ?? "member")}. Findora never invents availability, matches or
        payment success.
      </p>
    </div>
  );
}
