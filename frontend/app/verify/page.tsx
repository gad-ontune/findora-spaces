import type { Metadata } from "next";

import { AuthLayout } from "@/components/auth/auth-layout";
import { VerifyForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = {
  title: "Verify your phone",
  description: "Enter the one-time code sent to your phone to finish setting up your Findora Spaces account.",
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; next?: string }>;
}) {
  const { phone, next } = await searchParams;
  return (
    <AuthLayout
      eyebrow="One more step"
      title="Verify your phone number"
      description="Enter the one-time code sent by SMS. Verification protects your account and confirms how property teams can reach you."
      footer="If you did not receive a code, check the number and resend after the cooldown. Codes expire quickly for your security."
    >
      <VerifyForm phone={phone ?? ""} next={next ?? null} />
    </AuthLayout>
  );
}
