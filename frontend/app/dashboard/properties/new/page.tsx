"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { useAuth } from "@/components/providers";
import { PropertyForm } from "@/components/dashboard/property-form";
import { InlineNote, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { LinkButton } from "@/components/ui/button";

export default function NewPropertyPage() {
  const { user, loading, hasPermission } = useAuth();

  if (loading || !user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!hasPermission("property:create")) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Property tools"
          title="Listing access required"
          description="Your account does not currently have permission to submit property listings."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              If you are a landlord or property manager, make sure you registered the correct account type. You can{" "}
              <Link href="/dashboard/profile" className="font-semibold underline">
                review your profile
              </Link>{" "}
              or contact support for help.
            </span>
          </span>
        </InlineNote>
        <LinkButton href="/dashboard" variant="outline">
          Back to dashboard
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Property tools"
        title="Add a property"
        description="Submit a real property you own or are authorised to list. The listing stays private until moderation approves it and its availability is freshly confirmed."
      />

      {!user.phone_verified ? (
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Verify your phone number before submitting a property.{" "}
              <Link href="/verify" className="font-semibold underline">
                Verify now
              </Link>
              .
            </span>
          </span>
        </InlineNote>
      ) : null}

      <InlineNote>
        All seeded listings in this demo environment are fictional. When you add your own listing, enter only accurate
        information about a real property you are authorised to advertise.
      </InlineNote>

      <PropertyForm mode="create" />
    </div>
  );
}
