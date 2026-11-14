"use client";

import { useState } from "react";
import { CalendarCheck2, Flag, MessageSquare, ShieldCheck } from "lucide-react";

import { useAuth, useToast } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { InlineNote } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { api, errorMessage, validationDetails } from "@/lib/api";

type Mode = "enquiry" | "viewing" | "report" | null;

export function ContactActions({ propertyId, propertyTitle }: { propertyId: string; propertyTitle: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<{ title: string; message: string; reference?: string } | null>(null);

  const [enquiry, setEnquiry] = useState({
    name: user?.name ?? "",
    phone: user?.phone ?? "",
    email: user?.email ?? "",
    message: "Hello, I would like to confirm whether this space is still available and arrange a viewing.",
    enquiry_type: "availability",
  });
  const [viewing, setViewing] = useState({
    seeker_name: user?.name ?? "",
    seeker_phone: user?.phone ?? "",
    preferred_date: "",
    preferred_time: "Afternoon",
    notes: "",
  });
  const [report, setReport] = useState({
    reason: "incorrect_information",
    details: "",
  });

  function close() {
    setMode(null);
    setErrors([]);
    setSuccess(null);
  }

  function open(next: Mode) {
    setMode(next);
    setErrors([]);
    setSuccess(null);
  }

  async function submitEnquiry(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrors([]);
    try {
      const payload = await api.post<{ enquiry: { id: string }; message: string }>(
        `/properties/${propertyId}/enquiries`,
        {
          ...enquiry,
          email: enquiry.email || null,
        },
      );
      setSuccess({
        title: "Enquiry sent",
        message:
          payload.message ??
          "The property team has received your enquiry. They will contact you using the details you provided.",
      });
      toast({ title: "Enquiry sent", tone: "success" });
    } catch (error) {
      setErrors(validationDetails(error).length ? validationDetails(error) : [errorMessage(error)]);
    } finally {
      setLoading(false);
    }
  }

  async function submitViewing(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrors([]);
    try {
      const payload = await api.post<{ viewing: { reference: string } }>("/viewings", {
        property_id: propertyId,
        seeker_name: viewing.seeker_name,
        seeker_phone: viewing.seeker_phone,
        preferred_date: viewing.preferred_date || null,
        preferred_time: viewing.preferred_time || null,
        notes: viewing.notes || null,
      });
      setSuccess({
        title: "Viewing requested",
        message:
          "The property representative will confirm a date and time. A confirmed viewing is not a guarantee that the property is available until they reconfirm.",
        reference: payload.viewing.reference,
      });
      toast({ title: "Viewing requested", tone: "success" });
    } catch (error) {
      setErrors(validationDetails(error).length ? validationDetails(error) : [errorMessage(error)]);
    } finally {
      setLoading(false);
    }
  }

  async function submitReport(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrors([]);
    try {
      await api.post(`/properties/${propertyId}/reports`, report);
      setSuccess({
        title: "Report received",
        message:
          "Thank you. Findora moderators will review this report against the listing evidence. We do not publish unverified accusations.",
      });
      toast({ title: "Report sent to moderators", tone: "success" });
    } catch (error) {
      setErrors(validationDetails(error).length ? validationDetails(error) : [errorMessage(error)]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="grid gap-2">
        <Button onClick={() => open("enquiry")}>
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Send an enquiry
        </Button>
        <Button variant="secondary" onClick={() => open("viewing")}>
          <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
          Request a viewing
        </Button>
        <button
          type="button"
          onClick={() => open("report")}
          className="mt-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-ink-400 transition hover:text-terracotta-700"
        >
          <Flag className="h-3.5 w-3.5" aria-hidden="true" />
          Report a problem with this listing
        </button>
      </div>

      <Modal
        open={mode === "enquiry"}
        onClose={close}
        title="Send an enquiry"
        description={`About ${propertyTitle}`}
        footer={
          success ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close} type="button">
                Cancel
              </Button>
              <Button form="enquiry-form" type="submit" loading={loading}>
                Send enquiry
              </Button>
            </>
          )
        }
      >
        {success ? (
          <SuccessPanel success={success} />
        ) : (
          <form id="enquiry-form" onSubmit={submitEnquiry} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" htmlFor="enquiry-name" required>
                <Input
                  id="enquiry-name"
                  value={enquiry.name}
                  onChange={(event) => setEnquiry({ ...enquiry, name: event.target.value })}
                  required
                  autoComplete="name"
                />
              </Field>
              <Field label="Phone number" htmlFor="enquiry-phone" required hint="Use a number the property team can reach.">
                <Input
                  id="enquiry-phone"
                  type="tel"
                  value={enquiry.phone}
                  onChange={(event) => setEnquiry({ ...enquiry, phone: event.target.value })}
                  required
                  autoComplete="tel"
                  placeholder="+254 7…"
                />
              </Field>
            </div>
            <Field label="Email (optional)" htmlFor="enquiry-email">
              <Input
                id="enquiry-email"
                type="email"
                value={enquiry.email}
                onChange={(event) => setEnquiry({ ...enquiry, email: event.target.value })}
                autoComplete="email"
              />
            </Field>
            <Field label="What do you need?" htmlFor="enquiry-type">
              <Select
                id="enquiry-type"
                value={enquiry.enquiry_type}
                onChange={(event) => setEnquiry({ ...enquiry, enquiry_type: event.target.value })}
              >
                <option value="availability">Confirm availability</option>
                <option value="viewing">Arrange a viewing</option>
                <option value="enquiry">Ask a general question</option>
              </Select>
            </Field>
            <Field label="Message" htmlFor="enquiry-message" required>
              <Textarea
                id="enquiry-message"
                value={enquiry.message}
                onChange={(event) => setEnquiry({ ...enquiry, message: event.target.value })}
                required
                minLength={10}
              />
            </Field>
            <FormErrors errors={errors} />
            <InlineNote>
              Your phone number is shared only with the authorised property team so they can respond. Do not send
              money before viewing and confirming the property.
            </InlineNote>
          </form>
        )}
      </Modal>

      <Modal
        open={mode === "viewing"}
        onClose={close}
        title="Request a viewing"
        description={`About ${propertyTitle}`}
        footer={
          success ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close} type="button">
                Cancel
              </Button>
              <Button form="viewing-form" type="submit" loading={loading}>
                Request viewing
              </Button>
            </>
          )
        }
      >
        {success ? (
          <SuccessPanel success={success} />
        ) : (
          <form id="viewing-form" onSubmit={submitViewing} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your name" htmlFor="viewing-name" required>
                <Input
                  id="viewing-name"
                  value={viewing.seeker_name}
                  onChange={(event) => setViewing({ ...viewing, seeker_name: event.target.value })}
                  required
                  autoComplete="name"
                />
              </Field>
              <Field label="Phone number" htmlFor="viewing-phone" required>
                <Input
                  id="viewing-phone"
                  type="tel"
                  value={viewing.seeker_phone}
                  onChange={(event) => setViewing({ ...viewing, seeker_phone: event.target.value })}
                  required
                  autoComplete="tel"
                  placeholder="+254 7…"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Preferred date" htmlFor="viewing-date">
                <Input
                  id="viewing-date"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={viewing.preferred_date}
                  onChange={(event) => setViewing({ ...viewing, preferred_date: event.target.value })}
                />
              </Field>
              <Field label="Preferred time" htmlFor="viewing-time">
                <Select
                  id="viewing-time"
                  value={viewing.preferred_time}
                  onChange={(event) => setViewing({ ...viewing, preferred_time: event.target.value })}
                >
                  <option>Morning</option>
                  <option>Midday</option>
                  <option>Afternoon</option>
                  <option>Evening</option>
                </Select>
              </Field>
            </div>
            <Field label="Notes (optional)" htmlFor="viewing-notes">
              <Textarea
                id="viewing-notes"
                value={viewing.notes}
                onChange={(event) => setViewing({ ...viewing, notes: event.target.value })}
                placeholder="Anything the representative should know?"
              />
            </Field>
            <FormErrors errors={errors} />
            <InlineNote tone="warning">
              Never pay a deposit before viewing the property and confirming that the person you are dealing with is
              authorised to let it.
            </InlineNote>
          </form>
        )}
      </Modal>

      <Modal
        open={mode === "report"}
        onClose={close}
        title="Report a problem"
        description="Reports help moderators protect other seekers. Please be factual."
        footer={
          success ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close} type="button">
                Cancel
              </Button>
              <Button form="report-form" type="submit" variant="danger" loading={loading}>
                Send report
              </Button>
            </>
          )
        }
      >
        {success ? (
          <SuccessPanel success={success} />
        ) : (
          <form id="report-form" onSubmit={submitReport} className="space-y-4">
            <Field label="What is wrong?" htmlFor="report-reason" required>
              <Select
                id="report-reason"
                value={report.reason}
                onChange={(event) => setReport({ ...report, reason: event.target.value })}
              >
                <option value="incorrect_information">Incorrect information</option>
                <option value="unavailable">No longer available</option>
                <option value="misleading_photos">Misleading photos</option>
                <option value="payment_request">Suspicious payment request</option>
                <option value="suspected_fraud">Suspected fraud</option>
                <option value="duplicate">Duplicate listing</option>
                <option value="other">Something else</option>
              </Select>
            </Field>
            <Field label="What happened?" htmlFor="report-details" required hint="At least 10 characters. Include dates or amounts if relevant.">
              <Textarea
                id="report-details"
                value={report.details}
                onChange={(event) => setReport({ ...report, details: event.target.value })}
                required
                minLength={10}
                placeholder="Describe the issue factually…"
              />
            </Field>
            <FormErrors errors={errors} />
            <InlineNote>
              <ShieldCheck className="mr-1 inline h-4 w-4" aria-hidden="true" />
              Findora moderators review reports against listing evidence. False reports may affect your account.
            </InlineNote>
          </form>
        )}
      </Modal>
    </>
  );
}

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

function SuccessPanel({
  success,
}: {
  success: { title: string; message: string; reference?: string };
}) {
  return (
    <div className="py-2 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sage-200 text-teal-800">
        <ShieldCheck className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="mt-4 font-display text-lg font-bold text-ink-900">{success.title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-500">{success.message}</p>
      {success.reference ? (
        <p className="mt-4 rounded-xl bg-ivory-100 px-3 py-2 text-sm font-semibold text-ink-700">
          Reference: {success.reference}
        </p>
      ) : null}
    </div>
  );
}
