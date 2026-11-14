"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

export function HeroSearch({ townNames }: { townNames: string[] }) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [maxRent, setMaxRent] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (q.trim()) params.set("q", q.trim());
    if (maxRent) params.set("max_rent", maxRent);
    router.push(`/properties${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="rounded-2xl border border-white/20 bg-white/95 p-3 shadow-lift backdrop-blur sm:p-4">
      <div className="mb-2 flex gap-1" role="tablist" aria-label="Property category">
        {[
          { value: "", label: "All spaces" },
          { value: "residential", label: "Homes" },
          { value: "commercial", label: "Business" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={category === option.value}
            onClick={() => setCategory(option.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm",
              category === option.value
                ? "bg-teal-700 text-white"
                : "text-ink-500 hover:bg-ink-900/5 hover:text-ink-800",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            aria-hidden="true"
          />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Town, neighbourhood or landmark"
            aria-label="Search by town, neighbourhood or landmark"
            className="pl-9"
            list="home-town-suggestions"
          />
          <datalist id="home-town-suggestions">
            {townNames.map((town) => (
              <option key={town} value={town} />
            ))}
          </datalist>
        </div>
        <Select
          value={maxRent}
          onChange={(event) => setMaxRent(event.target.value)}
          aria-label="Maximum monthly rent"
          className="sm:w-44"
        >
          <option value="">Any budget</option>
          <option value="5000">Up to KES 5,000</option>
          <option value="10000">Up to KES 10,000</option>
          <option value="15000">Up to KES 15,000</option>
          <option value="25000">Up to KES 25,000</option>
          <option value="50000">Up to KES 50,000</option>
          <option value="100000">Up to KES 100,000</option>
        </Select>
        <Button type="submit" size="md" className="sm:w-auto">
          Search
        </Button>
      </form>
      <p className="mt-2 px-1 text-[12px] leading-5 text-ink-400">
        Only approved listings with availability confirmed in the last 14 days appear in results.
      </p>
    </div>
  );
}
