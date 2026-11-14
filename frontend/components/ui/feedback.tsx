import type { ReactNode } from "react";
import { Loader2, SearchX } from "lucide-react";

import { cn } from "@/lib/utils";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-ink-500", className)} role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-ink-100", className)} aria-hidden="true" />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ivory-200 text-teal-700">
        {icon ?? <SearchX className="h-6 w-6" aria-hidden="true" />}
      </div>
      <h3 className="font-display text-lg font-semibold text-ink-800">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "We could not load this",
  description,
  retry,
}: {
  title?: string;
  description?: string;
  retry?: () => void;
}) {
  return (
    <div className="surface border-terracotta-200 px-6 py-10 text-center">
      <h3 className="font-display text-lg font-semibold text-ink-800">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-500">
        {description ?? "Check your connection and try again. No information is shown unless it comes from the platform."}
      </p>
      {retry ? (
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-xl border border-ink-900/15 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function InlineNote({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3 text-sm leading-6",
        tone === "info" && "border-teal-200 bg-teal-50 text-teal-900",
        tone === "warning" && "border-sand-300 bg-sand-100 text-ink-700",
        tone === "success" && "border-sage-300 bg-sage-100 text-teal-900",
      )}
    >
      {children}
    </div>
  );
}
