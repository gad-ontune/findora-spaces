import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, MapPin, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/brand";

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="container-page py-10 sm:py-14">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-ink-900/10 bg-white shadow-lift lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative hidden overflow-hidden bg-teal-900 p-8 text-ivory-50 lg:flex lg:flex-col lg:justify-between">
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 15%, rgba(169,191,165,0.4), transparent 35%), radial-gradient(circle at 85% 80%, rgba(194,106,74,0.3), transparent 40%)",
            }}
            aria-hidden="true"
          />
          <div className="relative">
            <Logo light />
            <p className="mt-10 max-w-xs text-balance font-display text-2xl font-bold leading-snug">
              Honest availability. Visible verification. Local help when you need it.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-teal-100/85">
              {[
                "Only approved listings with fresh availability appear publicly.",
                "The Property Passport shows what was checked and when.",
                "A local team can search and inspect on your behalf.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage-300" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mt-10 space-y-2 text-xs text-teal-100/70">
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              Launching in Kehancha, Migori County
            </p>
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Built for every county in Kenya
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">{eyebrow}</p>
          <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-ink-500">{description}</p>
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-5 border-t border-ink-900/10 pt-4 text-xs leading-5 text-ink-400">{footer}</div> : null}
        </div>
      </div>

      <p className="mx-auto mt-5 max-w-5xl text-center text-xs text-ink-400">
        By continuing you agree to use Findora honestly.{" "}
        <Link href="/trust#privacy" className="font-semibold text-teal-700 hover:underline">
          Privacy and data
        </Link>{" "}
        ·{" "}
        <Link href="/trust#safety" className="font-semibold text-teal-700 hover:underline">
          Safety guidance
        </Link>
      </p>
    </div>
  );
}
