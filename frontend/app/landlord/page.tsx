import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  Handshake,
  LineChart,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { serverFetch } from "@/lib/server-api";
import type { SubscriptionPlan } from "@/lib/types";
import { formatKes } from "@/lib/utils";

export const metadata: Metadata = {
  title: "List your property",
  description:
    "List a home or commercial space on Findora Spaces. Reach serious seekers, show verified details and keep availability honest.",
};

type PlansPayload = { plans: SubscriptionPlan[] };

export const dynamic = "force-dynamic";

export default async function LandlordPage() {
  const payload = await serverFetch<PlansPayload>("/plans", { revalidate: 300 });
  const plans = payload?.plans ?? [];

  return (
    <div className="container-page py-8 sm:py-12">
      <PageHeader
        eyebrow="For landlords and property managers"
        title="Fill your space with serious seekers"
        description="Findora shows approved, freshly confirmed listings with a transparent Property Passport. You keep control of availability, enquiries and viewings."
        actions={
          <>
            <LinkButton href="/register?type=landlord">
              Create a landlord account
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </LinkButton>
            <LinkButton href="/login" variant="outline">
              Sign in
            </LinkButton>
          </>
        }
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: <BadgeCheck className="h-5 w-5" />, title: "Trust by evidence", body: "Show seekers exactly which checks are complete and which are still pending." },
          { icon: <CalendarCheck2 className="h-5 w-5" />, title: "Honest availability", body: "Simple reconfirmation keeps stale listings out of public search." },
          { icon: <Wallet className="h-5 w-5" />, title: "Clear costs", body: "Disclose rent, deposit and mandatory fees in one move-in cost table." },
          { icon: <LineChart className="h-5 w-5" />, title: "Useful visibility", body: "Track views, enquiries and viewings without paying for fake boosts." },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border border-ink-900/10 bg-white p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">{item.icon}</span>
            <h2 className="mt-3 text-sm font-bold text-ink-900">{item.title}</h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">{item.body}</p>
          </div>
        ))}
      </div>

      <section className="mt-12 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]" aria-labelledby="listing-steps">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">How listing works</p>
          <h2 id="listing-steps" className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink-900">
            From draft to genuine availability
          </h2>
          <ol className="mt-5 space-y-3">
            {[
              {
                title: "Create your account and verify your phone",
                body: "Landlord and property manager accounts are reviewed before listing access is enabled.",
              },
              {
                title: "Add the property with honest details",
                body: "Location, rent, deposit, fees, amenities and photos. Mark which details you can evidence.",
              },
              {
                title: "Submit for moderation",
                body: "Findora checks the listing for completeness, duplicates and policy issues before it can appear.",
              },
              {
                title: "Build the Property Passport",
                body: "Identity, ownership or authority, inspection and availability checks are recorded separately with evidence.",
              },
              {
                title: "Keep availability fresh",
                body: "Reconfirm availability inside the freshness window. If you forget, the listing is hidden rather than shown as stale.",
              },
              {
                title: "Respond to genuine enquiries",
                body: "Manage enquiries and viewing requests from your dashboard. Never ask for money before a viewing.",
              },
            ].map((step, index) => (
              <li key={step.title} className="flex gap-4 rounded-2xl border border-ink-900/10 bg-white p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 font-display text-sm font-bold text-white">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-ink-900">{step.title}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-ink-500">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-sage-300 bg-sage-100 p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-teal-900">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              What we ask of every listing
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-teal-900/85">
              {[
                "You are the owner or are authorised to let the property.",
                "Photos and details are current and not misleading.",
                "Rent, deposit and mandatory fees are fully disclosed.",
                "Availability is reconfirmed when requested.",
                "You respond to enquiries honestly and do not demand money before viewing.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-ink-900/10 bg-white p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
              <Handshake className="h-5 w-5 text-teal-600" aria-hidden="true" />
              Need help inspecting or managing?
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-500">
              Property managers can be assigned to a listing with scoped access. Findora can also coordinate a local
              partner inspection where coverage exists, with the field report reviewed by staff.
            </p>
            <Link href="/trust#assisted" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline">
              Learn about local partners
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="pricing-heading">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Plans</p>
        <h2 id="pricing-heading" className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink-900">
          Simple options, no invented boosts
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-500">
          Basic listing and moderation are free. Optional featured placement is clearly labelled and never bypasses
          approval or availability checks. Prices below come from the live platform settings.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div key={plan.id} className="flex flex-col rounded-2xl border border-ink-900/10 bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-bold text-ink-900">{plan.name}</h3>
                {plan.code === "growth" ? <span className="rounded-full bg-sand-200 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-700">Popular</span> : null}
              </div>
              <p className="mt-1 text-xs leading-5 text-ink-500">{plan.description}</p>
              <p className="mt-3 font-display text-2xl font-extrabold text-ink-900">
                {plan.price === 0 ? "Free" : formatKes(plan.price)}
                {plan.price > 0 ? <span className="ml-1 text-xs font-medium text-ink-400">/{plan.period}</span> : null}
              </p>
              <ul className="mt-3 flex-1 space-y-2 text-xs leading-5 text-ink-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
                <li className="flex items-start gap-1.5">
                  <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden="true" />
                  {plan.listing_limit ? `Up to ${plan.listing_limit} active listings` : "Listing limit set by agreement"}
                </li>
              </ul>
              <LinkButton href="/register?type=landlord" variant={plan.code === "growth" ? "primary" : "outline"} className="mt-4 w-full">
                Get started
              </LinkButton>
            </div>
          ))}
          {plans.length === 0 ? (
            <div className="rounded-2xl border border-ink-900/10 bg-ivory-100 p-5 text-sm leading-6 text-ink-500 sm:col-span-2 lg:col-span-3">
              Plans could not be loaded right now. You can still create a landlord account and add a property; pricing
              will be shown in your dashboard before any payment.
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-xs leading-5 text-ink-400">
          Featured placement is a promotion, not a verification upgrade. Findora does not guarantee enquiries or
          tenants. Payments in this demo are simulated.
        </p>
      </section>

      <section className="mt-12 grid gap-4 lg:grid-cols-2" aria-labelledby="landlord-faq">
        <div>
          <h2 id="landlord-faq" className="font-display text-2xl font-bold tracking-tight text-ink-900">
            Common questions
          </h2>
          <div className="mt-4 space-y-3">
            {[
              {
                q: "Can I list a property before it is verified?",
                a: "You can create a draft and submit it. Public visibility still requires moderation approval and fresh availability. Verification checks are shown separately and are not faked.",
              },
              {
                q: "Who can see my phone number?",
                a: "Public pages show a masked number. A seeker who sends an enquiry shares their contact details with the authorised property team so you can respond.",
              },
              {
                q: "How often must I reconfirm availability?",
                a: "Inside the platform freshness window. Your dashboard shows when the listing needs reconfirmation; after that it is hidden from public search.",
              },
              {
                q: "Can a property manager help me?",
                a: "Yes. You can assign a property manager with scoped access. Every material change is audited.",
              },
            ].map((faq) => (
              <details key={faq.q} className="group rounded-2xl border border-ink-900/10 bg-white p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-ink-800 marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {faq.q}
                    <span className="text-lg leading-none text-teal-600 transition group-open:rotate-45" aria-hidden="true">+</span>
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-6 text-ink-500">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
        <div className="rounded-3xl bg-teal-800 p-6 text-ivory-50 sm:p-8">
          <Sparkles className="h-6 w-6 text-sage-300" aria-hidden="true" />
          <h2 className="mt-3 font-display text-2xl font-bold">Ready to list honestly?</h2>
          <p className="mt-2 text-sm leading-6 text-teal-100/80">
            Create an account, verify your phone and add your first property. You stay in control of availability and
            enquiries, and every material change is recorded.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <LinkButton href="/register?type=landlord" variant="secondary">
              Create a landlord account
            </LinkButton>
            <LinkButton href="/trust" variant="outline" className="border-teal-500 bg-transparent text-ivory-50 hover:bg-teal-700 hover:text-white">
              Read the trust guide
            </LinkButton>
          </div>
          <p className="mt-4 text-xs text-teal-100/60">
            Demo environment: all properties and accounts are fictional sample data.
          </p>
        </div>
      </section>
    </div>
  );
}
