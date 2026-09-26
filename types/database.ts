/**
 * Hand-written database types mirroring `supabase/migrations/0001_*.sql`.
 *
 * These are intentionally hand-maintained rather than generated so the
 * migration files remain the single source of truth. When the schema changes,
 * regenerate with `supabase gen types typescript --project-id <ref>` and
 * reconcile, or update both sides consistently.
 *
 * Row/Insert/Update are written as explicit object-literal types (same shape
 * `supabase gen types` produces) so they satisfy supabase-js's `GenericRow`
 * constraint — derived mapped types like `Partial<Clinic>` do not.
 */

export type ClinicRole = "owner" | "admin" | "staff";

export type ServiceStatus = "active" | "inactive";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

/** Where the booking was created. This phase only writes `dashboard`. */
export type BookingSource = string;

/**
 * Row types are `type` aliases (not interfaces) so they satisfy supabase-js's
 * `GenericTable` constraint, which requires `Row: Record<string, unknown>`.
 * TypeScript only infers implicit index signatures for object-literal type
 * aliases, not for interfaces.
 */
export type Clinic = {
  id: string;
  name: string;
  slug: string;
  doctor_name: string | null;
  timezone: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** Google Business review link (Phase 16) — encoded into the QR tool. */
  google_review_url: string | null;
  /**
   * UHID prefix, 2–6 uppercase letters, default `CLI`. Feeds
   * `assign_patient_code` to produce `CLI-2026-00001` (migration 0029).
   * Changing it does not renumber existing patients.
   */
  patient_code_prefix: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ClinicMember = {
  id: string;
  clinic_id: string;
  user_id: string;
  role: ClinicRole;
  /** Denormalized from auth.users at join time — the roster's label. */
  email: string;
  created_at: string;
};

/** Lifecycle of a team invitation. */
export type ClinicInviteStatus = "pending" | "accepted" | "revoked" | "expired";

/**
 * A team invitation. Only the SHA-256 hash of the raw token is stored — the
 * raw token lives exclusively in the invite link. Invites can never grant
 * `owner` (DB CHECK); ownership changes go through member management.
 */
export type ClinicInvite = {
  id: string;
  clinic_id: string;
  email: string;
  role: ClinicRole;
  token_hash: string;
  status: ClinicInviteStatus;
  expires_at: string;
  invited_by: string;
  accepted_at: string | null;
  created_at: string;
};

/**
 * A doctor in the clinic roster (Phase 10). `user_id` is nullable — a doctor
 * may not have a login. `is_visible` controls whether booking surfaces (AI
 * widget, website, dashboard) offer this doctor for NEW bookings; invisible
 * doctors keep their historical appointments. `credentials` is a simple JSON
 * array of degree/certification strings.
 */
/** How a doctor's appointments are scheduled (Phase 20). */
export type DoctorConsultationMode = "single_slot" | "shared_window";

/** Delivery modes a doctor offers (Phase 20; data field only). */
export type DoctorConsultationType = "offline" | "both" | "online";

export type Doctor = {
  id: string;
  clinic_id: string;
  user_id: string | null;
  name: string;
  specialty: string | null;
  credentials: string[] | null;
  photo_url: string | null;
  consultation_fee: number | null;
  is_visible: boolean;
  /** Phase 20 — full profile fields. */
  years_of_experience: number | null;
  qualification: string | null;
  medical_registration_number: string | null;
  email: string | null;
  phone: string | null;
  follow_up_fee: number | null;
  follow_up_valid_for: number | null;
  follow_up_period: "days" | "weeks" | "months" | null;
  professional_description: string | null;
  signature_url: string | null;
  consultation_mode: DoctorConsultationMode;
  max_patients_per_window: number;
  consultation_type: DoctorConsultationType;
  created_at: string;
  updated_at: string;
};

/**
 * A named, discrete booking slot for one doctor on one weekday (Phase 20).
 * Multiple rows for the same day = split shifts. Slots take precedence over
 * range-based `availability_rules` in the app layer.
 */
export type DoctorSlotTemplate = {
  id: string;
  clinic_id: string;
  doctor_id: string;
  day_of_week: number;
  slot_name: string;
  start_time: string;
  end_time: string;
  /** Per-slot capacity for shared-window doctors (Phase 21). NULL = use the
   * doctor's global `max_patients_per_window`. */
  patient_limit: number | null;
  created_at: string;
  updated_at: string;
};

/** One custom vital the clinic defines for a doctor. */
export type CustomVital = {
  key: string;
  label: string;
  unit: string | null;
  placeholder: string | null;
  /** How values are entered at check-in. Defaults to "numeric". */
  type?: "numeric" | "text" | null;
};

/** A recorded custom vital value on a visit's vitals row. */
export type CustomVitalValue = {
  key: string;
  label: string;
  value: string;
  unit: string | null;
};

/**
 * Per-doctor vitals capture config (Phase 20). Null `standard_vitals` = all
 * standard vitals in canonical order. `custom_vitals` are clinic-defined
 * fields; `display_order` restores the form order across both sets.
 */
export type DoctorVitalsConfig = {
  id: string;
  clinic_id: string;
  doctor_id: string;
  standard_vitals: string[] | null;
  custom_vitals: CustomVital[] | null;
  display_order: string[] | null;
  created_at: string;
  updated_at: string;
};

/**
 * A service a clinic offers (e.g. "General Consultation", 30 minutes, $50).
 * `status` is the soft-delete flag: inactive services are never offered by
 * the AI agent or booking widget (PRD §13). `doctor_id` is nullable — NULL
 * means any doctor can perform the service; set means it is tied to that
 * specific doctor.
 */
export type ServiceCategory =
  | "consultation"
  | "service"
  | "diagnostic"
  | "lab_test"
  | "procedure";

export type Service = {
  id: string;
  clinic_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  doctor_id: string | null;
  status: ServiceStatus;
  category: ServiceCategory;
  /** Phase 21 — flexible "duration / report time" (e.g. a lab turnaround). */
  duration_or_report_time: string | null;
  follow_up_fee: number | null;
  follow_up_valid_for: number | null;
  follow_up_period: "days" | "weeks" | "months" | null;
  preparation_instructions: string | null;
  consultation_mode: DoctorConsultationMode;
  created_at: string;
  updated_at: string;
};

/**
 * A named, discrete booking slot for one service on one weekday (Phase 21).
 * Mirrors `DoctorSlotTemplate` 1:1 so both parents share the same
 * slot-generation UI and capacity model. Multiple rows for the same day =
 * split shifts.
 */
export type ServiceSlotTemplate = {
  id: string;
  clinic_id: string;
  service_id: string;
  day_of_week: number;
  slot_name: string;
  start_time: string;
  end_time: string;
  /** Per-slot capacity for shared-window services. NULL = single patient. */
  patient_limit: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * Weekly working hours, one row per `day_of_week` (0 = Monday ... 6 = Sunday).
 * `start_time`/`end_time` are wall-clock times in the clinic's timezone.
 * `doctor_id` is nullable — NULL rows are clinic-wide defaults that apply to
 * every doctor; non-NULL rows are that doctor's own hours and override the
 * default for slot calculation involving them.
 */
export type AvailabilityRule = {
  id: string;
  clinic_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  enabled: boolean;
  doctor_id: string | null;
};

/**
 * Absolute blocked ranges (holidays, time off) stored as `timestamptz`
 * (UTC), rendered in the clinic's timezone. `doctor_id` is nullable — NULL
 * blocks the whole clinic; set blocks only that doctor.
 */
export type BlockedTime = {
  id: string;
  clinic_id: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  doctor_id: string | null;
  created_at: string;
};

/**
 * A clinic's patient record. `email`/`phone`/`notes` are optional but
 * format-validated when present; `date_of_birth` is optional and never in the
 * future (DB CHECK `patients_dob_not_future`). `notification_preference` and
 * `whatsapp_number` (Phase 11) are stored for Phase 13's WhatsApp channel —
 * they do NOT change routing behavior yet.
 *
 * `patient_code` is the human-facing UHID (`CLI-2026-00001`), assigned by the
 * `assign_patient_code` BEFORE INSERT trigger (migration 0029) — never set it
 * from application code. Unique per clinic; the prefix comes from
 * `clinics.patient_code_prefix` and the year from the clinic's timezone.
 *
 * `age` is a legacy stored value that goes stale within a year. Derive age from
 * `date_of_birth` for display and treat `age` as fallback input only.
 */
export type NotificationPreference = "email" | "whatsapp" | "both";

/** The eight ABO/Rh groups accepted by DB CHECK `patients_blood_group_check`. */
export type BloodGroup = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

export type Patient = {
  id: string;
  clinic_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  date_of_birth: string | null;
  notification_preference: NotificationPreference;
  whatsapp_number: string | null;
  city: string | null;
  gender: "male" | "female" | "other" | null;
  age: number | null;
  known_allergies: string | null;
  medical_conditions: string | null;
  /** Height in centimeters; patient-level baseline captured at registration. */
  height: number | null;
  /** Weight in kilograms; patient-level baseline captured at registration. */
  weight: number | null;
  /** Free-text current medications captured at registration. */
  current_medications: string | null;
  /** UHID, e.g. `CLI-2026-00001`. Trigger-assigned; null only pre-0029. */
  patient_code: string | null;
  blood_group: BloodGroup | null;
  registered_branch: string | null;
  /** Cached AI patient summary. Null until a consultation history exists. */
  ai_summary: string | null;
  ai_summary_generated_at: string | null;
  /** Visit count the cached summary was generated from — used to detect staleness. */
  ai_summary_visit_count: number | null;
  /**
   * Soft-archive markers set by `merge_patient_profiles` (0041). A duplicate that
   * was merged into another profile keeps its row (and all still-pointing data is
   * moved away first) but is hidden from `patient_directory`. `merged_at` and
   * `merged_into_patient_id` are always both null or both set.
   */
  merged_at: string | null;
  merged_into_patient_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * One row of the `patient_directory` view: every patient plus derived
 * appointment and visit stats (computed live, never stored).
 * `appointment_count`/`upcoming_count` exclude cancelled appointments;
 * `last_appointment_at` is the most recent non-cancelled appointment.
 * `visit_count`/`last_visit_at` come from `visits` (actual check-ins, a
 * different dimension from bookings) and drive the First Visit / Returning
 * segmentation. Read-only.
 */
export type PatientDirectoryRow = Patient & {
  appointment_count: number;
  last_appointment_at: string | null;
  upcoming_count: number;
  visit_count: number;
  last_visit_at: string | null;
};

/**
 * A booked appointment. `start_time`/`end_time` are `timestamptz` (UTC);
 * `end_time` is computed from the service's `duration_minutes` at booking time
 * and stored so history survives later duration edits. `status` changes are
 * explicit auditable actions (confirm/cancel/complete/no-show/reschedule),
 * never silent edits. `doctor_id` is nullable — NULL means unassigned, which
 * blocks every doctor in overlap checks (pre-Phase-10 rows and any booking
 * path that does not select a doctor).
 */
export type Appointment = {
  id: string;
  clinic_id: string;
  patient_id: string;
  service_id: string;
  doctor_id: string | null;
  start_time: string;
  end_time: string;
   status: AppointmentStatus;
   booking_source: BookingSource;
   notes: string | null;
   /** Set once the reminder job dispatched this appointment's reminder. */
   reminder_sent_at: string | null;
consultation_type: ConsultationType;
    created_at: string;
    updated_at: string;
};

// ---------------------------------------------------------------------------
// Phase 22: Pre-Consultation Questions & Answers types
// ---------------------------------------------------------------------------

/**
 * When the receptionist (or the after-booking WhatsApp follow-up) asks the
 * configured screening questions relative to the booking.
 */
export type PreConsultationTiming = "during_booking" | "after_booking";

/**
 * One clinic-created screening question. Targets EXACTLY one scope: a doctor
 * XOR a service (enforced in the DB). A set is persisted with a single
 * `timing` and read back ordered by `display_order` (0-based, max 2 → ≤3
 * questions per set).
 */
export type PreConsultationQuestion = {
  id: string;
  clinic_id: string;
  doctor_id: string | null;
  service_id: string | null;
  timing: PreConsultationTiming;
  question_text: string;
  display_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

/** Patient-supplied answer; one row per (appointment, question) — upserted. */
export type PreConsultationAnswer = {
  id: string;
  clinic_id: string;
  appointment_id: string;
  question_id: string;
  answer_text: string;
  answered_at: string;
};

// ---------------------------------------------------------------------------
// Phase 17: Visit / Queue / Vitals types
// ---------------------------------------------------------------------------

/** Lifecycle of a physical patient visit (separate dimension from appointment status). */
export type VisitStatus =
  | "scheduled"
  | "checked_in"
  | "waiting"
  | "in_consultation"
  | "completed";

/** Independent payment-state dimension on a visit — not hard-wired to visit status. */
export type PaymentStatus =
  | "pending"
  | "collected_pre"
  | "collected_post"
  | "not_required";

/**
 * One row of the `visits` table. Created at check-in time (not at booking).
 * Tracks the physical visit workflow: waiting -> in_consultation -> completed.
 * `token_number` is a daily per-clinic sequence assigned at check-in.
 * `queue_position` is the serving order (recalculated on reorder).
 */
export type Visit = {
  id: string;
  clinic_id: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string | null;
  status: VisitStatus;
  payment_status: PaymentStatus;
  token_number: number;
  queue_position: number;
  checked_in_at: string;
  consultation_started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Vitals recorded for a visit. One record per visit (upserted).
 * Structured BP (systolic/diastolic) alongside legacy blood_pressure text.
 * BMI is always auto-computed from height + weight, never user-entered.
 */
export type Vitals = {
  id: string;
  clinic_id: string;
  visit_id: string;
  recorded_by: string | null;
  blood_pressure: string | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  temperature: number | null;
  pulse: number | null;
  weight: number | null;
  height: number | null;
  spo2: number | null;
  respiratory_rate: number | null;
  bmi: number | null;
  /** Phase 20 — clinic-defined custom vitals recorded for this visit. */
  custom_vitals: CustomVitalValue[] | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
};

/** A single medicine entry within a prescription's medicines jsonb array. */
export type MedicineEntry = {
  name: string;
  route: string;
  form: string;
  frequency: string;
  duration: string;
  unit: string;
  instructions: string;
};

/** A single lab order entry within a prescription's lab_orders jsonb array. */
export type LabOrder = {
  test_name: string;
  notes: string;
};

/**
 * A prescription created during a consultation. One per visit (enforced by
 * unique constraint on clinic_id + visit_id). Medicines and lab orders are
 * stored as jsonb arrays.
 */
export type Prescription = {
  id: string;
  clinic_id: string;
  visit_id: string;
  patient_id: string;
  doctor_id: string | null;
  chief_complaint: string;
  findings: string;
  diagnosis: string;
  custom_diagnosis: string;
  medicines: MedicineEntry[];
  lab_orders: LabOrder[];
  follow_up_date: string | null;
  follow_up_notes: string;
  doctor_notes: string;
  created_at: string;
  updated_at: string;
};

/**
 * A reusable prescription template scoped to a doctor. Stores diagnosis,
 * medicines, lab orders, and doctor notes — NOT patient-specific fields.
 */
export type PrescriptionTemplate = {
  id: string;
  clinic_id: string;
  doctor_id: string;
  name: string;
  diagnosis: string;
  custom_diagnosis: string;
  medicines: MedicineEntry[];
  lab_orders: LabOrder[];
  doctor_notes: string;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Phase 19: Patient Billing types
// ---------------------------------------------------------------------------

/**
 * Bill lifecycle. `waived` and `cancelled` were added in migration 0029:
 * - `waived`    — clinic forgave the balance; counts as closed, not as revenue.
 * - `cancelled` — bill raised in error; excluded from every total.
 * Neither is reachable by paying; both are explicit staff actions.
 */
export type PatientBillStatus =
  | "pending"
  | "paid"
  | "partially_paid"
  | "waived"
  | "cancelled";

/** What the bill was raised for. Drives the Bill Type capsules in the create modal. */
export type PatientBillType = "consultation" | "procedure" | "other";

export type PatientPaymentMethod =
  | "cash"
  | "card"
  | "bank_transfer"
  | "jazzcash"
  | "easypaisa"
  | "upi"
  | "waive";

/**
 * Payment methods offered in the UI — Pakistani rails only (decision D8), in
 * display order. Single source of truth: the `PatientPaymentMethodUI` type and
 * the `collectPaymentSchema` zod enum both derive from this tuple, so adding a
 * rail here is enough to accept it end to end.
 *
 * `upi` is deliberately absent: it is an Indian rail, kept in the DB enum only
 * because Postgres cannot drop enum values and historical rows may reference
 * it. Never add it to a picker; render existing `upi` rows read-only.
 */
export const PATIENT_PAYMENT_METHODS_UI = [
  "cash",
  "card",
  "jazzcash",
  "easypaisa",
  "bank_transfer",
  "waive",
] as const;

export type PatientPaymentMethodUI = (typeof PATIENT_PAYMENT_METHODS_UI)[number];

export type PatientBill = {
  id: string;
  clinic_id: string;
  visit_id: string | null;
  patient_id: string;
  total_amount: number;
  discount_amount: number;
  discount_percent: number;
  currency: string;
  status: PatientBillStatus;
  /**
   * Human-facing bill number, `BILL-20260810-004` — assigned by the
   * `assign_bill_number` BEFORE INSERT trigger (0029). Never set from
   * application code. Unique per clinic; sequence resets daily in clinic time.
   */
  bill_number: string | null;
  bill_type: PatientBillType;
  /** Billing date in the clinic's timezone (`date`, not `timestamptz`). */
  bill_date: string;
  /** Attending doctor, optional per spec. */
  doctor_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PatientBillItem = {
  id: string;
  clinic_id: string;
  bill_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
};

export type PatientPayment = {
  id: string;
  clinic_id: string;
  bill_id: string;
  amount: number;
  payment_method: PatientPaymentMethod;
  /** Transaction/reference number for non-cash rails (JazzCash TID, cheque no.). */
  payment_reference: string | null;
  collected_by_user_id: string | null;
  collected_at: string;
  created_at: string;
};

export type Receipt = {
  id: string;
  clinic_id: string;
  bill_id: string;
  receipt_number: number;
  generated_at: string;
  pdf_path: string | null;
};

/**
 * A file attached to a patient record (migration 0029) — lab report, scan,
 * referral. `file_path` is a key in the PRIVATE `patient-documents` storage
 * bucket, laid out `{clinic_id}/{patient_id}/{uuid}-{filename}`.
 *
 * Never build a public URL from `file_path`: these are medical records. Reads
 * go through a short-lived server-generated signed URL. `mime_type` and
 * `size_bytes` are DB-constrained (pdf/png/jpeg/webp, ≤ 10 MB) and must also be
 * validated server-side — a client `accept` attribute is not validation.
 */
export type PatientDocument = {
  id: string;
  clinic_id: string;
  patient_id: string;
  document_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by_user_id: string | null;
  uploaded_at: string;
};

/** MIME types accepted by DB CHECK `patient_documents_mime_type_check`. */
export const PATIENT_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** Matches DB CHECK `patient_documents_size_bytes_check` — 10 MiB. */
export const PATIENT_DOCUMENT_MAX_BYTES = 10_485_760;

/** Private bucket id created in migration 0029. `public` is false — keep it false. */
export const PATIENT_DOCUMENTS_BUCKET = "patient-documents";

export type AiTone = "professional" | "friendly" | "casual" | "empathetic";

/**
 * LLM vendors the AI Agent panel can be pointed at. Only `google` has a
 * working provider implementation (`lib/ai/gemini-provider.ts`); the other two
 * are selectable-but-disabled in the UI until a provider exists (decision D5).
 */
export type LlmProvider = "google" | "openai" | "anthropic";

/**
 * How a visit is delivered (Phase 15). A data field only — no video
 * infrastructure. `in_clinic` is the default for every booking path.
 */
export type ConsultationType = "in_clinic" | "online" | "video";

export type AiAgentTier = "chatbot" | "ai_agent";

export type AiGreetingStyle = "custom_template" | "ai_generated";

export type WhatsappConnectionStatus =
  | "not_connected"
  | "connected"
  | "error";

export type AiConversationOutcome = "success" | "failed" | "escalated";

/**
 * Doctor-configured knowledge/behavior for the Gemini receptionist
 * (Phase 5). One row per clinic. `faqs` is a JSONB array of knowledge
 * entries `{ id, question, answer, active, is_custom }` — only `active`
 * entries reach the AI. `required_patient_fields` is a subset of
 * `name` / `email` / `phone` the agent must collect before booking.
 */
export type WidgetPosition = "bottom-right" | "bottom-left";

export type ClinicAiSettings = {
  id: string;
  clinic_id: string;
  agent_name: string;
  welcome_message: string | null;
  tone: AiTone;
  clinic_description: string | null;
  booking_rules: string | null;
  cancellation_policy_text: string | null;
  faqs: unknown;
  required_patient_fields: string[];
  enabled: boolean;
  /** Phase 12 — WhatsApp channel toggle, independent of `enabled`/`is_activated`. */
  whatsapp_enabled: boolean;
  /** Stored preference only; 'ai_agent' (natural language) is the primary mode. */
  agent_tier: AiAgentTier;
  /** 'custom_template' reuses welcome_message; 'ai_generated' lets the model greet. */
  greeting_style: AiGreetingStyle;
  is_activated: boolean;
  widget_color: string;
  widget_position: WidgetPosition;
  widget_avatar_url: string | null;
  widget_header_subtitle: string | null;
  /** Which vendor's API the clinic's own key belongs to. */
  llm_provider: LlmProvider;
  /**
   * Model id, e.g. `gemini-3.5-flash-lite`. NULL means "use the platform
   * default from env" — do not substitute a hardcoded string here.
   */
  llm_model: string | null;
  /** True once `Connect API` completed a live round-trip with the stored key. */
  llm_key_verified: boolean;
  llm_key_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Service-role-only storage for a clinic's own LLM API key (migration 0029).
 * RLS-enabled with ZERO policies for `authenticated` — no client role can read
 * or write these rows, same posture as `ClinicWhatsappSecret`.
 *
 * The key must NEVER cross into the browser: not in component props, not in a
 * server-component payload, not in an API response. The UI shows only a masked
 * input plus `ClinicAiSettings.llm_key_verified`.
 */
export type ClinicAiSecret = {
  id: string;
  settings_id: string;
  api_key: string;
  created_at: string;
  updated_at: string;
};

/**
 * Meta WhatsApp Cloud API connection for one clinic (Phase 12). One row per
 * clinic. The access token lives separately in `clinic_whatsapp_secrets`
 * (zero RLS policies — service-role-only), so this table is safe to read
 * with any member session and can never leak the credential.
 */
export type ClinicWhatsappConfig = {
  id: string;
  clinic_id: string;
  whatsapp_business_account_id: string | null;
  phone_number_id: string | null;
  display_phone_number: string | null;
  connection_status: WhatsappConnectionStatus;
  status_message: string | null;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Service-role-only storage for a clinic's WhatsApp business access token
 * (Phase 12). RLS-enabled with ZERO policies — no client role can ever read
 * or write these rows; only server actions using the service-role key do.
 */
export type ClinicWhatsappSecret = {
  id: string;
  config_id: string;
  access_token: string;
  created_at: string;
  updated_at: string;
};

/**
 * One row per AI chat turn (observability). Only session id / outcome /
 * counts are stored — never patient content.
 */
export type WebsiteStatus = "draft" | "published" | "unpublished";

export type WebsiteTemplate = "classic" | "modern" | "minimal";

/**
 * A clinic's website configuration. One row per clinic (1:1 via unique on
 * clinic_id). `content_json` holds editable content (hero, about, contact,
 * section ordering/visibility). `theme_json` holds visual settings (colors,
 * fonts). `template` selects the presentational layer.
 */
export type Website = {
  id: string;
  clinic_id: string;
  slug: string;
  template: WebsiteTemplate;
  status: WebsiteStatus;
  content_json: Record<string, unknown>;
  theme_json: Record<string, unknown>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * An image belonging to a clinic website (gallery or hero). `kind`
 * distinguishes hero banner, doctor portrait and gallery images; `position`
 * controls display order within each kind.
 */
export type WebsiteImage = {
  id: string;
  website_id: string;
  clinic_id: string;
  kind: "hero" | "doctor" | "gallery";
  url: string;
  alt: string;
  position: number;
  created_at: string;
};

export type AiConversationLog = {
  id: string;
  clinic_id: string;
  session_id: string;
  outcome: AiConversationOutcome;
  message_count: number;
  booking_attempted: boolean;
  error: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Phase 13/14: WhatsApp conversational booking + human takeover inbox
// ---------------------------------------------------------------------------

/** Who wrote a WhatsApp thread message. */
export type WhatsappSenderType = "patient" | "ai" | "staff";

/**
 * Server-side per-thread state for one patient's WhatsApp conversation with a
 * clinic (Phase 13). `session_state` is an opaque jsonb blob owned by
 * `lib/whatsapp/adapter.ts` (selected service/doctor/date/slot, pending
 * reschedule/cancel target). `human_takeover` (Phase 14) stops AI auto-replies
 * for the thread until staff release it.
 */
export type WhatsappConversation = {
  id: string;
  clinic_id: string;
  /** Canonical WhatsApp user id (wa_id): digits only, no leading '+'. */
  patient_whatsapp_number: string;
  patient_id: string | null;
  session_state: Record<string, unknown>;
  human_takeover: boolean;
  last_message_preview: string | null;
  unread_by_staff: boolean;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

/**
 * One message in a WhatsApp thread — the persistent log used by both the
 * orchestrator history and the Phase 14 inbox thread view. `meta_message_id`
 * stores Meta's wamid for INBOUND patient messages and is UNIQUE so webhook
 * retries are deduplicated.
 */
export type WhatsappMessage = {
  id: string;
  conversation_id: string;
  clinic_id: string;
  sender_type: WhatsappSenderType;
  sender_user_id: string | null;
  sender_name: string | null;
  content: string;
  meta_message_id: string | null;
  sent_at: string;
};

// ---------------------------------------------------------------------------
// Phase 8: Billing types
// ---------------------------------------------------------------------------

export type SubscriptionStatus =
  | "pending_payment"
  | "payment_submitted"
  | "under_review"
  | "approved"
  | "active"
  | "expiring"
  | "expired"
  | "rejected";

export type SubscriptionPlan = {
  id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  billing_interval: string;
  features: { key: string; label: string; included: boolean }[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Subscription = {
  id: string;
  clinic_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentMethodType = "bank_transfer" | "jazzcash" | "easypaisa";

export type PaymentMethod = {
  id: string;
  type: PaymentMethodType;
  name: string;
  account_title: string | null;
  account_number: string | null;
  iban: string | null;
  instructions: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PaymentSubmissionStatus = "pending" | "approved" | "rejected" | "expired";

export type PaymentSubmission = {
  id: string;
  clinic_id: string;
  subscription_id: string;
  payment_method_id: string;
  amount: number;
  currency: string;
  sender_name: string;
  sender_phone: string;
  transaction_reference: string;
  account_title: string | null;
  notes: string | null;
  proof_file_path: string | null;
  status: PaymentSubmissionStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingEvent = {
  id: string;
  subscription_id: string | null;
  payment_submission_id: string | null;
  event_type: string;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Phase 9: Observability types
// ---------------------------------------------------------------------------

export type AppEventCategory =
  | "api"
  | "booking"
  | "email"
  | "auth"
  | "billing";
export type AppEventSeverity = "info" | "warning" | "error";

export type AppEventLog = {
  id: string;
  clinic_id: string | null;
  category: AppEventCategory;
  event: string;
  severity: AppEventSeverity;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      clinics: {
        Row: Clinic;
        Insert: {
          id?: string;
          name: string;
          slug: string;
          doctor_name?: string | null;
          timezone?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          google_review_url?: string | null;
          patient_code_prefix?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          name?: string;
          slug?: string;
          doctor_name?: string | null;
          timezone?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          google_review_url?: string | null;
          patient_code_prefix?: string;
          created_by?: string;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinics_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "auth.users";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_members: {
        Row: ClinicMember;
        Insert: {
          id?: string;
          clinic_id: string;
          user_id: string;
          role?: ClinicRole;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: string;
          user_id?: string;
          role?: ClinicRole;
          email?: string;
          created_at?: never;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_members_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinic_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "auth.users";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_invites: {
        Row: ClinicInvite;
        Insert: {
          id?: string;
          clinic_id: string;
          email: string;
          role?: ClinicRole;
          token_hash: string;
          status?: ClinicInviteStatus;
          expires_at: string;
          invited_by: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: string;
          email?: string;
          role?: ClinicRole;
          token_hash?: string;
          status?: ClinicInviteStatus;
          expires_at?: string;
          invited_by?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_invites_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: Service;
        Insert: {
          id?: string;
          clinic_id: string;
          name: string;
          description?: string | null;
          duration_minutes: number;
          price?: number;
          doctor_id?: string | null;
          status?: ServiceStatus;
          category?: ServiceCategory;
          duration_or_report_time?: string | null;
          follow_up_fee?: number | null;
          follow_up_valid_for?: number | null;
          follow_up_period?: "days" | "weeks" | "months" | null;
          preparation_instructions?: string | null;
          consultation_mode?: DoctorConsultationMode;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          name?: string;
          description?: string | null;
          duration_minutes?: number;
          price?: number;
          doctor_id?: string | null;
          status?: ServiceStatus;
          category?: ServiceCategory;
          duration_or_report_time?: string | null;
          follow_up_fee?: number | null;
          follow_up_valid_for?: number | null;
          follow_up_period?: "days" | "weeks" | "months" | null;
          preparation_instructions?: string | null;
          consultation_mode?: DoctorConsultationMode;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "services_clinic_doctor_fkey";
            columns: ["clinic_id", "doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      service_slot_templates: {
        Row: ServiceSlotTemplate;
        Insert: {
          id?: string;
          clinic_id: string;
          service_id: string;
          day_of_week: number;
          slot_name: string;
          start_time: string;
          end_time: string;
          patient_limit?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          service_id?: never;
          day_of_week?: number;
          slot_name?: string;
          start_time?: string;
          end_time?: string;
          patient_limit?: number | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_slot_templates_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_slot_templates_clinic_service_fkey";
            columns: ["clinic_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      doctors: {
        Row: Doctor;
        Insert: {
          id?: string;
          clinic_id: string;
          user_id?: string | null;
          name: string;
          specialty?: string | null;
          credentials?: unknown;
          photo_url?: string | null;
          consultation_fee?: number | null;
          is_visible?: boolean;
          years_of_experience?: number | null;
          qualification?: string | null;
          medical_registration_number?: string | null;
          email?: string | null;
          phone?: string | null;
          follow_up_fee?: number | null;
          follow_up_valid_for?: number | null;
          follow_up_period?: "days" | "weeks" | "months" | null;
          professional_description?: string | null;
          signature_url?: string | null;
          consultation_mode?: DoctorConsultationMode;
          max_patients_per_window?: number;
          consultation_type?: DoctorConsultationType;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          user_id?: string | null;
          name?: string;
          specialty?: string | null;
          credentials?: unknown;
          photo_url?: string | null;
          consultation_fee?: number | null;
          is_visible?: boolean;
          years_of_experience?: number | null;
          qualification?: string | null;
          medical_registration_number?: string | null;
          email?: string | null;
          phone?: string | null;
          follow_up_fee?: number | null;
          follow_up_valid_for?: number | null;
          follow_up_period?: "days" | "weeks" | "months" | null;
          professional_description?: string | null;
          signature_url?: string | null;
          consultation_mode?: DoctorConsultationMode;
          max_patients_per_window?: number;
          consultation_type?: DoctorConsultationType;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doctors_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "doctors_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "auth.users";
            referencedColumns: ["id"];
          },
        ];
      };
      doctor_slot_templates: {
        Row: DoctorSlotTemplate;
        Insert: {
          id?: string;
          clinic_id: string;
          doctor_id: string;
          day_of_week: number;
          slot_name: string;
          start_time: string;
          end_time: string;
          patient_limit?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          doctor_id?: never;
          day_of_week?: number;
          slot_name?: string;
          start_time?: string;
          end_time?: string;
          patient_limit?: number | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doctor_slot_templates_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "doctor_slot_templates_clinic_doctor_fkey";
            columns: ["clinic_id", "doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      doctor_vitals_config: {
        Row: DoctorVitalsConfig;
        Insert: {
          id?: string;
          clinic_id: string;
          doctor_id: string;
          standard_vitals?: unknown;
          custom_vitals?: unknown;
          display_order?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          doctor_id?: never;
          standard_vitals?: unknown;
          custom_vitals?: unknown;
          display_order?: unknown;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "doctor_vitals_config_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "doctor_vitals_config_clinic_doctor_fkey";
            columns: ["clinic_id", "doctor_id"];
            isOneToOne: true;
            referencedRelation: "doctors";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      clinic_whatsapp_config: {
        Row: ClinicWhatsappConfig;
        Insert: {
          id?: string;
          clinic_id: string;
          whatsapp_business_account_id?: string | null;
          phone_number_id?: string | null;
          display_phone_number?: string | null;
          connection_status?: WhatsappConnectionStatus;
          status_message?: string | null;
          connected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          whatsapp_business_account_id?: string | null;
          phone_number_id?: string | null;
          display_phone_number?: string | null;
          connection_status?: WhatsappConnectionStatus;
          status_message?: string | null;
          connected_at?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_whatsapp_config_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: true;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_whatsapp_secrets: {
        Row: ClinicWhatsappSecret;
        Insert: {
          id?: string;
          config_id: string;
          access_token: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          config_id?: never;
          access_token?: string;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_whatsapp_secrets_config_id_fkey";
            columns: ["config_id"];
            isOneToOne: true;
            referencedRelation: "clinic_whatsapp_config";
            referencedColumns: ["id"];
          },
        ];
      };
      availability_rules: {
        Row: AvailabilityRule;
        Insert: {
          id?: string;
          clinic_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          enabled?: boolean;
          doctor_id?: string | null;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          enabled?: boolean;
          doctor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "availability_rules_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "availability_rules_clinic_doctor_fkey";
            columns: ["clinic_id", "doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      blocked_times: {
        Row: BlockedTime;
        Insert: {
          id?: string;
          clinic_id: string;
          start_time: string;
          end_time: string;
          reason?: string | null;
          doctor_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          start_time?: string;
          end_time?: string;
          reason?: string | null;
          doctor_id?: string | null;
          created_at?: never;
        };
        Relationships: [
          {
            foreignKeyName: "blocked_times_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocked_times_clinic_doctor_fkey";
            columns: ["clinic_id", "doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      patients: {
        Row: Patient;
        Insert: {
          id?: string;
          clinic_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          date_of_birth?: string | null;
          notification_preference?: NotificationPreference;
          whatsapp_number?: string | null;
          city?: string | null;
          gender?: "male" | "female" | "other" | null;
          age?: number | null;
          known_allergies?: string | null;
          medical_conditions?: string | null;
          height?: number | null;
          weight?: number | null;
          current_medications?: string | null;
          /** Trigger-assigned UHID — never write it from application code. */
          patient_code?: never;
          blood_group?: BloodGroup | null;
          registered_branch?: string | null;
          ai_summary?: string | null;
          ai_summary_generated_at?: string | null;
          ai_summary_visit_count?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          name?: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          date_of_birth?: string | null;
          notification_preference?: NotificationPreference;
          whatsapp_number?: string | null;
          city?: string | null;
          gender?: "male" | "female" | "other" | null;
          age?: number | null;
          known_allergies?: string | null;
          medical_conditions?: string | null;
          height?: number | null;
          weight?: number | null;
          current_medications?: string | null;
          patient_code?: never;
          blood_group?: BloodGroup | null;
          registered_branch?: string | null;
          ai_summary?: string | null;
          ai_summary_generated_at?: string | null;
          ai_summary_visit_count?: number | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      appointments: {
        Row: Appointment;
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          service_id: string;
          doctor_id?: string | null;
          start_time: string;
          end_time: string;
          status?: AppointmentStatus;
          booking_source?: BookingSource;
          notes?: string | null;
          reminder_sent_at?: string | null;
           consultation_type?: "in_clinic" | "online" | "video";
           created_at?: string;
           updated_at?: string;
        };
        Update: {
           id?: never;
           clinic_id?: never;
           patient_id?: string;
           service_id?: string;
           doctor_id?: string | null;
           start_time?: string;
           end_time?: string;
           status?: AppointmentStatus;
           booking_source?: string;
           notes?: string | null;
           reminder_sent_at?: string | null;
           consultation_type?: "in_clinic" | "online" | "video";
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_clinic_patient_fkey";
            columns: ["clinic_id", "patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["clinic_id", "id"];
          },
          {
            foreignKeyName: "appointments_clinic_service_fkey";
            columns: ["clinic_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["clinic_id", "id"];
          },
          {
            foreignKeyName: "appointments_clinic_doctor_fkey";
            columns: ["clinic_id", "doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      pre_consultation_questions: {
        Row: PreConsultationQuestion;
        Insert: {
          id?: string;
          clinic_id: string;
          doctor_id?: string | null;
          service_id?: string | null;
          timing: PreConsultationTiming;
          question_text: string;
          display_order: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          doctor_id?: string | null;
          service_id?: string | null;
          timing?: PreConsultationTiming;
          question_text?: string;
          display_order?: number;
          active?: boolean;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pre_consultation_questions_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pre_consultation_questions_clinic_doctor_fkey";
            columns: ["clinic_id", "doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["clinic_id", "id"];
          },
          {
            foreignKeyName: "pre_consultation_questions_clinic_service_fkey";
            columns: ["clinic_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      pre_consultation_answers: {
        Row: PreConsultationAnswer;
        Insert: {
          id?: string;
          clinic_id: string;
          appointment_id: string;
          question_id: string;
          answer_text: string;
          answered_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          appointment_id?: never;
          question_id?: never;
          answer_text?: string;
          answered_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pre_consultation_answers_clinic_appointment_fkey";
            columns: ["clinic_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["clinic_id", "id"];
          },
          {
            foreignKeyName: "pre_consultation_answers_clinic_question_fkey";
            columns: ["clinic_id", "question_id"];
            isOneToOne: false;
            referencedRelation: "pre_consultation_questions";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      clinic_ai_settings: {
        Row: ClinicAiSettings;
        Insert: {
          id?: string;
          clinic_id: string;
          agent_name?: string;
          welcome_message?: string | null;
          tone?: AiTone;
          clinic_description?: string | null;
          booking_rules?: string | null;
          cancellation_policy_text?: string | null;
          faqs?: unknown;
          required_patient_fields?: string[];
          enabled?: boolean;
          whatsapp_enabled?: boolean;
          agent_tier?: AiAgentTier;
          greeting_style?: AiGreetingStyle;
          is_activated?: boolean;
          widget_color?: string;
          widget_position?: WidgetPosition;
          widget_avatar_url?: string | null;
          widget_header_subtitle?: string | null;
          llm_provider?: LlmProvider;
          llm_model?: string | null;
          llm_key_verified?: boolean;
          llm_key_verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          agent_name?: string;
          welcome_message?: string | null;
          tone?: AiTone;
          clinic_description?: string | null;
          booking_rules?: string | null;
          cancellation_policy_text?: string | null;
          faqs?: unknown;
          required_patient_fields?: string[];
          enabled?: boolean;
          whatsapp_enabled?: boolean;
          agent_tier?: AiAgentTier;
          greeting_style?: AiGreetingStyle;
          is_activated?: boolean;
          widget_color?: string;
          widget_position?: WidgetPosition;
          widget_avatar_url?: string | null;
          widget_header_subtitle?: string | null;
          llm_provider?: LlmProvider;
          llm_model?: string | null;
          llm_key_verified?: boolean;
          llm_key_verified_at?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_ai_settings_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: true;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_conversation_logs: {
        Row: AiConversationLog;
        Insert: {
          id?: string;
          clinic_id: string;
          session_id: string;
          outcome: AiConversationOutcome;
          message_count?: number;
          booking_attempted?: boolean;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          session_id?: string;
          outcome?: AiConversationOutcome;
          message_count?: number;
          booking_attempted?: boolean;
          error?: string | null;
          created_at?: never;
        };
        Relationships: [
          {
            foreignKeyName: "ai_conversation_logs_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_conversations: {
        Row: WhatsappConversation;
        Insert: {
          id?: string;
          clinic_id: string;
          patient_whatsapp_number: string;
          patient_id?: string | null;
          session_state?: Record<string, unknown>;
          human_takeover?: boolean;
          last_message_preview?: string | null;
          unread_by_staff?: boolean;
          last_message_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          patient_whatsapp_number?: never;
          patient_id?: string | null;
          session_state?: Record<string, unknown>;
          human_takeover?: boolean;
          last_message_preview?: string | null;
          unread_by_staff?: boolean;
          last_message_at?: string;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_conversations_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_messages: {
        Row: WhatsappMessage;
        Insert: {
          id?: string;
          conversation_id: string;
          clinic_id: string;
          sender_type: WhatsappSenderType;
          sender_user_id?: string | null;
          sender_name?: string | null;
          content: string;
          meta_message_id?: string | null;
          sent_at?: string;
        };
        Update: {
          id?: never;
          conversation_id?: never;
          clinic_id?: never;
          sender_type?: WhatsappSenderType;
          sender_user_id?: string | null;
          sender_name?: string | null;
          content?: string;
          meta_message_id?: string | null;
          sent_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "whatsapp_messages_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      websites: {
        Row: Website;
        Insert: {
          id?: string;
          clinic_id: string;
          slug: string;
          template?: WebsiteTemplate;
          status?: WebsiteStatus;
          content_json?: Record<string, unknown>;
          theme_json?: Record<string, unknown>;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          slug?: string;
          template?: WebsiteTemplate;
          status?: WebsiteStatus;
          content_json?: Record<string, unknown>;
          theme_json?: Record<string, unknown>;
          published_at?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "websites_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: true;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      website_images: {
        Row: WebsiteImage;
        Insert: {
          id?: string;
          website_id: string;
          clinic_id: string;
          kind?: "hero" | "doctor" | "gallery";
          url: string;
          alt?: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: never;
          website_id?: never;
          clinic_id?: never;
          kind?: "hero" | "doctor" | "gallery";
          url?: string;
          alt?: string;
          position?: number;
          created_at?: never;
        };
        Relationships: [
          {
            foreignKeyName: "website_images_website_id_fkey";
            columns: ["website_id"];
            isOneToOne: false;
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "website_images_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: { user_id: string; created_at: string };
        Insert: { user_id: string; created_at?: string };
        Update: { user_id?: never; created_at?: never };
        Relationships: [];
      };
      subscription_plans: {
        Row: SubscriptionPlan;
        Insert: {
          id?: string;
          code: string;
          name: string;
          price: number;
          currency?: string;
          billing_interval?: string;
          features?: { key: string; label: string; included: boolean }[];
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          code?: string;
          name?: string;
          price?: number;
          currency?: string;
          billing_interval?: string;
          features?: { key: string; label: string; included: boolean }[];
          active?: boolean;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: Subscription;
        Insert: {
          id?: string;
          clinic_id: string;
          plan_id: string;
          status?: SubscriptionStatus;
          current_period_start?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          plan_id?: string;
          status?: SubscriptionStatus;
          current_period_start?: string | null;
          current_period_end?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: true;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "subscription_plans";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_methods: {
        Row: PaymentMethod;
        Insert: {
          id?: string;
          type: PaymentMethodType;
          name: string;
          account_title?: string | null;
          account_number?: string | null;
          iban?: string | null;
          instructions?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          type?: PaymentMethodType;
          name?: string;
          account_title?: string | null;
          account_number?: string | null;
          iban?: string | null;
          instructions?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [];
      };
      payment_submissions: {
        Row: PaymentSubmission;
        Insert: {
          id?: string;
          clinic_id: string;
          subscription_id: string;
          payment_method_id: string;
          amount: number;
          currency?: string;
          sender_name: string;
          sender_phone: string;
          transaction_reference: string;
          account_title?: string | null;
          notes?: string | null;
          proof_file_path?: string | null;
          status?: PaymentSubmissionStatus;
          rejection_reason?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          subscription_id?: string;
          payment_method_id?: string;
          amount?: number;
          currency?: string;
          sender_name?: string;
          sender_phone?: string;
          transaction_reference?: string;
          account_title?: string | null;
          notes?: string | null;
          proof_file_path?: string | null;
          status?: PaymentSubmissionStatus;
          rejection_reason?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_submissions_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_submissions_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_submissions_payment_method_id_fkey";
            columns: ["payment_method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_events: {
        Row: BillingEvent;
        Insert: {
          id?: string;
          subscription_id?: string | null;
          payment_submission_id?: string | null;
          event_type: string;
          actor_user_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: never;
          subscription_id?: string | null;
          payment_submission_id?: string | null;
          event_type?: string;
          actor_user_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: never;
        };
        Relationships: [
          {
            foreignKeyName: "billing_events_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "subscriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "billing_events_payment_submission_id_fkey";
            columns: ["payment_submission_id"];
            isOneToOne: false;
            referencedRelation: "payment_submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      app_event_logs: {
        Row: AppEventLog;
        Insert: {
          id?: string;
          clinic_id?: string | null;
          category: AppEventCategory;
          event: string;
          severity?: AppEventSeverity;
          actor_user_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: string | null;
          category?: AppEventCategory;
          event?: string;
          severity?: AppEventSeverity;
          actor_user_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: never;
        };
        Relationships: [
          {
            foreignKeyName: "app_event_logs_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      visits: {
        Row: Visit;
        Insert: {
          id?: string;
          clinic_id: string;
          appointment_id: string;
          patient_id: string;
          doctor_id?: string | null;
          status?: VisitStatus;
          payment_status?: PaymentStatus;
          token_number: number;
          queue_position: number;
          checked_in_at?: string;
          consultation_started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          appointment_id?: never;
          patient_id?: never;
          doctor_id?: string | null;
          status?: VisitStatus;
          payment_status?: PaymentStatus;
          token_number?: number;
          queue_position?: number;
          checked_in_at?: string;
          consultation_started_at?: string | null;
          completed_at?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "visits_clinic_appointment_fkey";
            columns: ["clinic_id", "appointment_id"];
            isOneToOne: true;
            referencedRelation: "appointments";
            referencedColumns: ["clinic_id", "id"];
          },
          {
            foreignKeyName: "visits_clinic_patient_fkey";
            columns: ["clinic_id", "patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["clinic_id", "id"];
          },
          {
            foreignKeyName: "visits_clinic_doctor_fkey";
            columns: ["clinic_id", "doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      vitals: {
        Row: Vitals;
        Insert: {
          id?: string;
          clinic_id: string;
          visit_id: string;
          recorded_by?: string | null;
          blood_pressure?: string | null;
          systolic_bp?: number | null;
          diastolic_bp?: number | null;
          temperature?: number | null;
          pulse?: number | null;
          weight?: number | null;
          height?: number | null;
          spo2?: number | null;
          respiratory_rate?: number | null;
          bmi?: number | null;
          custom_vitals?: unknown;
          recorded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          visit_id?: never;
          recorded_by?: string | null;
          blood_pressure?: string | null;
          systolic_bp?: number | null;
          diastolic_bp?: number | null;
          temperature?: number | null;
          pulse?: number | null;
          weight?: number | null;
          height?: number | null;
          spo2?: number | null;
          respiratory_rate?: number | null;
          bmi?: number | null;
          custom_vitals?: unknown;
          recorded_at?: string;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vitals_clinic_visit_fkey";
            columns: ["clinic_id", "visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      prescriptions: {
        Row: Prescription;
        Insert: {
          id?: string;
          clinic_id: string;
          visit_id: string;
          patient_id: string;
          doctor_id?: string | null;
          chief_complaint?: string;
          findings?: string;
          diagnosis?: string;
          custom_diagnosis?: string;
          medicines?: MedicineEntry[];
          lab_orders?: LabOrder[];
          follow_up_date?: string | null;
          follow_up_notes?: string;
          doctor_notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          visit_id?: never;
          patient_id?: never;
          doctor_id?: string | null;
          chief_complaint?: string;
          findings?: string;
          diagnosis?: string;
          custom_diagnosis?: string;
          medicines?: MedicineEntry[];
          lab_orders?: LabOrder[];
          follow_up_date?: string | null;
          follow_up_notes?: string;
          doctor_notes?: string;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prescriptions_clinic_visit_fkey";
            columns: ["clinic_id", "visit_id"];
            isOneToOne: false;
            referencedRelation: "visits";
            referencedColumns: ["clinic_id", "id"];
          },
          {
            foreignKeyName: "prescriptions_clinic_patient_fkey";
            columns: ["clinic_id", "patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["clinic_id", "id"];
          },
          {
            foreignKeyName: "prescriptions_clinic_doctor_fkey";
            columns: ["clinic_id", "doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      prescription_templates: {
        Row: PrescriptionTemplate;
        Insert: {
          id?: string;
          clinic_id: string;
          doctor_id: string;
          name: string;
          diagnosis?: string;
          custom_diagnosis?: string;
          medicines?: MedicineEntry[];
          lab_orders?: LabOrder[];
          doctor_notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          doctor_id?: never;
          name?: string;
          diagnosis?: string;
          custom_diagnosis?: string;
          medicines?: MedicineEntry[];
          lab_orders?: LabOrder[];
          doctor_notes?: string;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prescription_templates_clinic_doctor_fkey";
            columns: ["clinic_id", "doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      patient_bills: {
        Row: PatientBill;
        Insert: {
          id?: string;
          clinic_id: string;
          visit_id?: string | null;
          patient_id: string;
          total_amount?: number;
          discount_amount?: number;
          discount_percent?: number;
          currency?: string;
          status?: PatientBillStatus;
          /** Trigger-assigned bill number — never write it from application code. */
          bill_number?: never;
          bill_type?: PatientBillType;
          bill_date?: string;
          doctor_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          visit_id?: string | null;
          patient_id?: string;
          total_amount?: number;
          discount_amount?: number;
          discount_percent?: number;
          currency?: string;
          status?: PatientBillStatus;
          bill_number?: never;
          bill_type?: PatientBillType;
          bill_date?: string;
          doctor_id?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_bills_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_bills_clinic_doctor_fkey";
            columns: ["clinic_id", "doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      patient_bill_items: {
        Row: PatientBillItem;
        Insert: {
          id?: string;
          clinic_id: string;
          bill_id: string;
          description: string;
          quantity?: number;
          unit_price: number;
          line_total: number;
          created_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          bill_id?: never;
          description?: string;
          quantity?: number;
          unit_price?: number;
          line_total?: number;
          created_at?: never;
        };
        Relationships: [
          {
            foreignKeyName: "patient_bill_items_bill_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "patient_bills";
            referencedColumns: ["id"];
          },
        ];
      };
      patient_payments: {
        Row: PatientPayment;
        Insert: {
          id?: string;
          clinic_id: string;
          bill_id: string;
          amount: number;
          payment_method: PatientPaymentMethod;
          payment_reference?: string | null;
          collected_by_user_id?: string | null;
          collected_at?: string;
          created_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          bill_id?: never;
          amount?: number;
          payment_method?: PatientPaymentMethod;
          payment_reference?: string | null;
          collected_by_user_id?: string | null;
          collected_at?: string;
          created_at?: never;
        };
        Relationships: [
          {
            foreignKeyName: "patient_payments_bill_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "patient_bills";
            referencedColumns: ["id"];
          },
        ];
      };
      receipts: {
        Row: Receipt;
        Insert: {
          id?: string;
          clinic_id: string;
          bill_id: string;
          receipt_number: number;
          generated_at?: string;
          pdf_path?: string | null;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          bill_id?: never;
          receipt_number?: number;
          generated_at?: string;
          pdf_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "receipts_bill_fkey";
            columns: ["bill_id"];
            isOneToOne: false;
            referencedRelation: "patient_bills";
            referencedColumns: ["id"];
          },
        ];
      };
      patient_documents: {
        Row: PatientDocument;
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          document_name: string;
          file_path: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by_user_id?: string | null;
          uploaded_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          patient_id?: never;
          document_name?: string;
          file_path?: never;
          mime_type?: never;
          size_bytes?: never;
          uploaded_by_user_id?: never;
          uploaded_at?: never;
        };
        Relationships: [
          {
            foreignKeyName: "patient_documents_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_documents_clinic_patient_fkey";
            columns: ["clinic_id", "patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["clinic_id", "id"];
          },
        ];
      };
      clinic_ai_secrets: {
        Row: ClinicAiSecret;
        Insert: {
          id?: string;
          settings_id: string;
          api_key: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          settings_id?: never;
          api_key?: string;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_ai_secrets_settings_id_fkey";
            columns: ["settings_id"];
            isOneToOne: true;
            referencedRelation: "clinic_ai_settings";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      patient_directory: {
        Row: PatientDirectoryRow;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      book_appointment: {
        Args: {
          p_clinic_id: string;
          p_patient_id: string;
          p_service_id: string;
          p_start_time: string;
          p_end_time: string;
          p_booking_source: string;
          p_notes: string | null;
          p_status: AppointmentStatus;
          p_doctor_id?: string | null;
          p_consultation_type?: ConsultationType;
        };
        Returns: Appointment;
      };
      ensure_walk_in_service: {
        Args: {
          p_clinic_id: string;
        };
        Returns: string;
      };
      reschedule_appointment: {
        Args: {
          p_appointment_id: string;
          p_clinic_id: string;
          p_new_start_time: string;
          p_new_end_time: string;
        };
        Returns: Appointment;
      };
      upsert_availability_rules: {
        Args: {
          p_clinic_id: string;
          p_doctor_id: string | null;
          p_rules: unknown;
        };
        Returns: undefined;
      };
      activate_subscription: {
        Args: {
          p_subscription_id: string;
          p_duration_days?: number;
        };
        Returns: Subscription;
      };
      has_active_subscription: {
        Args: {
          p_clinic_id: string;
        };
        Returns: boolean;
      };
      check_in_patient: {
        Args: {
          p_clinic_id: string;
          p_appointment_id: string;
          p_payment_status?: PaymentStatus;
        };
        Returns: Visit;
      };
      record_vitals: {
        Args: {
          p_visit_id: string;
          p_blood_pressure: string | null;
          p_temperature: number | null;
          p_pulse: number | null;
          p_weight: number | null;
          p_height: number | null;
          p_systolic_bp?: number | null;
          p_diastolic_bp?: number | null;
          p_spo2?: number | null;
          p_respiratory_rate?: number | null;
          p_custom_vitals?: unknown;
        };
        Returns: Vitals;
      };
      record_pre_consultation_answers: {
        Args: {
          p_clinic_id: string;
          p_appointment_id: string;
          p_answers?: unknown;
        };
        Returns: undefined;
      };
      reorder_queue: {
        Args: {
          p_clinic_id: string;
          p_visit_id: string;
          p_new_position: number;
        };
        Returns: undefined;
      };
      start_consultation: {
        Args: {
          p_clinic_id: string;
          p_visit_id: string;
        };
        Returns: Visit;
      };
      complete_and_advance: {
        Args: {
          p_clinic_id: string;
          p_visit_id: string;
        };
        Returns: Visit;
      };
      /** 0041 — re-parents all of the duplicate's rows onto the primary, then
       *  soft-archives the duplicate. Returns the primary id on success. */
      merge_patient_profiles: {
        Args: {
          p_primary_patient_id: string;
          p_duplicate_patient_id: string;
        };
        Returns: string;
      };
      create_patient_bill: {
        Args: {
          p_clinic_id: string;
          p_patient_id: string;
          p_visit_id?: string | null;
          p_items?: unknown;
          p_currency?: string;
          p_bill_type?: string;
          p_doctor_id?: string | null;
          p_bill_date?: string | null;
        };
        Returns: PatientBill;
      };
      collect_patient_payment: {
        Args: {
          p_clinic_id: string;
          p_bill_id: string;
          p_payment_method: PatientPaymentMethod;
          p_amount: number;
        };
        Returns: Receipt;
      };
      collect_patient_payment_with_adjustments: {
        Args: {
          p_clinic_id: string;
          p_bill_id: string;
          p_payment_method: PatientPaymentMethod;
          p_additional_charges?: unknown;
          p_discount_amount?: number;
          p_discount_percent?: number;
        };
        Returns: Receipt | null;
      };
    };
    Enums: {
      clinic_role: ClinicRole;
      service_status: ServiceStatus;
      appointment_status: AppointmentStatus;
      visit_status: VisitStatus;
      payment_status: PaymentStatus;
      patient_bill_status: PatientBillStatus;
      patient_payment_method: PatientPaymentMethod;
      website_status: WebsiteStatus;
      subscription_status: SubscriptionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
