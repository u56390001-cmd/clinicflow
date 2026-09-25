import { randomUUID } from "node:crypto";

/**
 * Knowledge-entry shape stored in `clinic_ai_settings.faqs` (jsonb array).
 * `active` entries are the only ones the AI ever sees; `is_custom` marks
 * doctor-authored FAQs as opposed to platform-provided starter templates.
 */
export type FaqKnowledgeEntry = {
  id: string;
  question: string;
  answer: string;
  active: boolean;
  is_custom: boolean;
};

/**
 * Parse the raw jsonb value into typed FAQ entries. Tolerates legacy rows
 * saved before migration 0015 ({question, answer} only): missing ids are
 * generated, missing flags default to active/custom. Entries with an empty
 * question or answer are dropped.
 */
export function parseFaqEntries(raw: unknown): FaqKnowledgeEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: FaqKnowledgeEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const question =
      typeof record.question === "string" ? record.question.trim() : "";
    const answer =
      typeof record.answer === "string" ? record.answer.trim() : "";
    if (!question || !answer) continue;
    entries.push({
      id:
        typeof record.id === "string" && record.id.trim()
          ? record.id
          : randomUUID(),
      question,
      answer,
      active: record.active !== false,
      is_custom: record.is_custom !== false,
    });
  }
  return entries;
}

/** Only active FAQs count as clinic knowledge for the AI. */
export function activeFaqEntries(raw: unknown): FaqKnowledgeEntry[] {
  return parseFaqEntries(raw).filter((entry) => entry.active);
}
