import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {eyebrow ? (
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-teal-600">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  hrefLabel = "View all",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {eyebrow ? (
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-teal-600">{eyebrow}</p>
        ) : null}
        <h2 className="font-display text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{title}</h2>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-500">{description}</p> : null}
      </div>
      {href ? (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline">
          {hrefLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "ivory",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "ivory" | "teal" | "sand" | "sage";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-5",
        tone === "ivory" && "border-ink-900/10 bg-white",
        tone === "teal" && "border-teal-800 bg-teal-800 text-ivory-50",
        tone === "sand" && "border-sand-300 bg-sand-100",
        tone === "sage" && "border-sage-300 bg-sage-100",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-xs font-semibold uppercase tracking-wide", tone === "teal" ? "text-teal-100" : "text-ink-500")}>
          {label}
        </p>
        {icon ? <span className={tone === "teal" ? "text-teal-200" : "text-teal-600"}>{icon}</span> : null}
      </div>
      <p className={cn("mt-2 font-display text-2xl font-bold tracking-tight", tone === "teal" ? "text-white" : "text-ink-900")}>
        {value}
      </p>
      {hint ? (
        <p className={cn("mt-1 text-xs leading-5", tone === "teal" ? "text-teal-100/80" : "text-ink-400")}>{hint}</p>
      ) : null}
    </div>
  );
}
