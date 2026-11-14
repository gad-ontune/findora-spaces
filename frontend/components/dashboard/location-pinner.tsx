"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  LocateFixed,
  MapPin,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineNote } from "@/components/ui/feedback";

type Precision = "exact" | "approximate" | "neighbourhood";

function formatAccuracy(accuracy: number): string {
  if (accuracy < 1000) return `${Math.round(accuracy)} m`;
  return `${(accuracy / 1000).toFixed(1)} km`;
}

function geolocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === 1) {
    return "Location permission was denied. Allow location access for this site in your browser settings, then try again.";
  }
  if (error.code === 2) {
    return "Your device could not determine a location. Move outdoors, check that GPS/location services are on, and try again.";
  }
  if (error.code === 3) {
    return "Getting your location took too long. Move outdoors, wait a moment, and try again.";
  }
  return "We could not read your current location. Please try again.";
}

export function LocationPinner({
  latitude,
  longitude,
  precision,
  onCapture,
  onClear,
}: {
  latitude: string;
  longitude: string;
  precision: Precision;
  onCapture: (latitude: number, longitude: number) => void;
  onClear: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lowAccuracy, setLowAccuracy] = useState(false);

  const parsedLatitude = latitude.trim() === "" ? null : Number(latitude);
  const parsedLongitude = longitude.trim() === "" ? null : Number(longitude);
  const displayCoordinates =
    parsedLatitude !== null &&
    parsedLongitude !== null &&
    Number.isFinite(parsedLatitude) &&
    Number.isFinite(parsedLongitude)
      ? `${parsedLatitude.toFixed(6)}, ${parsedLongitude.toFixed(6)}`
      : null;
  const hasPin = displayCoordinates !== null;

  useEffect(() => {
    if (!hasPin) {
      setStatus("idle");
      setMessage(null);
      setAccuracy(null);
      setLowAccuracy(false);
    }
  }, [hasPin]);

  function capture() {
    if (!window.isSecureContext) {
      setStatus("error");
      setMessage(
        "Location needs a secure connection. Open Findora over HTTPS (or localhost during development), then try again.",
      );
      return;
    }
    if (!navigator.geolocation) {
      setStatus("error");
      setMessage("This browser or device does not support location. Try a phone with GPS and a modern browser.");
      return;
    }

    setStatus("locating");
    setMessage(null);
    setAccuracy(null);
    setLowAccuracy(false);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: capturedLatitude, longitude: capturedLongitude, accuracy: capturedAccuracy } =
          position.coords;
        onCapture(capturedLatitude, capturedLongitude);
        setAccuracy(capturedAccuracy);
        setLowAccuracy(capturedAccuracy > 100);
        setStatus("success");
        setMessage(
          capturedAccuracy > 100
            ? "Location captured, but the accuracy is low. Move outdoors, wait a few seconds, and press the button again for a tighter pin."
            : "Location captured. Check the coordinates below, then save the listing.",
        );
      },
      (error) => {
        setStatus("error");
        setMessage(geolocationErrorMessage(error));
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  function clear() {
    onClear();
    setStatus("idle");
    setMessage(null);
    setAccuracy(null);
    setLowAccuracy(false);
  }

  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-700 text-ivory-50">
          <Crosshair className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-display text-base font-bold text-ink-900">Pin the exact spot</h3>
          <p className="mt-1 text-sm leading-6 text-ink-600">
            Stand at the exact house or gate. Turn on your phone&apos;s location, then press the button.
          </p>
        </div>
      </div>

      <ol className="mt-3 space-y-1.5 text-sm leading-6 text-ink-600">
        <li className="flex gap-2">
          <span className="font-semibold text-teal-800">1.</span>
          <span>Stand at the exact house, gate or plot entrance.</span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-teal-800">2.</span>
          <span>Make sure phone location or GPS is switched on.</span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-teal-800">3.</span>
          <span>Press &ldquo;Use my exact current location&rdquo; below.</span>
        </li>
      </ol>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          onClick={capture}
          loading={status === "locating"}
          icon={<LocateFixed className="h-4 w-4" aria-hidden="true" />}
        >
          {hasPin ? "Update my exact current location" : "Use my exact current location"}
        </Button>
        {hasPin ? (
          <Button type="button" variant="ghost" onClick={clear}>
            Clear pin
          </Button>
        ) : null}
      </div>

      <div aria-live="polite" className="mt-3 space-y-2">
        {displayCoordinates ? (
          <div className="rounded-xl border border-sage-300 bg-white p-3">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Location pinned
            </p>
            <p className="mt-1 flex items-center gap-1.5 font-mono text-sm text-ink-800">
              <MapPin className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
              {displayCoordinates}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              {accuracy !== null
                ? `Phone accuracy: about ${formatAccuracy(accuracy)}.`
                : "Accuracy was not recorded for this saved pin."}
            </p>
          </div>
        ) : (
          <p className="text-xs text-ink-500">
            No pin yet. Findora only records coordinates when you press the button.
          </p>
        )}

        {message ? (
          <InlineNote tone={status === "error" || lowAccuracy ? "warning" : "success"}>
            <span className="flex items-start gap-2">
              {status === "error" || lowAccuracy ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>{message}</span>
            </span>
          </InlineNote>
        ) : null}
      </div>

      <div className="mt-3">
        <InlineNote tone={precision === "exact" ? "warning" : "info"}>
          <span className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {precision === "exact"
                ? "Map precision is set to Exact. A captured pin will be visible on the public listing."
                : "Map precision is not Exact. Captured coordinates are stored privately for the owner and Findora operations, while the public map stays approximate."}
            </span>
          </span>
        </InlineNote>
      </div>
    </div>
  );
}
