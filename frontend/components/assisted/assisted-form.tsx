"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Button, LinkButton } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { InlineNote } from "@/components/ui/feedback";
import { api, errorMessage, validationDetails } from "@/lib/api";
import type { ConfigPayload, SearchRequest } from "@/lib/types";
import { cn, formatKes } from "@/lib/utils";

type Option = { id: string; name: string; county?: string | null; county_id?: string | null };

type OptionsPayload = {
  counties: Option[];
  towns: Option[];
};

type CreatedPayload = {
  request: SearchRequest;
  tracking: { tracking_token: string; tracking_url: string };
  message: string;
};

export function AssistedRequestForm({
  config,
  options,
}: {
  config: ConfigPayload | null;
  options: OptionsPayload | null;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    category: "residential" as "residential" | "commercial",
    county_id: "",
    town_id: "",
    budget_min: "",
    budget_max: "",
    property_type: "",
    bedrooms_min: "",
    floor_area_min: "",
    floor_area_max: "",
    frontage_min: "",
    loading_required: false,
    parking_required: "",
    facilities: [] as string[],
    move_in_date: "",
    business_type: "",
    requirements: "",
    assistance_requirements: "",
    contact_method: "phone",
    guest_name: "",
    guest_phone: "",
    guest_email: "",
    consent_to_share: false,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedPayload | null>(null);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  const towns = useMemo(() => {
    if (!options) return [];
    return form.county_id
      ? options.towns.filter((town) => town.county_id === form.county_id)
      : options.towns;
  }, [options, form.county_id]);

  const types = config?.property_types
    ? form.category === "commercial"
      ? config.property_types.commercial
      : config.property_types.residential
    : [];

  const facilities = (config?.amenities ?? []).filter(
    (amenity) => amenity.applies_to === "both" || amenity.applies_to === form.category,
  );

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    try {
      const payload = await api.post<CreatedPayload>("/search-requests", {
        category: form.category,
        county_id: form.county_id || null,
        town_id: form.town_id || null,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: Number(form.budget_max),
        property_type: form.property_type || null,
        bedrooms_min: form.category === "residential" && form.bedrooms_min ? Number(form.bedrooms_min) : null,
        floor_area_min: form.category === "commercial" && form.floor_area_min ? Number(form.floor_area_min) : null,
        floor_area_max: form.category === "commercial" && form.floor_area_max ? Number(form.floor_area_max) : null,
        frontage_min: form.category === "commercial" && form.frontage_min ? Number(form.frontage_min) : null,
        loading_required: form.category === "commercial" ? form.loading_required : false,
        parking_required:
          form.category === "commercial" && form.parking_required ? Number(form.parking_required) : null,
        facilities: form.facilities,
        move_in_date: form.move_in_date || null,
        business_type: form.category === "commercial" ? form.business_type || null : null,
        requirements: form.requirements || null,
        assistance_requirements: form.assistance_requirements || null,
        contact_method: form.contact_method,
        guest_name: user ? null : form.guest_name || null,
        guest_phone: user ? null : form.guest_phone || null,
        guest_email: !user && form.guest_email ? form.guest_email : null,
        consent_to_share: form.consent_to_share,
      });
      setCreated(payload);
      toast({ title: "Request received", description: `Reference ${payload.request.reference}`, tone: "success" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      const details = validationDetails(error);
      setErrors(details.length ? details : [errorMessage(error)]);
    } finally {
      setSubmitting(false);
    }
  }

  async function pay() {
    if (!created) return;
    setPaying(true);
    try {
      const payload = await api.post<{ payment: { status: string; reference: string }; message: string }>(
        "/payments/initiate",
        {
          purpose: "assisted_search",
          related_id: created.request.id,
          idempotency_key: `assisted-${created.request.id}-${Date.now()}`,
        },
      );
      if (payload.payment.status === "success") {
        setPaid(true);
        toast({ title: "Payment completed", description: payload.message, tone: "success" });
      } else {
        toast({
          title: "Payment not completed",
          description: payload.message,
          tone: payload.payment.status === "pending" ? "info" : "error",
        });
      }
    } catch (error) {
      toast({ title: "Payment could not start", description: errorMessage(error), tone: "error" });
    } finally {
      setPaying(false);
    }
  }

  if (created) {
    const trackHref = `/assisted/track/${created.tracking.tracking_token}`;
    return (
      <div className="surface p-6 sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sage-200 text-teal-800">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-ink-900">Your request is with our team</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-ink-600">{created.message}</p>

        <div className="mt-5 rounded-2xl border border-ink-900/10 bg-ivory-100 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Reference</p>
          <p className="mt-1 font-display text-xl font-bold text-ink-900">{created.request.reference}</p>
          <p className="mt-2 text-xs leading-5 text-ink-500">
            Keep this secure tracking link. Anyone with it can see the status and shared matches, so only share it with
            someone you trust.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <LinkButton href={trackHref} variant="outline" className="flex-1">
              Track this request
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </LinkButton>
            {user ? (
              <LinkButton href="/dashboard/requests" variant="ghost" className="flex-1">
                Go to my requests
              </LinkButton>
            ) : null}
          </div>
        </div>

        {user ? (
          <div className="mt-5 rounded-2xl border border-sand-300 bg-sand-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-ink-900">Assisted search service</p>
                <p className="mt-0.5 text-xs leading-5 text-ink-600">
                  KES 300 covers review, genuine matching and coordination. You can also continue without paying and
                  track your request.
                </p>
              </div>
              {paid ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Paid
                </span>
              ) : (
                <Button onClick={pay} loading={paying} variant="secondary">
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  Pay {formatKes(300)}
                </Button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-ink-500">
              Demo mode: M-Pesa is simulated. No real money is charged. A payment only succeeds when the provider
              confirms it.
            </p>
          </div>
        ) : (
          <InlineNote tone="warning">
            You submitted this as a guest. Keep the tracking link safe — it is the only way to follow progress.{" "}
            <Link href="/register" className="font-semibold underline">
              Create an account
            </Link>{" "}
            next time to manage requests in your dashboard.
          </InlineNote>
        )}

        <button
          type="button"
          onClick={() => {
            setCreated(null);
            setPaid(false);
            setForm((current) => ({ ...current, requirements: "", assistance_requirements: "" }));
          }}
          className="mt-5 text-sm font-semibold text-teal-700 hover:underline"
        >
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="surface p-5 sm:p-7">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white">
          <Search className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-ink-900">Tell us what you need</h2>
          <p className="text-xs text-ink-400">The more specific you are, the fewer wasted viewings.</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="label">What kind of space?</p>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-ink-900/10 bg-ivory-100 p-1">
          {[
            { value: "residential", label: "A home" },
            { value: "commercial", label: "A business space" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setForm((current) => ({
                  ...current,
                  category: option.value as "residential" | "commercial",
                  property_type: "",
                  facilities: [],
                }));
              }}
              className={cn(
                "rounded-lg px-3 py-2.5 text-sm font-semibold transition",
                form.category === option.value
                  ? "bg-white text-teal-800 shadow-sm"
                  : "text-ink-500 hover:text-ink-800",
              )}
              aria-pressed={form.category === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="County" htmlFor="assisted-county">
          <Select
            id="assisted-county"
            value={form.county_id}
            onChange={(event) => {
              set("county_id", event.target.value);
              set("town_id", "");
            }}
          >
            <option value="">Any county</option>
            {(options?.counties ?? []).map((county) => (
              <option key={county.id} value={county.id}>
                {county.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Town or city" htmlFor="assisted-town">
          <Select id="assisted-town" value={form.town_id} onChange={(event) => set("town_id", event.target.value)}>
            <option value="">Any town</option>
            {towns.map((town) => (
              <option key={town.id} value={town.id}>
                {town.name}
                {town.county ? ` (${town.county})` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Minimum budget (KES)" htmlFor="assisted-min">
          <Input
            id="assisted-min"
            type="number"
            min={0}
            inputMode="numeric"
            value={form.budget_min}
            onChange={(event) => set("budget_min", event.target.value)}
            placeholder="Optional"
          />
        </Field>
        <Field label="Maximum budget (KES)" htmlFor="assisted-max" required>
          <Input
            id="assisted-max"
            type="number"
            min={1}
            inputMode="numeric"
            required
            value={form.budget_max}
            onChange={(event) => set("budget_max", event.target.value)}
            placeholder="e.g. 15000"
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Property type" htmlFor="assisted-type">
          <Select id="assisted-type" value={form.property_type} onChange={(event) => set("property_type", event.target.value)}>
            <option value="">Any suitable type</option>
            {types.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
        </Field>
        {form.category === "residential" ? (
          <Field label="Minimum bedrooms" htmlFor="assisted-beds">
            <Select id="assisted-beds" value={form.bedrooms_min} onChange={(event) => set("bedrooms_min", event.target.value)}>
              <option value="">Any</option>
              {[1, 2, 3, 4, 5].map((count) => (
                <option key={count} value={count}>
                  {count}+
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Business type or intended use" htmlFor="assisted-business">
            <Input
              id="assisted-business"
              value={form.business_type}
              onChange={(event) => set("business_type", event.target.value)}
              placeholder="e.g. hardware shop"
            />
          </Field>
        )}
      </div>

      {form.category === "commercial" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Floor area min (m²)" htmlFor="assisted-area-min">
            <Input
              id="assisted-area-min"
              type="number"
              min={1}
              value={form.floor_area_min}
              onChange={(event) => set("floor_area_min", event.target.value)}
            />
          </Field>
          <Field label="Floor area max (m²)" htmlFor="assisted-area-max">
            <Input
              id="assisted-area-max"
              type="number"
              min={1}
              value={form.floor_area_max}
              onChange={(event) => set("floor_area_max", event.target.value)}
            />
          </Field>
          <Field label="Frontage min (m)" htmlFor="assisted-frontage">
            <Input
              id="assisted-frontage"
              type="number"
              min={0}
              value={form.frontage_min}
              onChange={(event) => set("frontage_min", event.target.value)}
            />
          </Field>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Earliest move-in date" htmlFor="assisted-date">
          <Input
            id="assisted-date"
            type="date"
            min={new Date().toISOString().slice(0, 10)}
            value={form.move_in_date}
            onChange={(event) => set("move_in_date", event.target.value)}
          />
        </Field>
        <Field label="Preferred contact method" htmlFor="assisted-contact">
          <Select id="assisted-contact" value={form.contact_method} onChange={(event) => set("contact_method", event.target.value)}>
            <option value="phone">Phone call</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </Select>
        </Field>
      </div>

      <fieldset className="mt-4">
        <legend className="label">Must-have facilities</legend>
        <div className="flex flex-wrap gap-1.5">
          {facilities.map((facility) => {
            const selected = form.facilities.includes(facility.slug);
            return (
              <button
                key={facility.id}
                type="button"
                onClick={() =>
                  set(
                    "facilities",
                    selected
                      ? form.facilities.filter((slug) => slug !== facility.slug)
                      : [...form.facilities, facility.slug],
                  )
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  selected
                    ? "border-teal-600 bg-teal-700 text-white"
                    : "border-ink-900/15 bg-white text-ink-600 hover:border-teal-600/40",
                )}
                aria-pressed={selected}
              >
                {facility.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      {form.category === "commercial" ? (
        <div className="mt-4 space-y-2">
          <Checkbox
            label="I need vehicle loading access"
            description="Tell us if deliveries or customer pickups require direct loading."
            checked={form.loading_required}
            onChange={(event) => set("loading_required", event.target.checked)}
          />
          <Field label="Minimum parking spaces" htmlFor="assisted-parking">
            <Input
              id="assisted-parking"
              type="number"
              min={0}
              value={form.parking_required}
              onChange={(event) => set("parking_required", event.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        <Field
          label="What should we know?"
          htmlFor="assisted-requirements"
          hint="Describe your household or business, priorities and anything that would make a space unsuitable."
        >
          <Textarea
            id="assisted-requirements"
            value={form.requirements}
            onChange={(event) => set("requirements", event.target.value)}
            placeholder="e.g. Quiet compound, secure water, within walking distance of Kehancha market. I work nights and need a safe entrance."
            maxLength={3000}
          />
        </Field>
        <Field label="Help needed (optional)" htmlFor="assisted-help">
          <Textarea
            id="assisted-help"
            value={form.assistance_requirements}
            onChange={(event) => set("assistance_requirements", event.target.value)}
            placeholder="e.g. I am not in Migori; please arrange an inspection and share photos."
            maxLength={2000}
            className="min-h-20"
          />
        </Field>
      </div>

      {!user ? (
        <div className="mt-4 rounded-2xl border border-ink-900/10 bg-ivory-100 p-4">
          <p className="text-sm font-bold text-ink-900">How we reach you</p>
          <p className="mt-0.5 text-xs leading-5 text-ink-500">
            You can submit without an account. We only use these details for this request.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Your name" htmlFor="assisted-name" required>
              <Input
                id="assisted-name"
                required
                value={form.guest_name}
                onChange={(event) => set("guest_name", event.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field label="Phone number" htmlFor="assisted-phone" required>
              <Input
                id="assisted-phone"
                type="tel"
                required
                value={form.guest_phone}
                onChange={(event) => set("guest_phone", event.target.value)}
                autoComplete="tel"
                placeholder="+254 7XX XXX XXX"
              />
            </Field>
          </div>
          <Field label="Email (optional)" htmlFor="assisted-email" className="mt-4">
            <Input
              id="assisted-email"
              type="email"
              value={form.guest_email}
              onChange={(event) => set("guest_email", event.target.value)}
              autoComplete="email"
            />
          </Field>
        </div>
      ) : null}

      <div className="mt-4">
        <Checkbox
          label="I consent to Findora reviewing my request and sharing the necessary details with a vetted local partner"
          description="Partners only see what is needed to investigate availability. We do not publish your request or personal details."
          checked={form.consent_to_share}
          onChange={(event) => set("consent_to_share", event.target.checked)}
          required
        />
      </div>

      {errors.length ? (
        <div className="mt-4 rounded-xl border border-terracotta-200 bg-terracotta-100 px-3.5 py-3 text-sm text-terracotta-800" role="alert">
          <ul className="list-inside list-disc space-y-1">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button type="submit" size="lg" className="mt-5 w-full" loading={submitting} disabled={!form.consent_to_share}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Submit assisted search request
      </Button>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-ink-400">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          No invented matches
        </span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          Local partner network
        </span>
        <span className="inline-flex items-center gap-1">
          <Loader2 className="h-3.5 w-3.5" aria-hidden="true" />
          Track progress securely
        </span>
      </div>
    </form>
  );
}
