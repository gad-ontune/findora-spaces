import Link from "next/link";
import { MapPin, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/brand";

const columns = [
  {
    title: "Discover",
    links: [
      { href: "/properties?category=residential", label: "Residential spaces" },
      { href: "/properties?category=commercial", label: "Commercial spaces" },
      { href: "/map", label: "Map search" },
      { href: "/assisted", label: "Assisted property finding" },
    ],
  },
  {
    title: "For property owners",
    links: [
      { href: "/landlord", label: "List a property" },
      { href: "/trust", label: "Verification and trust" },
      { href: "/register?type=landlord", label: "Create a landlord account" },
      { href: "/login", label: "Landlord sign in" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/trust", label: "How Findora works" },
      { href: "/trust#safety", label: "Safety guidance" },
      { href: "/trust#privacy", label: "Privacy and data" },
      { href: "/trust#accessibility", label: "Accessibility" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-ink-900/10 bg-teal-900 text-ivory-100">
      <div className="container-page py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo light />
            <p className="mt-4 max-w-sm text-sm leading-6 text-teal-100/80">
              Rental discovery built around honest availability, visible verification and local human help.
              Launching in Kehancha, Migori County, and designed for every town in Kenya.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-teal-100/80">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-700 bg-teal-800 px-3 py-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Kehancha, Migori County
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-700 bg-teal-800 px-3 py-1.5">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Evidence-based verification
              </span>
            </div>
          </div>
          {columns.map((column) => (
            <div key={column.title}>
              <h2 className="text-sm font-semibold text-ivory-50">{column.title}</h2>
              <ul className="mt-3 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-teal-100/75 transition hover:text-white hover:underline underline-offset-4"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-teal-700 bg-teal-800/70 p-4 text-xs leading-6 text-teal-100/80">
          <strong className="font-semibold text-ivory-50">Demo environment:</strong> every property listing, photo,
          verification record and review in this build is fictional sample data created for demonstration. Findora
          never publishes a listing as available unless it is approved and its availability has been freshly
          confirmed.
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-teal-700 pt-6 text-xs text-teal-100/60 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Findora Spaces. Built for Kenya.</p>
          <p>Prices in Kenyan Shillings. Verification reduces risk but does not guarantee a property.</p>
        </div>
      </div>
    </footer>
  );
}
