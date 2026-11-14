"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

export function ShortlistCommentForm({ token }: { token: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [authorName, setAuthorName] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await api.post(`/shortlists/shared/${token}/comments`, {
        body,
        author_name: user ? null : authorName || null,
      });
      setBody("");
      toast({ title: "Comment added", tone: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: "Could not add comment", description: errorMessage(error), tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-ink-900/10 bg-white p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
        <MessageSquarePlus className="h-4 w-4 text-teal-600" aria-hidden="true" />
        Add a note for the group
      </h2>
      <p className="mt-1 text-xs leading-5 text-ink-500">
        Comments are visible to anyone with this private link. Do not share bank details, passwords or sensitive
        personal information.
      </p>
      <div className="mt-3 space-y-3">
        {!user ? (
          <Field label="Your name" htmlFor="shortlist-author">
            <Input
              id="shortlist-author"
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
              placeholder="e.g. Family member"
              maxLength={120}
            />
          </Field>
        ) : null}
        <Field label="Comment" htmlFor="shortlist-comment" required>
          <Textarea
            id="shortlist-comment"
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="e.g. I like the second one, but we should confirm water before viewing."
            maxLength={2000}
          />
        </Field>
        <Button type="submit" loading={loading} disabled={!body.trim()}>
          Post comment
        </Button>
      </div>
    </form>
  );
}
