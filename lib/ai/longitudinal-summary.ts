import { z } from "zod";

import { getGeminiProvider } from "@/lib/ai/gemini-provider";
import { resolveProviderForClinic } from "@/lib/ai/provider";
import type { PsychAssessment } from "@/types/database";

const trajectoryEnum = z.enum([
  "IMPROVING",
  "STABLE",
  "DETERIORATING",
  "FLUCTUATING",
]);

export type LongitudinalTrajectory = z.infer<typeof trajectoryEnum>;

export const longitudinalSummarySchema = z.object({
  trajectory: trajectoryEnum,
  summary_markdown: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe("Short clinical summary draft"),
  key_observations: z
    .array(z.string().trim().min(1).max(200))
    .min(1)
    .max(8)
    .describe("Bulletable clinical signals"),
});

export type LongitudinalSummary = z.infer<typeof longitudinalSummarySchema>;

export type PsychAssessmentHistory = Pick<
  PsychAssessment,
  "assessment_type" | "score" | "severity" | "conducted_at" | "notes"
>;

export interface LongitudinalInput {
  patientId: string;
  clinicId: string;
  patientContext?: {
    age?: number | null;
    gender?: string | null;
  };
  assessments: PsychAssessmentHistory[];
}

const MAX_ASSESSMENTS_IN_PROMPT = 20;

function sortChronological(assessments: PsychAssessmentHistory[]): PsychAssessmentHistory[] {
  return [...assessments].sort((a, b) => {
    const t1 = new Date(a.conducted_at || "1970-01-01").getTime();
    const t2 = new Date(b.conducted_at || "1970-01-01").getTime();
    if (isNaN(t1)) return 1;
    if (isNaN(t2)) return -1;
    return t1 - t2;
  });
}

function buildDigest(input: LongitudinalInput): string {
  const list = sortChronological(input.assessments).slice(-MAX_ASSESSMENTS_IN_PROMPT);
  const lines = [
    "Patient: de-identified",
    input.patientContext?.age != null ? `Age: ${input.patientContext.age}` : "Age: unknown",
    input.patientContext?.gender ? `Gender: ${input.patientContext.gender}` : "Gender: unknown",
    "",
    "Chronological assessments:",
  ];
  if (list.length === 0) {
    lines.push("(none)");
  } else {
    for (const a of list) {
      const date = (a.conducted_at || "").slice(0, 10);
      const score = a.score ?? "n/a";
      const sev = a.severity ? ` (${a.severity})` : "";
      lines.push(`${date} — ${a.assessment_type}: ${score}${sev}`);
    }
  }
  return lines.join("\n");
}

const LONGITUDINAL_SYSTEM = `You are a clinical assistant summarizing longitudinal psychometric trends for clinicians.

Rules:
- Use ONLY the supplied data. Never diagnose or recommend treatment.
- Classify trajectory: IMPROVING, STABLE, DETERIORATING, or FLUCTUATING based on scores over time.
- Provide a concise summary_markdown (plain text, no heavy markdown formatting required; 1-3 sentences).
- List 1-6 key_observations as short bullet points in words.
- Attribute changes ("decreased from 18 to 9 over 6 weeks"). Do not invent values.
- If insufficient data (<=1 assessment), be conservative: trajectory likely STABLE or note limited data, but follow schema.
- Stay factual and decision-supportive.`;

export async function generateLongitudinalSummary(
  input: LongitudinalInput,
): Promise<LongitudinalSummary> {
  const digest = buildDigest(input);
  const provider = input.clinicId
    ? await resolveProviderForClinic(input.clinicId)
    : getGeminiProvider();

  const raw = await provider.completeJson({
    systemInstruction: LONGITUDINAL_SYSTEM,
    prompt: digest,
    schema: {
      type: "object",
      required: ["trajectory", "summary_markdown", "key_observations"],
      additionalProperties: false,
      properties: {
        trajectory: {
          type: "string",
          enum: ["IMPROVING", "STABLE", "DETERIORATING", "FLUCTUATING"],
        },
        summary_markdown: { type: "string" },
        key_observations: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    temperature: 0.2,
    maxOutputTokens: 600,
  });

  const parsed = longitudinalSummarySchema.safeParse(raw);
  if (!parsed.success) {
    // Try to be graceful if model returns slightly off shape; otherwise throw
    throw new Error("Model returned unexpected longitudinal summary shape");
  }
  return parsed.data;
}
