"use client";

import {
  Bell,
  CheckCheck,
  Lightbulb,
  MessageSquareText,
  MoreVertical,
  PhoneCall,
  Plus,
  Send,
  Smile,
  Star,
} from "lucide-react";

const SAMPLE = {
  patientName: "Rahul Sharma",
  doctorName: "Dr. Sarah Jenkins",
};

/**
 * Renders a live WhatsApp bubble from a template draft ({variable} tokens are
 * replaced with sample values for the preview). Matches the reference phone
 * frame: WhatsApp-brand header + wallpaper inside the preview only — the rest
 * of the page stays on the system's primary teal.
 */
function renderPreview(text: string, clinicName: string): string {
  const location = clinicName;
  return text
    .replace(/\{patient_name\}/g, SAMPLE.patientName)
    .replace(/\{doctor_name\}/g, SAMPLE.doctorName)
    .replace(/\{clinic_name\}/g, clinicName)
    .replace(/\{clinic_location\}/g, location)
    .replace(/\{appointment_date\}/g, "Tue, Sep 1")
    .replace(/\{appointment_time\}/g, "9:30 AM");
}

type WhatsappPreviewProps = {
  message: string;
  clinicName: string;
};

export function WhatsappPreview({ message, clinicName }: WhatsappPreviewProps) {
  const preview = renderPreview(message, clinicName);

  return (
    <div>
      {/* Cover strip */}
      <div className="flex items-center justify-between gap-3 rounded-t-card bg-gradient-to-r from-primary to-[#0F766E] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">WhatsApp Live Preview</p>
          <p className="mt-0.5 text-xs text-white/75">Shown to patients in real time</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
          <span className="size-1.5 animate-pulse rounded-pill bg-white" />
          Live
        </span>
      </div>

      <div className="rounded-b-card border border-hairline bg-app/60 p-4 pb-5">
        {/* Phone shell */}
        <div className="mx-auto w-[264px] rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 p-1.5 shadow-dropdown">
          <div className="overflow-hidden rounded-[1.4rem] bg-skeleton/40">
            {/* WhatsApp header (brand, inside the preview only) */}
            <div className="flex items-center justify-between bg-[#008069] px-3 py-2 text-white">
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-pill bg-white/40" aria-hidden="true" />
                <p className="text-[11px] font-semibold">Patient Dashboard</p>
              </div>
              <div className="flex items-center gap-2 text-white/90">
                <PhoneCall className="size-3" aria-hidden="true" />
                <MoreVertical className="size-3" aria-hidden="true" />
              </div>
            </div>

            {/* Chat wallpaper: the dotted reference backdrop */}
            <div
              className="h-[480px] overflow-y-auto p-3"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(15,23,42,0.10) 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            >
              <div className="mb-2 text-center">
                <span className="rounded-pill bg-white/90 px-2 py-0.5 text-[9px] font-medium text-text-muted shadow-sm">
                  Today · 11:24 AM
                </span>
              </div>
              <div className="ml-auto w-fit max-w-[88%] rounded-xl rounded-tr-sm bg-[#DCF8C6] px-3 py-2 shadow-sm">
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-800">
                  {preview}
                </p>
                <p className="mt-1 flex items-center justify-end gap-1 text-right text-[9px] text-slate-500">
                  11:24 AM
                  <CheckCheck className="size-3" aria-hidden="true" />
                </p>
              </div>
              {/* The reference's review-request action chip */}
              <div className="ml-auto mt-2 flex w-fit flex-col items-end">
                <span className="rounded-lg bg-primary px-3 py-1.5 text-[10px] font-semibold text-white shadow-sm">
                  Send Review Request
                </span>
                <span className="mt-1 flex items-center gap-1 text-[9px] text-text-muted underline">
                  <Star className="size-2.5 text-amber-400" aria-hidden="true" />
                  see what patients received
                </span>
              </div>
            </div>

            {/* Input bar */}
            <div className="flex items-center gap-2 bg-skeleton/50 px-3 py-2">
              <span className="flex size-6 items-center justify-center rounded-pill bg-white text-text-muted">
                <Plus className="size-3" aria-hidden="true" />
              </span>
              <div className="h-7 flex-1 rounded-pill bg-white/90" />
              <span className="flex size-6 items-center justify-center rounded-pill bg-white text-text-muted">
                <Smile className="size-3" aria-hidden="true" />
              </span>
              <span className="flex size-6 items-center justify-center rounded-pill bg-primary text-white">
                <Send className="size-3" aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Why WhatsApp Engagement — dark primary card */}
      <div className="mt-4 rounded-card bg-gradient-to-br from-primary to-[#134E4A] p-5 text-white shadow-card">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-control bg-white/10 text-white">
            <MessageSquareText className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Why WhatsApp Engagement?</h3>
            <p className="text-xs text-white/75">Meet patients where they already chat</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { value: "4,600+", label: "messages sent monthly" },
            { value: "2–3x", label: "more reply rate than email" },
            { value: "Real-time", label: "interactive updates" },
            { value: "1-on-1", label: "personal conversations" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-control bg-white/10 p-2.5">
              <p className="text-base font-bold leading-tight text-[#F0FDFA]">{stat.value}</p>
              <p className="mt-0.5 text-[11px] text-white/80">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pro tips */}
      <div className="mt-4 rounded-card border border-hairline bg-surface p-5 shadow-card">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-control bg-primary/10 text-primary">
            <Lightbulb className="size-5" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary">Pro Tips</h3>
        </div>
        <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-text-secondary">
          <li className="flex gap-2">
            <Bell className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Include <code className="rounded bg-skeleton px-1 py-0.5 font-mono text-[11px] text-text-primary">{"{appointment_time}"}</code> in
              reminders — specific times cut no-shows the most.
            </span>
          </li>
          <li className="flex gap-2">
            <Star className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              The review link works best right after a visit — keep the 24-hour delay.
            </span>
          </li>
          <li className="flex gap-2">
            <CheckCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              Store numbers with a country code, e.g.{" "}
              <code className="rounded bg-skeleton px-1 py-0.5 font-mono text-[11px] text-text-primary">
                +92 3xx xxxxxxx
              </code>
              , for the fastest delivery.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}