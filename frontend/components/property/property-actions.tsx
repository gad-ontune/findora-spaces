"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, Share2 } from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import type { PropertySummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FavouriteButton({
  propertyId,
  initialFavouriteId,
  variant = "outline",
}: {
  propertyId: string;
  initialFavouriteId?: string | null;
  variant?: "outline" | "icon";
}) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [favouriteId, setFavouriteId] = useState(initialFavouriteId ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || initialFavouriteId) return;
    let cancelled = false;
    api
      .get<{ properties: PropertySummary[] }>("/favourites")
      .then((payload) => {
        if (cancelled) return;
        const saved = payload.properties.find((item) => item.id === propertyId);
        setFavouriteId(saved?.favourite_id ?? null);
      })
      .catch(() => {
        // The button remains usable; a failed lookup simply shows the unsaved state.
      });
    return () => {
      cancelled = true;
    };
  }, [user, propertyId, initialFavouriteId]);

  async function toggle() {
    if (!user) {
      router.push(`/login?next=/properties/${propertyId}`);
      return;
    }
    setLoading(true);
    try {
      if (favouriteId) {
        await api.delete(`/favourites/${favouriteId}`);
        setFavouriteId(null);
        toast({ title: "Removed from saved spaces", tone: "info" });
      } else {
        const response = await api.post<{ favourite_id: string }>("/favourites", {
          property_id: propertyId,
        });
        setFavouriteId(response.favourite_id);
        toast({ title: "Saved to your spaces", tone: "success" });
      }
      await queryClient.invalidateQueries({ queryKey: ["favourites"] });
      await queryClient.invalidateQueries({ queryKey: ["seeker-overview"] });
    } catch (error) {
      toast({ title: "Could not update saved space", description: errorMessage(error), tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full border border-ink-900/10 bg-white shadow-sm transition hover:border-terracotta-300",
          favouriteId ? "text-terracotta-600" : "text-ink-500",
        )}
        aria-label={favouriteId ? "Remove from saved spaces" : "Save this space"}
        aria-pressed={Boolean(favouriteId)}
      >
        <Heart className={cn("h-5 w-5", favouriteId && "fill-current")} aria-hidden="true" />
      </button>
    );
  }

  return (
    <Button variant="outline" onClick={toggle} loading={loading} className="flex-1 sm:flex-none">
      <Heart className={cn("h-4 w-4", favouriteId && "fill-terracotta-500 text-terracotta-500")} aria-hidden="true" />
      {favouriteId ? "Saved" : "Save"}
    </Button>
  );
}

export function ShareButton({ title }: { title: string }) {
  const { toast } = useToast();

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Share it with someone you trust.", tone: "success" });
    } catch {
      toast({ title: "Could not share", description: "Copy the address from your browser instead.", tone: "error" });
    }
  }

  return (
    <Button variant="outline" onClick={share} aria-label="Share this listing">
      <Share2 className="h-4 w-4" aria-hidden="true" />
      Share
    </Button>
  );
}
