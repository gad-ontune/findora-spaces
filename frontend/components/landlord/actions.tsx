"use client";

import { ArrowRight, Sparkles } from "lucide-react";

import { useAuth } from "@/components/providers";
import { LinkButton } from "@/components/ui/button";

function workspaceHref(hasPermission: (code: string) => boolean, isStaff: boolean) {
  if (isStaff) return "/admin";
  return hasPermission("property:create") ? "/dashboard/properties" : "/dashboard";
}

export function LandlordHeaderActions() {
  const { user, hasPermission, isStaff } = useAuth();

  if (!user) {
    return (
      <>
        <LinkButton href="/register?type=landlord">
          Create a landlord account
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </LinkButton>
        <LinkButton href="/login" variant="outline">
          Sign in
        </LinkButton>
      </>
    );
  }

  const canList = hasPermission("property:create");

  return (
    <>
      <LinkButton href={workspaceHref(hasPermission, isStaff)}>
        Go to your workspace
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </LinkButton>
      {canList ? (
        <LinkButton href="/dashboard/subscription" variant="outline">
          Review your plan
        </LinkButton>
      ) : null}
    </>
  );
}

export function LandlordPlanAction({ highlighted }: { highlighted: boolean }) {
  const { user, hasPermission } = useAuth();
  const canList = hasPermission("property:create");

  return (
    <LinkButton
      href={user ? (canList ? "/dashboard/subscription" : "/dashboard") : "/register?type=landlord"}
      variant={highlighted ? "primary" : "outline"}
      className="mt-4 w-full"
    >
      {user ? (canList ? "Review this plan" : "Go to dashboard") : "Get started"}
    </LinkButton>
  );
}

export function LandlordFinalCta() {
  const { user, hasPermission, isStaff } = useAuth();
  const canList = hasPermission("property:create");

  return (
    <div className="rounded-3xl bg-teal-800 p-6 text-ivory-50 sm:p-8">
      <Sparkles className="h-6 w-6 text-sage-300" aria-hidden="true" />
      <h2 className="mt-3 font-display text-2xl font-bold">
        {user ? "Keep your listings working for you" : "Ready to list honestly?"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-teal-100/80">
        {user
          ? "Add another property, reconfirm availability and manage enquiries from your workspace. Your plan and remaining listing capacity are shown before you add anything."
          : "Create an account, verify your phone and add your first property. You stay in control of availability and enquiries, and every material change is recorded."}
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <LinkButton
          href={
            user
              ? canList
                ? "/dashboard/properties/new"
                : workspaceHref(hasPermission, isStaff)
              : "/register?type=landlord"
          }
          variant="secondary"
        >
          {user ? (canList ? "Add a property" : "Go to your dashboard") : "Create a landlord account"}
        </LinkButton>
        <LinkButton
          href={user && canList ? "/dashboard/subscription" : "/trust"}
          variant="outline"
          className="border-teal-500 bg-transparent text-ivory-50 hover:bg-teal-700 hover:text-white"
        >
          {user && canList ? "Review your plan" : "Read the trust guide"}
        </LinkButton>
      </div>
      <p className="mt-4 text-xs text-teal-100/60">
        Demo environment: all properties and accounts are fictional sample data.
      </p>
    </div>
  );
}
