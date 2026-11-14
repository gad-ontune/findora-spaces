import type { Metadata } from "next";
import Link from "next/link";
import {
  Accessibility,
  BadgeCheck,
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  EyeOff,
  FileSearch,
  Handshake,
  HeartHandshake,
  LockKeyhole,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserCheck,
} from "lucide-react";

import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";

export const metadata: Metadata = {
  title: "How Findora works",
  description:
    "Understand Findora's Property Passport, availability freshness, local partner inspections, privacy, safety and accessibility commitments.",
};

const PASSPORT_CHECKS = [
  {
    icon: <UserCheck className="h-5 w-5" />,
    title: "Advertiser identity",
    body: "The person or business listing the property is identified and their phone is verified. Evidence references are retained for moderators.",
  },
  {
    icon: <FileSearch className="h-5 w-5" />,
    title: "Ownership or authority",
    body: "Where completed, Findora records evidence that the advertiser owns the property or is authorised to let it. The status is shown honestly, including when it is still pending.",
  },
  {
    icon: <ClipboardCheck className="h-5 w-5" />,
    title: "Physical inspection",
    body: "A field officer or vetted local partner records what they could observe on a specific date: condition, water, electricity, access and outstanding concerns.",
  },
  {
    icon: <CalendarCheck2 className="h-5 w-5" />,
    title: "Availability freshness",
    body: "A listing is public only when availability has been confirmed within the freshness window. Stale or unconfirmed listings disappear from public search instead of misleading seekers.",
  },
  {
    icon: <Database className="h-5 w-5" />,
    title: "Rent and cost disclosure",
    body: "Rent, deposit and mandatory fees are broken into a move-in cost table. Undisclosed costs are flagged rather than hidden.",
  },
  {
    icon: <EyeOff className="h-5 w-5" />,
    title: "Location privacy",
    body: "Public maps show an approximate area, not an exact address. This protects current occupants from unwanted visits.",
  },
];

export default function TrustPage() {
  return (
    <div className="container-page py-8 sm:py-12">
      <PageHeader
        eyebrow="Trust and safety"
        title="How Findora works"
        description="Findora is built around a simple rule: show what has actually been checked, when, and what it does not prove. No vague verification badges. No invented availability."
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { value: "Approved only", label: "Every public listing passes moderation before it appears." },
          { value: "Fresh only", label: "Availability must be reconfirmed inside the freshness window." },
          { value: "Evidence-led", label: "Each Property Passport check has a status, date and evidence trail." },
        ].map((item) => (
          <div key={item.value} className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
            <p className="font-display text-lg font-bold text-teal-900">{item.value}</p>
            <p className="mt-1 text-sm leading-6 text-teal-900/75">{item.label}</p>
          </div>
        ))}
      </div>

      <section id="passport" className="mt-12 scroll-mt-24" aria-labelledby="passport-heading">
        <h2 id="passport-heading" className="font-display text-2xl font-bold tracking-tight text-ink-900">
          The Property Passport
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-600">
          Every listing carries a Property Passport. It is a transparent record, not a guarantee. A strong passport
          means more checks are complete and current; it does not remove the need to view the property and confirm
          the people you are dealing with.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PASSPORT_CHECKS.map((check) => (
            <div key={check.title} className="rounded-2xl border border-ink-900/10 bg-white p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                {check.icon}
              </span>
              <h3 className="mt-3 text-sm font-bold text-ink-900">{check.title}</h3>
              <p className="mt-1.5 text-xs leading-6 text-ink-500">{check.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="availability" className="mt-12 scroll-mt-24 rounded-3xl border border-ink-900/10 bg-white p-6 sm:p-8" aria-labelledby="availability-heading">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Availability</p>
            <h2 id="availability-heading" className="mt-1 font-display text-2xl font-bold text-ink-900">
              Why a listing can disappear
            </h2>
            <p className="mt-2 text-sm leading-7 text-ink-600">
              A property that was available last month may be occupied today. Findora would rather show fewer results
              than send you to a home that is no longer free.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { title: "Confirmed", body: "The property team reconfirmed availability inside the freshness window. The listing can appear publicly." },
              { title: "Needs reconfirmation", body: "The freshness window has passed. The listing is hidden from public search and detail pages until reconfirmed." },
              { title: "Occupied or withdrawn", body: "The listing is removed from public discovery. Existing saved links no longer expose it." },
            ].map((state) => (
              <div key={state.title} className="flex gap-3 rounded-xl bg-ivory-100 p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-ink-800">{state.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-ink-500">{state.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="safety" className="mt-12 scroll-mt-24" aria-labelledby="safety-heading">
        <h2 id="safety-heading" className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-ink-900">
          <ShieldAlert className="h-6 w-6 text-terracotta-600" aria-hidden="true" />
          Safety guidance
        </h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-sand-300 bg-sand-100 p-5">
            <h3 className="font-display text-base font-bold text-ink-900">Before you pay</h3>
            <ul className="mt-3 space-y-2.5 text-sm leading-6 text-ink-700">
              {[
                "View the property in person, or use a trusted person or Findora partner to inspect it.",
                "Confirm the owner or authorised representative and ask for written authority.",
                "Get a written agreement with rent, deposit, fees and payment schedule.",
                "Pay only through agreed channels after you have verified the property and the recipient.",
                "Keep receipts and never send money under pressure to 'hold' a property you have not seen.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta-500" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-ink-900/10 bg-white p-5">
            <h3 className="font-display text-base font-bold text-ink-900">When meeting people</h3>
            <ul className="mt-3 space-y-2.5 text-sm leading-6 text-ink-600">
              {[
                "Meet during daylight in a public or familiar place where possible.",
                "Tell someone you trust where you are going and who you are meeting.",
                "Do not share passwords, one-time codes or full financial details.",
                "If something feels wrong, stop. You can report the listing from its detail page.",
                "Findora moderators review reports against evidence; we do not publish unverified accusations.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-ink-900/10 bg-ivory-100 p-4 text-sm text-ink-600">
          <HeartHandshake className="h-5 w-5 shrink-0 text-teal-600" aria-hidden="true" />
          <p className="flex-1">
            Something wrong with a listing? Use the report action on its detail page. For an assisted search, message
            the team from your tracking page.
          </p>
          <LinkButton href="/properties" variant="outline" size="sm">
            Browse and report
          </LinkButton>
        </div>
      </section>

      <section id="assisted" className="mt-12 scroll-mt-24" aria-labelledby="assisted-trust-heading">
        <h2 id="assisted-trust-heading" className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-ink-900">
          <Handshake className="h-6 w-6 text-teal-600" aria-hidden="true" />
          Assisted search and local partners
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "Vetted partners",
              body: "Partners are onboarded with identity and service-area checks. Their access is limited to assigned requests.",
            },
            {
              title: "Field reports, not automatic claims",
              body: "A partner submits findings and photos. Staff review them before anything is treated as verified.",
            },
            {
              title: "Genuine matches only",
              body: "Matches come from real listings in the platform. If suitable supply does not exist, we say so.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-ink-900/10 bg-white p-5">
              <BadgeCheck className="h-5 w-5 text-teal-600" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-bold text-ink-900">{item.title}</h3>
              <p className="mt-1.5 text-xs leading-6 text-ink-500">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="privacy" className="mt-12 scroll-mt-24 rounded-3xl bg-teal-900 p-6 text-ivory-50 sm:p-8" aria-labelledby="privacy-heading">
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-sage-300">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
              Privacy and data
            </p>
            <h2 id="privacy-heading" className="mt-1.5 font-display text-2xl font-bold">
              Your details are not a public listing
            </h2>
            <p className="mt-2 text-sm leading-7 text-teal-100/80">
              Public browsing does not require an account. When you do create one, we use your phone and profile to
              provide discovery, enquiries, viewings and assisted search. We do not sell your personal data.
            </p>
          </div>
          <ul className="space-y-2.5 text-sm leading-6 text-teal-100/85">
            {[
              "Phone numbers are masked publicly and shared only with authorised property teams.",
              "Exact addresses are not shown publicly; maps use approximate areas.",
              "Sensitive evidence in the Property Passport is available to moderators, not published wholesale.",
              "You can update your profile, notification preferences and marketing consent from your dashboard.",
              "Report a data concern through support so it can be investigated and audited.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage-300" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="accessibility" className="mt-12 scroll-mt-24" aria-labelledby="accessibility-heading">
        <h2 id="accessibility-heading" className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-ink-900">
          <Accessibility className="h-6 w-6 text-teal-600" aria-hidden="true" />
          Accessibility and low-data design
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <Smartphone className="h-5 w-5" />, title: "Mobile first", body: "Touch-friendly controls, safe-area spacing and readable type on small screens." },
            { icon: <EyeOff className="h-5 w-5" />, title: "Reduced motion", body: "Animations are minimised automatically when your device requests reduced motion." },
            { icon: <Database className="h-5 w-5" />, title: "Low data", body: "Lazy-loaded images and a service worker that caches only static media and pages — never API or dashboards." },
            { icon: <MapPin className="h-5 w-5" />, title: "Works without maps", body: "Listings remain usable if map tiles fail to load, with text directions and approximate areas." },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-ink-900/10 bg-white p-4">
              <span className="text-teal-600">{item.icon}</span>
              <h3 className="mt-2 text-sm font-bold text-ink-900">{item.title}</h3>
              <p className="mt-1 text-xs leading-5 text-ink-500">{item.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-ink-400">
          Findora aims to meet WCAG 2.2 AA. If you encounter a barrier, contact support with the page and what happened
          so we can fix it.
        </p>
      </section>

      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-ink-900/10 bg-white p-6">
        <div>
          <h2 className="font-display text-xl font-bold text-ink-900">Ready to look?</h2>
          <p className="mt-1 text-sm text-ink-500">Browse approved spaces or ask a local team to search for you.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/properties">Browse spaces</LinkButton>
          <LinkButton href="/assisted" variant="outline">Find it for me</LinkButton>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-ink-400">
        <Link href="/" className="hover:text-teal-700">Findora Spaces</Link> · Launching in Kehancha, Migori County ·
        Built for all Kenyan counties
      </p>
    </div>
  );
}
