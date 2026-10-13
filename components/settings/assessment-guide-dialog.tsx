"use client";

import { useState } from "react";
import {
  BookOpen,
  Check,
  Download,
  FolderCog,
  Gauge,
  HelpCircle,
  ListChecks,
  Power,
  Send,
  Sparkles,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type SectionId =
  | "overview"
  | "categories"
  | "start"
  | "questions"
  | "scoring"
  | "interpretation"
  | "activate"
  | "faq";

const SECTIONS: { id: SectionId; icon: typeof BookOpen; label: string }[] = [
  { id: "overview", icon: BookOpen, label: "Overview" },
  { id: "categories", icon: FolderCog, label: "1 · Categories" },
  { id: "start", icon: Download, label: "2 · Start a template" },
  { id: "questions", icon: ListChecks, label: "3 · Questions" },
  { id: "scoring", icon: Gauge, label: "4 · Scoring" },
  { id: "interpretation", icon: Sparkles, label: "5 · AI interpretation" },
  { id: "activate", icon: Power, label: "6 · Activate & use" },
  { id: "faq", icon: HelpCircle, label: "Tips & FAQ" },
];

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-[12.5px] leading-relaxed text-text-secondary">
          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Callout({ tone = "info", children }: { tone?: "info" | "warn"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "rounded-control border px-3 py-2 text-[12px] leading-relaxed",
        tone === "warn"
          ? "border-status-warning/30 bg-status-warning/5 text-text-secondary"
          : "border-primary/20 bg-primary/5 text-text-secondary",
      )}
    >
      {children}
    </p>
  );
}

function TypeCard({
  name,
  tag,
  best,
  example,
}: {
  name: string;
  tag: string;
  best: string;
  example: string;
}) {
  return (
    <div className="rounded-card border border-hairline bg-app p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-bold text-text-primary">{name}</p>
        <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-primary">
          {tag}
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{best}</p>
      <p className="mt-1 text-[11.5px] italic text-ink-faint">e.g. {example}</p>
    </div>
  );
}

export function AssessmentGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [section, setSection] = useState<SectionId>("overview");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" className="h-[85vh] max-w-4xl p-0">
        <DialogHeader className="border-b border-hairline px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen className="size-4 text-primary" aria-hidden="true" />
            Assessment Library guide
          </DialogTitle>
          <DialogDescription>
            A step-by-step walkthrough: build a questionnaire, score it, and use it with patients.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <nav className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-hairline p-3 sm:flex">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex items-center gap-2 rounded-control px-2.5 py-2 text-left text-[12.5px] font-semibold transition-colors",
                  section === item.id
                    ? "bg-primary/10 text-primary"
                    : "text-text-secondary hover:bg-skeleton hover:text-text-primary",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex gap-1 overflow-x-auto border-b border-hairline p-2 sm:hidden">
              {SECTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "shrink-0 rounded-pill px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                    section === item.id
                      ? "bg-primary text-white"
                      : "bg-app text-text-secondary",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {section === "overview" && (
                <div className="space-y-4">
                  <h2 className="text-[15px] font-bold text-text-primary">
                    What is the Assessment Library?
                  </h2>
                  <p className="text-[12.5px] leading-relaxed text-text-secondary">
                    It is your clinic&rsquo;s own set of psychological questionnaires. Each one
                    is a <strong>template</strong> with questions, a scoring method and severity
                    bands. Build one here, then use it two ways:
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <div className="rounded-card border border-hairline bg-app p-3">
                      <p className="text-[12.5px] font-bold text-text-primary">In the clinic</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
                        Log a score against the patient in the Psychology workspace &rarr;
                        Psychometrics tab.
                      </p>
                    </div>
                    <div className="rounded-card border border-hairline bg-app p-3">
                      <p className="text-[12.5px] font-bold text-text-primary">With the patient</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
                        Send a secure link; the patient answers on their phone and the score comes
                        back automatically.
                      </p>
                    </div>
                  </div>
                  <h3 className="text-[13px] font-bold text-text-primary">The flow in one line</h3>
                  <p className="rounded-card border border-hairline bg-app p-3 text-[12px] font-medium text-text-secondary">
                    Category &rarr; Template &rarr; Questions &rarr; Scoring &rarr; AI rules &rarr;
                    Activate &rarr; Use / Send
                  </p>
                  <Callout>
                    You do not need to build the standard tests yourself — use{" "}
                    <strong>Import</strong> to copy PHQ-9, GAD-7, BDI-II, PCL-5 and more in one
                    click, then edit if you wish.
                  </Callout>
                </div>
              )}

              {section === "categories" && (
                <div className="space-y-4">
                  <h2 className="text-[15px] font-bold text-text-primary">
                    Step 1 · Organise with categories
                  </h2>
                  <p className="text-[12.5px] leading-relaxed text-text-secondary">
                    Categories are folders that keep the list tidy. They are optional, but helpful
                    once you have several tests.
                  </p>
                  <Bullets
                    items={[
                      "Go to Settings → Clinical Settings → Assessment Library.",
                      "Click Edit categories, then add names like Anxiety, Depression, ADHD & Attention, Trauma.",
                      "Each template is filed under one category (or left Uncategorised).",
                      "Filter templates by category using the chips above the list.",
                    ]}
                  />
                </div>
              )}

              {section === "start" && (
                <div className="space-y-4">
                  <h2 className="text-[15px] font-bold text-text-primary">
                    Step 2 · Start a template
                  </h2>
                  <div className="space-y-2.5">
                    <div className="rounded-card border border-hairline bg-app p-3">
                      <p className="text-[12.5px] font-bold text-text-primary">
                        Option A · Import a standard instrument
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
                        Copies a ready-made test (questions + scoring + bands) into your library so
                        you can use and edit it. Best when a published test already fits.
                      </p>
                    </div>
                    <div className="rounded-card border border-hairline bg-app p-3">
                      <p className="text-[12.5px] font-bold text-text-primary">
                        Option B · Create assessment
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
                        Starts a blank template for your own questionnaire, rating scale or
                        checklist.
                      </p>
                    </div>
                  </div>
                  <Callout>
                    New templates save as <strong>Draft</strong> (hidden from use) until you
                    activate them.
                  </Callout>
                </div>
              )}

              {section === "questions" && (
                <div className="space-y-4">
                  <h2 className="text-[15px] font-bold text-text-primary">
                    Step 3 · Write your questions
                  </h2>
                  <p className="text-[12.5px] leading-relaxed text-text-secondary">
                    Each question has a <strong>type</strong>, {""}
                    <strong>options</strong> (a label and a numeric value), and an Optional toggle.
                    The type decides how the patient answers and how it scores — so pick the one
                    that matches the test.
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <TypeCard
                      name="Single choice"
                      tag="Pick one"
                      best="Likert scales and severity/frequency items. The patient picks exactly one option; the score is that option's value."
                      example="“Little interest or pleasure?” → Not at all / Several days / More than half the days / Nearly every day"
                    />
                    <TypeCard
                      name="Scale"
                      tag="Pick one"
                      best="A single point on a numeric scale. Works like single choice; give options for each point."
                      example="Pain today → 0 · 1 · 2 · … · 10"
                    />
                    <TypeCard
                      name="Multiple choice"
                      tag="Pick many"
                      best="Symptom checklists and “select all that apply”. The score is the SUM of every selected option's value."
                      example="“Which apply to you?” → Sleep problems, Low appetite, Fatigue"
                    />
                    <TypeCard
                      name="Free text"
                      tag="Typed — not scored"
                      best="Open/qualitative answers the clinician reads. Never scored, and it blocks the online patient link."
                      example="“Describe your sleep in your own words.”"
                    />
                  </div>
                  <Callout tone="warn">
                    Tip: give every option a <strong>value</strong> (0, 1, 2, 3…). Consistency across
                    questions is what makes the total score meaningful.
                  </Callout>
                </div>
              )}

              {section === "scoring" && (
                <div className="space-y-4">
                  <h2 className="text-[15px] font-bold text-text-primary">
                    Step 4 · Set up scoring
                  </h2>
                  <ul className="space-y-2 text-[12.5px] leading-relaxed text-text-secondary">
                    <li>
                      <strong className="text-text-primary">Sum</strong> — adds every answer. The
                      usual choice, and the only method allowed for online patient links (e.g.
                      PHQ-9).
                    </li>
                    <li>
                      <strong className="text-text-primary">Average</strong> — mean of the answered
                      items. Use when items are on the same scale and you want an average.
                    </li>
                    <li>
                      <strong className="text-text-primary">Manual</strong> — no automatic score;
                      the clinician enters it. For clinician-scored tools.
                    </li>
                  </ul>
                  <h3 className="text-[13px] font-bold text-text-primary">Max score</h3>
                  <p className="text-[12.5px] leading-relaxed text-text-secondary">
                    The ceiling of the test (e.g. 27 for PHQ-9). It bounds the score input and the
                    trend bar in the patient&rsquo;s history.
                  </p>
                  <h3 className="text-[13px] font-bold text-text-primary">Severity bands</h3>
                  <p className="text-[12.5px] leading-relaxed text-text-secondary">
                    Ranges that map a score to a label, e.g. 0&ndash;4 Minimal, 5&ndash;9 Mild,
                    10&ndash;14 Moderate. The severity field fills itself from these, so the
                    clinician does not retype it.
                  </p>
                  <Callout tone="warn">
                    Bands must be <strong>ascending and non-overlapping</strong> (no gaps, no
                    overlaps) — otherwise they will not save.
                  </Callout>
                </div>
              )}

              {section === "interpretation" && (
                <div className="space-y-4">
                  <h2 className="text-[15px] font-bold text-text-primary">
                    Step 5 · AI interpretation rules
                  </h2>
                  <p className="text-[12.5px] leading-relaxed text-text-secondary">
                    Rules are short guidance texts mapped to a score range, e.g.{" "}
                    <em>“10&ndash;14 Moderate: discuss sleep and activity scheduling.”</em>
                  </p>
                  <Bullets
                    items={[
                      "Add one rule per score range that matters for your practice.",
                      "When a result comes in, open the row in Psychometrics and click AI interpretation.",
                      "The assistant writes a short clinician-facing summary from this rule + the severity + the answers.",
                      "If the assistant is unavailable, the authored rule text is shown on its own.",
                    ]}
                  />
                  <Callout>
                    The interpretation is decision support for the clinician — not a diagnosis, and
                    it is never shown to the patient.
                  </Callout>
                </div>
              )}

              {section === "activate" && (
                <div className="space-y-4">
                  <h2 className="text-[15px] font-bold text-text-primary">
                    Step 6 · Activate &amp; use it
                  </h2>
                  <p className="text-[12.5px] leading-relaxed text-text-secondary">
                    Move the template from <strong>Draft</strong> to{" "}
                    <strong>Active</strong> from its “More” menu. Active templates appear in two
                    places:
                  </p>
                  <div className="space-y-2.5">
                    <div className="rounded-card border border-hairline bg-app p-3">
                      <p className="flex items-center gap-2 text-[12.5px] font-bold text-text-primary">
                        <Gauge className="size-4 text-primary" aria-hidden="true" />
                        Psychology → Psychometrics
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
                        Pick it in the Assessment list, enter the score (severity auto-fills), and
                        record. Scores build a trend history.
                      </p>
                    </div>
                    <div className="rounded-card border border-hairline bg-app p-3">
                      <p className="flex items-center gap-2 text-[12.5px] font-bold text-text-primary">
                        <Send className="size-4 text-primary" aria-hidden="true" />
                        Send patient links
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
                        Choose it in the Send assessment dropdown and send over WhatsApp. The
                        patient answers on their phone and the score returns automatically.
                      </p>
                    </div>
                  </div>
                  <Callout>
                    A template shows an <strong>Online</strong> badge only when it can be sent to
                    patients (see FAQ).
                  </Callout>
                </div>
              )}

              {section === "faq" && (
                <div className="space-y-4">
                  <h2 className="text-[15px] font-bold text-text-primary">Tips &amp; FAQ</h2>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[12.5px] font-bold text-text-primary">
                        Why doesn&rsquo;t my template show an “Online” badge?
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                        Online needs all three: status Active, scored with the Sum method, and at
                        least one non-free-text question. Remove free-text items for sendable tests.
                      </p>
                    </div>
                    <div>
                      <p className="text-[12.5px] font-bold text-text-primary">
                        Severity isn&rsquo;t auto-filling.
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                        Add ascending, non-overlapping bands in Step 4, then save.
                      </p>
                    </div>
                    <div>
                      <p className="text-[12.5px] font-bold text-text-primary">
                        Can I edit a test after using it?
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                        Yes. Past recorded results keep their own name and score; only the template
                        moves forward.
                      </p>
                    </div>
                    <div>
                      <p className="text-[12.5px] font-bold text-text-primary">
                        Who can build tests?
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                        Owners and admins. All clinic members can use active tests in the workspace.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
