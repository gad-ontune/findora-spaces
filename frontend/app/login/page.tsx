import type { Metadata } from "next";

import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to manage saved spaces, viewings, enquiries and assisted property searches on Findora Spaces.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to Findora"
      description="Manage saved spaces, viewings, enquiries and assisted searches from one place."
      footer="Demo environment: all accounts, listings and verification records are fictional. Use the account shortcuts in the form."
    >
      <LoginForm next={next ?? null} />
    </AuthLayout>
  );
}
