import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "You are offline",
  description: "Findora Spaces could not reach the network. Reconnect to continue browsing live listings.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-16">
      <div className="surface max-w-md p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ivory-200 text-teal-700">
          <WifiOff className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">You are offline</h1>
        <p className="mt-2 text-sm leading-6 text-ink-500">
          Findora needs a connection to show live availability. Cached pages may be out of date, and we never show an
          old listing as if it were freshly confirmed.
        </p>
        <p className="mt-3 rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-500">
          Reconnect and reload to continue. Your saved spaces and dashboards are not cached on shared devices.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <LinkButton href="/">Try again</LinkButton>
          <LinkButton href="/properties" variant="outline">
            Browse spaces
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
