"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ReceiptText,
  RefreshCcw,
  ShieldAlert,
  Wallet,
} from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { PageHeader, StatCard } from "@/components/ui/page";
import { api, errorMessage, validationDetails } from "@/lib/api";
import type {
  AdminPaymentListResponse,
  AdminReconciliation,
  AdminRefundListResponse,
} from "@/lib/types";
import { formatDate, formatDateTime, formatKes, titleize } from "@/lib/utils";

type Tab = "payments" | "refunds" | "reconciliation";

const PAYMENT_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "initiated", label: "Initiated" },
  { value: "pending", label: "Pending" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

export default function AdminFinancePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canView = hasPermission("payment:view") || hasPermission("payment:refund");
  const canReconcile = hasPermission("payment:refund");

  const [tab, setTab] = useState<Tab>("payments");
  const [paymentStatus, setPaymentStatus] = useState("");

  const [reconciliationDate, setReconciliationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [providerTotal, setProviderTotal] = useState("");
  const [savingReconciliation, setSavingReconciliation] = useState(false);
  const [reconciliationResult, setReconciliationResult] = useState<AdminReconciliation | null>(null);

  const paymentsQuery = useQuery({
    queryKey: ["admin-payments", paymentStatus],
    queryFn: () =>
      api.get<AdminPaymentListResponse>("/admin/payments", {
        status: paymentStatus || undefined,
      }),
    enabled: canView,
  });

  const refundsQuery = useQuery({
    queryKey: ["admin-refunds"],
    queryFn: () => api.get<AdminRefundListResponse>("/admin/refunds"),
    enabled: canView,
  });

  const totals = paymentsQuery.data?.totals ?? {};
  const successTotal = totals.success?.amount ?? 0;
  const refundedTotal = totals.refunded?.amount ?? 0;
  const pendingTotal = (totals.pending?.amount ?? 0) + (totals.initiated?.amount ?? 0);
  const failedTotal = totals.failed?.amount ?? 0;

  const paymentRows = useMemo(() => paymentsQuery.data?.payments ?? [], [paymentsQuery.data]);
  const refunds = refundsQuery.data?.refunds ?? [];

  async function submitReconciliation(event: React.FormEvent) {
    event.preventDefault();
    if (!providerTotal) {
      toast({
        title: "Enter the provider total",
        description: "Use the genuine total from the payment provider statement.",
        tone: "error",
      });
      return;
    }
    setSavingReconciliation(true);
    try {
      const result = await api.post<{ reconciliation: AdminReconciliation; message: string }>(
        "/admin/finance/reconcile",
        {
          reconciliation_date: reconciliationDate,
          provider_total: Number(providerTotal),
        },
      );
      setReconciliationResult(result.reconciliation);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-payments"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] }),
      ]);
      setProviderTotal("");
      toast({
        title: result.reconciliation.difference === 0 ? "Reconciliation balanced" : "Discrepancy recorded",
        description: result.message,
        tone: result.reconciliation.difference === 0 ? "success" : "info",
      });
    } catch (error) {
      const details = validationDetails(error);
      toast({
        title: "Could not record the reconciliation",
        description: details.length ? details.join(" · ") : errorMessage(error),
        tone: "error",
      });
    } finally {
      setSavingReconciliation(false);
    }
  }

  if (!canView) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Finance"
          title="Payments and refunds"
          description="Your staff role does not include finance access."
        />
        <InlineNote tone="warning">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Only finance officers and super administrators can view payment records.</span>
          </span>
        </InlineNote>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finance"
        title="Payments and refunds"
        description="Review genuine payment records, refunds and daily reconciliation. Amounts are shown exactly as recorded by the payment provider — never estimated."
        actions={<Badge tone="slate">{paymentsQuery.data?.count ?? 0} payments</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Successful payments"
          value={formatKes(successTotal)}
          hint={`${totals.success?.count ?? 0} successful`}
          icon={<Wallet className="h-5 w-5" aria-hidden="true" />}
          tone="teal"
        />
        <StatCard
          label="Pending / initiated"
          value={formatKes(pendingTotal)}
          hint={`${(totals.pending?.count ?? 0) + (totals.initiated?.count ?? 0)} awaiting outcome`}
          icon={<RefreshCcw className="h-5 w-5" aria-hidden="true" />}
          tone="sand"
        />
        <StatCard
          label="Refunded"
          value={formatKes(refundedTotal)}
          hint={`${totals.refunded?.count ?? 0} refunded payment${(totals.refunded?.count ?? 0) === 1 ? "" : "s"}`}
          icon={<ArrowLeftRight className="h-5 w-5" aria-hidden="true" />}
        />
        <StatCard
          label="Failed"
          value={formatKes(failedTotal)}
          hint={`${totals.failed?.count ?? 0} failed payment${(totals.failed?.count ?? 0) === 1 ? "" : "s"}`}
          icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          tone={failedTotal ? "sand" : "ivory"}
        />
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-ink-900/10 pb-2" role="tablist" aria-label="Finance views">
        {(
          [
            { id: "payments", label: "Payments", icon: ReceiptText },
            { id: "refunds", label: "Refunds", icon: ArrowLeftRight },
            { id: "reconciliation", label: "Reconciliation", icon: CheckCircle2 },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={
                active
                  ? "inline-flex items-center gap-1.5 rounded-full bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-ivory-50"
                  : "inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-600 ring-1 ring-ink-900/10 hover:bg-teal-50"
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "payments" ? (
        <section aria-label="Payments" className="space-y-3">
          <div className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <Field label="Payment status" htmlFor="payment-status-filter" className="sm:w-64">
              <Select
                id="payment-status-filter"
                value={paymentStatus}
                onChange={(event) => setPaymentStatus(event.target.value)}
              >
                {PAYMENT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs leading-5 text-ink-400 sm:pb-2">
              Payment success comes from the provider callback. The console never marks a payment successful manually.
            </p>
          </div>

          {paymentsQuery.isError ? (
            <ErrorState
              title="Payments could not load"
              description="We could not reach the payment records."
              retry={() => paymentsQuery.refetch()}
            />
          ) : paymentsQuery.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : paymentRows.length ? (
            <div className="surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <caption className="sr-only">Payment records with provider status</caption>
                  <thead>
                    <tr className="border-b border-ink-900/10 bg-ivory-100 text-[11px] uppercase tracking-wide text-ink-500">
                      <th scope="col" className="px-4 py-3 font-semibold">Reference</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Purpose</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Amount</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Provider</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRows.map((payment) => (
                      <tr key={payment.id} className="border-b border-ink-900/5 last:border-0 hover:bg-ivory-50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink-800">{payment.reference}</p>
                          <p className="text-[11px] text-ink-400">{payment.phone ?? "No phone recorded"}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-600">
                          {titleize(payment.purpose)}
                          {payment.description ? (
                            <span className="mt-0.5 block text-[11px] text-ink-400">{payment.description}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-ink-800">
                          {formatKes(payment.amount)}
                          <span className="mt-0.5 block text-[11px] font-normal text-ink-400">{payment.currency}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={payment.status} />
                          {payment.failure_reason ? (
                            <p className="mt-1 max-w-[180px] text-[10px] leading-4 text-terracotta-700">{payment.failure_reason}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-600">
                          {titleize(payment.provider)}
                          <span className="mt-0.5 block max-w-[150px] truncate text-[11px] text-ink-400">
                            {payment.provider_reference ?? "No provider reference"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-500">{formatDateTime(payment.created_at)}</td>
                        <td className="px-4 py-3 text-xs text-ink-500">
                          {payment.completed_at ? formatDateTime(payment.completed_at) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<ReceiptText className="h-6 w-6" aria-hidden="true" />}
              title="No payments in this view"
              description="Payments appear when a seeker or landlord pays for a genuine platform service. No placeholder payments are shown."
            />
          )}
        </section>
      ) : null}

      {tab === "refunds" ? (
        <section aria-label="Refunds" className="space-y-3">
          <InlineNote tone="info">
            Refund records are read-only in this console. A refund is only shown as completed when the provider confirms
            it — never based on an assumption.
          </InlineNote>
          {refundsQuery.isError ? (
            <ErrorState
              title="Refunds could not load"
              description="We could not reach the refund records."
              retry={() => refundsQuery.refetch()}
            />
          ) : refundsQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : refunds.length ? (
            <div className="space-y-3">
              {refunds.map((refund) => (
                <article key={refund.id} className="surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-ink-900">{formatKes(refund.amount)}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        Refund for payment {refund.payment_id} · {refund.currency} · created {formatDateTime(refund.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={refund.status} />
                  </div>
                  <p className="mt-2 rounded-lg bg-ivory-100 px-3 py-2 text-xs leading-5 text-ink-600">{refund.reason}</p>
                  <p className="mt-1 text-[11px] text-ink-400">
                    Provider reference: {refund.provider_reference ?? "not recorded"}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ArrowLeftRight className="h-6 w-6" aria-hidden="true" />}
              title="No refunds recorded"
              description="Refund records appear when a genuine refund is initiated or completed."
            />
          )}
        </section>
      ) : null}

      {tab === "reconciliation" ? (
        <section aria-label="Reconciliation" className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="surface p-5">
            <h2 className="font-display text-lg font-bold text-ink-900">Daily reconciliation</h2>
            <p className="mt-1 text-xs leading-5 text-ink-500">
              Enter the genuine total from the M-Pesa statement for a date. The server computes the internal successful
              total and records any difference. A discrepancy stays a discrepancy until investigated.
            </p>
            {canReconcile ? (
              <form onSubmit={submitReconciliation} className="mt-4 space-y-4">
                <Field label="Reconciliation date" htmlFor="reconciliation-date" required>
                  <Input
                    id="reconciliation-date"
                    type="date"
                    required
                    value={reconciliationDate}
                    onChange={(event) => setReconciliationDate(event.target.value)}
                  />
                </Field>
                <Field
                  label="Provider total (KES)"
                  htmlFor="reconciliation-total"
                  required
                  hint="Copy the exact total from the provider statement. Do not estimate."
                >
                  <Input
                    id="reconciliation-total"
                    type="number"
                    required
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={providerTotal}
                    onChange={(event) => setProviderTotal(event.target.value)}
                    placeholder="e.g. 12500.00"
                  />
                </Field>
                <Button type="submit" loading={savingReconciliation}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Record reconciliation
                </Button>
              </form>
            ) : (
              <InlineNote tone="warning">
                Your role can view finance records but cannot record reconciliations. This requires the refund
                permission.
              </InlineNote>
            )}
          </div>

          <div className="space-y-3">
            {reconciliationResult ? (
              <div className="surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-ink-900">Last recorded result</h2>
                  <StatusBadge status={reconciliationResult.status} />
                </div>
                <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-ivory-100 p-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Date</dt>
                    <dd className="mt-1 text-sm font-semibold text-ink-800">{formatDate(reconciliationResult.date)}</dd>
                  </div>
                  <div className="rounded-xl bg-ivory-100 p-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Provider</dt>
                    <dd className="mt-1 text-sm font-semibold text-ink-800">{formatKes(reconciliationResult.provider_total)}</dd>
                  </div>
                  <div className="rounded-xl bg-ivory-100 p-3">
                    <dt className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Internal</dt>
                    <dd className="mt-1 text-sm font-semibold text-ink-800">{formatKes(reconciliationResult.internal_total)}</dd>
                  </div>
                </dl>
                <p
                  className={
                    reconciliationResult.difference === 0
                      ? "mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900"
                      : "mt-3 rounded-lg bg-terracotta-100 px-3 py-2 text-sm font-semibold text-terracotta-800"
                  }
                >
                  Difference: {formatKes(reconciliationResult.difference)}
                  {reconciliationResult.difference === 0
                    ? " — balanced."
                    : " — investigate before treating this as resolved."}
                </p>
              </div>
            ) : (
              <div className="surface p-5">
                <h2 className="font-display text-lg font-bold text-ink-900">Reconciliation rules</h2>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-ink-600">
                  <li className="rounded-lg border border-ink-900/10 px-3 py-2">
                    Only successful payments completed on the selected date are included in the internal total.
                  </li>
                  <li className="rounded-lg border border-ink-900/10 px-3 py-2">
                    A zero difference records a balanced day. A non-zero difference records a discrepancy.
                  </li>
                  <li className="rounded-lg border border-ink-900/10 px-3 py-2">
                    Reconciliation does not change any payment status. Failed or pending payments remain as recorded.
                  </li>
                  <li className="rounded-lg border border-ink-900/10 px-3 py-2">
                    Every reconciliation is written to the audit log with the officer&apos;s account.
                  </li>
                </ul>
              </div>
            )}
          </div>
        </section>
      ) : null}

      <InlineNote tone="info">
        <span className="flex items-start gap-2">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Payment and refund outcomes are provider-driven. Never tell a seeker that a payment succeeded based on an
            initiation response; only a confirmed success status is evidence of payment.
          </span>
        </span>
      </InlineNote>
    </div>
  );
}
