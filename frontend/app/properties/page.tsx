import type { Metadata } from "next";
import { Suspense } from "react";

import { PropertiesExplorer } from "@/components/search/properties-explorer";
import type { ConfigPayload } from "@/lib/types";
import { serverFetch } from "@/lib/server-api";

export const metadata: Metadata = {
  title: "Browse rental spaces in Kenya",
  description:
    "Search approved, freshly confirmed homes and commercial spaces in Kehancha and across Kenya. Filter by rent, bedrooms, amenities, verification and availability.",
};

type OptionsPayload = {
  counties: { id: string; name: string; code: string; slug: string }[];
  towns: { id: string; name: string; county: string; county_id: string }[];
};

export default async function PropertiesPage() {
  const [config, options] = await Promise.all([
    serverFetch<ConfigPayload>("/config", { revalidate: 120 }),
    serverFetch<OptionsPayload>("/locations/options", { revalidate: 120 }),
  ]);

  return (
    <Suspense
      fallback={
        <div className="container-page py-10">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-ink-100" />
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="surface overflow-hidden">
                <div className="aspect-[4/3] animate-pulse bg-ink-100" />
                <div className="space-y-3 p-4">
                  <div className="h-5 w-28 animate-pulse rounded bg-ink-100" />
                  <div className="h-4 w-full animate-pulse rounded bg-ink-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      }
    >
      <PropertiesExplorer config={config} towns={options?.towns ?? []} />
    </Suspense>
  );
}
