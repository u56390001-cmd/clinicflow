"use client";

import { useEffect, useRef, useState } from "react";
import {
  ClipboardPen,
  FileSignature,
  Printer,
  ScrollText,
  Video,
  Upload as UploadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  getClinicLetterheadAction,
  getCurrentClinicianInfoAction,
} from "@/lib/actions/specialty-workspaces";
import { clinicLogoPublicUrl } from "@/lib/clinic-logo-url";

/** Letterhead facts, identical to the assessment print report's shape. */
type Letterhead = {
  name: string;
  phone: string | null;
  address: string | null;
  logoPath: string | null;
};

export type ConsentPatientInfo = {
  name: string;
  patientCode: string | null;
  dateOfBirth: string | null;
  gender: string | null;
};

type ConsentTemplateId = "general_treatment" | "tele_therapy" | "roi";

const CONSENT_TEMPLATES: {
  id: ConsentTemplateId;
  label: string;
  description: string;
  icon: typeof ClipboardPen;
  title: string;
  intro: string;
  terms: string[];
  urduNote: string;
  extras: string[];
}[] = [
  {
    id: "general_treatment",
    label: "General Treatment Consent",
    description: "In-clinic psychological treatment, confidentiality & fees",
    icon: ClipboardPen,
    title: "Consent for General Psychological Treatment",
    intro:
      "I, the undersigned (or the parent/legal guardian of the named patient), consent to psychological assessment and treatment provided by this clinic.",
    terms: [
      "I understand that psychological treatment involves discussion of personal and sensitive information. Sessions are confidential within the limits permitted by law.",
      "Confidentiality may be broken only where required by law: imminent risk of serious harm to myself or another person, suspected abuse of a child or vulnerable adult, or a valid court order.",
      "Session notes, assessment scores and consent forms form part of my medical record. They may be reviewed by the clinic's treating team and auditors bound by confidentiality.",
      "I understand fees are payable per session and that appointments missed without adequate notice may be billed according to clinic policy.",
      "I may withdraw this consent at any time in writing. Withdrawal ends future treatment but does not erase records already lawfully created.",
    ],
    urduNote:
      "یہ فارم آپ کے علاج، رازداری اور آپ کے حقوق کی وضاحت کرتا ہے۔ پڑھ کر اطمینان کے ساتھ دستخط کریں۔",
    extras: [],
  },
  {
    id: "tele_therapy",
    label: "Tele-Therapy Consent",
    description: "Online/video sessions, emergencies & technology limits",
    icon: Video,
    title: "Consent for Tele-Therapy & Online Sessions",
    intro:
      "I consent to receiving psychological sessions by secure video call or telephone instead of, or in addition to, in-clinic attendance.",
    terms: [
      "Sessions may be conducted through the clinic's approved video or phone channels. I understand the technology can fail, and that a session may continue by phone or be rescheduled.",
      "I confirm that I will join each session from a safe, private location, and I am responsible for my own audio privacy (headphones recommended).",
      "Tele-therapy is not suitable for a crisis. In an emergency I will contact my local emergency services or the clinic's emergency line; my clinician will tell me both numbers.",
      "If my clinician believes I am at imminent risk of harming myself or another person, they may contact the emergency services or my listed emergency contact, and may share only the minimum information needed.",
      "The confidentiality terms of in-clinic treatment apply in full to tele-therapy.",
    ],
    urduNote:
      "آن لائن سیشن کے فوائد، حدود اور ایمرجنسی طریقہ کار اس فارم میں بیان کیے گئے ہیں۔",
    extras: [
      "Emergency contact name & relationship: ______________________________",
      "Emergency contact phone: ______________________________",
    ],
  },
  {
    id: "roi",
    label: "Release of Information (ROI)",
    description: "Authorize sharing records with another party",
    icon: FileSignature,
    title: "Release of Information Authorization",
    intro:
      "I authorize this clinic to disclose the medical records described below to the person or institution named here.",
    terms: [
      "I understand the information released is confidential, becomes the receiver's responsibility, and requires my new consent for any onward release.",
      "I may revoke this authorization in writing at any time, except for disclosures already made in reliance on it.",
      "This authorization expires on the date below, or when the stated purpose is fulfilled, whichever comes first.",
      "This clinic cannot control what the receiving party does with records once released.",
    ],
    urduNote:
      "اس رضامندی سے آپ کی طبی معلومات درج ذیل ادارے کو فراہم کی جائیں گی۔ آپ جب چاہیں تحریری طور پر اسے واپس لے سکتے ہیں۔",
    extras: [
      "Disclose to (name & institution): ____________________________________",
      "Purpose of disclosure: ____________________________________",
      "Records to disclose:  ☐ Psychiatric notes   ☐ Assessments   ☐ Lab reports   ☐ Prescriptions   ☐ Other: ____________",
      "This authorization is valid until: ____________________",
    ],
  },
];

/**
 * 📜 Built-in clinic consent form generator.
 *
 * Picks a standard template, fills it from the patient file and the clinic
 * letterhead, and renders a print surface (same mount-then-print pattern as
 * the assessment report). Printing is the signature step — the signed paper
 * is scanned back in and archived by the uploader with the `consents_legal`
 * category, which keeps the clinic's consent trail inside patient_documents.
 */
export function ConsentFormGenerator({
  patientInfo,
  disabled = false,
  onUnsignedCopyUpload,
}: {
  patientInfo: ConsentPatientInfo | null;
  disabled?: boolean;
  /** Called when the clinician wants to archive the signed copy (scanner time). */
  onUnsignedCopyUpload?: () => void;
}) {
  const [template, setTemplate] = useState<ConsentTemplateId | null>(null);
  const [letterhead, setLetterhead] = useState<Letterhead | null>(null);
  const [clinician, setClinician] = useState("");
  const [loading, setLoading] = useState(false);

  const open = template !== null;

  // Load clinic branding once per component lifetime; the actions are guarded
  // server-side. States are read through refs so the fetch fires exactly once.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    setLoading(true);
    Promise.all([getClinicLetterheadAction(), getCurrentClinicianInfoAction()])
      .then(([lh, cl]) => {
        if (cancelled) return;
        if (lh.ok) setLetterhead(lh.data);
        if (cl.ok) setClinician(cl.data.name);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const active = CONSENT_TEMPLATES.find((t) => t.id === template) ?? null;
  const logoUrl = clinicLogoPublicUrl(letterhead?.logoPath ?? null);
  const today = new Date().toISOString().slice(0, 10);

  const age = (() => {
    if (!patientInfo?.dateOfBirth) return null;
    const born = new Date(patientInfo.dateOfBirth);
    if (Number.isNaN(born.getTime())) return null;
    const now = new Date();
    let years = now.getFullYear() - born.getFullYear();
    if (
      now.getMonth() < born.getMonth() ||
      (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())
    ) {
      years -= 1;
    }
    return years >= 0 && years < 130 ? `${years} yrs` : null;
  })();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={disabled}>
            <ScrollText aria-hidden="true" />
            Generate Consent Form
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Standard clinic consents</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {CONSENT_TEMPLATES.map((t) => {
            const Icon = t.icon;
            return (
              <DropdownMenuItem key={t.id} onClick={() => setTemplate(t.id)}>
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
                <span className="flex flex-col">
                  <span className="font-medium">{t.label}</span>
                  <span className="text-[11px] text-text-muted">{t.description}</span>
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {active && (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (!next) setTemplate(null);
          }}
        >
          <DialogContent size="wide" className="max-h-[92vh] gap-0 p-0">
            <DialogHeader className="border-b border-hairline px-4 py-3">
              <DialogTitle className="flex items-center gap-2 pr-6 text-sm font-semibold">
                <active.icon aria-hidden="true" className="size-4 text-primary" />
                {active.title}
              </DialogTitle>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-auto bg-app/60 p-4">
              {loading && (
                <p className="mb-3 flex items-center gap-2 text-xs text-text-muted">
                  <Spinner size="sm" /> Loading clinic letterhead…
                </p>
              )}
              <div id="consent-print-area" className="consent-print-surface rounded-card border border-hairline bg-white p-8">
                <style>{`
                  @media print {
                    .consent-print-surface { display: block !important; }
                    body * { visibility: hidden; }
                    .consent-print-surface, .consent-print-surface * { visibility: visible; }
                    .consent-print-surface {
                      position: absolute;
                      left: 0;
                      top: 0;
                      width: 100%;
                      border: none !important;
                      padding: 36px 40px;
                      background: white;
                      print-color-adjust: exact;
                      -webkit-print-color-adjust: exact;
                    }
                  }
                `}</style>

                {/* Letterhead */}
                <div className="mb-6 border-b-2 border-black pb-4">
                  <div className="flex items-center gap-3">
                    {logoUrl && (
                      <img src={logoUrl} alt="" className="h-14 w-14 border border-black/20 object-contain" />
                    )}
                    <div className="min-w-0">
                      <h2 className="text-base font-extrabold uppercase tracking-widest text-black">
                        {letterhead?.name ?? "Clinic"}
                      </h2>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-black/60">
                        {[letterhead?.phone, letterhead?.address].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Patient block */}
                <div className="mb-4 grid grid-cols-3 gap-3 text-[12px] text-black">
                  <span><strong>Patient:</strong> {patientInfo?.name ?? "—"}</span>
                  <span><strong>UHID:</strong> {patientInfo?.patientCode ?? "—"}</span>
                  <span><strong>Age/Gender:</strong> {age ?? "—"} / {patientInfo?.gender ?? "—"}</span>
                  <span><strong>Date:</strong> {today}</span>
                  <span><strong>Clinician:</strong> {clinician || "—"}</span>
                  <span><strong>Location:</strong> {letterhead?.address?.split(",")[0] ?? "In-clinic"}</span>
                </div>

                <h3 className="mb-3 text-center text-base font-bold text-black">{active.title}</h3>
                <p className="mb-3 text-[12.5px] leading-relaxed text-black">{active.intro}</p>

                <ol className="mb-4 list-decimal space-y-2 pl-5 text-[12.5px] leading-relaxed text-black">
                  {active.terms.map((term) => (
                    <li key={term.slice(0, 24)}>{term}</li>
                  ))}
                </ol>

                {active.extras.length > 0 && (
                  <div className="mb-4 space-y-2 text-[12.5px] leading-relaxed text-black">
                    {active.extras.map((extra) => (
                      <p key={extra.slice(0, 24)}>{extra}</p>
                    ))}
                  </div>
                )}

                <p className="mb-6 border border-black/20 rounded px-3 py-2 text-center text-[12px] italic leading-relaxed text-black/80" dir="rtl">
                  {active.urduNote}
                </p>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-8 text-black">
                  <div>
                    <p className="mb-6 h-px bg-black"> </p>
                    <p className="text-sm font-semibold">Patient / Guardian signature</p>
                    <p className="mt-2 text-[12px]">Date: ____________________</p>
                  </div>
                  <div>
                    <p className="mb-6 h-px bg-black"> </p>
                    <p className="text-sm font-semibold">Witness signature</p>
                    <p className="mt-2 text-[12px]">Name: ____________________</p>
                    <p className="text-[12px]">Date: ____________________</p>
                  </div>
                </div>
                <div className="mt-6 border-t border-black/20 pt-3 text-right">
                  <p className="text-[12px] font-semibold">{clinician || "Clinician"}</p>
                  <p className="text-[11px] text-black/60">Treating clinician · license/credential: ____________________</p>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-hairline px-4 py-3">
              <span className="mr-auto hidden text-[11px] text-text-muted sm:block">
                After the signed copy comes back, scan it and file it under
                &ldquo;Consents &amp; Legal&rdquo; so it stays with this patient&apos;s record.
              </span>
              {onUnsignedCopyUpload && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTemplate(null);
                    onUnsignedCopyUpload();
                  }}
                >
                  <UploadIcon aria-hidden="true" />
                  File signed copy
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={!active}
                onClick={() => window.print()}
              >
                <Printer aria-hidden="true" />
                Print / Save as PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
