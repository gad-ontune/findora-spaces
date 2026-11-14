import type { ReactNode } from "react";

import { cn, statusTone, titleize } from "@/lib/utils";

type Tone = "green" | "amber" | "red" | "slate" | "teal" | "sand" | "sage";

const tones: Record<Tone, string> = {
  green: "border-teal-200 bg-teal-50 text-teal-800",
  amber: "border-sand-300 bg-sand-100 text-amber-900",
  red: "border-terracotta-200 bg-terracotta-100 text-terracotta-800",
  slate: "border-ink-200 bg-ink-50 text-ink-600",
  teal: "border-teal-300 bg-teal-100 text-teal-900",
  sand: "border-sand-300 bg-sand-100 text-ink-700",
  sage: "border-sage-300 bg-sage-100 text-teal-900",
};

export function Badge({
  children,
  tone = "slate",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        tones[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <Badge tone={statusTone(status)} dot>
      {label ?? titleize(status)}
    </Badge>
  );
}
