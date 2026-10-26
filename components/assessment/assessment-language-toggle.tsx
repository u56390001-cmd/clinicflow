"use client";

import { LANG_ORDER, languageLabel, type AssessmentLanguage } from "@/lib/assessments/translations";
import { cn } from "@/lib/utils";

/**
 * Patient-side 3-way language switcher: `[ English | اردو | Roman Urdu ]`.
 *
 * Mounted at the top-right of the assessment form and mobile wizard. Switching
 * is pure presentation state — it re-renders labels but never touches the
 * numeric answers, so a patient can flip languages mid-questionnaire without
 * losing a single tap.
 */
export function AssessmentLanguageToggle({
  value,
  onChange,
  className,
}: {
  value: AssessmentLanguage;
  onChange: (lang: AssessmentLanguage) => void;
  className?: string;
}) {
  return (
    <div
      dir="ltr"
      role="group"
      aria-label="Language"
      className={cn(
        "sticky top-2 z-20 ms-auto w-fit rounded-pill border border-hairline bg-white/95 p-1 shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center">
        {LANG_ORDER.map((lang) => {
          const isSelected = lang === value;
          return (
            <button
              key={lang}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(lang)}
              className={cn(
                "rounded-pill px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                lang === "ur" && "font-urdu text-[11px] leading-loose",
                isSelected
                  ? "bg-primary text-white"
                  : "text-text-secondary hover:text-primary",
              )}
            >
              {languageLabel(lang)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
