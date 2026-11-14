import type { Metadata } from "next";

import { MapExplorer } from "@/components/maps/map-explorer";
import { PageHeader } from "@/components/ui/page";
import { serverFetch } from "@/lib/server-api";
import type { ConfigPayload } from "@/lib/types";

export const metadata: Metadata = {
  title: "Map search",
  description:
    "Explore approved rental homes and commercial spaces on a map. Locations are approximate to protect occupants.",
};

type OptionsPayload = {
  towns: { id: string; name: string; county: string | null; county_id: string | null }[];
};

export default async function MapPage() {
  const [config, options] = await Promise.all([
    serverFetch<ConfigPayload>("/config", { revalidate: 120 }),
    serverFetch<OptionsPayload>("/locations/options", { revalidate: 120 }),
  ]);

  return (
    <div className="container-page py-8 sm:py-10">
      <PageHeader
        eyebrow="Map search"
        title="Explore spaces by area"
        description="Search approved, freshly confirmed listings on a map. Pins show approximate areas rather than exact addresses, so current occupants are not exposed to unwanted visits."
      />
      <div className="mt-6">
        <MapExplorer config={config} towns={options?.towns ?? []} />
      </div>
    </div>
  );
}
