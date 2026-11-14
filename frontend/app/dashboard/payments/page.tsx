"use client";

import { useQuery } from "@tanstack/react-query";
import { CreditCard, FileText, ReceiptText, ShieldCheck } from "lucide-react";

import { StatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState, ErrorState, InlineNote, Skeleton } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { api } from "@/lib/api";
import type { Invoice, Payment } from "@/lib/types";
import { formatDateTime, formatKes, titleize } from "@/lib/utils";

export default function PaymentsPage() {
  const paymentsQuery = useQuery({
    queryKey: ["payments"],
    queryFn: () => api.get<{ payments: Payment[]; count: number }>("/payments"),
  });

  const invoicesQuery = useQuery({
    queryKey: ["invoices"],
    queryFn: () => api.get<{ invoices: Invoice[] }>("/invoices"),
  });

  const payments = paymentsQuery.data?.payments ?? [];
  const invoices = invoicesQuery.data?.invoices ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Payments"
        title="Payments and receipts"
        description="Findora only charges for defined services such as assisted search. A payment is never shown as successful unless the provider confirmed it."
        actions={
          <LinkButton href="/assisted" variant="outline">
            Assisted search
          </LinkButton>
        }
      />

      <InlineNote>
        <ShieldCheck className="mr-1 inline h-4 w-4" aria-hidden="true" />
        Demo environment: M-Pesa is simulated. No real money is charged, and a failed or pending payment is never
        displayed as paid.
      </InlineNote>

      <section className="surface overflow-hidden" aria-labelledby="payments-heading">
        <div className="border-b border-ink-900/10 p-4">
          <h2 id="payments-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
            <CreditCard className="h-5 w-5 text-teal-600" aria-hidden="true" />
            Payment history
          </h2>
        </div>

        {paymentsQuery.isError ? (
          <div className="p-4">
            <ErrorState
              title="Payments could not load"
              description="We could not reach your payment records."
              retry={() => paymentsQuery.refetch()}
            />
          </div>
        ) : paymentsQuery.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : payments.length ? (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Your Findora payments</caption>
                <thead>
                  <tr className="border-b border-ink-900/10 bg-ivory-100 text-xs uppercase tracking-wide text-ink-500">
                    <th scope="col" className="px-4 py-3">Reference</th>
                    <th scope="col" className="px-4 py-3">Purpose</th>
                    <th scope="col" className="px-4 py-3">Amount</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-900/10">
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink-800">{payment.reference}</p>
                        <p className="text-xs text-ink-400">{payment.provider}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-600">{titleize(payment.purpose)}</td>
                      <td className="px-4 py-3 font-semibold text-ink-800">{formatKes(payment.amount)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={payment.status} />
                        {payment.failure_reason ? (
                          <p className="mt-1 max-w-56 text-xs leading-5 text-terracotta-700">{payment.failure_reason}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-500">{formatDateTime(payment.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-ink-900/10 sm:hidden">
              {payments.map((payment) => (
                <li key={payment.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">{payment.reference}</p>
                      <p className="text-xs text-ink-400">{titleize(payment.purpose)}</p>
                    </div>
                    <StatusBadge status={payment.status} />
                  </div>
                  <p className="mt-1 font-display text-lg font-bold text-ink-900">{formatKes(payment.amount)}</p>
                  <p className="text-xs text-ink-400">{formatDateTime(payment.created_at)}</p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={<CreditCard className="h-6 w-6" aria-hidden="true" />}
              title="No payments yet"
              description="Assisted search fees and other service payments will appear here. Browsing and saving spaces is free."
              action={<LinkButton href="/assisted" variant="outline">Ask for help finding a space</LinkButton>}
            />
          </div>
        )}
      </section>

      <section className="surface overflow-hidden" aria-labelledby="invoices-heading">
        <div className="border-b border-ink-900/10 p-4">
          <h2 id="invoices-heading" className="flex items-center gap-2 font-display text-lg font-bold text-ink-900">
            <ReceiptText className="h-5 w-5 text-teal-600" aria-hidden="true" />
            Invoices
          </h2>
        </div>
        {invoicesQuery.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-20 w-full" />
          </div>
        ) : invoices.length ? (
          <ul className="divide-y divide-ink-900/10">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ivory-200 text-teal-700">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{invoice.number}</p>
                    <p className="text-xs text-ink-400">Issued {formatDateTime(invoice.issued_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-ink-800">{formatKes(invoice.amount)}</p>
                  <StatusBadge status={invoice.status} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-ink-500">No invoices have been issued to your account.</p>
        )}
      </section>

      <p className="text-xs leading-5 text-ink-400">
        Questions about a charge? Open a support request from the trust page or contact the team. Refunds are recorded
        against the original payment and are never silently marked as complete.
      </p>
    </div>
  );
}
