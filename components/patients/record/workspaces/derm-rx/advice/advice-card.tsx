"use client";

/**
 * Advice card — quick-phrase chips in three languages toggle into the save
 * row's `patient_education`, drug-aware Suggestions append with a "Suggested"
 * badge until used, and the application instructions live here too. All text
 * flows to WhatsApp and the print sheet through the same DB columns the
 * legacy builder used.
 */

import { useState } from "react";
import { ClipboardCheck, Lightbulb } from "lucide-react";

import type { RxItem } from "../schema/rx-item";
import { suggestNotes, type AdviceSuggestion } from "./suggestions";

type AdviceLang = "en" | "roman" | "urdu";

const ADVICE_LANGS: { key: AdviceLang; label: string }[] = [
  { key: "en", label: "🇬🇧 English" },
  { key: "roman", label: "🗣️ Roman Urdu" },
  { key: "urdu", label: "🌐 اردو (Urdu Script)" },
];

const ADVICE_LIBRARY: Record<AdviceLang, { chip: string; text: string }[]> = {
  en: [
    { chip: "🧼 Soap Substitutes Only", text: "Soap substitutes only" },
    { chip: "🌙 Night Application", text: "Night application" },
    { chip: "☀️ SPF 50 Daily", text: "Daily sunscreen SPF 50" },
    { chip: "👕 Cotton Clothing", text: "Wear cotton clothing" },
  ],
  roman: [
    { chip: "🧼 Soap Nahi — Cleanser", text: "Soap nahi — sirf cleanser use karna" },
    { chip: "🌙 Raat Ko Lagana", text: "Raat ko lagana hai" },
    { chip: "☀️ Roz SPF 50", text: "Roz sunscreen SPF 50 lagana hai" },
    { chip: "👕 Sooti Kapde", text: "Sooti (cotton) kapde pehnna" },
  ],
  urdu: [
    { chip: "🧼 صابن نہیں — کلینزر", text: "صابن نہیں، صرف کلینزر استعمال کریں" },
    { chip: "🌙 رات کو لگانا", text: "رات کو لگانا ہے" },
    { chip: "☀️ روز SPF 50", text: "روز سن اسکرین SPF 50 لگانی ہے" },
    { chip: "👕 سوتی کپڑے", text: "سوتی (cotton) کپڑے پہننا" },
  ],
};

export function AdviceCard({
  items,
  diagnosis,
  application,
  education,
  canManage,
  onChangeApplication,
  onChangeEducation,
}: {
  items: RxItem[];
  diagnosis?: string | null;
  application: string;
  education: string;
  canManage: boolean;
  onChangeApplication: (next: string) => void;
  onChangeEducation: (next: string) => void;
}) {
  const [lang, setLang] = useState<AdviceLang>("roman");
  const [usedSuggestions, setUsedSuggestions] = useState<string[]>([]);
  const library = ADVICE_LIBRARY[lang];
  const suggestions: AdviceSuggestion[] = suggestNotes(items, diagnosis);
  const unused = suggestions.filter(
    (s) => !usedSuggestions.includes(s.id),
  );

  const toggleChipText = (text: string) => {
    const parts = education
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const gone = parts.filter(
      (line) => line.toLowerCase() !== text.toLowerCase(),
    );
    const present = parts.some(
      (line) => line.toLowerCase() === text.toLowerCase(),
    );
    onChangeEducation(
      present ? gone.join("\n") : [...gone, text].join("\n"),
    );
  };

  const appendEducation = (text: string) => {
    const parts = education
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!parts.some((line) => line.toLowerCase() === text.toLowerCase())) {
      onChangeEducation([...parts, text].join("\n"));
    }
  };

  return (
    <div className="rounded-xl border border-card-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-card-line px-3.5 py-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Advice &amp; instructions
        </p>
        <div className="flex flex-wrap gap-1">
          {ADVICE_LANGS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={lang === option.key}
              onClick={() => setLang(option.key)}
              className={
                "rounded-lg border px-2 py-1 text-[11px] transition-colors " +
                (lang === option.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-hairline text-text-muted hover:text-text-primary")
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2.5 p-3.5">
        <div>
          <label
            htmlFor="derm-rx-application"
            className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-muted"
          >
            Application (how to use)
          </label>
          <textarea
            id="derm-rx-application"
            value={application}
            disabled={!canManage}
            onChange={(event) => onChangeApplication(event.target.value)}
            rows={2}
            placeholder="Thin layer, gently — 15 min baad moisturiser"
            className="w-full rounded-lg border border-input-border bg-surface px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted/60 focus-visible:outline-2 focus-visible:outline-primary/50"
          />
        </div>
        {library.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {library.map((entry) => {
              const active = education
                .toLowerCase()
                .includes(entry.text.toLowerCase());
              return (
                <button
                  key={entry.chip}
                  type="button"
                  aria-pressed={active}
                  disabled={!canManage}
                  onClick={() => toggleChipText(entry.text)}
                  className={
                    "rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-colors " +
                    (active
                      ? "border-primary bg-primary text-white"
                      : "border-hairline bg-surface text-text-muted hover:text-text-primary")
                  }
                  title={`${entry.chip} → ${entry.text}`}
                  aria-label={entry.chip}
                >
                  {entry.chip}
                </button>
              );
            })}
          </div>
        ) : null}
        <div>
          <label
            htmlFor="derm-rx-education"
            className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-muted"
          >
            Patient education
          </label>
          <textarea
            id="derm-rx-education"
            value={education}
            disabled={!canManage}
            onChange={(event) => onChangeEducation(event.target.value)}
            rows={3}
            placeholder="Wafadariki... patient ko yahan line-by-line likhen"
            className="w-full rounded-lg border border-input-border bg-surface px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted/60 focus-visible:outline-2 focus-visible:outline-primary/50"
          />
        </div>
        {unused.length > 0 ? (
          <div className="space-y-1.5 rounded-lg border border-[#e8dcc2] bg-[#fbf7ee] p-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#8a6d1f]">
              <Lightbulb className="h-3.5 w-3.5" />
              Suggested advice
            </p>
            <ul className="space-y-1.5">
              {unused.map((suggestion) => (
                <li
                  key={suggestion.id}
                  className="flex items-start justify-between gap-2"
                >
                  <p className="min-w-0 flex-1 text-xs leading-relaxed text-[#5f4b13]">
                    <span className="mr-1 rounded bg-[#f0e4bf] px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-[#8a6d1f]">
                      Suggested
                    </span>
                    {suggestion.text}
                  </p>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => {
                        appendEducation(suggestion.text);
                        setUsedSuggestions((current) => [
                          ...current,
                          suggestion.id,
                        ]);
                      }}
                      className="shrink-0 rounded-md border border-[#e0cf9a] px-2 py-0.5 text-[11px] font-semibold text-[#8a6d1f] hover:bg-[#f7efd8]"
                    >
                      Add
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
