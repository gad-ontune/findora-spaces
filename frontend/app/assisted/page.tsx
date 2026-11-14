import type { Metadata } from "next";
import { CheckCircle2, Clock3, MapPin, Search, ShieldCheck, UserCheck } from "lucide-react";

import { AssistedRequestForm } from "@/components/assisted/assisted-form";
import { PageHeader } from "@/components/ui/page";
import { serverFetch } from "@/lib/server-api";
import type { ConfigPayload } from "@/lib/types";

export const metadata: Metadata = {
  title: "Assisted property finding",
  description:
    "Tell Findora what you need. A local Kenyan property team reviews genuine available supply, arranges inspections and shares real matches — never invented listings.",
};

export const dynamic = "force-dynamic";

type OptionsPayload = {
  counties: { id: string; name: string }[];
  towns: { id: string; name: string; county: string | null; county_id: string | null }[];
};

const STEPS = [
  {
    icon: <Search className="h-5 w-5" />,
    title: "Tell us what you need",
    body: "Budget, area, must-haves and any access needs. The more detail, the fewer wasted viewings.",
  },
  {
    icon: <UserCheck className="h-5 w-5" />,
    title: "We review real supply",
    body: "Our team checks approved listings and can ask a vetted local partner to investigate a specific area.",
  },
  {
    icon: <MapPin className="h-5 w-5" />,
    title: "Genuine matches only",
    body: "We share properties that actually exist in the platform, with their Property Passport and known gaps.",
  },
  {
    icon: <Clock3 className="h-5 w-5" />,
    title: "You decide and track",
    body: "Review matches, ask questions and request a viewing. Every step is recorded against your reference.",
  },
];

export default async function AssistedPage() {
  const [config, options] = await Promise.all([
    serverFetch<ConfigPayload>("/config", { revalidate: 120 }),
    serverFetch<OptionsPayload>("/locations/options", { revalidate: 120 }),
  ]);

  return (
    <div className="container-page py-8 sm:py-12">
      <PageHeader
        eyebrow="Assisted search"
        title="Find it for me"
        description="Can't find the right space, or you're not in town? Tell us what you need and a local Findora team will look on your behalf. We only share matches that genuinely exist."
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            {STEPS.map((step, index) => (
              <div key={step.title} className="rounded-2xl border border-ink-900/10 bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                    {step.icon}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-400">Step {index + 1}</span>
                </div>
                <h2 className="mt-3 text-sm font-bold text-ink-900">{step.title}</h2>
                <p className="mt-1 text-xs leading-5 text-ink-500">{step.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-teal-900">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              What we will never do
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-teal-900/85">
              {[
                "Invent a property, availability confirmation or verification result.",
                "Charge you to view a fake listing or guarantee a specific number of matches.",
                "Publish your request or personal details publicly.",
                "Ask you to pay a deposit to Findora for a property you have not seen.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 rounded-2xl border border-sand-300 bg-sand-100 p-5">
            <h2 className="font-display text-base font-bold text-ink-900">How the fee works</h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              The assisted search service fee is <strong className="font-semibold text-ink-900">KES 300</strong>.
              You can submit a request first and choose whether to pay. The fee covers review and coordination; it
              does not buy a guaranteed match. Payments in this demo are simulated.
            </p>
            <p className="mt-2 text-xs leading-5 text-ink-500">
              If we cannot find a genuine suitable match, we say so rather than sharing irrelevant listings. Any
              refund is handled under the published terms and recorded against your payment.
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {[
              {
                q: "Do I need an account?",
                a: "No. You can submit as a guest and receive a secure tracking link. An account makes it easier to manage multiple requests, viewings and messages.",
              },
              {
                q: "Can you inspect a property for me?",
                a: "Yes, where a vetted local partner covers the area. They submit a factual field report for staff review. An inspection is not a structural survey or a guarantee.",
              },
              {
                q: "How long does it take?",
                a: "It depends on genuine supply in your area and budget. Your tracking page shows the real status; we do not invent progress updates.",
              },
            ].map((faq) => (
              <details key={faq.q} className="group rounded-2xl border border-ink-900/10 bg-white p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-ink-800 marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {faq.q}
                    <span className="text-lg leading-none text-teal-600 transition group-open:rotate-45" aria-hidden="true">
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-6 text-ink-500">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>

        <div id="request-form" className="scroll-mt-24">
          <AssistedRequestForm config={config} options={options} />
        </div>
      </div>
    </div>
  );
}
