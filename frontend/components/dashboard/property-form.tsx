"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, Home, MapPin, Save, Store } from "lucide-react";

import { LocationPinner } from "@/components/dashboard/location-pinner";
import { useAuth, useToast } from "@/components/providers";
import { Button, LinkButton } from "@/components/ui/button";
import { InlineNote } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { api, errorMessage, validationDetails } from "@/lib/api";
import type {
  Category,
  ConfigPayload,
  OptionsPayload,
  PropertyDetail,
  PropertySummary,
} from "@/lib/types";
import { cn, formatKes, titleize } from "@/lib/utils";

type NeighbourhoodOption = { id: string; name: string; slug: string };
type LandmarkOption = { id: string; name: string };

type FormState = {
  title: string;
  description: string;
  category: Category;
  property_type: string;
  town_id: string;
  neighbourhood_id: string;
  landmark_id: string;
  address_line: string;
  directions: string;
  precision: "exact" | "approximate" | "neighbourhood";
  latitude: string;
  longitude: string;
  rent_amount: string;
  deposit_amount: string;
  rent_period: string;
  agency_fee: string;
  service_fee: string;
  utility_connection_fee: string;
  other_mandatory_fee: string;
  utilities_included: boolean;
  negotiable: boolean;
  available_from: string;
  minimum_lease_months: string;
  payment_schedule: string;
  bedrooms: string;
  bathrooms: string;
  house_style: string;
  furnishing: string;
  floor_number: string;
  has_private_bathroom: boolean;
  residential_parking_spaces: string;
  outdoor_space: string;
  water_source: string;
  electricity_supply: string;
  shared_accommodation: boolean;
  floor_area_sqm: string;
  frontage_m: string;
  floor_level: string;
  power_capacity_kva: string;
  commercial_parking_spaces: string;
  accessibility: string;
  loading_access: boolean;
  visibility: string;
  road_access: string;
  lease_duration_months: string;
  zoning_note: string;
  permitted_use_verified: boolean;
  amenity_ids: string[];
  commercial_use_ids: string[];
  confirm_authority: boolean;
  confirm_photo_consent: boolean;
  confirm_available_now: boolean;
  recorded_owner_name: string;
  recorded_owner_phone: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  category: "residential",
  property_type: "two_bedroom",
  town_id: "",
  neighbourhood_id: "",
  landmark_id: "",
  address_line: "",
  directions: "",
  precision: "approximate",
  latitude: "",
  longitude: "",
  rent_amount: "",
  deposit_amount: "",
  rent_period: "monthly",
  agency_fee: "",
  service_fee: "",
  utility_connection_fee: "",
  other_mandatory_fee: "",
  utilities_included: false,
  negotiable: false,
  available_from: "",
  minimum_lease_months: "",
  payment_schedule: "",
  bedrooms: "",
  bathrooms: "",
  house_style: "",
  furnishing: "unfurnished",
  floor_number: "",
  has_private_bathroom: false,
  residential_parking_spaces: "0",
  outdoor_space: "",
  water_source: "",
  electricity_supply: "",
  shared_accommodation: false,
  floor_area_sqm: "",
  frontage_m: "",
  floor_level: "",
  power_capacity_kva: "",
  commercial_parking_spaces: "0",
  accessibility: "",
  loading_access: false,
  visibility: "",
  road_access: "",
  lease_duration_months: "",
  zoning_note: "",
  permitted_use_verified: false,
  amenity_ids: [],
  commercial_use_ids: [],
  confirm_authority: false,
  confirm_photo_consent: false,
  confirm_available_now: true,
  recorded_owner_name: "",
  recorded_owner_phone: "",
};

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value: string): number | null {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formFromProperty(property: PropertyDetail): FormState {
  const residential = property.residential;
  const commercial = property.commercial;
  const privateLatitude = property.management?.private_latitude;
  const privateLongitude = property.management?.private_longitude;
  const exactFallback = property.location.precision === "exact";
  const latitude =
    privateLatitude !== null && privateLatitude !== undefined
      ? String(privateLatitude)
      : exactFallback && property.location.latitude !== null
        ? String(property.location.latitude)
        : "";
  const longitude =
    privateLongitude !== null && privateLongitude !== undefined
      ? String(privateLongitude)
      : exactFallback && property.location.longitude !== null
        ? String(property.location.longitude)
        : "";
  return {
    ...EMPTY_FORM,
    title: property.title,
    description: property.description,
    category: property.category,
    property_type: property.property_type,
    town_id: property.location.town_id,
    neighbourhood_id: property.location.neighbourhood_id ?? "",
    landmark_id: property.location.landmark_id ?? "",
    address_line: property.location.address_line ?? "",
    directions: property.location.directions ?? "",
    precision: (property.location.precision as FormState["precision"]) ?? "approximate",
    latitude,
    longitude,
    rent_amount: property.terms?.rent_amount !== null && property.terms?.rent_amount !== undefined ? String(property.terms.rent_amount) : "",
    deposit_amount:
      property.terms?.deposit_amount !== null && property.terms?.deposit_amount !== undefined
        ? String(property.terms.deposit_amount)
        : "",
    rent_period: property.terms?.rent_period ?? "monthly",
    agency_fee: property.terms?.agency_fee !== null && property.terms?.agency_fee !== undefined ? String(property.terms.agency_fee) : "",
    service_fee:
      property.terms?.service_fee !== null && property.terms?.service_fee !== undefined ? String(property.terms.service_fee) : "",
    utility_connection_fee:
      property.terms?.utility_connection_fee !== null && property.terms?.utility_connection_fee !== undefined
        ? String(property.terms.utility_connection_fee)
        : "",
    other_mandatory_fee:
      property.terms?.other_mandatory_fee !== null && property.terms?.other_mandatory_fee !== undefined
        ? String(property.terms.other_mandatory_fee)
        : "",
    utilities_included: Boolean(property.terms?.utilities_included),
    negotiable: Boolean(property.terms?.negotiable),
    available_from: property.terms?.available_from ?? "",
    minimum_lease_months:
      property.terms?.minimum_lease_months !== null && property.terms?.minimum_lease_months !== undefined
        ? String(property.terms.minimum_lease_months)
        : "",
    payment_schedule: property.terms?.payment_schedule ?? "",
    bedrooms: residential?.bedrooms !== null && residential?.bedrooms !== undefined ? String(residential.bedrooms) : "",
    bathrooms: residential?.bathrooms !== null && residential?.bathrooms !== undefined ? String(residential.bathrooms) : "",
    house_style: residential?.house_style ?? "",
    furnishing: residential?.furnishing ?? "unfurnished",
    floor_number:
      residential?.floor_number !== null && residential?.floor_number !== undefined ? String(residential.floor_number) : "",
    has_private_bathroom: Boolean(residential?.has_private_bathroom),
    residential_parking_spaces:
      residential?.parking_spaces !== null && residential?.parking_spaces !== undefined
        ? String(residential.parking_spaces)
        : "0",
    outdoor_space: residential?.outdoor_space ?? "",
    water_source: residential?.water_source ?? "",
    electricity_supply: residential?.electricity_supply ?? "",
    shared_accommodation: Boolean(residential?.shared_accommodation),
    floor_area_sqm:
      commercial?.floor_area_sqm !== null && commercial?.floor_area_sqm !== undefined ? String(commercial.floor_area_sqm) : "",
    frontage_m: commercial?.frontage_m !== null && commercial?.frontage_m !== undefined ? String(commercial.frontage_m) : "",
    floor_level: commercial?.floor_level ?? "",
    power_capacity_kva:
      commercial?.power_capacity_kva !== null && commercial?.power_capacity_kva !== undefined
        ? String(commercial.power_capacity_kva)
        : "",
    commercial_parking_spaces:
      commercial?.parking_spaces !== null && commercial?.parking_spaces !== undefined ? String(commercial.parking_spaces) : "0",
    accessibility: commercial?.accessibility ?? "",
    loading_access: Boolean(commercial?.loading_access),
    visibility: commercial?.visibility ?? "",
    road_access: commercial?.road_access ?? "",
    lease_duration_months:
      commercial?.lease_duration_months !== null && commercial?.lease_duration_months !== undefined
        ? String(commercial.lease_duration_months)
        : "",
    zoning_note: commercial?.zoning_note ?? "",
    permitted_use_verified: Boolean(commercial?.permitted_use_verified),
    amenity_ids: (property.amenities ?? []).map((amenity) => amenity.id),
    commercial_use_ids: (property.commercial_uses ?? []).map((use) => use.id),
    recorded_owner_name: property.management?.recorded_owner_name ?? "",
    recorded_owner_phone: property.management?.recorded_owner_phone ?? "",
  };
}

function buildLocation(form: FormState) {
  return {
    town_id: form.town_id,
    neighbourhood_id: textOrNull(form.neighbourhood_id),
    landmark_id: textOrNull(form.landmark_id),
    address_line: textOrNull(form.address_line),
    directions: textOrNull(form.directions),
    precision: form.precision,
    latitude: numberOrNull(form.latitude),
    longitude: numberOrNull(form.longitude),
  };
}

function buildTerms(form: FormState) {
  return {
    currency: "KES",
    rent_amount: numberOrNull(form.rent_amount) ?? 0,
    deposit_amount: numberOrNull(form.deposit_amount) ?? 0,
    rent_period: form.rent_period,
    agency_fee: numberOrNull(form.agency_fee),
    service_fee: numberOrNull(form.service_fee),
    utility_connection_fee: numberOrNull(form.utility_connection_fee),
    other_mandatory_fee: numberOrNull(form.other_mandatory_fee),
    other_charges: [],
    utilities_included: form.utilities_included,
    negotiable: form.negotiable,
    available_from: textOrNull(form.available_from),
    minimum_lease_months: integerOrNull(form.minimum_lease_months),
    payment_schedule: textOrNull(form.payment_schedule),
  };
}

function buildResidential(form: FormState) {
  return {
    bedrooms: integerOrNull(form.bedrooms),
    bathrooms: integerOrNull(form.bathrooms),
    house_style: textOrNull(form.house_style),
    furnishing: form.furnishing,
    floor_number: integerOrNull(form.floor_number),
    has_private_bathroom: form.has_private_bathroom,
    parking_spaces: integerOrNull(form.residential_parking_spaces) ?? 0,
    outdoor_space: textOrNull(form.outdoor_space),
    security_features: [] as string[],
    water_source: textOrNull(form.water_source),
    electricity_supply: textOrNull(form.electricity_supply),
    shared_accommodation: form.shared_accommodation,
  };
}

function buildCommercial(form: FormState) {
  return {
    floor_area_sqm: numberOrNull(form.floor_area_sqm),
    frontage_m: numberOrNull(form.frontage_m),
    floor_level: textOrNull(form.floor_level),
    power_capacity_kva: numberOrNull(form.power_capacity_kva),
    parking_spaces: integerOrNull(form.commercial_parking_spaces) ?? 0,
    accessibility: textOrNull(form.accessibility),
    loading_access: form.loading_access,
    visibility: textOrNull(form.visibility),
    road_access: textOrNull(form.road_access),
    lease_duration_months: integerOrNull(form.lease_duration_months),
    zoning_note: textOrNull(form.zoning_note),
    permitted_use_verified: form.permitted_use_verified,
  };
}

function sorted(values: string[]) {
  return [...values].sort();
}

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface p-5 sm:p-6", className)}>
      <h2 className="font-display text-lg font-bold text-ink-900">{title}</h2>
      {description ? <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-500">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function PropertyForm({
  mode,
  property,
}: {
  mode: "create" | "edit";
  property?: PropertyDetail;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(() => (property ? formFromProperty(property) : EMPTY_FORM));
  const [initialForm] = useState<FormState>(() => (property ? formFromProperty(property) : EMPTY_FORM));
  const [saving, setSaving] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState<Record<string, unknown>[]>([]);

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<ConfigPayload>("/config"),
    staleTime: 5 * 60_000,
  });

  const optionsQuery = useQuery({
    queryKey: ["location-options"],
    queryFn: () => api.get<OptionsPayload>("/locations/options"),
    staleTime: 5 * 60_000,
  });

  const neighbourhoodsQuery = useQuery({
    queryKey: ["neighbourhoods", form.town_id],
    queryFn: () => api.get<{ neighbourhoods: NeighbourhoodOption[] }>(`/locations/${form.town_id}/neighbourhoods`),
    enabled: Boolean(form.town_id),
    staleTime: 5 * 60_000,
  });

  const landmarksQuery = useQuery({
    queryKey: ["landmarks", form.town_id],
    queryFn: () => api.get<{ landmarks: LandmarkOption[] }>(`/locations/${form.town_id}/landmarks`),
    enabled: Boolean(form.town_id),
    staleTime: 5 * 60_000,
  });

  const towns = optionsQuery.data?.towns ?? [];
  const counties = optionsQuery.data?.counties ?? [];
  const propertyTypes = configQuery.data?.property_types[form.category] ?? [];
  const amenities = useMemo(
    () =>
      (configQuery.data?.amenities ?? []).filter(
        (amenity) => amenity.applies_to === "both" || amenity.applies_to === form.category,
      ),
    [configQuery.data?.amenities, form.category],
  );
  const commercialUses = configQuery.data?.commercial_uses ?? [];
  const selectedTown = towns.find((town) => town.id === form.town_id);
  const operatesForOthers = Boolean(user?.roles.some((role) => ["data_partner", "property_manager"].includes(role)));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectCategory(category: Category) {
    const types = configQuery.data?.property_types[category] ?? [];
    setForm((current) => ({
      ...current,
      category,
      property_type: types[0]?.value ?? current.property_type,
      commercial_use_ids: category === "commercial" ? current.commercial_use_ids : [],
    }));
  }

  function toggleList(key: "amenity_ids" | "commercial_use_ids", id: string) {
    setForm((current) => {
      const values = current[key];
      return {
        ...current,
        [key]: values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
      };
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || form.title.trim().length < 8) {
      toast({ title: "Add a descriptive title", description: "Titles must be at least 8 characters.", tone: "error" });
      return;
    }
    if (form.description.trim().length < 40) {
      toast({
        title: "Describe the property in more detail",
        description: "Descriptions must be at least 40 characters.",
        tone: "error",
      });
      return;
    }
    if (!form.town_id) {
      toast({ title: "Choose the town", description: "Every listing needs a real town from the location list.", tone: "error" });
      return;
    }
    const rent = numberOrNull(form.rent_amount);
    if (!rent || rent <= 0) {
      toast({ title: "Enter the advertised rent", description: "Rent must be greater than zero.", tone: "error" });
      return;
    }
    if (form.category === "commercial" && form.commercial_use_ids.length === 0) {
      toast({
        title: "Select at least one business use",
        description: "Commercial listings must say which business uses the space suits.",
        tone: "error",
      });
      return;
    }
    if (mode === "create") {
      if (!form.confirm_authority) {
        toast({ title: "Confirm your authority to list", description: "You must have permission from the owner.", tone: "error" });
        return;
      }
      if (operatesForOthers && (!form.recorded_owner_name.trim() || !form.recorded_owner_phone.trim())) {
        toast({
          title: "Record the owner details",
          description: "Partner and manager submissions must record the owner or authorised representative.",
          tone: "error",
        });
        return;
      }
    }

    setSaving(true);
    try {
      if (mode === "create") {
        const payload = {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          property_type: form.property_type,
          location: buildLocation(form),
          terms: buildTerms(form),
          residential: form.category === "residential" ? buildResidential(form) : null,
          commercial: form.category === "commercial" ? buildCommercial(form) : null,
          amenity_ids: form.amenity_ids,
          commercial_use_ids: form.category === "commercial" ? form.commercial_use_ids : [],
          confirm_authority: form.confirm_authority,
          confirm_photo_consent: form.confirm_photo_consent,
          confirm_available_now: form.confirm_available_now,
          recorded_owner_name: operatesForOthers ? textOrNull(form.recorded_owner_name) : null,
          recorded_owner_phone: operatesForOthers ? textOrNull(form.recorded_owner_phone) : null,
        };
        const result = await api.post<{
          property: PropertySummary;
          duplicate_warnings: Record<string, unknown>[];
          message: string;
        }>("/properties", payload);
        setDuplicateWarnings(result.duplicate_warnings ?? []);
        await queryClient.invalidateQueries({ queryKey: ["my-properties"] });
        await queryClient.invalidateQueries({ queryKey: ["seeker-overview"] });
        toast({ title: "Property submitted", description: result.message, tone: "success" });
        router.push(`/dashboard/properties/${result.property.id}/edit`);
        return;
      }

      if (!property) return;
      const payload: Record<string, unknown> = {};
      if (form.title.trim() !== initialForm.title) payload.title = form.title.trim();
      if (form.description.trim() !== initialForm.description) payload.description = form.description.trim();
      if (form.property_type !== initialForm.property_type) payload.property_type = form.property_type;

      const location = buildLocation(form);
      if (JSON.stringify(location) !== JSON.stringify(buildLocation(initialForm))) payload.location = location;

      const terms = buildTerms(form);
      if (JSON.stringify(terms) !== JSON.stringify(buildTerms(initialForm))) payload.terms = terms;

      if (form.category === "residential") {
        const residential = buildResidential(form);
        if (JSON.stringify(residential) !== JSON.stringify(buildResidential(initialForm))) {
          payload.residential = residential;
        }
      } else {
        const commercial = buildCommercial(form);
        if (JSON.stringify(commercial) !== JSON.stringify(buildCommercial(initialForm))) {
          payload.commercial = commercial;
        }
      }

      if (JSON.stringify(sorted(form.amenity_ids)) !== JSON.stringify(sorted(initialForm.amenity_ids))) {
        payload.amenity_ids = form.amenity_ids;
      }
      if (JSON.stringify(sorted(form.commercial_use_ids)) !== JSON.stringify(sorted(initialForm.commercial_use_ids))) {
        payload.commercial_use_ids = form.category === "commercial" ? form.commercial_use_ids : [];
      }

      if (Object.keys(payload).length === 0) {
        toast({ title: "No changes to save", description: "Edit a field first, then save.", tone: "info" });
        return;
      }

      const result = await api.patch<{ property: PropertySummary; message: string }>(
        `/properties/${property.id}`,
        payload,
      );
      await queryClient.invalidateQueries({ queryKey: ["my-properties"] });
      await queryClient.invalidateQueries({ queryKey: ["property", property.id] });
      toast({ title: "Listing updated", description: result.message, tone: "success" });
      router.refresh();
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not save the listing",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LinkButton href="/dashboard/properties" variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          My listings
        </LinkButton>
        <p className="text-xs text-ink-400">
          {mode === "create" ? "New listing · starts in moderation" : `Reference ${property?.reference ?? ""}`}
        </p>
      </div>

      {duplicateWarnings.length ? (
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Possible duplicates were detected. A moderator will review them before the listing becomes public. Do not
              submit the same property twice.
            </span>
          </span>
        </InlineNote>
      ) : null}

      <Section
        title="The basics"
        description="Describe the real space accurately. Material changes to an approved listing return it to moderation."
      >
        <div className="grid gap-4">
          <Field label="Listing title" htmlFor="property-title" required hint="At least 8 characters. Mention the space and area, not the exact house number.">
            <Input
              id="property-title"
              required
              minLength={8}
              maxLength={200}
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder="e.g. Bright two-bedroom home near Kehancha market"
            />
          </Field>

          <fieldset>
            <legend className="label">Category</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { value: "residential" as Category, label: "Residential", description: "Homes and living spaces", icon: Home },
                  { value: "commercial" as Category, label: "Commercial", description: "Shops, offices and business premises", icon: Store },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const active = form.category === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectCategory(option.value)}
                    disabled={mode === "edit"}
                    aria-pressed={active}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-70",
                      active
                        ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600/20"
                        : "border-ink-900/10 bg-white hover:border-teal-600/40",
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", active ? "text-teal-700" : "text-ink-400")} aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-semibold text-ink-800">{option.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-ink-500">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {mode === "edit" ? (
              <p className="mt-1.5 text-xs text-ink-400">
                Category cannot be changed after submission. Create a new listing if the property type is different.
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Property type" htmlFor="property-type" required>
              <Select
                id="property-type"
                value={form.property_type}
                onChange={(event) => update("property_type", event.target.value)}
              >
                {propertyTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Available from" htmlFor="available-from">
              <Input
                id="available-from"
                type="date"
                value={form.available_from}
                onChange={(event) => update("available_from", event.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Description"
            htmlFor="property-description"
            required
            hint="At least 40 characters. Include the condition, access, water and power situation honestly."
          >
            <Textarea
              id="property-description"
              required
              minLength={40}
              maxLength={8000}
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              className="min-h-36"
              placeholder="Describe the space, its condition, what is nearby and anything a seeker should know before viewing."
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Location"
        description="Choose the real town and neighbourhood, then pin the exact spot with your phone if you can. Public maps use an approximate position unless you deliberately choose exact."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Town" htmlFor="property-town" required hint={selectedTown?.county ? `${selectedTown.county} County` : undefined}>
            <Select
              id="property-town"
              required
              value={form.town_id}
              onChange={(event) => {
                update("town_id", event.target.value);
                update("neighbourhood_id", "");
                update("landmark_id", "");
                update("latitude", "");
                update("longitude", "");
              }}
            >
              <option value="">Choose a town</option>
              {towns.map((town) => (
                <option key={town.id} value={town.id}>
                  {town.name}
                  {town.county ? ` (${town.county})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Neighbourhood" htmlFor="property-neighbourhood" hint="Optional, but it helps seekers judge the area.">
            <Select
              id="property-neighbourhood"
              value={form.neighbourhood_id}
              onChange={(event) => update("neighbourhood_id", event.target.value)}
              disabled={!form.town_id || neighbourhoodsQuery.isLoading}
            >
              <option value="">{form.town_id ? "Not specified" : "Choose a town first"}</option>
              {(neighbourhoodsQuery.data?.neighbourhoods ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Nearby landmark" htmlFor="property-landmark" hint="Used for orientation, not as the exact address.">
            <Select
              id="property-landmark"
              value={form.landmark_id}
              onChange={(event) => update("landmark_id", event.target.value)}
              disabled={!form.town_id || landmarksQuery.isLoading}
            >
              <option value="">{form.town_id ? "Not specified" : "Choose a town first"}</option>
              {(landmarksQuery.data?.landmarks ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Map precision" htmlFor="property-precision" hint="Approximate hides the exact pin publicly. Exact shows the captured position on the public map.">
            <Select
              id="property-precision"
              value={form.precision}
              onChange={(event) => update("precision", event.target.value as FormState["precision"])}
            >
              <option value="approximate">Approximate — show the neighbourhood area</option>
              <option value="neighbourhood">Neighbourhood only — show only the neighbourhood</option>
              <option value="exact">Exact — show the captured position publicly</option>
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <LocationPinner
            latitude={form.latitude}
            longitude={form.longitude}
            precision={form.precision}
            onCapture={(latitude, longitude) => {
              setForm((current) => ({
                ...current,
                latitude: latitude.toFixed(6),
                longitude: longitude.toFixed(6),
              }));
            }}
            onClear={() => {
              setForm((current) => ({ ...current, latitude: "", longitude: "" }));
            }}
          />
        </div>

        <div className="mt-4 grid gap-4">
          <Field label="Street or building address (optional)" htmlFor="property-address" hint="Only share an address you are authorised to publish. It is not shown as the exact map pin.">
            <Input
              id="property-address"
              maxLength={255}
              value={form.address_line}
              onChange={(event) => update("address_line", event.target.value)}
              placeholder="e.g. Off Kehancha–Migori road"
            />
          </Field>
          <Field label="Directions or access notes (optional)" htmlFor="property-directions" hint="e.g. matatu stage, gate colour, nearby shop. Keep private details out of public text.">
            <Textarea
              id="property-directions"
              maxLength={1000}
              value={form.directions}
              onChange={(event) => update("directions", event.target.value)}
              className="min-h-20"
            />
          </Field>
        </div>

        {selectedTown ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-400">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {selectedTown.name}
            {selectedTown.county ? `, ${selectedTown.county} County` : ""}
            {selectedTown.latitude !== null && selectedTown.longitude !== null
              ? " · town centre available on the public map"
              : ""}
          </p>
        ) : null}
      </Section>

      <Section
        title="Rent and move-in costs"
        description="Disclose every mandatory cost. Findora shows seekers a move-in total calculated from these figures."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Advertised rent (KES)" htmlFor="rent-amount" required>
            <Input
              id="rent-amount"
              required
              type="number"
              min={1}
              max={10_000_000}
              inputMode="numeric"
              value={form.rent_amount}
              onChange={(event) => update("rent_amount", event.target.value)}
              placeholder="e.g. 15000"
            />
          </Field>
          <Field label="Deposit (KES)" htmlFor="deposit-amount">
            <Input
              id="deposit-amount"
              type="number"
              min={0}
              max={100_000_000}
              inputMode="numeric"
              value={form.deposit_amount}
              onChange={(event) => update("deposit_amount", event.target.value)}
              placeholder="0 if no deposit"
            />
          </Field>
          <Field label="Rent period" htmlFor="rent-period">
            <Select id="rent-period" value={form.rent_period} onChange={(event) => update("rent_period", event.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="biannual">Every six months</option>
              <option value="annual">Annually</option>
            </Select>
          </Field>
          <Field label="Agency fee (KES)" htmlFor="agency-fee">
            <Input
              id="agency-fee"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.agency_fee}
              onChange={(event) => update("agency_fee", event.target.value)}
              placeholder="Leave blank if none"
            />
          </Field>
          <Field label="Service fee (KES)" htmlFor="service-fee">
            <Input
              id="service-fee"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.service_fee}
              onChange={(event) => update("service_fee", event.target.value)}
              placeholder="Leave blank if none"
            />
          </Field>
          <Field label="Utility connection fee (KES)" htmlFor="utility-fee">
            <Input
              id="utility-fee"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.utility_connection_fee}
              onChange={(event) => update("utility_connection_fee", event.target.value)}
              placeholder="Leave blank if none"
            />
          </Field>
          <Field label="Other mandatory fee (KES)" htmlFor="other-fee">
            <Input
              id="other-fee"
              type="number"
              min={0}
              inputMode="numeric"
              value={form.other_mandatory_fee}
              onChange={(event) => update("other_mandatory_fee", event.target.value)}
              placeholder="Leave blank if none"
            />
          </Field>
          <Field label="Minimum lease (months)" htmlFor="lease-months">
            <Input
              id="lease-months"
              type="number"
              min={0}
              max={120}
              inputMode="numeric"
              value={form.minimum_lease_months}
              onChange={(event) => update("minimum_lease_months", event.target.value)}
              placeholder="e.g. 6"
            />
          </Field>
          <Field label="Payment schedule (optional)" htmlFor="payment-schedule">
            <Input
              id="payment-schedule"
              maxLength={80}
              value={form.payment_schedule}
              onChange={(event) => update("payment_schedule", event.target.value)}
              placeholder="e.g. Monthly in advance"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Checkbox
            label="Utilities are included in the rent"
            description="Only tick this if the advertised rent genuinely covers them."
            checked={form.utilities_included}
            onChange={(event) => update("utilities_included", event.target.checked)}
          />
          <Checkbox
            label="The rent is negotiable"
            description="Seekers will still confirm the final rent with you."
            checked={form.negotiable}
            onChange={(event) => update("negotiable", event.target.checked)}
          />
        </div>

        {numberOrNull(form.rent_amount) ? (
          <p className="mt-3 rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-500">
            Initial move-in total shown to seekers:{" "}
            <strong className="font-semibold text-ink-800">
              {formatKes(
                (numberOrNull(form.rent_amount) ?? 0) +
                  (numberOrNull(form.deposit_amount) ?? 0) +
                  (numberOrNull(form.agency_fee) ?? 0) +
                  (numberOrNull(form.service_fee) ?? 0) +
                  (numberOrNull(form.utility_connection_fee) ?? 0) +
                  (numberOrNull(form.other_mandatory_fee) ?? 0),
              )}
            </strong>
            . This is calculated from the figures above, not a negotiated quote.
          </p>
        ) : null}
      </Section>

      {form.category === "residential" ? (
        <Section title="Residential details" description="Describe the home accurately. These details appear on the Property Passport.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Bedrooms" htmlFor="bedrooms">
              <Input
                id="bedrooms"
                type="number"
                min={0}
                max={30}
                inputMode="numeric"
                value={form.bedrooms}
                onChange={(event) => update("bedrooms", event.target.value)}
                placeholder="e.g. 2"
              />
            </Field>
            <Field label="Bathrooms" htmlFor="bathrooms">
              <Input
                id="bathrooms"
                type="number"
                min={0}
                max={30}
                inputMode="numeric"
                value={form.bathrooms}
                onChange={(event) => update("bathrooms", event.target.value)}
                placeholder="e.g. 1"
              />
            </Field>
            <Field label="Furnishing" htmlFor="furnishing">
              <Select id="furnishing" value={form.furnishing} onChange={(event) => update("furnishing", event.target.value)}>
                <option value="unfurnished">Unfurnished</option>
                <option value="semi_furnished">Semi-furnished</option>
                <option value="furnished">Furnished</option>
              </Select>
            </Field>
            <Field label="House style (optional)" htmlFor="house-style">
              <Input
                id="house-style"
                maxLength={80}
                value={form.house_style}
                onChange={(event) => update("house_style", event.target.value)}
                placeholder="e.g. Bungalow in a gated compound"
              />
            </Field>
            <Field label="Floor number (optional)" htmlFor="floor-number">
              <Input
                id="floor-number"
                type="number"
                min={-5}
                max={100}
                inputMode="numeric"
                value={form.floor_number}
                onChange={(event) => update("floor_number", event.target.value)}
                placeholder="e.g. 1"
              />
            </Field>
            <Field label="Parking spaces" htmlFor="residential-parking">
              <Input
                id="residential-parking"
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={form.residential_parking_spaces}
                onChange={(event) => update("residential_parking_spaces", event.target.value)}
              />
            </Field>
            <Field label="Outdoor space (optional)" htmlFor="outdoor-space">
              <Input
                id="outdoor-space"
                maxLength={120}
                value={form.outdoor_space}
                onChange={(event) => update("outdoor_space", event.target.value)}
                placeholder="e.g. Small private yard"
              />
            </Field>
            <Field label="Water source (optional)" htmlFor="water-source">
              <Input
                id="water-source"
                maxLength={120}
                value={form.water_source}
                onChange={(event) => update("water_source", event.target.value)}
                placeholder="e.g. Metered piped water"
              />
            </Field>
            <Field label="Electricity supply (optional)" htmlFor="electricity-supply">
              <Input
                id="electricity-supply"
                maxLength={120}
                value={form.electricity_supply}
                onChange={(event) => update("electricity_supply", event.target.value)}
                placeholder="e.g. Token meter"
              />
            </Field>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Checkbox
              label="The main bedroom has a private bathroom"
              checked={form.has_private_bathroom}
              onChange={(event) => update("has_private_bathroom", event.target.checked)}
            />
            <Checkbox
              label="This is shared accommodation"
              description="Tick if the seeker rents a room within a shared house."
              checked={form.shared_accommodation}
              onChange={(event) => update("shared_accommodation", event.target.checked)}
            />
          </div>
        </Section>
      ) : (
        <Section title="Commercial details" description="Give businesses the facts they need to judge the premises.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Floor area (m²)" htmlFor="floor-area">
              <Input
                id="floor-area"
                type="number"
                min={1}
                step="0.1"
                inputMode="decimal"
                value={form.floor_area_sqm}
                onChange={(event) => update("floor_area_sqm", event.target.value)}
                placeholder="e.g. 40"
              />
            </Field>
            <Field label="Frontage (m)" htmlFor="frontage">
              <Input
                id="frontage"
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                value={form.frontage_m}
                onChange={(event) => update("frontage_m", event.target.value)}
                placeholder="e.g. 5"
              />
            </Field>
            <Field label="Floor level (optional)" htmlFor="floor-level">
              <Input
                id="floor-level"
                maxLength={40}
                value={form.floor_level}
                onChange={(event) => update("floor_level", event.target.value)}
                placeholder="e.g. Ground floor"
              />
            </Field>
            <Field label="Power capacity (kVA)" htmlFor="power-capacity">
              <Input
                id="power-capacity"
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                value={form.power_capacity_kva}
                onChange={(event) => update("power_capacity_kva", event.target.value)}
                placeholder="e.g. 10"
              />
            </Field>
            <Field label="Parking spaces" htmlFor="commercial-parking">
              <Input
                id="commercial-parking"
                type="number"
                min={0}
                max={500}
                inputMode="numeric"
                value={form.commercial_parking_spaces}
                onChange={(event) => update("commercial_parking_spaces", event.target.value)}
              />
            </Field>
            <Field label="Lease duration (months)" htmlFor="commercial-lease">
              <Input
                id="commercial-lease"
                type="number"
                min={0}
                max={600}
                inputMode="numeric"
                value={form.lease_duration_months}
                onChange={(event) => update("lease_duration_months", event.target.value)}
                placeholder="e.g. 36"
              />
            </Field>
            <Field label="Accessibility (optional)" htmlFor="accessibility">
              <Input
                id="accessibility"
                maxLength={160}
                value={form.accessibility}
                onChange={(event) => update("accessibility", event.target.value)}
                placeholder="e.g. Step-free entrance"
              />
            </Field>
            <Field label="Visibility (optional)" htmlFor="visibility">
              <Input
                id="visibility"
                maxLength={120}
                value={form.visibility}
                onChange={(event) => update("visibility", event.target.value)}
                placeholder="e.g. Main road frontage"
              />
            </Field>
            <Field label="Road access (optional)" htmlFor="road-access">
              <Input
                id="road-access"
                maxLength={160}
                value={form.road_access}
                onChange={(event) => update("road_access", event.target.value)}
                placeholder="e.g. Tarmac access to the gate"
              />
            </Field>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Checkbox
              label="There is loading access"
              checked={form.loading_access}
              onChange={(event) => update("loading_access", event.target.checked)}
            />
            <Checkbox
              label="Permitted use has been verified"
              description="Only tick if you have independent confirmation. Findora may ask for evidence."
              checked={form.permitted_use_verified}
              onChange={(event) => update("permitted_use_verified", event.target.checked)}
            />
          </div>
          <div className="mt-4">
            <Field label="Zoning note (optional)" htmlFor="zoning-note">
              <Textarea
                id="zoning-note"
                maxLength={1000}
                value={form.zoning_note}
                onChange={(event) => update("zoning_note", event.target.value)}
                className="min-h-20"
                placeholder="Anything a business should know about permitted use or zoning."
              />
            </Field>
          </div>
        </Section>
      )}

      <Section title="Amenities" description="Select only facilities that genuinely exist at the property.">
        {configQuery.isLoading ? (
          <p className="text-sm text-ink-500">Loading amenities…</p>
        ) : amenities.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {amenities.map((amenity) => {
              const checked = form.amenity_ids.includes(amenity.id);
              return (
                <label
                  key={amenity.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition",
                    checked
                      ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600/20"
                      : "border-ink-900/10 bg-white hover:border-teal-600/30",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleList("amenity_ids", amenity.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-teal-700 accent-teal-700"
                  />
                  <span>
                    <span className="block font-medium text-ink-800">{amenity.name}</span>
                    <span className="block text-[12px] uppercase tracking-wide text-ink-400">{titleize(amenity.category)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-ink-500">No amenities are configured.</p>
        )}
      </Section>

      {form.category === "commercial" ? (
        <Section
          title="Suitable business uses"
          description="Select at least one. These help the right businesses find the space and are required for commercial listings."
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {commercialUses.map((use) => {
              const checked = form.commercial_use_ids.includes(use.id);
              return (
                <label
                  key={use.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm transition",
                    checked
                      ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600/20"
                      : "border-ink-900/10 bg-white hover:border-teal-600/30",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleList("commercial_use_ids", use.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-teal-700 accent-teal-700"
                  />
                  <span>
                    <span className="block font-medium text-ink-800">{use.name}</span>
                    {use.description ? (
                      <span className="mt-0.5 block text-xs leading-5 text-ink-500">{use.description}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </Section>
      ) : null}

      {mode === "create" ? (
        <Section title="Confirmations" description="These confirmations are recorded with the submission.">
          <div className="grid gap-2">
            <Checkbox
              label="I have authority to list this property"
              description="I am the owner, or I have permission from the owner or an authorised representative to advertise it."
              checked={form.confirm_authority}
              onChange={(event) => update("confirm_authority", event.target.checked)}
              required
            />
            <Checkbox
              label="I have permission to publish the photos I upload"
              description="Photos must be of the real property and must not be copied from another listing without permission."
              checked={form.confirm_photo_consent}
              onChange={(event) => update("confirm_photo_consent", event.target.checked)}
            />
            <Checkbox
              label="The property is available now"
              description="Leave unticked if it is not yet available. Availability is shown separately from moderation."
              checked={form.confirm_available_now}
              onChange={(event) => update("confirm_available_now", event.target.checked)}
            />
          </div>

          {operatesForOthers ? (
            <div className="mt-4 grid gap-4 rounded-xl border border-sand-300 bg-sand-100 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="flex items-center gap-1.5 text-xs font-bold text-ink-700">
                  <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Owner or authorised representative
                </p>
                <p className="mt-1 text-xs leading-5 text-ink-500">
                  Partner and manager submissions must record who authorised the listing. This is not shown publicly.
                </p>
              </div>
              <Field label="Owner / representative name" htmlFor="owner-name" required>
                <Input
                  id="owner-name"
                  required
                  maxLength={160}
                  value={form.recorded_owner_name}
                  onChange={(event) => update("recorded_owner_name", event.target.value)}
                />
              </Field>
              <Field label="Owner / representative phone" htmlFor="owner-phone" required>
                <Input
                  id="owner-phone"
                  required
                  type="tel"
                  maxLength={20}
                  value={form.recorded_owner_phone}
                  onChange={(event) => update("recorded_owner_phone", event.target.value)}
                  placeholder="+254 7XX XXX XXX"
                />
              </Field>
            </div>
          ) : null}
        </Section>
      ) : null}

      <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-900/10 bg-white/95 p-3 shadow-card backdrop-blur">
        <p className="flex items-center gap-1.5 text-xs leading-5 text-ink-500">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
          {mode === "create"
            ? "Your listing becomes public only after moderation and a fresh availability confirmation."
            : "Only changed sections are sent. Material changes return an approved listing to moderation."}
        </p>
        <div className="flex items-center gap-2">
          <LinkButton href="/dashboard/properties" variant="ghost" size="sm">
            Cancel
          </LinkButton>
          <Button type="submit" loading={saving}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {mode === "create" ? "Submit for moderation" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
