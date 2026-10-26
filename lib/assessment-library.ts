import type {
  AssessmentInterpretationRule,
  AssessmentQuestion,
  AssessmentQuestionOption,
  AssessmentQuestionType,
  AssessmentScoring,
  AssessmentSeverityBand,
  AssessmentTargetSpecialty,
  AssessmentTemplateStatus,
} from "@/types/database";

/**
 * Assessment Library (Settings → Clinical Settings).
 *
 * Standard instruments are a code-side CATALOG, not seeded DB rows — importing
 * copies a catalog entry into the clinic's `assessment_templates` table where
 * clinicians may edit it. Fresh rows (Create Assessment) start empty.
 *
 * The four instruments that also power the built-in online patient flow
 * (PHQ-9, GAD-7, BDI-II, PCL-5) carry their full question bank here, so an
 * imported template is immediately usable both in the workspace and via a
 * send-to-patient link. The other standard instruments (BAI, OCI-R, AUDIT,
 * ASRS) are clinician-scored and imported with scoring bands only.
 *
 * JSONB shapes mirror `types/database.ts`:
 *   questions → [{ id, text, type, options, required }]
 *   scoring   → { method, min_score, max_score, bands: [{ min, max, label }] }
 *   interpret → [{ min, max, text }]
 */

/* ------------------------------------------------------------------------- */
/* Enums / labels                                                            */
/* ------------------------------------------------------------------------- */

export const ASSESSMENT_QUESTION_TYPES = ["single", "multiple", "text", "scale"] as const;

export const ASSESSMENT_QUESTION_TYPE_LABELS: Record<AssessmentQuestionType, string> = {
  single: "Single choice",
  multiple: "Multiple choice",
  text: "Free text",
  scale: "Scale",
};

export const ASSESSMENT_TARGET_SPECIALTIES = [
  "psychology",
  "psychiatry",
  "general_medicine",
] as const;

export const ASSESSMENT_TARGET_SPECIALTY_LABELS: Record<AssessmentTargetSpecialty, string> = {
  psychology: "Psychology",
  psychiatry: "Psychiatry",
  general_medicine: "General medicine",
};

export const ASSESSMENT_TEMPLATE_STATUSES = ["draft", "active"] as const;

export const ASSESSMENT_TEMPLATE_STATUS_LABELS: Record<AssessmentTemplateStatus, string> = {
  draft: "Draft",
  active: "Active",
};

/* ------------------------------------------------------------------------- */
/* Question + scoring factories (helper for the builder / catalog)           */
/* ------------------------------------------------------------------------- */

let questionSequence = 0;

/** Human-unique id for user-authored questions (`q_<random>`). */
export function makeQuestionId(): string {
  questionSequence += 1;
  return `q_${Date.now().toString(36)}${questionSequence}`;
}

/** A blank question card for the builder, in a given state. */
export function makeQuestion(type: AssessmentQuestionType = "single"): AssessmentQuestion {
  return {
    id: makeQuestionId(),
    text: "",
    type,
    options:
      type === "text" ? [] : [{ label: "", value: 0 }, { label: "", value: 1 }],
    required: true,
  };
}

export function emptyScoring(minScore = 0, maxScore = 30): AssessmentScoring {
  return { method: "sum", min_score: minScore, max_score: maxScore, bands: [] };
}

/* ------------------------------------------------------------------------- */
/* Catalog — the standard instrument bank a clinic can import from           */
/* ------------------------------------------------------------------------- */

export type AssessmentCatalogEntry = {
  /** Canonical `psych_assessments.assessment_type` value this entry maps to. */
  key: string;
  /** Full instrument name shown in the import dialog. */
  name: string;
  /** Suggested category label (clinic may file it elsewhere). */
  category: string;
  targetSpecialty: AssessmentTargetSpecialty;
  /** True when the bank can be completed by the patient on a share link. */
  onlineCapable: boolean;
  questions: AssessmentQuestion[];
  scoring: AssessmentScoring;
  interpretation: AssessmentInterpretationRule[];
};

const FREQ_PHQ_GAD: AssessmentQuestionOption[] = [
  { label: "Not at all", value: 0 },
  { label: "Several days", value: 1 },
  { label: "More than half the days", value: 2 },
  { label: "Nearly every day", value: 3 },
];

const FREQ_PCL: AssessmentQuestionOption[] = [
  { label: "Not at all", value: 0 },
  { label: "A little bit", value: 1 },
  { label: "Moderately", value: 2 },
  { label: "Quite a bit", value: 3 },
  { label: "Extremely", value: 4 },
];

const SEVERITY_BDI: AssessmentQuestionOption[] = [
  { label: "None", value: 0 },
  { label: "Mild", value: 1 },
  { label: "Moderate", value: 2 },
  { label: "Severe", value: 3 },
];

/** DASS-21 anchors (0–3; the short form doubles each subscale sum at scoring). */
const DASS_ANCHORS: AssessmentQuestionOption[] = [
  { label: "Did not apply to me at all", value: 0 },
  { label: "Applied to me to some degree, or some of the time", value: 1 },
  { label: "Applied to me to a considerable degree, or a good part of the time", value: 2 },
  { label: "Applied to me very much, or most of the time", value: 3 },
];

/** ISI anchors (0–4), 0–28 total. */
const ISI_ANCHORS: AssessmentQuestionOption[] = [
  { label: "Not at all / None", value: 0 },
  { label: "A little", value: 1 },
  { label: "Somewhat", value: 2 },
  { label: "Much", value: 3 },
  { label: "Very much / Severe", value: 4 },
];

/** PSS-10 frequency anchors (0–4; items 4, 5, 7, 8 reverse at scoring). */
const PSS_ANCHORS: AssessmentQuestionOption[] = [
  { label: "Never", value: 0 },
  { label: "Almost never", value: 1 },
  { label: "Sometimes", value: 2 },
  { label: "Fairly often", value: 3 },
  { label: "Very often", value: 4 },
];

function likertQuestions(
  prefix: string,
  texts: readonly string[],
  options: AssessmentQuestionOption[],
): AssessmentQuestion[] {
  return texts.map((text, index) => ({
    id: `${prefix}_${index + 1}`,
    text,
    type: "single",
    options,
    required: true,
  }));
}

function bands(minMaxLabel: Array<[number, number, string]>): AssessmentSeverityBand[] {
  return minMaxLabel.map(([min, max, label]) => ({ min, max, label }));
}

/* Standard instruments imported without their full question bank (manual entry). */
function scoringOnly(
  maxScore: number,
  bandRows: Array<[number, number, string]>,
): AssessmentScoring {
  return { method: "sum", min_score: 0, max_score: maxScore, bands: bands(bandRows) };
}

export const ASSESSMENT_CATALOG: readonly AssessmentCatalogEntry[] = [
  {
    key: "PHQ-9",
    name: "Patient Health Questionnaire-9",
    category: "Depression",
    targetSpecialty: "psychology",
    onlineCapable: true,
    questions: likertQuestions(
      "phq9",
      [
        "Little interest or pleasure in doing things",
        "Feeling down, depressed, or hopeless",
        "Trouble falling or staying asleep, or sleeping too much",
        "Feeling tired or having little energy",
        "Poor appetite or overeating",
        "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
        "Trouble concentrating on things, such as reading the newspaper or watching television",
        "Moving or speaking so slowly that other people could have noticed — or the opposite, being so fidgety or restless that you have been moving around a lot more than usual",
        "Thoughts that you would be better off dead, or of hurting yourself in some way",
      ],
      FREQ_PHQ_GAD,
    ),
    scoring: {
      method: "sum",
      min_score: 0,
      max_score: 27,
      bands: bands([
        [0, 4, "Minimal"],
        [5, 9, "Mild"],
        [10, 14, "Moderate"],
        [15, 19, "Moderately severe"],
        [20, 27, "Severe"],
      ]),
    },
    interpretation: [
      { min: 0, max: 4, text: "Minimal depressive symptoms. No action indicated." },
      { min: 5, max: 9, text: "Mild depressive symptoms. Supportive monitoring; review if symptoms persist." },
      { min: 10, max: 14, text: "Moderate depressive symptoms. Consider clinical review and a treatment plan." },
      { min: 15, max: 19, text: "Moderately severe depressive symptoms. Clinical assessment and treatment recommended." },
      { min: 20, max: 27, text: "Severe depressive symptoms. Prompt clinical review recommended; assess suicide risk." },
    ],
  },
  {
    key: "GAD-7",
    name: "Generalised Anxiety Disorder-7",
    category: "Anxiety",
    targetSpecialty: "psychology",
    onlineCapable: true,
    questions: likertQuestions(
      "gad7",
      [
        "Feeling nervous, anxious, or on edge",
        "Not being able to stop or control worrying",
        "Worrying too much about different things",
        "Trouble relaxing",
        "Being so restless that it is hard to sit still",
        "Becoming easily annoyed or irritable",
        "Feeling afraid as if something awful might happen",
      ],
      FREQ_PHQ_GAD,
    ),
    scoring: {
      method: "sum",
      min_score: 0,
      max_score: 21,
      bands: bands([
        [0, 4, "Minimal"],
        [5, 9, "Mild"],
        [10, 14, "Moderate"],
        [15, 21, "Severe"],
      ]),
    },
    interpretation: [
      { min: 0, max: 4, text: "Minimal anxiety. No action indicated." },
      { min: 5, max: 9, text: "Mild anxiety. Consider supportive monitoring." },
      { min: 10, max: 14, text: "Moderate anxiety. Consider clinical review and therapy options." },
      { min: 15, max: 21, text: "Severe anxiety. Treatment recommended; discuss therapy and medication options." },
    ],
  },
  {
    key: "BDI-II",
    name: "Beck Depression Inventory-II",
    category: "Depression",
    targetSpecialty: "psychology",
    onlineCapable: true,
    questions: likertQuestions(
      "bdi2",
      [
        "Sadness",
        "Pessimism",
        "Past failure",
        "Loss of pleasure",
        "Guilty feelings",
        "Punishment feelings",
        "Self-dislike",
        "Self-criticalness",
        "Suicidal thoughts or wishes",
        "Crying",
        "Agitation",
        "Loss of interest",
        "Indecisiveness",
        "Worthlessness",
        "Loss of energy",
        "Changes in sleeping pattern",
        "Irritability",
        "Changes in appetite",
        "Concentration difficulty",
        "Tiredness or fatigue",
        "Loss of interest in sex",
      ],
      SEVERITY_BDI,
    ),
    scoring: {
      method: "sum",
      min_score: 0,
      max_score: 63,
      bands: bands([
        [0, 13, "Minimal"],
        [14, 19, "Mild"],
        [20, 28, "Moderate"],
        [29, 63, "Severe"],
      ]),
    },
    interpretation: [],
  },
  {
    key: "PCL-5",
    name: "PTSD Checklist for DSM-5",
    category: "Trauma",
    targetSpecialty: "psychology",
    onlineCapable: true,
    questions: likertQuestions(
      "pcl5",
      [
        "Repeated, disturbing, and unwanted memories of the stressful experience",
        "Repeated, disturbing dreams of the stressful experience",
        "Suddenly feeling or acting as if the stressful experience were happening again",
        "Feeling very upset when something reminded you of the stressful experience",
        "Having strong physical reactions when something reminded you of the stressful experience",
        "Avoiding memories, thoughts, or feelings related to the stressful experience",
        "Avoiding external reminders of the stressful experience",
        "Trouble remembering important parts of the stressful experience",
        "Having strong negative beliefs about yourself, other people, or the world",
        "Blaming yourself or someone else for the stressful experience or what happened after it",
        "Having strong negative feelings such as fear, horror, anger, guilt, or shame",
        "Loss of interest in activities you used to enjoy",
        "Feeling distant or cut off from other people",
        "Trouble experiencing positive feelings",
        "Irritable behaviour, angry outbursts, or acting aggressively",
        "Taking too many risks or doing things that could cause you harm",
        "Being super alert or watchful or on guard",
        "Feeling jumpy or easily startled",
        "Having difficulty concentrating",
        "Trouble falling or staying asleep",
      ],
      FREQ_PCL,
    ),
    scoring: {
      method: "sum",
      min_score: 0,
      max_score: 80,
      bands: bands([
        [0, 30, "Below clinical threshold"],
        [31, 80, "Probable PTSD"],
      ]),
    },
    interpretation: [],
  },
  {
    key: "BAI",
    name: "Beck Anxiety Inventory",
    category: "Anxiety",
    targetSpecialty: "psychology",
    onlineCapable: false,
    questions: [],
    scoring: scoringOnly(63, [
      [0, 7, "Minimal"],
      [8, 15, "Mild"],
      [16, 25, "Moderate"],
      [26, 63, "Severe"],
    ]),
    interpretation: [],
  },
  {
    key: "OCI-R",
    name: "Obsessive-Compulsive Inventory - Revised",
    category: "Obsessive-Compulsive",
    targetSpecialty: "psychology",
    onlineCapable: false,
    questions: [],
    scoring: scoringOnly(72, [
      [0, 20, "Subclinical"],
      [21, 40, "Moderate"],
      [41, 72, "Severe"],
    ]),
    interpretation: [],
  },
  {
    key: "AUDIT",
    name: "Alcohol Use Disorders Identification Test",
    category: "Substance Use",
    targetSpecialty: "psychology",
    onlineCapable: false,
    questions: [],
    scoring: scoringOnly(40, [
      [0, 7, "Low risk"],
      [8, 15, "Hazardous"],
      [16, 19, "Harmful"],
      [20, 40, "Dependence likely"],
    ]),
    interpretation: [],
  },
  {
    key: "ASRS",
    name: "Adult ADHD Self-Report Scale (Part A)",
    category: "ADHD & Attention",
    targetSpecialty: "psychology",
    onlineCapable: false,
    questions: [],
    scoring: scoringOnly(24, [
      [0, 16, "Unlikely"],
      [17, 24, "Likely ADHD"],
    ]),
    interpretation: [],
  },
  {
    key: "DASS-21",
    name: "Depression, Anxiety and Stress Scale (21)",
    category: "Depression, Anxiety & Stress",
    targetSpecialty: "psychology",
    onlineCapable: true,
    questions: likertQuestions(
      "dass21",
      [
        "I found it hard to wind down",
        "I was aware of dryness of my mouth",
        "I couldn't seem to experience any positive feeling at all",
        "I experienced breathing difficulty (e.g. excessively rapid breathing, breathlessness in the absence of physical exertion)",
        "I found it difficult to work up the initiative to do things",
        "I tended to over-react to situations",
        "I experienced trembling (e.g. in the hands)",
        "I felt that I was using a lot of nervous energy",
        "I was worried about situations in which I might panic and make a fool of myself",
        "I felt that I had nothing to look forward to",
        "I found myself getting agitated",
        "I found it difficult to relax",
        "I felt down-hearted and blue",
        "I was intolerant of anything that kept me from getting on with what I was doing",
        "I felt I was close to panic",
        "I was unable to become enthusiastic about anything",
        "I felt I wasn't worth much as a person",
        "I felt that I was rather touchy",
        "I was aware of the action of my heart in the absence of physical exertion (e.g. sense of heart rate increase, heart missing a beat)",
        "I felt scared without any good reason",
        "I felt that life was meaningless",
      ],
      DASS_ANCHORS,
    ),
    scoring: {
      method: "sum",
      min_score: 0,
      max_score: 63,
      // Severity for DASS-21 reads the D/A/S subscale sums doubled (×2 short-form
      // convention), never the 21-item total — so no total bands are published
      // here. The validated engine path (`DASS-21` in lib/scoring) computes the
      // subscale bands; a hand-rolled template copy leaves severity blank for
      // the clinician to read from the subscale printout.
      bands: [],
    },
    interpretation: [],
  },
  {
    key: "ISI",
    name: "Insomnia Severity Index",
    category: "Sleep",
    targetSpecialty: "psychology",
    onlineCapable: true,
    questions: likertQuestions(
      "isi",
      [
        "Difficulty falling asleep",
        "Difficulty staying asleep",
        "Problem waking up too early",
        "How SATISFIED/DISSATISFIED are you with your current sleep pattern?",
        "How noticeable to others do you think your sleep problem is in terms of impairing the quality of your life?",
        "How WORRIED/DISTRESSED are you about your current sleep problem?",
        "To what extent do you consider your sleep problem to interfere with daily functioning (e.g. daytime fatigue, mood, ability to function at work/daily chores)?",
      ],
      ISI_ANCHORS,
    ),
    scoring: {
      method: "sum",
      min_score: 0,
      max_score: 28,
      bands: bands([
        [0, 7, "No clinically significant insomnia"],
        [8, 14, "Subthreshold insomnia"],
        [15, 21, "Clinical insomnia (moderate)"],
        [22, 28, "Clinical insomnia (severe)"],
      ]),
    },
    interpretation: [
      { min: 0, max: 7, text: "No clinically significant insomnia. No action indicated." },
      { min: 8, max: 14, text: "Subthreshold insomnia. Sleep-hygiene counselling and monitoring recommended." },
      { min: 15, max: 21, text: "Moderate clinical insomnia. Structured intervention (e.g. CBT-I) recommended." },
      { min: 22, max: 28, text: "Severe clinical insomnia. Prompt clinical review and intensive treatment recommended." },
    ],
  },
  {
    key: "PSS-10",
    name: "Perceived Stress Scale",
    category: "Stress",
    targetSpecialty: "psychology",
    onlineCapable: true,
    questions: likertQuestions(
      "pss10",
      [
        "In the last month, how often have you been upset because of something that happened unexpectedly?",
        "In the last month, how often have you felt that you were unable to control the important things in your life?",
        "In the last month, how often have you felt nervous and stressed?",
        "In the last month, how often have you felt confident about your ability to handle your personal problems?",
        "In the last month, how often have you felt that things were going your way?",
        "In the last month, how often have you found that you could not cope with all the things that you had to do?",
        "In the last month, how often have you been able to control irritations in your life?",
        "In the last month, how often have you felt that you were on top of things?",
        "In the last month, how often have you been angered because of things that were outside of your control?",
        "In the last month, how often have you felt difficulties were piling up so high that you could not overcome them?",
      ],
      PSS_ANCHORS,
    ),
    scoring: {
      method: "sum",
      min_score: 0,
      max_score: 40,
      // Published key reverses items 4, 5, 7 and 8. The validated engine path
      // (PSS-10 in lib/scoring) applies the reversal automatically; a hand-rolled
      // template copy plus a plain sum will READ THOSE FOUR ITEMS WRONG — bands
      // below assume the published reversed key.
      bands: bands([
        [0, 13, "Low perceived stress"],
        [14, 26, "Moderate perceived stress"],
        [27, 40, "High perceived stress"],
      ]),
    },
    interpretation: [
      { min: 0, max: 13, text: "Low perceived stress in the last month. No action indicated." },
      { min: 14, max: 26, text: "Moderate perceived stress. Consider stress-management work and monitoring." },
      { min: 27, max: 40, text: "High perceived stress. Structured stress intervention and clinical review recommended." },
    ],
  },
];

export function catalogEntryByKey(key: string): AssessmentCatalogEntry | undefined {
  return ASSESSMENT_CATALOG.find((entry) => entry.key === key);
}

/* ------------------------------------------------------------------------- */
/* Scoring helpers (shared by settings UI, workspace, patient form)          */
/* ------------------------------------------------------------------------- */

/** The band label a score falls into, or null when nothing matches. */
export function severityFromBands(bands: AssessmentSeverityBand[], score: number): string | null {
  if (bands.length === 0) return null;
  const band = bands.find((b) => score >= b.min && score <= b.max);
  return band?.label ?? null;
}

/** The interpretation text for a score, or null when out of range. */
export function interpretationForScore(
  rules: AssessmentInterpretationRule[],
  score: number,
): string | null {
  if (rules.length === 0) return null;
  const rule = rules.find((r) => score >= r.min && score <= r.max);
  return rule?.text ?? null;
}

/** The effective ceiling of a template's score range. */
export function templateMaxScore(scoring: { max_score: number; bands: AssessmentSeverityBand[] }): number {
  if (scoring.max_score > 0) return scoring.max_score;
  const last = scoring.bands[scoring.bands.length - 1];
  return last?.max ?? 0;
}

/**
 * A template is patient-completable when it is sum-scored and every question
 * yields a number (single/multiple/scale). Free-text items make answers
 * unrepresentable in `psych_assessments.answers` (Record<string, number>).
 */
export function canSendOnline(
  template: { questions: AssessmentQuestion[]; scoring: AssessmentScoring },
): boolean {
  return (
    template.questions.length > 0 &&
    template.scoring.method === "sum" &&
    template.questions.every((q) => q.type !== "text")
  );
}

/** Number of numeric-scorable items, for "x of n answered" progress. */
export function scorableCount(questions: AssessmentQuestion[]): number {
  return questions.filter((q) => q.type !== "text").length;
}

/**
 * Score a template's answers. For sum, adds every item's selected value
 * (multiple-choice answers carry the SUM of selected option values). For
 * average, averages the answered numeric items. Text questions contribute 0.
 */
export function scoreTemplateAnswers(
  template: { questions: AssessmentQuestion[]; scoring: AssessmentScoring },
  answers: Record<string, number>,
): number | null {
  const numeric = template.questions.filter((q) => q.type !== "text");
  if (numeric.length === 0) return null;
  if (template.scoring.method === "sum") {
    return numeric.reduce((total, q) => total + (answers[q.id] ?? 0), 0);
  }
  if (template.scoring.method === "average") {
    const answered = numeric.filter((q) => answers[q.id] !== undefined);
    if (answered.length === 0) return null;
    const total = answered.reduce((sum, q) => sum + (answers[q.id] ?? 0), 0);
    return total / answered.length;
  }
  return null;
}