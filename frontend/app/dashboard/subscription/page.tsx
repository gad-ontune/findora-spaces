"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Layers,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { api, errorMessage } from "@/lib/api";
import type { Payment, SubscriptionPayload, SubscriptionPlan } from "@/lib/types";
import { cn, formatDate, formatKes } from "@/lib/utils";

type PaymentResult = {
  payment: Payment;
  message: string;
  payment_confirmed_by_backend: boolean;
};

export default function SubscriptionPage() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [paymentNote, setPaymentNote] = useState<{
    tone: "success" | "warning" | "info";
    message: string;
  } | null>(null);

  const subscriptionQuery = useQuery({
    queryKey: ["subscription"],
    queryFn: () => api.get<SubscriptionPayload>("/subscriptions/me"),
  });

  const subscription = subscriptionQuery.data?.subscription;
  const plans = subscriptionQuery.data?.plans ?? [];
  const canPay = hasPermission("payment:initiate") && hasPermission("property:create");

  async function choosePlan(plan: SubscriptionPlan) {
    if (!canPay || plan.price <= 0 || purchasing) return;
    setPurchasing(plan.code);
    setPaymentNote(null);
    try {
      const result = await api.post<PaymentResult>("/payments/initiate", {
        purpose: "subscription",
        plan_code: plan.code,
        idempotency_key: `subscription-${plan.code}-${Date.now()}`,
      });
      if (result.payment_confirmed_by_backend) {
        setPaymentNote({
          tone: "success",
          message: `Payment confirmed by the backend. ${plan.name} is now your plan.`,
        });
        toast({
          title: "Plan activated",
          description: `${plan.name} is now your current plan.`,
          tone: "success",
        });
        await queryClient.invalidateQueries({ queryKey: ["subscription"] });
      } else if (result.payment.status === "pending") {
        setPaymentNote({
          tone: "warning",
          message:
            "Payment request sent. Confirm it on your phone, then refresh this page. The plan stays unchanged until the backend confirms payment.",
        });
        toast({
          title: "Check your phone",
          description: "Confirm the M-Pesa request to finish the plan change.",
          tone: "info",
        });
      } else {
        const reason =
          result.payment.failure_reason ||
          "The payment was not completed. No plan change was made.";
        setPaymentNote({ tone: "warning", message: reason });
        toast({ title: "Payment not completed", description: reason, tone: "error" });
      }
    } catch (error) {
      toast({
        title: "Plan change could not start",
        description: errorMessage(error),
        tone: "error",
      });
    } finally {
      setPurchasing(null);
    }
  }

  async function cancelPlan() {
    if (cancelBusy) return;
    setCancelBusy(true);
    try {
      const result = await api.post<{ message: string }>("/subscriptions/cancel");
      setPaymentNote({ tone: "info", message: result.message });
      toast({ title: "Cancellation scheduled", description: result.message, tone: "info" });
      await queryClient.invalidateQueries({ queryKey: ["subscription"] });
    } catch (error) {
      toast({
        title: "Cancellation could not be scheduled",
        description: errorMessage(error),
        tone: "error",
      });
    } finally {
      setCancelBusy(false);
    }
  }

  async function resumePlan() {
    if (resumeBusy) return;
    setResumeBusy(true);
    try {
      const result = await api.post<{ message: string }>("/subscriptions/resume");
      setPaymentNote({ tone: "success", message: result.message });
      toast({ title: "Plan resumed", description: result.message, tone: "success" });
      await queryClient.invalidateQueries({ queryKey: ["subscription"] });
    } catch (error) {
      toast({
        title: "Plan could not be resumed",
        description: errorMessage(error),
        tone: "error",
      });
    } finally {
      setResumeBusy(false);
    }
  }

  const limit = subscription?.listing_limit ?? null;
  const used = subscription?.listings_used ?? 0;
  const usagePercent = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Subscription"
        title="Plan and listing limit"
        description="Your plan sets how many active listings your account can keep. Upgrade only when you need more capacity; approval, verification and availability rules still apply."
        actions={
          <LinkButton href="/dashboard/payments" variant="outline">
            Payments and receipts
          </LinkButton>
        }
      />

      <InlineNote>
        <span className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Demo environment: M-Pesa is simulated. A plan is only shown as active after the
            backend confirms the payment. No real money is charged.
          </span>
        </span>
      </InlineNote>

      {paymentNote ? (
        <InlineNote tone={paymentNote.tone}>
          <span className="flex items-start gap-2">
            {paymentNote.tone === "warning" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{paymentNote.message}</span>
          </span>
        </InlineNote>
      ) : null}

      {subscriptionQuery.isError ? (
        <ErrorState
          title="Subscription could not load"
          description="We could not reach your plan details."
          retry={() => subscriptionQuery.refetch()}
        />
      ) : subscriptionQuery.isLoading || !subscription ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <section className="surface overflow-hidden" aria-labelledby="current-plan-heading">
            <div className="border-b border-ink-900/10 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-600">
                    Current plan
                  </p>
                  <h2
                    id="current-plan-heading"
                    className="mt-1 font-display text-2xl font-bold text-ink-900"
                  >
                    {subscription.plan?.name ?? "No plan"}
                  </h2>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-ink-500">
                    {subscription.plan?.description ??
                      "Choose a plan to set your listing capacity."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={subscription.status} />
                  {subscription.plan && subscription.plan.price > 0 ? (
                    <Badge tone="sand">
                      {formatKes(subscription.plan.price)}/{subscription.plan.period}
                    </Badge>
                  ) : (
                    <Badge tone="sage">Included by default</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
                  <Layers className="h-4 w-4 text-teal-600" aria-hidden="true" />
                  Listing usage
                </h3>
                <p className="mt-1 text-sm text-ink-600">
                  {subscription.staff_exempt ? (
                    <>
                      You have{" "}
                      <span className="font-semibold text-ink-900">{used}</span> active listing
                      {used === 1 ? "" : "s"}. Staff accounts are exempt from plan limits.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-ink-900">{used}</span> of{" "}
                      <span className="font-semibold text-ink-900">
                        {limit === null ? "unlimited" : limit}
                      </span>{" "}
                      active listings used.
                    </>
                  )}
                </p>
                {limit !== null ? (
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-ink-900/10"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={limit}
                    aria-valuenow={Math.min(used, limit)}
                    aria-label="Listing limit usage"
                  >
                    <div
                      className={cn(
                        "h-full rounded-full",
                        subscription.can_create_listing ? "bg-teal-600" : "bg-terracotta-500",
                      )}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                ) : null}
                <p className="mt-2 text-xs leading-5 text-ink-400">
                  Archived, rejected and deleted listings do not count toward the limit.
                </p>
                {!subscription.can_create_listing ? (
                  <div className="mt-3">
                    <InlineNote tone="warning">
                      <span className="flex items-start gap-2">
                        <AlertTriangle
                          className="mt-0.5 h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span>
                          You have reached this plan&apos;s limit.{" "}
                          <Link
                            href="/dashboard/properties"
                            className="font-semibold underline"
                          >
                            Archive a listing
                          </Link>{" "}
                          or choose a larger plan below before adding another.
                        </span>
                      </span>
                    </InlineNote>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="rounded-xl bg-ivory-100 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">
                    <CalendarClock className="h-4 w-4" aria-hidden="true" />
                    Renewal
                  </p>
                  {subscription.status === "free" ? (
                    <p className="mt-1 text-sm leading-6 text-ink-600">
                      Starter is included by default and has no renewal charge.
                    </p>
                  ) : subscription.cancel_at_period_end ? (
                    <p className="mt-1 text-sm leading-6 text-ink-600">
                      Access ends on{" "}
                      <span className="font-semibold text-ink-900">
                        {formatDate(subscription.ends_at)}
                      </span>
                      . You keep the current plan until then.
                    </p>
                  ) : (
                    <p className="mt-1 text-sm leading-6 text-ink-600">
                      Renews on{" "}
                      <span className="font-semibold text-ink-900">
                        {formatDate(subscription.ends_at)}
                      </span>
                      {subscription.days_remaining !== null
                        ? ` · ${subscription.days_remaining} day${
                            subscription.days_remaining === 1 ? "" : "s"
                          } remaining`
                        : ""}
                      .
                    </p>
                  )}
                </div>
                {subscription.status === "cancelling" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resumePlan}
                    loading={resumeBusy}
                  >
                    Keep my plan
                  </Button>
                ) : subscription.status === "active" &&
                  subscription.plan &&
                  subscription.plan.price > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={cancelPlan}
                    loading={cancelBusy}
                  >
                    Cancel renewal
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <section aria-labelledby="plans-heading">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-600">
                  Plans
                </p>
                <h2
                  id="plans-heading"
                  className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-900"
                >
                  Choose the capacity you need
                </h2>
              </div>
              <Sparkles className="hidden h-6 w-6 text-teal-600 sm:block" aria-hidden="true" />
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-500">
              Plan changes never bypass moderation, verification or availability checks. A paid
              plan starts only after a confirmed payment.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const isCurrent = subscription.plan?.code === plan.code;
                const isFree = plan.price <= 0;
                const isUpgrade =
                  subscription.plan === null || plan.price > subscription.plan.price;
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "flex flex-col rounded-2xl border bg-white p-5",
                      isCurrent
                        ? "border-teal-400 ring-2 ring-teal-100"
                        : "border-ink-900/10",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg font-bold text-ink-900">
                        {plan.name}
                      </h3>
                      {isCurrent ? (
                        <Badge tone="teal">Current</Badge>
                      ) : plan.code === "landlord_growth" ? (
                        <Badge tone="sand">Popular</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-ink-500">{plan.description}</p>
                    <p className="mt-3 font-display text-2xl font-extrabold text-ink-900">
                      {isFree ? "Free" : formatKes(plan.price)}
                      {!isFree ? (
                        <span className="ml-1 text-xs font-medium text-ink-400">
                          /{plan.period}
                        </span>
                      ) : null}
                    </p>
                    <ul className="mt-3 flex-1 space-y-2 text-sm leading-6 text-ink-600">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-1.5">
                          <CheckCircle2
                            className="mt-1 h-3.5 w-3.5 shrink-0 text-teal-600"
                            aria-hidden="true"
                          />
                          {feature}
                        </li>
                      ))}
                      <li className="flex items-start gap-1.5">
                        <Layers
                          className="mt-1 h-3.5 w-3.5 shrink-0 text-teal-600"
                          aria-hidden="true"
                        />
                        {plan.listing_limit
                          ? `Up to ${plan.listing_limit} active listings`
                          : "Listing limit set by agreement"}
                      </li>
                    </ul>

                    {isCurrent ? (
                      <Button type="button" variant="outline" className="mt-4 w-full" disabled>
                        Current plan
                      </Button>
                    ) : isFree ? (
                      <Button type="button" variant="outline" className="mt-4 w-full" disabled>
                        Included by default
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="mt-4 w-full"
                        variant={isUpgrade ? "primary" : "outline"}
                        onClick={() => choosePlan(plan)}
                        loading={purchasing === plan.code}
                        disabled={!canPay || Boolean(purchasing)}
                        icon={<CreditCard className="h-4 w-4" aria-hidden="true" />}
                      >
                        {isUpgrade ? "Upgrade to" : "Switch to"} {plan.name}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            {!canPay ? (
              <p className="mt-3 text-xs leading-5 text-ink-400">
                Listing plans apply to landlord, manager and data partner accounts. Your
                account cannot start a plan change; contact support if you believe this is
                wrong.
              </p>
            ) : (
              <p className="mt-3 text-xs leading-5 text-ink-400">
                Cancelling a paid plan keeps it active until the end of the current period.
                When it expires, the free Starter plan applies automatically.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
