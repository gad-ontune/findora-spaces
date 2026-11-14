"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Star, Trash2, Upload } from "lucide-react";

import { useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InlineNote } from "@/components/ui/feedback";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import type { Media } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MediaManager({ propertyId, media }: { propertyId: string; media: Media[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  function chooseFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length > 12) {
      toast({ title: "Upload up to 12 files at a time", tone: "error" });
      return;
    }
    setFiles(selected);
  }

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!files.length) {
      toast({ title: "Choose at least one photo or video", tone: "error" });
      return;
    }
    if (!consent) {
      toast({
        title: "Confirm photo permission",
        description: "You must have permission from the owner or authorised representative to publish these files.",
        tone: "error",
      });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      if (caption.trim()) form.append("caption", caption.trim());
      form.append("confirm_photo_consent", "true");
      await api.upload(`/properties/${propertyId}/media`, form);
      await queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
      await queryClient.invalidateQueries({ queryKey: ["my-properties"] });
      setFiles([]);
      setCaption("");
      setConsent(false);
      if (inputRef.current) inputRef.current.value = "";
      toast({
        title: "Media uploaded",
        description: "The first image becomes the primary photo when the listing has none.",
        tone: "success",
      });
    } catch (error) {
      toast({ title: "Could not upload the media", description: errorMessage(error), tone: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function remove(item: Media) {
    if (!window.confirm("Delete this media from the listing? This cannot be undone.")) return;
    setDeleting(item.id);
    try {
      await api.delete(`/properties/${propertyId}/media/${item.id}`);
      await queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
      await queryClient.invalidateQueries({ queryKey: ["my-properties"] });
      toast({ title: "Media removed", tone: "success" });
    } catch (error) {
      toast({ title: "Could not remove the media", description: errorMessage(error), tone: "error" });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      {media.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-xl border border-ink-900/10 bg-white">
              <div className="relative aspect-[4/3] bg-ivory-200">
                {item.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.caption ?? "Property media"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs font-semibold text-ink-400">
                    Video
                  </div>
                )}
                {item.is_primary ? (
                  <Badge tone="teal" className="absolute left-2 top-2">
                    <Star className="h-3 w-3" aria-hidden="true" />
                    Primary
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2 p-2.5">
                <p className="min-w-0 flex-1 truncate text-xs text-ink-500">{item.caption ?? "No caption"}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-terracotta-700 hover:bg-terracotta-100"
                  onClick={() => remove(item)}
                  loading={deleting === item.id}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">Delete media</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-ink-900/15 bg-ivory-50 px-5 py-8 text-center">
          <ImagePlus className="h-7 w-7 text-ink-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-ink-700">No photos yet</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-ink-500">
            Listings with real, current photos are easier to trust. Upload images of the actual property only.
          </p>
        </div>
      )}

      <form onSubmit={upload} className="rounded-xl border border-ink-900/10 bg-ivory-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
              <Upload className="h-4 w-4 text-teal-600" aria-hidden="true" />
              Add photos or video
            </p>
            <p className="mt-0.5 text-xs leading-5 text-ink-500">
              JPG, PNG, WebP, AVIF, MP4, WebM or MOV · up to 12 files, 25 MB each.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink-900/15 bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 transition hover:border-teal-600/40 hover:bg-teal-50">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            Choose files
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime"
              onChange={chooseFiles}
              className="sr-only"
            />
          </label>
        </div>

        {files.length ? (
          <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-ink-600" aria-live="polite">
            {files.length} file{files.length === 1 ? "" : "s"} selected: {files.map((file) => file.name).join(", ")}
          </p>
        ) : null}

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Caption (optional)" htmlFor="media-caption">
            <Input
              id="media-caption"
              maxLength={255}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="e.g. Sitting room and front entrance"
            />
          </Field>
          <Button type="submit" loading={uploading} disabled={!files.length}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload
          </Button>
        </div>

        <div className="mt-3">
          <Checkbox
            label="I have permission to publish these photos"
            description="They are of this real property, and I have the owner or representative's permission to use them."
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className={cn(consent && "border-teal-600 bg-teal-50")}
          />
        </div>
      </form>

      <InlineNote tone="warning">
        Do not upload photos of a different property, stock images presented as the real space, or images showing people
        without their consent. Misleading photos can lead to suspension.
      </InlineNote>
    </div>
  );
}
