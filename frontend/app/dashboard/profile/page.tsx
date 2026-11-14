"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  KeyRound,
  Laptop,
  LogOut,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage, validationDetails } from "@/lib/api";
import type { NotificationPreferences, OptionsPayload, UserSession } from "@/lib/types";
import { formatDateTime, titleize } from "@/lib/utils";

export default function ProfilePage() {
  const { user, refresh, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    email: "",
    bio: "",
    whatsapp: "",
    preferred_contact: "phone",
    locale: "en",
    town_id: "",
    marketing_consent: false,
  });
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "" });
  const [changingPassword, setChangingPassword] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["location-options"],
    queryFn: () => api.get<OptionsPayload>("/locations/options"),
    staleTime: 5 * 60_000,
  });

  const sessionsQuery = useQuery({
    queryKey: ["user-sessions"],
    queryFn: () => api.get<{ sessions: UserSession[] }>("/users/me/sessions"),
  });

  const preferencesQuery = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => api.get<{ preferences: NotificationPreferences }>("/notification-preferences"),
  });

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name,
      email: user.email ?? "",
      bio: user.profile?.bio ?? "",
      whatsapp: user.profile?.whatsapp ?? "",
      preferred_contact: user.profile?.preferred_contact ?? "phone",
      locale: user.profile?.locale ?? "en",
      town_id: user.profile?.town_id ?? "",
      marketing_consent: user.profile?.marketing_consent ?? false,
    });
  }, [user]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch("/users/me", {
        name: form.name.trim(),
        email: form.email.trim() || null,
        bio: form.bio.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        preferred_contact: form.preferred_contact,
        locale: form.locale,
        town_id: form.town_id || null,
        marketing_consent: form.marketing_consent,
      });
      await refresh();
      toast({ title: "Profile updated", tone: "success" });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not update your profile",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setChangingPassword(true);
    try {
      await api.post("/users/me/change-password", passwordForm);
      setPasswordForm({ current_password: "", new_password: "" });
      toast({
        title: "Password changed",
        description: "Other sessions were signed out. Sign in again on your other devices.",
        tone: "success",
      });
      await sessionsQuery.refetch();
    } catch (error) {
      toast({ title: "Could not change the password", description: errorMessage(error), tone: "error" });
    } finally {
      setChangingPassword(false);
    }
  }

  async function revoke(session: UserSession) {
    setRevoking(session.id);
    try {
      await api.delete(`/users/me/sessions/${session.id}`);
      await sessionsQuery.refetch();
      if (session.current) {
        await logout();
      } else {
        toast({ title: "Session revoked", tone: "success" });
      }
    } catch (error) {
      toast({ title: "Could not revoke the session", description: errorMessage(error), tone: "error" });
    } finally {
      setRevoking(null);
    }
  }

  if (!user) {
    return <Skeleton className="h-96 w-full" />;
  }

  const preferences = preferencesQuery.data?.preferences;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Profile and security"
        description="Keep your contact details current, review active sessions and control optional notifications. Your full phone number is never shown publicly."
        actions={
          <Badge tone={user.phone_verified ? "green" : "amber"}>
            <BadgeCheck className="h-3 w-3" aria-hidden="true" />
            {user.phone_verified ? "Phone verified" : "Phone not verified"}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <div className="space-y-6">
          <section className="surface p-5 sm:p-6" aria-labelledby="profile-heading">
            <h2 id="profile-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
              <UserRound className="h-5 w-5 text-teal-600" aria-hidden="true" />
              Your details
            </h2>
            <form onSubmit={save} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="profile-name" required>
                  <Input
                    id="profile-name"
                    required
                    minLength={2}
                    maxLength={160}
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </Field>
                <Field label="Phone number" htmlFor="profile-phone" hint="Contact support to change your verified phone.">
                  <Input id="profile-phone" value={user.phone} readOnly disabled />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="profile-email">
                  <Input
                    id="profile-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="you@example.com"
                  />
                </Field>
                <Field label="WhatsApp number" htmlFor="profile-whatsapp">
                  <Input
                    id="profile-whatsapp"
                    type="tel"
                    value={form.whatsapp}
                    onChange={(event) => setForm({ ...form, whatsapp: event.target.value })}
                    placeholder="+254 7XX XXX XXX"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Preferred contact" htmlFor="profile-contact">
                  <Select
                    id="profile-contact"
                    value={form.preferred_contact}
                    onChange={(event) => setForm({ ...form, preferred_contact: event.target.value })}
                  >
                    <option value="phone">Phone call</option>
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                  </Select>
                </Field>
                <Field label="Home town" htmlFor="profile-town" hint="Used to prioritise local results and assistance.">
                  <Select
                    id="profile-town"
                    value={form.town_id}
                    onChange={(event) => setForm({ ...form, town_id: event.target.value })}
                  >
                    <option value="">Not set</option>
                    {(optionsQuery.data?.towns ?? []).map((town) => (
                      <option key={town.id} value={town.id}>
                        {town.name}
                        {town.county ? ` (${town.county})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="About you (optional)" htmlFor="profile-bio" hint="Tell property teams what you are looking for. Do not include sensitive financial details.">
                <Textarea
                  id="profile-bio"
                  value={form.bio}
                  onChange={(event) => setForm({ ...form, bio: event.target.value })}
                  maxLength={1000}
                  className="min-h-24"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Language" htmlFor="profile-locale">
                  <Select
                    id="profile-locale"
                    value={form.locale}
                    onChange={(event) => setForm({ ...form, locale: event.target.value })}
                  >
                    <option value="en">English</option>
                    <option value="sw">Kiswahili</option>
                  </Select>
                </Field>
                <div className="flex items-end">
                  <Checkbox
                    label="Send optional product and market updates"
                    description="You can change this at any time."
                    checked={form.marketing_consent}
                    onChange={(event) => setForm({ ...form, marketing_consent: event.target.checked })}
                  />
                </div>
              </div>

              <Button type="submit" loading={saving}>
                <Save className="h-4 w-4" aria-hidden="true" />
                Save profile
              </Button>
            </form>
          </section>

          <section className="surface p-5 sm:p-6" aria-labelledby="password-heading">
            <h2 id="password-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
              <KeyRound className="h-5 w-5 text-teal-600" aria-hidden="true" />
              Change password
            </h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">
              Changing your password signs out other devices. Use a password you do not reuse elsewhere.
            </p>
            <form onSubmit={changePassword} className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Current password" htmlFor="current-password" required>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={passwordForm.current_password}
                  onChange={(event) => setPasswordForm({ ...passwordForm, current_password: event.target.value })}
                />
              </Field>
              <Field label="New password" htmlFor="new-password" required hint="At least 8 characters.">
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={passwordForm.new_password}
                  onChange={(event) => setPasswordForm({ ...passwordForm, new_password: event.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Button
                  type="submit"
                  variant="outline"
                  loading={changingPassword}
                  disabled={!passwordForm.current_password || passwordForm.new_password.length < 8}
                >
                  Update password
                </Button>
              </div>
            </form>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="surface p-5" aria-labelledby="account-heading">
            <h2 id="account-heading" className="font-display text-base font-bold text-ink-900">
              Account
            </h2>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-400">Roles</dt>
                <dd className="text-right font-medium text-ink-800">
                  {user.roles.length ? user.roles.map((role) => titleize(role)).join(", ") : "Member"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-400">Member since</dt>
                <dd className="font-medium text-ink-800">{formatDateTime(user.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-400">Status</dt>
                <dd className="font-medium text-ink-800">{titleize(user.status)}</dd>
              </div>
            </dl>
            <Link
              href="/dashboard/notifications"
              className="mt-4 inline-flex text-xs font-semibold text-teal-700 hover:underline"
            >
              Notification preferences
              {preferences ? ` · ${preferences.in_app ? "in-app on" : "in-app off"}` : ""}
            </Link>
          </section>

          <section className="surface p-5" aria-labelledby="sessions-heading">
            <h2 id="sessions-heading" className="flex items-center gap-2 font-display text-base font-bold text-ink-900">
              <Laptop className="h-4 w-4 text-teal-600" aria-hidden="true" />
              Active sessions
            </h2>
            {sessionsQuery.isError ? (
              <ErrorState title="Sessions could not load" retry={() => sessionsQuery.refetch()} />
            ) : sessionsQuery.isLoading ? (
              <Skeleton className="mt-3 h-24 w-full" />
            ) : sessionsQuery.data?.sessions.length ? (
              <ul className="mt-3 space-y-2">
                {sessionsQuery.data.sessions.map((session) => (
                  <li key={session.id} className="rounded-xl border border-ink-900/10 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink-800">
                          {session.current ? "This device" : "Other device"}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-400">
                          {session.user_agent ?? "Unknown browser"} · {session.ip_address ?? "IP hidden"}
                        </p>
                        <p className="text-[11px] text-ink-400">Last used {formatDateTime(session.last_used_at)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-terracotta-700 hover:bg-terracotta-100"
                        onClick={() => revoke(session)}
                        loading={revoking === session.id}
                      >
                        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                        Revoke
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-500">No active sessions were found.</p>
            )}
          </section>

          <InlineNote>
            <ShieldCheck className="mr-1 inline h-4 w-4" aria-hidden="true" />
            Findora uses your details to provide discovery, enquiries, viewings and assisted search. We do not sell your
            personal data. Read the{" "}
            <Link href="/trust#privacy" className="font-semibold underline">
              privacy summary
            </Link>
            .
          </InlineNote>
        </aside>
      </div>
    </div>
  );
}
