import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  DoorOpen,
  Handshake,
  House,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Warehouse,
  Briefcase,
  HeartHandshake,
  FileSearch,
} from "lucide-react";

import { GuestOnly } from "@/components/auth/guest-only";
import { HeroSearch } from "@/components/home/hero-search";
import { SignedInHomeBanner } from "@/components/home/signed-in-banner";
import { PropertyCard } from "@/components/property/property-card";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/page";
import type { ConfigPayload, HomePayload, TypeOption } from "@/lib/types";
import { serverFetch } from "@/lib/server-api";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  bedsitter: <DoorOpen className="h-5 w-5" />,
  single_room: <DoorOpen className="h-5 w-5" />,
  one_bedroom: <House className="h-5 w-5" />,
  two_bedroom: <House className="h-5 w-5" />,
  three_bedroom: <House className="h-5 w-5" />,
  maisonette: <Building2 className="h-5 w-5" />,
  apartment: <Building2 className="h-5 w-5" />,
  bungalow: <House className="h-5 w-5" />,
  shop: <Store className="h-5 w-5" />,
  office: <Briefcase className="h-5 w-5" />,
  warehouse: <Warehouse className="h-5 w-5" />,
  godown: <Warehouse className="h-5 w-5" />,
};

function TypeTile({ type, category }: { type: TypeOption; category: string }) {
  return (
    <Link
      href={`/properties?category=${category}&property_type=${type.value}`}
      className="group flex items-center gap-3 rounded-xl border border-ink-900/10 bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-teal-600/30 hover:shadow-card"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ivory-200 text-teal-700 transition group-hover:bg-teal-700 group-hover:text-white">
        {TYPE_ICONS[type.value] ?? <House className="h-5 w-5" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink-800">{type.label}</span>
        <span className="mt-0.5 block text-xs text-ink-400">
          {type.count !== undefined ? `${type.count} available` : type.description}
        </span>
      </span>
      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-teal-600" aria-hidden="true" />
    </Link>
  );
}

export default async function HomePage() {
  const [home, config] = await Promise.all([
    serverFetch<HomePayload>("/home"),
    serverFetch<ConfigPayload>("/config"),
  ]);

  const heroProperty = home?.featured?.[0] ?? home?.recently_confirmed?.[0] ?? null;
  const townNames = (config?.towns ?? []).map((town) => town.name);

  if (!home) {
    return (
      <div className="container-page py-20">
        <div className="surface mx-auto max-w-xl p-8 text-center">
          <Search className="mx-auto h-10 w-10 text-ink-300" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Findora is temporarily unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-ink-500">
            We could not load live listings. Please refresh in a moment. We never show invented results when the
            platform cannot confirm availability.
          </p>
          <LinkButton href="/properties" className="mt-5">
            Try browsing spaces
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <>
      <SignedInHomeBanner />

      {/* Hero */}
      <section className="relative overflow-hidden bg-teal-900 text-ivory-50">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 20%, rgba(169,191,165,0.28), transparent 32%), radial-gradient(circle at 82% 10%, rgba(194,106,74,0.22), transparent 30%), radial-gradient(circle at 65% 90%, rgba(44,119,110,0.45), transparent 40%)",
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
          aria-hidden="true"
        />
        <div className="container-page relative py-14 sm:py-20 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="animate-fade-up">
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-600 bg-teal-800/80 px-3 py-1.5 text-xs font-semibold text-teal-100">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  Launching in {config?.brand.launch_market ?? "Kehancha, Migori County"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-600 bg-teal-800/80 px-3 py-1.5 text-xs font-semibold text-teal-100">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Evidence-based Property Passport
                </span>
              </div>
              <h1 className="max-w-2xl text-balance font-display text-3xl font-extrabold leading-[1.12] tracking-tight sm:text-4xl lg:text-[3.25rem]">
                {home.hero.headline}
              </h1>
              <p className="mt-4 max-w-xl text-[16px] leading-7 text-teal-100/85 sm:text-base">
                {home.hero.subheadline}
              </p>
              <div className="mt-6 max-w-2xl">
                <HeroSearch townNames={townNames} />
              </div>
              <dl className="mt-6 grid max-w-lg grid-cols-3 gap-4 border-t border-teal-700/70 pt-5">
                <div>
                  <dt className="text-xs font-medium text-teal-200/80">Available now</dt>
                  <dd className="mt-0.5 font-display text-2xl font-bold text-white">
                    {formatNumber(home.hero.total_available)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-teal-200/80">Towns covered</dt>
                  <dd className="mt-0.5 font-display text-2xl font-bold text-white">
                    {formatNumber(home.hero.towns_covered)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-teal-200/80">Property partners</dt>
                  <dd className="mt-0.5 font-display text-2xl font-bold text-white">
                    {formatNumber(home.hero.landlords)}
                  </dd>
                </div>
              </dl>
            </div>

            {heroProperty ? (
              <div className="relative hidden lg:block">
                <div className="absolute -inset-4 rounded-[2rem] bg-teal-700/40 blur-2xl" aria-hidden="true" />
                <div className="relative rotate-1 rounded-3xl border border-white/20 bg-ivory-50 p-3 shadow-lift transition hover:rotate-0">
                  <div className="overflow-hidden rounded-2xl bg-ivory-200">
                    {heroProperty.primary_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={heroProperty.primary_image.url}
                        alt={heroProperty.primary_image.caption ?? "Illustrative property image"}
                        className="aspect-[4/3] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-teal-100 to-sand-200">
                        <House className="h-12 w-12 text-teal-700/50" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="px-2 pb-1 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="green">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Available now
                      </Badge>
                      <span className="text-[12px] font-semibold text-ink-400">
                        {heroProperty.verification.verified_count} checks completed
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 font-display text-base font-bold text-ink-900">
                      {heroProperty.title}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-teal-700">
                        KES {formatNumber(heroProperty.rent_amount)}
                        <span className="text-xs font-normal text-ink-400"> /month</span>
                      </p>
                      <Link
                        href={`/properties/${heroProperty.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
                      >
                        View passport
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-5 -left-6 rounded-2xl border border-white/20 bg-white p-3.5 shadow-lift">
                  <p className="flex items-center gap-2 text-xs font-bold text-ink-800">
                    <CalendarCheck2 className="h-4 w-4 text-teal-600" aria-hidden="true" />
                    Availability reconfirmed
                  </p>
                  <p className="mt-0.5 pl-6 text-[12px] text-ink-400">Freshness is visible on every listing.</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="relative border-t border-teal-700/70 bg-teal-950/40">
          <div className="container-page grid gap-3 py-4 text-xs font-medium text-teal-100/80 sm:grid-cols-3">
            <p className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-sage-300" aria-hidden="true" />
              Every public listing is approved by moderation
            </p>
            <p className="flex items-center gap-2">
              <CalendarCheck2 className="h-4 w-4 text-sage-300" aria-hidden="true" />
              Availability must be freshly confirmed to appear
            </p>
            <p className="flex items-center gap-2">
              <Users className="h-4 w-4 text-sage-300" aria-hidden="true" />
              Local partners help when you cannot visit yourself
            </p>
          </div>
        </div>
      </section>

      {/* Featured */}
      {home.featured.length > 0 ? (
        <section className="container-page py-12 sm:py-16">
          <SectionHeading
            eyebrow="Freshly confirmed"
            title="Spaces worth a closer look"
            description="Promoted listings still pass the same approval and availability checks as every other result."
            href="/properties?featured=true"
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {home.featured.slice(0, 6).map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Categories */}
      <section className="border-y border-ink-900/10 bg-ivory-100">
        <div className="container-page py-12 sm:py-16">
          <SectionHeading
            eyebrow="Browse by type"
            title="Start with the kind of space you need"
            description="Residential and commercial discovery share the same verification and freshness standards."
          />
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-ink-900">Homes</h3>
                <Link href="/properties?category=residential" className="text-xs font-semibold text-teal-700 hover:underline">
                  All residential
                </Link>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {home.residential_types.slice(0, 8).map((type) => (
                  <TypeTile key={type.value} type={type} category="residential" />
                ))}
              </div>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-ink-900">Business premises</h3>
                <Link href="/properties?category=commercial" className="text-xs font-semibold text-teal-700 hover:underline">
                  All commercial
                </Link>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {home.commercial_types.slice(0, 8).map((type) => (
                  <TypeTile key={type.value} type={type} category="commercial" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent + locations */}
      <section className="container-page py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <SectionHeading
              eyebrow="Recently added"
              title="New on Findora"
              description="New listings appear only after moderation and availability confirmation."
              href="/properties?sort=newest"
            />
            <div className="grid gap-5 sm:grid-cols-2">
              {home.recently_added.slice(0, 4).map((property) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          </div>
          <div>
            <SectionHeading eyebrow="Where to look" title="Popular places" />
            <div className="space-y-3">
              {home.popular_locations.map((location) => (
                <Link
                  key={location.id}
                  href={`/properties?town_id=${location.id}`}
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-ink-900/10 bg-white p-4 transition hover:border-teal-600/30 hover:shadow-card"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                      <MapPin className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink-800">{location.name}</p>
                      <p className="text-xs text-ink-400">{location.county} County</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg font-bold text-teal-700">{location.property_count}</p>
                    <p className="text-[11px] uppercase tracking-wide text-ink-400">available</p>
                  </div>
                </Link>
              ))}
              {home.neighbourhoods.length > 0 ? (
                <div className="surface-muted p-4">
                  <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-ink-500">Neighbourhood guides</p>
                  <div className="flex flex-wrap gap-2">
                    {home.neighbourhoods.slice(0, 8).map((neighbourhood) => (
                      <Link
                        key={neighbourhood.id}
                        href={`/properties?neighbourhood_id=${neighbourhood.id}`}
                        className="chip transition hover:border-teal-600/30 hover:text-teal-700"
                      >
                        {neighbourhood.name}
                        <span className="text-ink-400">{neighbourhood.property_count}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Assisted search */}
      <section className="relative overflow-hidden bg-sand-100">
        <div className="container-page py-12 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-terracotta-600">Assisted search</p>
              <h2 className="text-balance font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
                Can&apos;t find the right space? A local team can look for you.
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-7 text-ink-600">
                Tell us your budget, area and must-haves. Our Kehancha property team checks real listings, can
                arrange a local partner to inspect a place, and only shares matches that genuinely exist in the
                database.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <LinkButton href="/assisted">
                  Start an assisted search
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </LinkButton>
                <LinkButton href="/trust" variant="outline">
                  How it works
                </LinkButton>
              </div>
              <p className="mt-3 text-xs text-ink-500">
                Assisted search fee: KES 300, payable only when you choose to proceed. Demo payments are simulated.
              </p>
            </div>
            <ol className="space-y-3">
              {home.assisted_steps.map((step) => (
                <li key={step.step} className="flex gap-4 rounded-2xl border border-sand-300 bg-ivory-50 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-700 font-display text-sm font-bold text-white">
                    {step.step}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink-900">{step.title}</h3>
                    <p className="mt-0.5 text-xs leading-5 text-ink-500">{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="container-page py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-600">The Property Passport</p>
            <h2 className="text-balance font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
              Know what was checked, when, and what it means.
            </h2>
            <p className="mt-3 text-sm leading-7 text-ink-600">
              A Property Passport is not a vague “verified” sticker. It shows each check separately — identity,
              ownership or authority, inspection, rent and availability — with evidence references and expiry dates
              visible to moderators.
            </p>
            <ul className="mt-5 space-y-3 text-sm text-ink-700">
              {[
                { icon: <FileSearch className="h-4 w-4" />, text: "Availability is dated and expires if not reconfirmed." },
                { icon: <ClipboardCheck className="h-4 w-4" />, text: "Verification records carry evidence, notes and reviewer identity." },
                { icon: <Handshake className="h-4 w-4" />, text: "Local partners submit field reports for staff review, never automatic claims." },
                { icon: <HeartHandshake className="h-4 w-4" />, text: "Reports and complaints are triaged with an auditable resolution." },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage-200 text-teal-800">
                    {item.icon}
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>
            <Link href="/trust" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline">
              Read the trust and safety guide
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="rounded-3xl border border-ink-900/10 bg-white p-5 shadow-card">
            <div className="flex items-center justify-between border-b border-ink-900/10 pb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink-900">Property Passport</p>
                  <p className="text-[12px] text-ink-400">Sample structure · every item is evidence-backed</p>
                </div>
              </div>
              <Badge tone="green">Strong</Badge>
            </div>
            <ul className="mt-4 space-y-2.5">
              {[
                ["Identity of advertiser", "Verified"],
                ["Ownership or authority", "Verified"],
                ["Physical inspection", "Verified"],
                ["Rent and deposit disclosure", "Verified"],
                ["Availability", "Confirmed this week"],
                ["Exact location privacy", "Approximate publicly"],
              ].map(([label, status]) => (
                <li key={label} className="flex items-center justify-between gap-3 rounded-xl bg-ivory-100 px-3.5 py-2.5">
                  <span className="text-sm text-ink-600">{label}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {status}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-xl bg-sand-100 px-3.5 py-3 text-xs leading-5 text-ink-600">
              Verification reduces risk but does not guarantee a property. Findora shows the limits of every check
              rather than hiding them.
            </p>
          </div>
        </div>
      </section>

      {/* Landlord CTA: visitor-only, signed-in accounts already have a workspace */}
      <GuestOnly>
        <section className="container-page pb-16">
          <div className="relative overflow-hidden rounded-3xl bg-teal-800 px-6 py-10 text-ivory-50 sm:px-10">
            <div
              className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-sage-400/20 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3 py-1 text-xs font-semibold text-teal-100">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  For landlords and property managers
                </p>
                <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{home.landlord_cta.title}</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-teal-100/80">{home.landlord_cta.description}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3">
                <LinkButton href="/register?type=landlord" variant="secondary">
                  Create a landlord account
                </LinkButton>
                <LinkButton href="/landlord" variant="outline" className="border-teal-500 bg-transparent text-ivory-50 hover:bg-teal-700 hover:text-white">
                  Learn more
                </LinkButton>
              </div>
            </div>
          </div>
        </section>
      </GuestOnly>
    </>
  );
}
