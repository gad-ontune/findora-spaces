import type { Metadata } from "next";

import { AuthLayout } from "@/components/auth/auth-layout";
import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Create an account",
  description:
    "Create a Findora Spaces account to save properties, request viewings, track assisted searches or list a property.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; type?: string }>;
}) {
  const { next, type } = await searchParams;
  return (
    <AuthLayout
      eyebrow="Create account"
      title="Join Findora Spaces"
      description="Browse freely without an account. Create one when you want to save spaces, request viewings, track an assisted search or list a property."
      footer="We verify phone numbers to protect accounts and enable property teams to respond. You can browse publicly without registering."
    >
      <RegisterForm next={next ?? null} initialType={type} />
    </AuthLayout>
  );
}
