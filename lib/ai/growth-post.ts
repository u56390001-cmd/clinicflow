/**
 * Growth Agent — Google Business Profile post generation (Phase 24).
 *
 * This module is the only place that builds a prompt for the marketing model.
 * Two consequences of keeping it here rather than in a component:
 *
 *  1. The clinic context that reaches a third party is auditable in one file.
 *     It is the clinic's *public* profile — name, address, listed services,
 *     doctor name — and never patient data. There is no clinical input to this
 *     feature at all, which is deliberate: a marketing post has no business
 *     knowing anything about a person.
 *  2. The commercial guardrails below (no invented offers, no medical claims,
 *     no guarantees) are enforced in the prompt *and* re-checked on the way
 *     out, because a model that ignores an instruction should not be able to
 *     put a fabricated 40%-off offer on a real clinic's public profile.
 *
 * Separate from `lib/ai/system-prompt.ts` (the WhatsApp receptionist) and from
 * `lib/ai/patient-summary.ts` (clinical summarisation) for the same reason
 * those two are separate from each other: three products, three data-
 * sensitivity classes, three prompts.
 */

import { getGeminiProvider } from "@/lib/ai/gemini-provider";
import { resolveProviderForClinic } from "@/lib/ai/provider";
import type { AIProvider } from "@/lib/ai/types";

/** Google's own post field caps at 1500 characters; the DB CHECK matches. */
export const MAX_POST_CHARS = 1500;

/**
 * What we actually ask for. Google truncates a post after roughly three lines
 * in Search and Maps, so a 1200-character post is 900 characters nobody reads.
 * ~420 characters is about three honest lines and keeps the clinic's most
 * important sentence above the fold.
 */
const TARGET_POST_CHARS = 420;

/** Backstop applied after generation, in case the model runs long anyway. */
const HARD_TRIM_CHARS = 1400;

export type GrowthTone = "professional" | "promotional" | "educational";

/** Tone -> the instruction the model gets. Kept as data so the UI and the
 *  prompt can never drift apart by editing one and forgetting the other. */
const TONE_DIRECTION: Record<GrowthTone, string> = {
  professional:
    "Warm and measured, like a practice manager writing to a neighbour. No exclamation marks, no urgency language.",
  promotional:
    "Direct and upbeat about the offer, while still being honest about what it is. No pressure tactics, no countdowns, no 'limited time'.",
  educational:
    "Plain and genuinely useful. Lead with what the reader can do, not with what the clinic wants to sell.",
};

export const GROWTH_POST_SYSTEM_INSTRUCTION = `You write short posts for a clinic's Google Business Profile. The reader is a local person who just searched for a service nearby and is deciding whether to call. They are not a patient and they are not reading carefully.

Rules:
- Plain text only. No markdown, no bold, no hashtags in the body, no emoji, no bullet points, no heading.
- Between 3 and 4 sentences. Aim for around ${TARGET_POST_CHARS} characters. Hard limit ${HARD_TRIM_CHARS}.
- Write about the topic you are given. Do not wander into a second topic.
- Mention the clinic by name once, early. Write the name exactly as supplied.

Hard prohibitions — a clinic's public profile is a regulated surface:
- Never invent an offer, discount, price, freebie, gift, deadline or limited-time claim. If the clinic has not told you a specific offer exists in the brief, you may not imply one. "Ask us about our current whitening packages" is honest; "40% off this month" is fabrication.
- Never state or imply a medical claim, a diagnosis, a cure, a guaranteed result or a safety promise. You are writing about a service, not about anyone's health.
- Never invent a review score, a patient count, an award, an accreditation, a waiting time or an opening hour. Only use facts present in the brief.
- Never use urgency or fear: no "don't wait", no "before it's too late", no "suffering from".
- Do not address the reader's health or assume they have a condition.
- If the brief does not give you the information a sentence needs, cut the sentence. A short true post beats a long padded one.

Write like a person who works at the clinic and is quietly proud of it. Not like an advertisement, and not like a form letter — the same post for every clinic in the city is worse than useless.`;

export type GrowthClinicContext = {
  name: string;
  doctorName: string | null;
  address: string | null;
  phone: string | null;
  /** Names of the clinic's active services, for topical grounding. */
  services: string[];
};

/**
 * Build the brief the model writes from.
 *
 * Exported separately from the call so the exact text that would be sent can be
 * asserted on without invoking a provider.
 */
export function buildGrowthPostBrief(input: {
  clinic: GrowthClinicContext;
  topic: string;
  keywords: string[];
  tone: GrowthTone;
}): string {
  const { clinic, topic, keywords, tone } = input;

  const lines = [
    "CLINIC (public profile facts — do not add to these)",
    `Name: ${clinic.name}`,
    `Address: ${clinic.address ?? "not recorded"}`,
    `Phone: ${clinic.phone ?? "not recorded"}`,
    `Lead clinician: ${clinic.doctorName ?? "not recorded"}`,
    clinic.services.length > 0
      ? `Services this clinic offers: ${clinic.services.join(", ")}`
      : "Services this clinic offers: not recorded",
  ];

  lines.push("", "WRITE A POST ABOUT", topic.trim());

  lines.push(
    "",
    "TONE",
    TONE_DIRECTION[tone] ?? TONE_DIRECTION.professional,
  );

  if (keywords.length > 0) {
    lines.push(
      "",
      "KEYWORDS TO WORK IN",
      // Framed as search terms to cover, not as literal strings to paste. A
      // model told to "include #DentalClinic" writes "#DentalClinic"; a model
      // told the search intent writes a sentence a person would have written.
      keywords
        .map((keyword) => `- ${keyword} (cover the search intent in plain language, do not print the phrase verbatim unless it reads naturally)`)
        .join("\n"),
    );
  }

  lines.push(
    "",
    "Remember: no offer, price or claim that is not written above. If you want to invite an enquiry about a specific deal, invite the enquiry — do not state the deal.",
  );

  return lines.join("\n");
}

/**
 * Post-generation guard.
 *
 * The prompt already forbids invented offers, but a prompt is a request, not a
 * control. This is the control: the post never reaches a queue row, let alone a
 * public profile, carrying a discount the clinic did not authorise.
 *
 * Only *specific* commercial and clinical claims are caught. General language
 * ("whiten your smile", "gentle care") passes — that is what a clinic post is
 * made of. The rule is "no invented number attached to a benefit", not "no
 * numbers".
 */
const INVENTED_OFFER_PATTERNS: RegExp[] = [
  // "40% off", "save £30", "half price", "2 for 1"
  /\b\d{1,3}\s?%\s*(off|discount|reduced)\b/i,
  /\b(save|saving)\s+(£|\$|€|rs\.?|rupees?)\s?\d/i,
  /\b(half price|buy one get one|2 for 1|bogo)\b/i,
  /\bfree\s+(consultation|check-?up|treatment|whitening|implant|braces)\b/i,
  // Countdown pressure
  /\b(limited time|only (for|today|this week)|act now|hurry|don'?t wait|before it'?s too late|last chance)\b/i,
  // Clinical guarantees
  /\b(guarantee[ds]?|painless|side-?effect free|risk-?free|100% (safe|permanent)|permanent results?)\b/i,
  // Credential / social proof fabrication
  /\b(\d{2,}\+? (patients|customers|reviews)|award[- ]winning|best in (the )?(city|town)|#1 (choice|rated))\b/i,
];

/** Remove formatting the prompt forbids but a model may still emit. */
function normalisePost(raw: string): string {
  const cleaned = raw
    .trim()
    // Strip markdown emphasis and any heading/bullet scaffolding.
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^\s*[*•-]\s+/gm, "")
    // Collapse the blank-line-heavy spacing models default to.
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return cleaned.slice(0, HARD_TRIM_CHARS).trim();
}

/** The specific sentence that tripped the guard, or null when the post is clean. */
export function findUnauthorisedClaim(text: string): string | null {
  for (const pattern of INVENTED_OFFER_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

export type GrowthPostGenerationResult =
  | { ok: true; content: string }
  | { ok: false; reason: "empty" | "too_short" | "unauthorised_claim" | "error"; detail?: string };

/** The failure arm on its own, for callers that branch on `!result.ok`. */
export type GrowthPostFailure = Extract<
  GrowthPostGenerationResult,
  { ok: false }
>;

/**
 * Generate one post body.
 *
 * Never throws: every failure comes back as a typed `reason` so the UI can say
 * what happened and what to do next, rather than a generic "something went
 * wrong". The unauthorised-claim branch is the one that matters — it names the
 * phrase it caught so the clinic can see *why* the draft was rejected and fix
 * the topic rather than retrying blindly.
 */
export async function generateGrowthPost(input: {
  clinic: GrowthClinicContext;
  topic: string;
  keywords: string[];
  tone: GrowthTone;
  clinicId?: string;
}): Promise<GrowthPostGenerationResult> {
  const brief = buildGrowthPostBrief(input);

  let text: string;
  try {
    const provider: AIProvider = input.clinicId
      ? await resolveProviderForClinic(input.clinicId)
      : getGeminiProvider();
    text = await provider.complete({
      systemInstruction: GROWTH_POST_SYSTEM_INSTRUCTION,
      prompt: brief,
      // Higher than the clinical summariser: this is marketing copy, and a
      // temperature of 0.2 produces the same sentence for every clinic.
      temperature: 0.8,
      maxOutputTokens: 400,
    });
  } catch (error) {
    // The brief is public clinic data, so logging it is not a privacy problem,
    // but the raw provider error can carry the prompt back, so it is not logged.
    console.error(
      "[growth-post] generation failed",
      error instanceof Error ? error.message : String(error),
    );
    return { ok: false, reason: "error" };
  }

  const content = normalisePost(text ?? "");
  if (!content) return { ok: false, reason: "empty" };
  if (content.length < 40) return { ok: false, reason: "too_short" };

  const claim = findUnauthorisedClaim(content);
  if (claim) return { ok: false, reason: "unauthorised_claim", detail: claim };

  return { ok: true, content };
}

// ---------------------------------------------------------------------------
// Keyword suggestions
// ---------------------------------------------------------------------------

/**
 * Derive keyword suggestions from the clinic's own data.
 *
 * Deliberately not a hardcoded list. The prototype shipped three fixed
 * suggestions ("DentistNearMe", "ToothCare", "OralHealth") that any clinic
 * would receive, dental or not — which is worse than no suggestion, because it
 * looks tailored. These come from the clinic's real service names and its real
 * locality, so a physiotherapy clinic gets physiotherapy terms.
 */
export function suggestGrowthKeywords(
  clinic: Pick<GrowthClinicContext, "name" | "address" | "services">,
  limit = 6,
): string[] {
  const suggestions: string[] = [];
  const add = (value: string) => {
    const cleaned = value
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim()
      .replace(/\s+/g, " ");
    if (!cleaned) return;
    const exists = suggestions.some(
      (s) => s.toLowerCase() === cleaned.toLowerCase(),
    );
    if (!exists) suggestions.push(cleaned);
  };

  // "near me" variants of the clinic's actual services — the highest-intent
  // local searches, and derived from what this clinic really offers.
  for (const service of clinic.services) {
    if (suggestions.length >= limit) break;
    add(`${service} near me`);
  }

  // The locality, so the post can name where the clinic actually is.
  const locality = clinic.address?.split(",")[0]?.trim();
  if (locality) {
    if (suggestions.length < limit) add(`dentist ${locality}`.replace(/^dentist/i, "clinic"));
    if (suggestions.length < limit) add(`${clinic.name} ${locality}`);
  }

  // Bare service names fill whatever room is left.
  for (const service of clinic.services) {
    if (suggestions.length >= limit) break;
    add(service);
  }

  return suggestions.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Draft preview (no model involved)
// ---------------------------------------------------------------------------

/**
 * Compose a preview of a post that has not been generated yet, so the panel
 * beside the form is never empty.
 *
 * This is explicitly a *sketch*, not a post: it says so in the panel and the
 * returned `isDraft` flag drives that label. Its job is to show the effect of
 * the keywords and the call to action while the clinic is still choosing them,
 * which is the entire reason the preview updates per keystroke.
 */
export function composeDraftPreview(input: {
  clinicName: string;
  topic: string;
  keywords: string[];
  cta: string;
}): { text: string; isDraft: true } {
  const topic = input.topic.trim();
  const keywords = input.keywords.filter(Boolean);
  const keywordClause =
    keywords.length > 0
      ? ` Search terms we answer here: ${keywords.join(", ")}.`
      : "";

  const text =
    topic.length > 0
      ? `Ask about ${topic.toLowerCase()} at ${input.clinicName}. ` +
        `Talk to us about what suits you and what it costs before you decide.${keywordClause} ` +
        `${input.cta.trim() || "Get in touch"} to arrange a time.`
      : `Choose what this post should be about and the wording will appear here.`;

  return { text, isDraft: true };
}
