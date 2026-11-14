"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  Handshake,
  MapPin,
  Send,
  ShieldCheck,
  Star,
  Target,
  TrendingUp,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { PageHeader, StatCard } from "@/components/ui/page";
import { api, errorMessage, validationDetails } from "@/lib/api";
import type {
  OptionsPayload,
  PartnerAssignment,
  PartnerProfile,
} from "@/lib/types";
import { formatDate, formatKes, titleize } from "@/lib/utils";

type PartnerMe = { partner: PartnerProfile | null; message?: string };
type AssignmentPayload = {
  assignments: PartnerAssignment[];
  counts: { offered: number; accepted: number; in_progress: number; completed: number };
};
type PerformancePayload = {
  performance: {
    assignments_total: number;
    accepted: number;
    completed: number;
    completion_rate: number | null;
    field_reports: number;
    reviewed_reports: number;
    partner_rating: number | null;
    accuracy_score: number | null;
  };
  note: string;
};

type Neighbourhood = { id: string; name: string };

export default function PartnerOverviewPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission, refresh } = useAuth();
  const [partnerType, setPartnerType] = useState("finding");
  const [companyName, setCompanyName] = useState("");
  const [phoneAlt, setPhoneAlt] = useState("");
  const [townId, setTownId] = useState("");
  const [neighbourhoodIds, setNeighbourhoodIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [applying, setApplying] = useState(false);

  const partnerQuery = useQuery({
    queryKey: ["partner-me"],
    queryFn: () => api.get<PartnerMe>("/partners/me"),
  });

  const assignmentsQuery = useQuery({
    queryKey: ["partner-assignments"],
    queryFn: () => api.get<AssignmentPayload>("/partners/assignments"),
    enabled: Boolean(partnerQuery.data?.partner) && hasPermission("partner:assignment"),
  });

  const performanceQuery = useQuery({
    queryKey: ["partner-performance"],
    queryFn: () => api.get<PerformancePayload>("/partners/performance"),
    enabled: Boolean(partnerQuery.data?.partner) && hasPermission("partner:assignment"),
  });

  const optionsQuery = useQuery({
    queryKey: ["location-options"],
    queryFn: () => api.get<OptionsPayload>("/locations/options"),
    staleTime: 5 * 60_000,
  });

  const neighbourhoodsQuery = useQuery({
    queryKey: ["neighbourhoods", townId],
    queryFn: () => api.get<{ neighbourhoods: Neighbourhood[] }>(`/locations/${townId}/neighbourhoods`),
    enabled: Boolean(townId),
    staleTime: 5 * 60_000,
  });

  const partner = partnerQuery.data?.partner ?? null;
  const assignments = assignmentsQuery.data?.assignments ?? [];
  const offered = assignments.filter((assignment) => assignment.status === "offered");
  const performance = performanceQuery.data?.performance;

  async function apply(event: React.FormEvent) {
    event.preventDefault();
    if (!townId) {
      toast({ title: "Choose your main service town", tone: "error" });
      return;
    }
    setApplying(true);
    try {
      const result = await api.post<{ partner: PartnerProfile; message: string }>("/partners/apply", {
        partner_type: partnerType,
        company_name: companyName.trim() || null,
        phone_alt: phoneAlt.trim() || null,
        town_id: townId,
        neighbourhood_ids: neighbourhoodIds,
        notes: notes.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["partner-me"] });
      await refresh();
      toast({ title: "Application submitted", description: result.message, tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not submit the application",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setApplying(false);
    }
  }

  if (partnerQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (partnerQuery.isError) {
    return (
      <ErrorState
        title="Partner profile could not load"
        description="We could not reach your partner record."
        retry={() => partnerQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Local partner"
        title={partner ? `Karibu, ${partner.name?.split(" ")[0] ?? "partner"}` : "Become a local partner"}
        description={
          partner
            ? "Accept genuine assignments, investigate locally and submit honest field reports. Your findings help seekers avoid wasted trips and fraudulent listings."
            : "Findora works with local people who can check properties, confirm availability and collect authorised property information. Apply to join the demo network."
        }
        actions={
          partner ? (
            <LinkButton href="/partner/assignments">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              My assignments
            </LinkButton>
          ) : undefined
        }
      />

      {!partner ? (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <section className="surface p-5 sm:p-6" aria-labelledby="apply-heading">
            <h2 id="apply-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
              <Handshake className="h-5 w-5 text-teal-600" aria-hidden="true" />
              Partner application
            </h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">
              Tell us where you can work and what kind of partner you want to be. Applications are reviewed by the
              Findora team.
            </p>

            <form onSubmit={apply} className="mt-4 space-y-4">
              <Field label="Partner type" htmlFor="partner-type" required>
                <Select id="partner-type" value={partnerType} onChange={(event) => setPartnerType(event.target.value)}>
                  <option value="finding">Property-finding partner</option>
                  <option value="data_collection">Data-collection partner</option>
                  <option value="both">Both finding and data collection</option>
                </Select>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company name (optional)" htmlFor="partner-company">
                  <Input
                    id="partner-company"
                    maxLength={160}
                    value={companyName}
                    onChange={(event) => setCompanyName(event.target.value)}
                    placeholder="e.g. Kehancha Local Checks"
                  />
                </Field>
                <Field label="Alternative phone (optional)" htmlFor="partner-phone">
                  <Input
                    id="partner-phone"
                    type="tel"
                    maxLength={20}
                    value={phoneAlt}
                    onChange={(event) => setPhoneAlt(event.target.value)}
                    placeholder="+254 7XX XXX XXX"
                  />
                </Field>
              </div>

              <Field label="Main service town" htmlFor="partner-town" required>
                <Select
                  id="partner-town"
                  required
                  value={townId}
                  onChange={(event) => {
                    setTownId(event.target.value);
                    setNeighbourhoodIds([]);
                  }}
                >
                  <option value="">Choose a town</option>
                  {(optionsQuery.data?.towns ?? []).map((town) => (
                    <option key={town.id} value={town.id}>
                      {town.name}
                      {town.county ? ` (${town.county})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>

              {townId ? (
                <fieldset>
                  <legend className="label">Neighbourhoods you can cover (optional)</legend>
                  {neighbourhoodsQuery.isLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (neighbourhoodsQuery.data?.neighbourhoods ?? []).length ? (
                    <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-xl border border-ink-900/10 p-2 sm:grid-cols-2">
                      {(neighbourhoodsQuery.data?.neighbourhoods ?? []).map((neighbourhood) => (
                        <label
                          key={neighbourhood.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-700 transition hover:bg-ivory-100"
                        >
                          <input
                            type="checkbox"
                            checked={neighbourhoodIds.includes(neighbourhood.id)}
                            onChange={(event) =>
                              setNeighbourhoodIds((current) =>
                                event.target.checked
                                  ? [...current, neighbourhood.id]
                                  : current.filter((id) => id !== neighbourhood.id),
                              )
                            }
                            className="h-4 w-4 rounded border-ink-300 text-teal-700 accent-teal-700"
                          />
                          {neighbourhood.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-500">No neighbourhoods are listed for this town.</p>
                  )}
                </fieldset>
              ) : null}

              <Field label="Why you are a good local partner (optional)" htmlFor="partner-notes">
                <Textarea
                  id="partner-notes"
                  maxLength={2000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-24"
                  placeholder="Local knowledge, transport, availability for field visits, languages spoken."
                />
              </Field>

              <Checkbox
                label="I understand partner work must be honest and authorised"
                description="I will not trespass, pay bribes, invent findings or share a seeker's personal data outside the platform."
                checked
                readOnly
              />

              <Button type="submit" loading={applying} disabled={!townId} className="w-full sm:w-auto">
                <Send className="h-4 w-4" aria-hidden="true" />
                Submit application
              </Button>
            </form>
          </section>

          <aside className="space-y-4">
            <div className="surface p-5">
              <h2 className="font-display text-base font-bold text-ink-900">What local partners do</h2>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-ink-600">
                {[
                  "Visit properties and record what is genuinely visible.",
                  "Confirm whether a property is actually available.",
                  "Collect authorised property information for the platform.",
                  "Submit field reports that support staff review before matches are shared.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <InlineNote tone="warning">
              A partner badge is not a licence to enter property without permission. Always identify yourself, respect
              occupants and never promise a property to a seeker.
            </InlineNote>
          </aside>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Partner status"
              value={titleize(partner.status)}
              hint={partner.partner_type === "both" ? "Finding and data collection" : titleize(partner.partner_type)}
              icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
              tone={partner.status === "active" ? "sage" : "sand"}
            />
            <StatCard
              label="Open offers"
              value={assignmentsQuery.data?.counts.offered ?? 0}
              hint={`${assignmentsQuery.data?.counts.accepted ?? 0} accepted · ${assignmentsQuery.data?.counts.in_progress ?? 0} in progress`}
              icon={<ClipboardList className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Completed"
              value={performance?.completed ?? partner.completed_assignments}
              hint={
                performance?.completion_rate !== null && performance?.completion_rate !== undefined
                  ? `${performance.completion_rate}% completion rate`
                  : "No completion rate yet"
              }
              icon={<Target className="h-5 w-5" aria-hidden="true" />}
              tone="sage"
            />
            <StatCard
              label="Partner rating"
              value={performance?.partner_rating ?? partner.rating ?? "—"}
              hint={
                performance?.accuracy_score !== null && performance?.accuracy_score !== undefined
                  ? `Accuracy ${performance.accuracy_score}`
                  : "Based on reviewed reports"
              }
              icon={<Star className="h-5 w-5" aria-hidden="true" />}
              tone="sand"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <section className="surface p-5" aria-labelledby="offers-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="offers-heading" className="font-display text-lg font-bold text-ink-900">
                  New assignment offers
                </h2>
                <Link href="/partner/assignments" className="text-xs font-semibold text-teal-700 hover:underline">
                  All assignments
                </Link>
              </div>

              {assignmentsQuery.isLoading ? (
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-28 w-full" />
                  <Skeleton className="h-28 w-full" />
                </div>
              ) : offered.length ? (
                <ul className="mt-3 space-y-3">
                  {offered.map((assignment) => (
                    <li key={assignment.id} className="rounded-xl border border-ink-900/10 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-display text-base font-bold text-ink-900">{assignment.reference}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-teal-600" aria-hidden="true" />
                              {[assignment.request.neighbourhood, assignment.request.town].filter(Boolean).join(", ") ||
                                "Location shared on assignment"}
                            </span>
                            <span>{formatKes(assignment.request.budget_max)} max</span>
                            <span>{titleize(assignment.request.category)}</span>
                          </p>
                        </div>
                        <StatusBadge status={assignment.status} />
                      </div>
                      {assignment.instructions ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink-500">{assignment.instructions}</p>
                      ) : null}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-ink-400">
                          Offered {formatDate(assignment.created_at)}
                          {assignment.due_at ? ` · due ${formatDate(assignment.due_at)}` : ""}
                        </p>
                        <LinkButton href={`/partner/assignments/${assignment.id}`} size="sm" variant="outline">
                          Review
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                        </LinkButton>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 rounded-xl bg-ivory-100 p-4 text-sm leading-6 text-ink-500">
                  No new offers right now. Assignments appear when support staff assign a genuine assisted-search
                  investigation in your service area.
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <section className="surface p-5" aria-labelledby="profile-heading">
                <h2 id="profile-heading" className="font-display text-base font-bold text-ink-900">
                  Partner profile
                </h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-2 border-b border-ink-900/10 pb-2">
                    <dt className="text-ink-400">Status</dt>
                    <dd>
                      <Badge tone={partner.status === "active" ? "green" : "amber"}>{titleize(partner.status)}</Badge>
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 border-b border-ink-900/10 pb-2">
                    <dt className="text-ink-400">Type</dt>
                    <dd className="font-medium text-ink-800">{titleize(partner.partner_type)}</dd>
                  </div>
                  {partner.company_name ? (
                    <div className="flex justify-between gap-2 border-b border-ink-900/10 pb-2">
                      <dt className="text-ink-400">Company</dt>
                      <dd className="text-right font-medium text-ink-800">{partner.company_name}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2 border-b border-ink-900/10 pb-2">
                    <dt className="text-ink-400">Service areas</dt>
                    <dd className="text-right font-medium text-ink-800">
                      {partner.service_areas.length
                        ? partner.service_areas
                            .map((area) => {
                              const town = optionsQuery.data?.towns.find((item) => item.id === area.town_id);
                              return town?.name ?? "Assigned town";
                            })
                            .join(", ")
                        : "Not recorded"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ink-400">Joined</dt>
                    <dd className="font-medium text-ink-800">{formatDate(partner.created_at)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs leading-5 text-ink-400">
                  {partner.status === "pending"
                    ? "Your application is pending review. You can still see your profile, but assignments may be limited until the team activates the account."
                    : "Keep your service areas accurate so support staff assign work you can genuinely complete."}
                </p>
              </section>

              {performance ? (
                <section className="surface p-5" aria-labelledby="performance-heading">
                  <h2 id="performance-heading" className="flex items-center gap-2 font-display text-base font-bold text-ink-900">
                    <TrendingUp className="h-4 w-4 text-teal-600" aria-hidden="true" />
                    Performance
                  </h2>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
                    {[
                      { label: "Assignments", value: performance.assignments_total },
                      { label: "Completed", value: performance.completed },
                      { label: "Field reports", value: performance.field_reports },
                      { label: "Reviewed", value: performance.reviewed_reports },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl bg-ivory-100 px-2 py-2.5">
                        <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{item.label}</dt>
                        <dd className="mt-0.5 font-display text-lg font-bold text-ink-900">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-[11px] leading-5 text-ink-400">{performanceQuery.data?.note}</p>
                </section>
              ) : null}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
