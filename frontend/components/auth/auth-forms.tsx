"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Phone, ShieldCheck, Smartphone, UserRound } from "lucide-react";

import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { InlineNote } from "@/components/ui/feedback";
import { ApiError, errorMessage, validationDetails } from "@/lib/api";
import { dashboardForUser, safeNextPath } from "@/lib/auth-routing";
import { cn } from "@/lib/utils";

const DEMO_ACCOUNTS = [
  { label: "Super admin", phone: "+254700000001", password: "Admin123!" },
  { label: "Landlord", phone: "+254700000002", password: "Landlord123!" },
  { label: "Seeker", phone: "+254700000005", password: "Seeker123!" },
  { label: "Finding partner", phone: "+254700000006", password: "Partner123!" },
];

function FormErrors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="rounded-xl border border-terracotta-200 bg-terracotta-100 px-3.5 py-3 text-sm text-terracotta-800" role="alert">
      <ul className="list-inside list-disc space-y-1">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

function useAuthErrors() {
  const [errors, setErrors] = useState<string[]>([]);
  function capture(error: unknown) {
    const details = validationDetails(error);
    setErrors(details.length ? details : [errorMessage(error)]);
  }
  return { errors, setErrors, capture };
}

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const { errors, setErrors, capture } = useAuthErrors();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [unverified, setUnverified] = useState(false);

  const destination = safeNextPath(next);

  useEffect(() => {
    if (!loading && user) {
      router.replace(destination ?? dashboardForUser(user));
    }
  }, [loading, user, destination, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setUnverified(false);
    try {
      const signedIn = await login(phone, password);
      router.replace(destination ?? dashboardForUser(signedIn));
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === "phone_not_verified") setUnverified(true);
      capture(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Phone number" htmlFor="login-phone" required hint="Use the Kenyan number on your Findora account.">
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <Input
            id="login-phone"
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+254 7XX XXX XXX"
            className="pl-9"
          />
        </div>
      </Field>

      <Field label="Password" htmlFor="login-password" required>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <Input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Your password"
            className="pl-9 pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>

      <FormErrors errors={errors} />

      {unverified ? (
        <InlineNote tone="warning">
          Your phone number is not verified yet.{" "}
          <Link href={`/verify?phone=${encodeURIComponent(phone)}`} className="font-semibold underline">
            Enter the verification code
          </Link>
          .
        </InlineNote>
      ) : null}

      <Button type="submit" className="w-full" loading={submitting}>
        Sign in
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>

      <p className="text-center text-sm text-ink-500">
        New to Findora?{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-semibold text-teal-700 hover:underline">
          Create an account
        </Link>
      </p>

      <div className="rounded-xl border border-ink-900/10 bg-ivory-100 p-3.5">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Demo environment</p>
        <p className="mt-1 text-xs leading-5 text-ink-500">
          This is fictional demo data. Choose an account to fill the form.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.phone}
              type="button"
              onClick={() => {
                setPhone(account.phone);
                setPassword(account.password);
              }}
              className="rounded-lg border border-ink-900/10 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink-600 transition hover:border-teal-600/40 hover:text-teal-700"
            >
              {account.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

export function RegisterForm({ next, initialType }: { next: string | null; initialType?: string }) {
  const router = useRouter();
  const { register } = useAuth();
  const { errors, setErrors, capture } = useAuthErrors();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    account_type:
      initialType === "landlord" || initialType === "property_manager"
        ? initialType
        : ("property_seeker" as "property_seeker" | "landlord" | "property_manager"),
    consent: false,
    marketing_consent: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    try {
      const payload = await register({
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        password: form.password,
        account_type: form.account_type,
        consent: form.consent,
        marketing_consent: form.marketing_consent,
      });
      if (payload.otp_debug) {
        window.sessionStorage.setItem("findora_otp_hint", payload.otp_debug);
      }
      const params = new URLSearchParams({ phone: form.phone });
      if (next) params.set("next", next);
      router.push(`/verify?${params.toString()}`);
    } catch (error) {
      capture(error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Full name" htmlFor="register-name" required>
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <Input
            id="register-name"
            autoComplete="name"
            required
            minLength={2}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="e.g. Amina Odhiambo"
            className="pl-9"
          />
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone number" htmlFor="register-phone" required hint="We send a one-time code to verify it.">
          <Input
            id="register-phone"
            type="tel"
            autoComplete="tel"
            required
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            placeholder="+254 7XX XXX XXX"
          />
        </Field>
        <Field label="Email (optional)" htmlFor="register-email">
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="you@example.com"
          />
        </Field>
      </div>

      <Field label="I am a…" htmlFor="register-type" required>
        <Select
          id="register-type"
          value={form.account_type}
          onChange={(event) =>
            setForm({
              ...form,
              account_type: event.target.value as typeof form.account_type,
            })
          }
        >
          <option value="property_seeker">Property seeker</option>
          <option value="landlord">Landlord or property owner</option>
          <option value="property_manager">Property manager</option>
        </Select>
      </Field>

      <Field label="Password" htmlFor="register-password" required hint="At least 8 characters with letters and numbers.">
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <Input
            id="register-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            className="pl-9 pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-ink-700"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>

      <Checkbox
        label="I accept the terms and privacy notice"
        description="Findora uses your details to provide discovery, assisted search and account security. We never sell your data."
        checked={form.consent}
        onChange={(event) => setForm({ ...form, consent: event.target.checked })}
        required
      />
      <Checkbox
        label="Send me occasional updates (optional)"
        description="Availability alerts, new features and local property guidance. You can opt out at any time."
        checked={form.marketing_consent}
        onChange={(event) => setForm({ ...form, marketing_consent: event.target.checked })}
      />

      <FormErrors errors={errors} />

      <Button type="submit" className="w-full" loading={submitting} disabled={!form.consent}>
        Create account
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>

      <p className="text-center text-sm text-ink-500">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-semibold text-teal-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function VerifyForm({ phone: initialPhone, next }: { phone: string; next: string | null }) {
  const router = useRouter();
  const { user, loading, verifyPhone, resendOtp } = useAuth();
  const { errors, setErrors, capture } = useAuthErrors();
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setHint(window.sessionStorage.getItem("findora_otp_hint"));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    timer.current = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [cooldown]);

  useEffect(() => {
    if (!loading && user && user.phone_verified) {
      router.replace(safeNextPath(next) ?? dashboardForUser(user));
    }
  }, [loading, user, next, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    setNotice(null);
    try {
      const verified = await verifyPhone(phone, code.trim());
      window.sessionStorage.removeItem("findora_otp_hint");
      router.replace(safeNextPath(next) ?? dashboardForUser(verified));
      router.refresh();
    } catch (error) {
      capture(error);
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setResending(true);
    setErrors([]);
    setNotice(null);
    try {
      await resendOtp(phone);
      setCooldown(30);
      setNotice("If this number belongs to an account, a new code has been sent.");
    } catch (error) {
      capture(error);
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {hint ? (
        <InlineNote>
          <strong className="font-semibold">Demo mode:</strong> the verification code is{" "}
          <span className="font-mono text-base font-bold tracking-widest">{hint}</span>. In production this code is only
          sent by SMS.
        </InlineNote>
      ) : null}

      <Field label="Phone number" htmlFor="verify-phone" required>
        <div className="relative">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <Input
            id="verify-phone"
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+254 7XX XXX XXX"
            className="pl-9"
          />
        </div>
      </Field>

      <Field label="Verification code" htmlFor="verify-code" required hint="Enter the 4–8 digit code sent by SMS.">
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <Input
            id="verify-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            minLength={4}
            maxLength={8}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            className={cn("pl-9 font-mono text-lg tracking-[0.3em]")}
          />
        </div>
      </Field>

      <FormErrors errors={errors} />
      {notice ? <InlineNote tone="success">{notice}</InlineNote> : null}

      <Button type="submit" className="w-full" loading={submitting}>
        Verify phone and continue
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button type="button" variant="ghost" size="sm" onClick={resend} loading={resending} disabled={cooldown > 0}>
          <Smartphone className="h-4 w-4" aria-hidden="true" />
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </Button>
        <Link href="/login" className="font-semibold text-teal-700 hover:underline">
          Back to sign in
        </Link>
      </div>

      <p className="flex items-start gap-2 rounded-xl bg-ivory-100 px-3.5 py-3 text-xs leading-5 text-ink-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
        Verifying your phone helps protect your account and lets property teams know how to reach you. Findora never
        shares your full number publicly.
      </p>
    </form>
  );
}
