"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";

import type { Media } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PropertyGallery({ media, title }: { media: Media[]; title: string }) {
  const images = media.filter((item) => item.kind === "image");
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  if (!images.length) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center rounded-2xl border border-ink-900/10 bg-gradient-to-br from-teal-100 via-ivory-200 to-sand-200">
        <p className="max-w-xs px-6 text-center text-sm text-teal-800/70">
          No photos have been approved for this listing yet. Ask the property team for a current viewing.
        </p>
      </div>
    );
  }

  const current = images[index];

  function move(direction: number) {
    setIndex((value) => (value + direction + images.length) % images.length);
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-ink-900/10 bg-ivory-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.caption ?? `${title} — illustrative image ${index + 1}`}
          className="aspect-[16/10] w-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-ink-900/60 to-transparent p-3">
          <p className="line-clamp-1 text-xs font-medium text-white/90">{current.caption ?? "Illustrative image"}</p>
          <span className="rounded-lg bg-ink-900/70 px-2 py-1 text-[11px] font-semibold text-white">
            {index + 1} / {images.length}
          </span>
        </div>
        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => move(-1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-ink-700 shadow-sm transition hover:bg-white"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-ink-700 shadow-sm transition hover:bg-white"
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-ink-700 shadow-sm transition hover:bg-white"
          aria-label="View photos full screen"
        >
          <Expand className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {images.length > 1 ? (
        <div className="mt-2 grid grid-cols-5 gap-2">
          {images.slice(0, 5).map((image, imageIndex) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setIndex(imageIndex)}
              className={cn(
                "overflow-hidden rounded-lg border-2 transition",
                imageIndex === index ? "border-teal-600" : "border-transparent opacity-75 hover:opacity-100",
              )}
              aria-label={`Show photo ${imageIndex + 1}`}
              aria-pressed={imageIndex === index}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt=""
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {expanded ? (
        <div className="fixed inset-0 z-[90] flex flex-col bg-ink-950/95 p-4">
          <div className="flex items-center justify-between text-white">
            <p className="text-sm font-medium">
              {index + 1} of {images.length}
            </p>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="rounded-full bg-white/10 p-2 transition hover:bg-white/20"
              aria-label="Close full screen photos"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.url}
              alt={current.caption ?? title}
              className="max-h-full max-w-full rounded-xl object-contain"
            />
            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => move(-1)}
                  className="absolute left-2 rounded-full bg-white/15 p-3 text-white transition hover:bg-white/25 sm:left-6"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(1)}
                  className="absolute right-2 rounded-full bg-white/15 p-3 text-white transition hover:bg-white/25 sm:right-6"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-6 w-6" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
