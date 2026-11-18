"use client";

import Link from "next/link";
import { Bookmark, LayoutDashboard, PlusCircle } from "lucide-react";

import { useAuth } from "@/components/providers";

/**
 * A compact signed-in strip on the public home page. It replaces the usual
 * "create an account" prompts with the shortcuts an existing account needs.
 */
export function SignedInHomeBanner() {
  const { user, hasPermission, isStaff } = useAuth();
  if (!user) return null;

  const firstName = user.name.split(" ")[0];
  const dashboardHref = isStaff
    ? "/admin"
    : hasPermission("property:create")
      ? "/dashboard/properties"
      : "/dashboard";

  const linkClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-teal-700 bg-teal-900 px-2.5 py-1.5 text-xs font-semibold text-teal-100 transition hover:border-teal-500 hover:text-white";

  return (
    <section className="border-b border-teal-700/60 bg-teal-950 text-ivory-50" aria-label="Your Findora shortcuts">
      <div className="container-page flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
        <p className="text-sm text-teal-100">
          Signed in as <span className="font-semibold text-white">{firstName}</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={dashboardHref} className={linkClass}>
            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
            Dashboard
          </Link>
          <Link href="/dashboard/favourites" className={linkClass}>
            <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
            Saved spaces
          </Link>
          {hasPermission("property:create") ? (
            <Link href="/dashboard/properties/new" className={linkClass}>
              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Add a listing
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
