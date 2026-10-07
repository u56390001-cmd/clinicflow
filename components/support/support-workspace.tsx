"use client";

/**
 * Help & Support workspace (/app/support).
 *
 * The page is deliberately composed of three quiet layers:
 *
 *   1. A live-status strip and two contact cards — the fastest paths out of
 *      a problem.
 *   2. A searchable FAQ that covers the questions clinics actually ask, with
 *      answers tied to the real screens (e.g. WhatsApp lives on the AI Agent
 *      page, not a generic "integration").
 *   3. A "Need Help?" panel whose form is the only thing on the page that
 *      writes: one row in `support_tickets`, Zod-checked and author-bound.
 *
 * The accent, everywhere, is the system primary (teal). The reference mock
 * painted this page with its own indigo + green + amber + blue; here the
 * panel headers, chips, icons and links all stay on `primary`, and the only
 * other colour is the semantic status green on the "All systems operational"
 * strip — because that green means "live" rather than "brand".
 */

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  CircleHelp,
  Clock,
  FileText,
  Mail,
  MessageCircle,
  Search,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { SupportModal } from "@/components/support/support-modal";

const SUPPORT_EMAIL = "support@medbookai.com";
/** Replace the placeholder with the clinic's own support number before launch. */
const SUPPORT_WHATSAPP_LINK =
  "https://wa.me/YOUR_SUPPORT_NUMBER?text=Hi%20MedBook%20Support%2C%20I%20need%20assistance";

const SUPPORT_FAQS = [
  {
    id: 1,
    question: "How do I connect my WhatsApp number?",
    answer:
      "Open Settings > AI Agent and go to WhatsApp Connection. Scan the QR code using your WhatsApp Business app and the number links to your clinic.",
  },
  {
    id: 2,
    question: "How can patients book appointments?",
    answer:
      "Patients can book through your custom clinic website link, chat with the WhatsApp AI assistant, or walk in for a token at reception.",
  },
  {
    id: 3,
    question: "How do I see all booked appointments?",
    answer:
      "Open Appointments in the left sidebar to see the day's queue, the calendar, and the full booking history.",
  },
  {
    id: 4,
    question: "How can I edit Organization details?",
    answer:
      "Go to Settings > Organization to update your clinic name, address, doctor timings, and consultation fees. Changes there apply everywhere your clinic appears.",
  },
  {
    id: 5,
    question: "What should I do if I'm not receiving patient messages?",
    answer:
      "Check the WhatsApp connection status in Settings > AI Agent. If it is disconnected, re-scan the QR code or verify you have active AI credits.",
  },
  {
    id: 6,
    question: "How can I contact support?",
    answer:
      "Use the WhatsApp chat link or the email above, or open the support form on this page and we will reply to the email on your account.",
  },
  {
    id: 7,
    question: "How do I train the AI assistant for better responses?",
    answer:
      "Open Settings > AI Agent > Knowledge Base to upload custom FAQs, clinic policies, and doctor specialties.",
  },
] as const;

const REQUEST_TYPES = [
  { label: "Bug Report", icon: CircleAlert },
  { label: "Feature Improvement Request", icon: CircleHelp },
  { label: "General Help & Support", icon: MessageCircle },
] as const;

export function SupportWorkspace() {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const term = search.trim().toLowerCase();
  const visibleFaqs = useMemo(
    () =>
      SUPPORT_FAQS.filter((faq) => {
        if (!term) return true;
        return (
          faq.question.toLowerCase().includes(term) ||
          faq.answer.toLowerCase().includes(term)
        );
      }),
    [term],
  );

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          Help & Support
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Get help with your account, AI assistant, bookings, and system
          settings.
        </p>
      </header>

      {/* Live status strip — the only page colour beyond the primary. */}
      <section
        aria-label="System status"
        className="flex items-start gap-3 rounded-card border border-status-success/25 bg-status-success/10 p-4"
      >
        <span className="relative mt-1.5 flex size-2.5" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-pill bg-status-success opacity-60" />
          <span className="relative inline-flex size-2.5 rounded-pill bg-status-success" />
        </span>
        <div>
          <p className="text-sm font-semibold text-text-primary">
            All systems operational
          </p>
          <p className="mt-0.5 text-xs text-text-secondary">
            Last checked: Just now • If you face any issues, contact support
            below
          </p>
        </div>
      </section>

      {/* Direct contact — both cards are anchors, not buttons. */}
      <section
        aria-label="Contact support"
        className="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <a
          href={SUPPORT_WHATSAPP_LINK}
          target="_blank"
          rel="noreferrer"
          className="group flex items-start gap-4 rounded-card border border-hairline bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-card active:scale-[0.99] md:p-5"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
            <MessageCircle className="size-6" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-semibold text-text-primary">
              Chat with Support
            </span>
            <span className="mt-1 block text-sm text-text-secondary">
              Get instant help via WhatsApp
            </span>
            <span className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
              Average response: 2-4 hours
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
          </span>
        </a>

        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="group flex items-start gap-4 rounded-card border border-hairline bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-card active:scale-[0.99] md:p-5"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
            <Mail className="size-6" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-semibold text-text-primary">
              Email Support
            </span>
            <span className="mt-1 block text-sm text-text-secondary">
              Send us a detailed message
            </span>
            <span className="mt-2 flex items-center gap-1 text-xs font-medium text-primary">
              {SUPPORT_EMAIL}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
          </span>
        </a>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* FAQ — spans two columns */}
        <section
          aria-label="Frequently asked questions"
          className="overflow-hidden rounded-card border border-hairline bg-surface lg:col-span-2"
        >
          <div className="flex items-center gap-2 bg-gradient-to-r from-primary to-[#0F766E] px-4 py-4 md:px-6">
            <CircleHelp className="size-5 shrink-0 text-white" aria-hidden="true" />
            <h2 className="text-base font-semibold text-white md:text-lg">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="p-4 md:p-6">
            <div className="relative mb-4">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search FAQs…"
                aria-label="Search frequently asked questions"
                className="pl-9"
              />
            </div>

            {visibleFaqs.length === 0 ? (
              <div className="rounded-card border border-dashed border-text-muted/40 py-10 text-center">
                <CircleHelp
                  className="mx-auto size-7 text-text-muted/60"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-medium text-text-primary">
                  No answers match
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  Try another search term, or ask us directly with the support
                  form.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {visibleFaqs.map((faq, index) => (
                  <div
                    key={faq.id}
                    className="overflow-hidden rounded-card border border-hairline transition-colors hover:border-primary/40"
                  >
                    <Collapsible>
                      <CollapsibleTrigger className="gap-3 px-4 py-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-xs font-semibold text-primary">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium text-text-primary">
                          {faq.question}
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-4 pb-4">
                        <p className="pl-9 text-sm leading-relaxed text-text-secondary">
                          {faq.answer}
                        </p>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-start gap-3 rounded-card border border-primary/15 bg-primary/10 p-4">
              <Clock
                className="mt-0.5 size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-text-primary">
                  Support Hours
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  Monday - Friday: 9:00 AM - 6:00 PM (IST / PKT)
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Need Help? — right rail, sticky on desktop */}
        <aside className="overflow-hidden rounded-card border border-hairline bg-surface md:sticky md:top-6 md:self-start">
          <div className="flex items-center gap-2 bg-gradient-to-r from-primary to-[#0F766E] px-4 py-4 md:px-6">
            <FileText className="size-5 shrink-0 text-white" aria-hidden="true" />
            <h2 className="text-base font-semibold text-white md:text-lg">
              Need Help?
            </h2>
          </div>

          <div className="flex flex-col p-4 md:p-6">
            <h3 className="text-sm font-semibold text-text-primary">
              Need Help or Want to Share Feedback?
            </h3>
            <p className="mt-2 text-sm text-text-secondary">
              For the following requests, please fill out our support form:
            </p>

            <ul className="mt-4 flex flex-col gap-2.5">
              {REQUEST_TYPES.map(({ label, icon: Icon }) => (
                <li key={label} className="flex items-center gap-3 text-sm text-text-primary">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>

            <p className="mt-4 text-xs text-text-muted">
              Our team will review your submission and get back to you as soon
              as possible.
            </p>

            <Button className="mt-4 w-full" onClick={() => setModalOpen(true)}>
              <Send aria-hidden="true" />
              Open Support Form
            </Button>

            <div className="mt-4 rounded-card border border-hairline bg-app p-4">
              <p className="text-xs font-semibold text-text-primary">
                How to Submit a Request
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-text-secondary">
                <li>Click Open Support Form</li>
                <li>Select the type of request</li>
                <li>Fill in the required details</li>
                <li>Submit the form</li>
                <li>Our team will review and respond</li>
              </ol>
            </div>
          </div>
        </aside>
      </div>

      <SupportModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmitted={() =>
          flash("Support request submitted — we will reply soon")
        }
      />

      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-card bg-slate-900 px-3.5 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          <Check className="size-4 text-emerald-400" aria-hidden="true" />
          {toast}
        </div>
      )}
    </div>
  );
}