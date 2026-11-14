import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={cn("h-9 w-9", className)}
    >
      <rect width="40" height="40" rx="12" fill="#0E403B" />
      <path d="M10.5 21.2 20 12l9.5 9.2" stroke="#F9F5EC" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 20.5v8.2h13v-8.2" stroke="#A9BFA5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.6 28.7v-5.1h4.8v5.1" stroke="#F9F5EC" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="27.8" cy="13.2" r="3.2" fill="#C26A4A" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5", className)} aria-label="Findora Spaces home">
      <LogoMark />
      <span className="leading-none">
        <span className={cn("block font-display text-lg font-extrabold tracking-tight", light ? "text-ivory-50" : "text-ink-900")}>
          Findora
        </span>
        <span className={cn("mt-0.5 block text-[11px] font-semibold uppercase tracking-[0.22em]", light ? "text-sage-300" : "text-teal-600")}>
          Spaces
        </span>
      </span>
    </Link>
  );
}
