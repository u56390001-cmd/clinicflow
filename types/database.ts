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
  "pending" | "confirmed" | "completed" | "cancelled" | "no_show";

/** Where the booking was created. This phase only writes `dashboard`. */
export type BookingSource = string;

/**
 * Queue Management preference on `clinics.appointments_view_mode`
 * (migration 0043). `queue` shows the live waiting queue above the
 * appointment tabs; `list` shows the plain list.
 */
export type AppointmentsViewMode = "queue" | "list";

/**
 * Shape given to new patient IDs (UHID). See `clinics.patient_code_format`,
 * migration 0055.
 */
export type PatientCodeFormat = "sequence" | "year_sequence";

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
   * Object path inside the public `clinic-logos` bucket, or null when the
   * clinic has no logo (migration 0054). Public bucket because the logo also
   * renders on unauthenticated patient-facing pages.
   */
  logo_url: string | null;
  /**
   * UHID prefix, 2–6 uppercase letters, default `CLI`. Feeds
   * `assign_patient_code` to produce `CLI-2026-00001` (migration 0029).
   * Changing it does not renumber existing patients.
   */
  patient_code_prefix: string;
  /**
   * Shape given to NEW patient IDs (migration 0055). `year_sequence` yields
   * `CLI-2026-00001` and restarts each calendar year in the clinic's timezone —
   * the only behaviour before 0055, and still the default. `sequence` yields
   * `CLI-00001`, running continuously across year boundaries.
   *
   * Existing `patients.patient_code` values are never rewritten by a change
   * here; the setting only affects codes minted after it is saved.
   */
  patient_code_format: PatientCodeFormat;
  /**
   * Organization settings → Billing (migration 0056).
   *
   * `bill_number_prefix` and `receipt_prefix` are not display-only: they are
   * read by the `assign_bill_number` and `assign_receipt_code` triggers, so the
   * values generated in the database always match what the settings card
   * previews. Both are constrained to 2–6 uppercase letters.
   */
  bill_number_prefix: string;
  receipt_prefix: string;
  /** Send the receipt over WhatsApp automatically once a payment is collected. */
  auto_send_whatsapp_receipt: boolean;
  /** Printed at the bottom of receipts. */
  receipt_footer_message: string | null;
  /**
   * When true, printed receipts carry `gst_number` and the SGST/CGST split of
   * `gst_rate`. Both fields are ignored while this is false, so turning it off
   * is enough to stop showing tax without losing the numbers.
   */
  show_gst_on_receipt: boolean;
  gst_number: string | null;
  /** Total GST percentage (0–100), split evenly into SGST and CGST. */
  gst_rate: number | null;
  /** Shown on the bill detail modal and receipt print view. Capped at 1000 words. */
  bill_terms: string | null;
  /**
   * Organization settings → Prescription (migration 0057).
   *
   * When false, printed prescriptions omit the clinic name, address, phone and
   * the `PRESCRIPTION` title, leaving a clean sheet for clinics that print onto
   * their own letterhead. The patient QR is part of that block and goes with it.
   *
   * Defaults to true: a clinic that has never opened this tab keeps printing the
   * header it prints today. Both print paths (`consultation-view.tsx` and
   * `prescription-workspace.tsx`) read this one column, so the answer is set
   * once per clinic rather than per workstation.
   */
  show_prescription_header: boolean;
  /**
   * Queue Management preference, written by the /app/integrations dashboard
   * (migration 0043). `queue` renders the live waiting queue on the
   * appointments page, `list` shows the plain list. Defaults to `queue`, which
   * is the behaviour the appointments page already had.
   */
  appointments_view_mode: AppointmentsViewMode;
  /**
   * Public booking page settings (migration 0058).
   *
   * `booking_slug` is the short name in the public link
   * `/book/<booking_slug>`. It is nullable and defaults to null: a clinic with
   * no custom slug falls back to `slug` when the link is built, so upgrading
   * clinics keep working without a backfill. The partial unique index on this
   * column makes the value globally unique across every clinic, which is why
   * the availability check is a lookup rather than a scoped one.
   */
  booking_slug: string | null;
  /**
   * Master switch for the public booking page. When false the public route
   * still resolves but renders the "booking unavailable" state, so links
   * shared before a clinic pauses bookings do not 404.
   */
  is_public_booking_enabled: boolean;
  /** Length of one bookable slot in minutes; drives the slot grid. */
  slot_duration_minutes: number;
  /** How far ahead patients may book. Null means no limit. */
  max_advance_days: number | null;
  /**
   * When true a submitted booking is confirmed immediately instead of waiting
   * for staff approval. The public form reads this to decide whether to show
   * a "request sent" or a "confirmed" message.
   */
  auto_approve_bookings: boolean;
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
  "consultation" | "service" | "diagnostic" | "lab_test" | "procedure";

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
export type BloodGroup =
  "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

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
  /**
   * Baseline past-history narrative captured on the patient row (migration
   * 0046). Free text, not structured: these are sentences a doctor types at
   * intake ("Appendectomy 2018, Cholecystectomy 2022"), not records with dates.
   * Dated clinical events added over time live in `medical_history` (0045)
   * instead.
   */
  past_illnesses: string | null;
  past_surgeries: string | null;
  hospitalizations: string | null;
  family_history: string | null;
  personal_history: string | null;
  immunization_history: string | null;
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
  "scheduled" | "checked_in" | "waiting" | "in_consultation" | "completed";

/** Independent payment-state dimension on a visit — not hard-wired to visit status. */
export type PaymentStatus =
  "pending" | "collected_pre" | "collected_post" | "not_required";

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
  /** Blood glucose in mg/dL. Optional — most check-ins do not measure it. */
  blood_sugar: number | null;
  /** Phase 20 — clinic-defined custom vitals recorded for this visit. */
  custom_vitals: CustomVitalValue[] | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
};

/**
 * One past-history fact: a surgical procedure, a chronic condition, a past
 * illness, a hospitalization, a relative's condition, a social/lifestyle note,
 * or an immunization (migration 0043, widened in 0048).
 * `category` is the DB CHECK list; `relationship` only applies to `family`
 * entries ("Father", "Mother", …). `date` is a partial history — plenty of
 * these are known without a year — so it is nullable rather than defaulted.
 * 0048 added `source` (who recorded it), `verification_status` (clinician
 * approval — AI OCR / patient intake rows start `pending_approval`) and
 * `clinical_status` (active / resolved / chronic).
 * `report_date` (0052) is the date of the scanned document this entry came
 * from — NOT the onset date, which is `date`.
 */
export type MedicalHistory = {
  id: string;
  clinic_id: string;
  patient_id: string;
  category:
    | "surgical"
    | "chronic"
    | "past_illnesses"
    | "hospitalization"
    | "family"
    | "social"
    | "immunization";
  condition: string;
  date: string | null;
  report_date: string | null;
  notes: string | null;
  relationship: string | null;
  source: "patient_intake" | "ai_ocr" | "doctor_entry" | "receptionist";
  verification_status: "verified" | "pending_approval";
  clinical_status: "active" | "resolved" | "chronic";
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A medicine tracked on a patient's medication list (migration 0050).
 *
 * AI OCR rows land with `status: "active_pending"` and `source: "ai_ocr"` so
 * they never surface in the Overview "Active Medications" list until a clinician
 * approves them; `report_name` is the scanned file they came from.
 */
export type PatientMedication = {
  id: string;
  clinic_id: string;
  patient_id: string;
  medicine_name: string;
  strength: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  report_name: string | null;
  report_date: string | null;
  status: "active_pending" | "active" | "discontinued";
  source: "manual" | "ai_ocr";
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A single lab value read out of a scanned report, or entered by hand
 * (migration 0053).
 *
 * `test_value` is TEXT, not numeric, on purpose: real reports contain "<0.01",
 * "Positive", ">1000" and "Not Detected", and a numeric column would force all
 * of those to null — which is to say, it would discard exactly the results that
 * matter most. Range comparison happens where the report's own
 * `reference_range` is available, not by parsing strings.
 *
 * `abnormal` is an enum rather than a boolean: "High", "Low" and "Critical" are
 * three different signals, and a value inside the lab's stated range can still
 * be clinically alarming, which a boolean has no way to say.
 *
 * AI OCR rows arrive `active_pending` and stay unread-by-clinicians until
 * approved, exactly like `PatientMedication` — an unverified number in the
 * prescription sidebar is worse than no number, because it looks authoritative.
 */
export type PatientLabResult = {
  id: string;
  clinic_id: string;
  patient_id: string;
  /** The scan this came from; null if that upload was later deleted. */
  document_id: string | null;
  test_name: string;
  test_value: string | null;
  unit: string | null;
  /** The report's own range, verbatim — labs differ, so we do not hardcode. */
  reference_range: string | null;
  abnormal: "normal" | "high" | "low" | "critical" | null;
  report_date: string | null;
  report_name: string | null;
  status: "active_pending" | "active" | "discontinued";
  source: "manual" | "ai_ocr";
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A safety alert (allergy or known condition) staged from a scanned document
 * (migration 0051). AI OCR rows arrive `active_pending`; approving one merges
 * its `text` into the matching free-text column on `patients`
 * (`known_allergies` for `allergy`, `medical_conditions` for `known_case`) so
 * it can never reach the red Critical Safety Alerts block unverified.
 */
export type PatientAlert = {
  id: string;
  clinic_id: string;
  patient_id: string;
  alert_type: "allergy" | "known_case";
  text: string;
  report_name: string | null;
  report_date: string | null;
  status: "active_pending" | "approved" | "dismissed";
  source: "ai_ocr";
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * The six categories the intake form and OCR parser emit (migration 0049's
 * extractor vocabularies map onto DB categories — past_illness → past_illnesses,
 * surgery → surgical, lifestyle → social — see lib/medical-history-mapping.ts).
 */
export type IntakeHistoryCategory =
  | "past_illness"
  | "surgery"
  | "hospitalization"
  | "family_history"
  | "lifestyle"
  | "immunization";

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

/**
 * A row in a clinic's medicine catalogue — Organization settings → Prescription
 * → "Manage Medicines" (migration 0057).
 *
 * Distinct from the three things that also involve medicines:
 *   * `MedicineEntry` above is a line inside ONE prescription's jsonb array.
 *   * `PatientMedication` (0050) is one patient's medication history, usually
 *     OCR-extracted.
 *   * `OPD_MEDICINE_SUGGESTIONS` in `lib/opd-medicines.ts` is a hard-coded
 *     general list.
 *
 * This is the clinic's own editable list. `is_active` is a soft flag rather than
 * a delete, so a drug retired from the suggestion list keeps the name available
 * for prescriptions that already mention it.
 */
export type ClinicMedicine = {
  id: string;
  clinic_id: string;
  /** Drug name without the strength, e.g. "Amlodipine". */
  name: string;
  /** Dosage variant, e.g. "5mg". Null when the drug has one form. */
  strength: string | null;
  /** Free text, e.g. "Tablet", "Capsule", "Soap". */
  category: string | null;
  is_active: boolean;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A single lab order entry within a prescription's lab_orders jsonb array.
 *
 * `sub_parameters` is optional because it was added after rows existed: an
 * older order is the whole panel by definition. It lives in jsonb rather than a
 * join table on purpose — a lab order is a line on a prescription, not a
 * specimen with results, and nothing queries "all Platelets orders" across
 * patients to justify normalising it.
 */
export type LabOrder = {
  test_name: string;
  notes: string;
  /** The individual parameters of a panel order, e.g. ["Platelets", "ESR"]. */
  sub_parameters?: string[];
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
  "pending" | "paid" | "partially_paid" | "waived" | "cancelled";

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

export type PatientPaymentMethodUI =
  (typeof PATIENT_PAYMENT_METHODS_UI)[number];

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
  /**
   * Ordering key: a per-clinic counter. Kept as an integer because three
   * existing RPCs (0025, 0028, 0031) assign it as `max(...) + 1`.
   *
   * Do not use it for display — that is `receipt_code`.
   */
  receipt_number: number;
  /**
   * Human-facing receipt ID, `{PREFIX}-{YYYYMMDD}-{NNN}` (migration 0056).
   * Filled by the `assign_receipt_code` BEFORE INSERT trigger from
   * `clinics.receipt_prefix`, so it respects the prefix set in Billing settings.
   */
  receipt_code: string;
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
 * `document_date` (0052) is the date printed on the document itself, distinct
 * from `uploaded_at` (when the file reached us); null for manually uploaded
 * files, which carry no such date.
 */
export type PatientDocument = {
  id: string;
  clinic_id: string;
  patient_id: string;
  document_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  document_date: string | null;
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

/**
 * A transient scan staged between the browser and the AI parser (migration
 * 0049). Also PRIVATE. Objects live at `{clinic_id}/{patient_id}/{uuid}-...`
 * only for the few seconds it takes the server to read them back and hand them
 * to the model — they are deleted when parsing finishes.
 */
export const AI_OCR_DOCUMENTS_BUCKET = "ai-ocr-documents";

/**
 * Shareable pre-intake form link (migration 0049). Only the SHA-256 hash of the
 * raw token is stored — the raw 64-hex token exists solely in the URL the
 * clinic sends the patient. RLS is enabled with no Data-API policies: reads and
 * writes go through the service-role client with the token hash as the
 * capability, exactly like `clinic_invites` (0011).
 */
export type PatientIntakeToken = {
  id: string;
  clinic_id: string;
  patient_id: string;
  /** SHA-256 hex of the raw token — never the token itself. */
  token_hash: string;
  status: "pending" | "used" | "revoked" | "expired";
  created_by: string;
  expires_at: string;
  submitted_at: string | null;
  created_at: string;
};

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

export type WhatsappConnectionStatus = "not_connected" | "connected" | "error";

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

/** DNS state of a clinic's custom domain (migration 0059). */
export type WebsiteDomainStatus = "none" | "pending" | "verified" | "failed";

/**
 * A clinic's website configuration. One row per clinic (1:1 via unique on
 * clinic_id). `content_json` holds editable content (hero, about, contact,
 * section ordering/visibility). `theme_json` holds visual settings (colors,
 * fonts). `template` selects the presentational layer.
 *
 * 0059 added the custom-domain columns and `seo_json`. `domain` is null for the
 * ordinary case — the site is served from the ClinicFlow subdomain — so every
 * reader must treat "no domain" as normal rather than as missing data.
 */
export type Website = {
  id: string;
  clinic_id: string;
  slug: string;
  template: WebsiteTemplate;
  status: WebsiteStatus;
  content_json: Record<string, unknown>;
  theme_json: Record<string, unknown>;
  widget_json: Record<string, unknown>;
  seo_json: Record<string, unknown>;
  locale_json: Record<string, unknown>;
  domain: string | null;
  domain_status: WebsiteDomainStatus;
  domain_verification_token: string | null;
  domain_verified_at: string | null;
  doctor_page_slug: string | null;
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

// ---------------------------------------------------------------------------
// Growth Agent (Phase 24, migration 0042)
// ---------------------------------------------------------------------------

/**
 * Lifecycle of a Google Business Profile post.
 *
 * `published` means "handed off / marked live". While the Google integration is
 * absent there is no API call behind that transition, so the UI is explicit
 * about the difference rather than implying the post is already on Google.
 */
export type GrowthPostStatus = "draft" | "scheduled" | "published" | "failed";

/**
 * Google Business Profile connection state.
 *
 * Four values, not a boolean: the UI has to tell "retry the handshake" apart
 * from "sign in again", and `connecting` is a real state in between.
 */
export type GrowthConnectionState =
  "not_connected" | "connecting" | "connected" | "error";

/** How often the scheduler writes a fresh post. */
export type GrowthPostingFrequency = "weekly" | "biweekly" | "monthly";

// =============================================================================
// Phase 25 — Integrations dashboard (migration 0043)
// =============================================================================

/**
 * Catalogue key for an integration. Mirrors `INTEGRATION_CATALOG` in
 * `lib/constants.ts`, which is the runtime source of truth — this union exists
 * so the server action can reject a key that is not in the catalogue before it
 * reaches the database.
 *
 * Note that `queue` is deliberately absent conceptually but present as a key:
 * it is the one integration backed by a column on `clinics` rather than a
 * `clinic_integrations` row, because the live waiting queue it controls already
 * works. See INTEGRATION_CATALOG for the `backedBy` flag that expresses this.
 */
export type IntegrationKey =
  | "gcal"
  | "gmeet"
  | "gsheets"
  | "zoom"
  | "msteams"
  | "queue"
  | "whatsapp"
  | "smsgateway";

/**
 * Integration lifecycle state.
 *
 * Three values, not a boolean: a failed enable is a state a boolean cannot
 * represent, and the UI has to distinguish it from a deliberate "off" so it can
 * offer a retry rather than a re-auth.
 *
 * `activated` is only reachable for integrations that do something real inside
 * this app today. The seven vendor integrations require OAuth credentials and
 * API approval that this deployment does not have, so they read as configured
 * or not configured — never as "connected to Google".
 */
export type IntegrationStatus = "disabled" | "activated" | "error";

/**
 * Per-clinic integration state. One row per (clinic_id, integration_key).
 *
 * `config` holds NON-SECRET settings only (spreadsheet id, timezone, phone
 * number). API keys and tokens live in `ClinicIntegrationSecret`, which has no
 * RLS policies and is reachable only with the service role.
 */
export type ClinicIntegration = {
  id: string;
  clinic_id: string;
  integration_key: string;
  status: IntegrationStatus;
  last_error: string | null;
  /** Non-secret settings only — never credentials. */
  config: Record<string, unknown>;
  /** Null means the clinic has never saved a working configuration. */
  configured_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Integration credentials, isolated from the rest of the table so no clinic
 * member can read them. There are intentionally ZERO RLS policies on this
 * table: `anon` and `authenticated` can never read or write a row regardless of
 * platform privilege re-grants, and the service role is the only accessor.
 *
 * The dashboard never receives these values — `lib/actions/integrations.ts`
 * returns booleans derived from their presence, never the values themselves.
 * The generic slots exist so one table serves every vendor; the action layer
 * checks that the fields a given catalogue entry requires are all present.
 */
export type ClinicIntegrationSecret = {
  id: string;
  integration_id: string;
  api_key: string | null;
  api_secret: string | null;
  account_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Add-ons marketplace (migration 0060).
 *
 * `Addon` is one catalog row — the storefront's data source. `slug` is the
 * feature-gate key handed to `public.is_addon_active()`; `sort_order` drives
 * the curated marketplace order; `price_pkr` is rendered through
 * `lib/utils/currency.ts`, never formatted by hand.
 */
export type AddonCategory = "Automation" | "Growth & Marketing" | "Operations";

export type Addon = {
  id: string;
  slug: string;
  name: string;
  category: AddonCategory;
  description: string;
  /** Monthly price in PKR. */
  price_pkr: number;
  billing_period: string;
  /** Seat/display add-ons are bought per unit; feature add-ons are single. */
  is_quantity_based: boolean;
  /** Transient storefront label, e.g. "Coming Soon". Null renders no badge. */
  badge_text: string | null;
  sort_order: number;
  created_at: string;
};

/**
 * Add-on subscription lifecycle. `active` means the feature is live today;
 * `cancelled` is a real state — the row is kept for history and an
 * unambiguous re-enable — rather than the absence of a row.
 */
export type AddonSubscriptionStatus =
  | "active"
  | "pending_approval"
  | "cancelled"
  | "expired";

/** One clinic's subscription for a single add-on (migration 0060). */
export type ClinicAddon = {
  id: string;
  clinic_id: string;
  addon_id: string;
  status: AddonSubscriptionStatus;
  /** Units for seat/display add-ons; 1 for feature add-ons. */
  quantity: number;
  /** Future compatibility bag, e.g. `{ "ai_credits": 1000 }`. */
  metadata: Record<string, unknown>;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Support tickets (migration 0061, /app/support).
 *
 * `clinic_id` is nullable by design — a user may have to file a ticket before
 * their clinic exists. `type` and `priority` mirror the support form's
 * dropdown values; `status` is written by the support operator (`open` on
 * insert), not by the app UI.
 */
export type SupportTicketType =
  | "Bug Report"
  | "Feature Improvement Request"
  | "General Help & Support";

export type SupportTicketPriority = "Low" | "Medium" | "High";

export type SupportTicketStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "closed";

export type SupportTicket = {
  id: string;
  clinic_id: string | null;
  user_id: string;
  type: SupportTicketType;
  subject: string;
  description: string;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  created_at: string;
  updated_at: string;
};

/**
 * One clinic's Growth Agent configuration. 1:1 with a clinic (unique on
 * `clinic_id`). Carries both the Google connection and the auto-publishing
 * preferences because the same person configures both at the same time.
 */
export type GrowthAgentSettings = {
  id: string;
  clinic_id: string;
  connection_state: GrowthConnectionState;
  google_location_name: string | null;
  /**
   * The Google Business Profile location id, e.g. `locations/1234567890`.
   * Non-secret, and resolved once at connect time so sync does not have to
   * re-list locations on every page load.
   */
  google_location_id: string | null;
  /**
   * The Google account the clinic connected with. Shown so a clinic can see
   * WHICH account is linked — linking a personal account is a common cause of
   * posts landing on the wrong listing.
   */
  google_account_email: string | null;
  connected_at: string | null;
  last_synced_at: string | null;
  /** Persists a failed connection attempt across a page reload. */
  last_error: string | null;
  auto_post_enabled: boolean;
  posting_frequency: GrowthPostingFrequency;
  /** 0 = Monday ... 6 = Sunday, matching `availability_rules.day_of_week`. */
  preferred_day: number;
  /** Wall clock in the clinic's timezone — a Postgres `time`, not a timestamptz. */
  preferred_time: string;
  /** true: generated posts wait as drafts. false: published unreviewed. */
  require_approval: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * A Google Business Profile post in the content queue.
 *
 * `keywords` is a `text[]` so the clinic's own tags round-trip verbatim into
 * the editor without re-parsing a delimited string.
 */
export type GrowthPost = {
  id: string;
  clinic_id: string;
  content: string;
  topic: string;
  keywords: string[];
  cta: string;
  tone: string;
  status: GrowthPostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  /** Only meaningful while `status` is `failed` (DB CHECK enforces this). */
  failure_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * One day of Google Business Profile metrics for a clinic.
 *
 * `metric_date` is a calendar day in the clinic's timezone, not an instant —
 * which is why it is a `date` and why bucketing happens before the write.
 *
 * The three counts are NOT NULL with a zero default: zero views is a real
 * measurement. `health_score` is nullable instead, because it is only
 * computable once there is enough profile data — a stored 0 would be a lie.
 */
export type GrowthMetric = {
  id: string;
  clinic_id: string;
  metric_date: string;
  views: number;
  calls: number;
  direction_requests: number;
  health_score: number | null;
  created_at: string;
  updated_at: string;
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

export type PaymentSubmissionStatus =
  "pending" | "approved" | "rejected" | "expired";

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

export type AppEventCategory = "api" | "booking" | "email" | "auth" | "billing";
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
          logo_url?: string | null;
          patient_code_prefix?: string;
          patient_code_format?: PatientCodeFormat;

          /** Organization settings ? Billing (migration 0056). See the Clinic row type. */

          bill_number_prefix?: string;

          receipt_prefix?: string;

          auto_send_whatsapp_receipt?: boolean;

          receipt_footer_message?: string | null;

          show_gst_on_receipt?: boolean;

          gst_number?: string | null;

          gst_rate?: number | null;

          bill_terms?: string | null;
          show_prescription_header?: boolean;
          appointments_view_mode?: AppointmentsViewMode;

          /** Public booking settings (migration 0058). See the Clinic row type. */

          booking_slug?: string | null;

          is_public_booking_enabled?: boolean;

          slot_duration_minutes?: number;

          max_advance_days?: number | null;

          auto_approve_bookings?: boolean;

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
          logo_url?: string | null;
          patient_code_prefix?: string;
          patient_code_format?: PatientCodeFormat;

          /** Organization settings ? Billing (migration 0056). See the Clinic row type. */

          bill_number_prefix?: string;

          receipt_prefix?: string;

          auto_send_whatsapp_receipt?: boolean;

          receipt_footer_message?: string | null;

          show_gst_on_receipt?: boolean;

          gst_number?: string | null;

          gst_rate?: number | null;

          bill_terms?: string | null;
          show_prescription_header?: boolean;
          appointments_view_mode?: AppointmentsViewMode;

          booking_slug?: string | null;

          is_public_booking_enabled?: boolean;

          slot_duration_minutes?: number;

          max_advance_days?: number | null;

          auto_approve_bookings?: boolean;

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
      /**
       * Clinic medicine catalogue (migration 0057) — Organization settings →
       * Prescription → "Manage Medicines".
       */
      medicines: {
        Row: ClinicMedicine;
        Insert: {
          id?: string;
          clinic_id: string;
          name: string;
          strength?: string | null;
          category?: string | null;
          is_active?: boolean;
          created_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          name?: string;
          strength?: string | null;
          category?: string | null;
          is_active?: boolean;
          created_by_user_id?: never;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "medicines_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medicines_created_by_user_id_fkey";
            columns: ["created_by_user_id"];
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
          past_illnesses?: string | null;
          past_surgeries?: string | null;
          hospitalizations?: string | null;
          family_history?: string | null;
          personal_history?: string | null;
          immunization_history?: string | null;
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
          past_illnesses?: string | null;
          past_surgeries?: string | null;
          hospitalizations?: string | null;
          family_history?: string | null;
          personal_history?: string | null;
          immunization_history?: string | null;
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
          widget_json?: Record<string, unknown>;
          seo_json?: Record<string, unknown>;
          locale_json?: Record<string, unknown>;
          domain?: string | null;
          domain_status?: WebsiteDomainStatus;
          domain_verification_token?: string | null;
          domain_verified_at?: string | null;
          doctor_page_slug?: string | null;
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
          widget_json?: Record<string, unknown>;
          seo_json?: Record<string, unknown>;
          locale_json?: Record<string, unknown>;
          domain?: string | null;
          domain_status?: WebsiteDomainStatus;
          domain_verification_token?: string | null;
          domain_verified_at?: string | null;
          doctor_page_slug?: string | null;
          published_at?: string | null;
          created_at?: never;
          updated_at?: never;
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
      support_tickets: {
        Row: SupportTicket;
        Insert: {
          id?: string;
          clinic_id?: string | null;
          user_id: string;
          type: SupportTicketType;
          subject: string;
          description: string;
          priority?: SupportTicketPriority;
          status?: SupportTicketStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          user_id?: never;
          type?: SupportTicketType;
          subject?: string;
          description?: string;
          priority?: SupportTicketPriority;
          status?: SupportTicketStatus;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_tickets_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
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
          blood_sugar?: number | null;
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
          blood_sugar?: number | null;
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
      medical_history: {
        Row: MedicalHistory;
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          category: MedicalHistory["category"];
          condition: string;
          date?: string | null;
          report_date?: string | null;
          notes?: string | null;
          relationship?: string | null;
          source?: MedicalHistory["source"];
          verification_status?: MedicalHistory["verification_status"];
          clinical_status?: MedicalHistory["clinical_status"];
          created_by_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          patient_id?: never;
          category?: MedicalHistory["category"];
          condition?: string;
          date?: string | null;
          report_date?: string | null;
          notes?: string | null;
          relationship?: string | null;
          source?: MedicalHistory["source"];
          verification_status?: MedicalHistory["verification_status"];
          clinical_status?: MedicalHistory["clinical_status"];
          created_by_name?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "medical_history_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "medical_history_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      patient_medications: {
        Row: PatientMedication;
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          medicine_name: string;
          strength?: string | null;
          frequency?: string | null;
          duration?: string | null;
          instructions?: string | null;
          report_name?: string | null;
          report_date?: string | null;
          status?: PatientMedication["status"];
          source?: PatientMedication["source"];
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          patient_id?: never;
          medicine_name?: string;
          strength?: string | null;
          frequency?: string | null;
          duration?: string | null;
          instructions?: string | null;
          report_name?: string | null;
          report_date?: string | null;
          status?: PatientMedication["status"];
          source?: PatientMedication["source"];
          created_by_user_id?: never;
          created_by_name?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_medications_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_medications_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      patient_alerts: {
        Row: PatientAlert;
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          alert_type: PatientAlert["alert_type"];
          text: string;
          report_name?: string | null;
          report_date?: string | null;
          status?: PatientAlert["status"];
          source?: PatientAlert["source"];
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          patient_id?: never;
          alert_type?: PatientAlert["alert_type"];
          text?: string;
          report_name?: string | null;
          report_date?: string | null;
          status?: PatientAlert["status"];
          source?: PatientAlert["source"];
          created_by_user_id?: never;
          created_by_name?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_alerts_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_alerts_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      patient_lab_results: {
        Row: PatientLabResult;
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          document_id?: string | null;
          test_name: string;
          test_value?: string | null;
          unit?: string | null;
          reference_range?: string | null;
          abnormal?: PatientLabResult["abnormal"];
          report_date?: string | null;
          report_name?: string | null;
          status?: PatientLabResult["status"];
          source?: PatientLabResult["source"];
          created_by_user_id?: string | null;
          created_by_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          patient_id?: never;
          document_id?: string | null;
          test_name?: string;
          test_value?: string | null;
          unit?: string | null;
          reference_range?: string | null;
          abnormal?: PatientLabResult["abnormal"];
          report_date?: string | null;
          report_name?: string | null;
          status?: PatientLabResult["status"];
          source?: PatientLabResult["source"];
          created_by_user_id?: never;
          created_by_name?: never;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "patient_lab_results_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_lab_results_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_lab_results_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "patient_documents";
            referencedColumns: ["id"];
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
          receipt_code: string;
          generated_at?: string;
          pdf_path?: string | null;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          bill_id?: never;
          receipt_number?: number;
          receipt_code?: string;
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
          document_date?: string | null;
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
          document_date?: string | null;
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
      patient_intake_tokens: {
        Row: PatientIntakeToken;
        Insert: {
          id?: string;
          clinic_id: string;
          patient_id: string;
          token_hash: string;
          status?: string;
          created_by: string;
          expires_at: string;
          submitted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          patient_id?: never;
          token_hash?: never;
          status?: string;
          created_by?: never;
          expires_at?: never;
          submitted_at?: string | null;
          created_at?: never;
        };
        Relationships: [
          {
            foreignKeyName: "patient_intake_tokens_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_intake_tokens_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patient_intake_tokens_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
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
      growth_agent_settings: {
        Row: GrowthAgentSettings;
        Insert: {
          id?: string;
          clinic_id: string;
          connection_state?: GrowthConnectionState;
          google_location_name?: string | null;
          google_location_id?: string | null;
          google_account_email?: string | null;
          connected_at?: string | null;
          last_synced_at?: string | null;
          last_error?: string | null;
          auto_post_enabled?: boolean;
          posting_frequency?: GrowthPostingFrequency;
          preferred_day?: number;
          preferred_time?: string;
          require_approval?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          connection_state?: GrowthConnectionState;
          google_location_name?: string | null;
          google_location_id?: string | null;
          google_account_email?: string | null;
          connected_at?: string | null;
          last_synced_at?: string | null;
          last_error?: string | null;
          auto_post_enabled?: boolean;
          posting_frequency?: GrowthPostingFrequency;
          preferred_day?: number;
          preferred_time?: string;
          require_approval?: boolean;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "growth_agent_settings_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: true;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      /**
       * Google Business Profile OAuth tokens (migration 0044).
       *
       * Service-role only: this table has RLS enabled with ZERO policies, so an
       * `authenticated` session cannot read or write a row regardless of what
       * the client asks for. Every access goes through `createSecretsClient()`.
       * The dashboard is told only whether a row exists, never its contents.
       */
      growth_agent_secrets: {
        Row: {
          id: string;
          settings_id: string;
          refresh_token: string;
          access_token: string | null;
          access_token_expires_at: string | null;
          scope: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          settings_id: string;
          refresh_token: string;
          access_token?: string | null;
          access_token_expires_at?: string | null;
          scope?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          settings_id?: never;
          refresh_token?: string;
          access_token?: string | null;
          access_token_expires_at?: string | null;
          scope?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "growth_agent_secrets_settings_id_fkey";
            columns: ["settings_id"];
            isOneToOne: true;
            referencedRelation: "growth_agent_settings";
            referencedColumns: ["id"];
          },
        ];
      };
      growth_posts: {
        Row: GrowthPost;
        Insert: {
          id?: string;
          clinic_id: string;
          content: string;
          topic: string;
          keywords?: string[];
          cta?: string;
          tone?: string;
          status?: GrowthPostStatus;
          scheduled_at?: string | null;
          published_at?: string | null;
          failure_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          content?: string;
          topic?: string;
          keywords?: string[];
          cta?: string;
          tone?: string;
          status?: GrowthPostStatus;
          scheduled_at?: string | null;
          published_at?: string | null;
          failure_reason?: string | null;
          created_by?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "growth_posts_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "growth_posts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "auth.users";
            referencedColumns: ["id"];
          },
        ];
      };
      growth_metrics: {
        Row: GrowthMetric;
        Insert: {
          id?: string;
          clinic_id: string;
          metric_date: string;
          views?: number;
          calls?: number;
          direction_requests?: number;
          health_score?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          metric_date?: string;
          views?: number;
          calls?: number;
          direction_requests?: number;
          health_score?: number | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "growth_metrics_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      addons: {
        Row: Addon;
        Insert: {
          id?: string;
          slug: string;
          name: string;
          category: AddonCategory;
          description: string;
          price_pkr: number;
          billing_period?: string;
          is_quantity_based?: boolean;
          badge_text?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: never;
          slug?: string;
          name?: string;
          category?: AddonCategory;
          description?: string;
          price_pkr?: number;
          billing_period?: string;
          is_quantity_based?: boolean;
          badge_text?: string | null;
          sort_order?: number;
          created_at?: never;
        };
        Relationships: [];
      };
      clinic_addons: {
        Row: ClinicAddon;
        Insert: {
          id?: string;
          clinic_id: string;
          addon_id: string;
          status?: AddonSubscriptionStatus;
          quantity?: number;
          metadata?: Record<string, unknown>;
          activated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          addon_id?: never;
          status?: AddonSubscriptionStatus;
          quantity?: number;
          metadata?: Record<string, unknown>;
          activated_at?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_addons_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clinic_addons_addon_id_fkey";
            columns: ["addon_id"];
            isOneToOne: false;
            referencedRelation: "addons";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_integrations: {
        Row: ClinicIntegration;
        Insert: {
          id?: string;
          clinic_id: string;
          integration_key: string;
          status?: IntegrationStatus;
          last_error?: string | null;
          config?: Record<string, unknown>;
          configured_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          clinic_id?: never;
          integration_key?: never;
          status?: IntegrationStatus;
          last_error?: string | null;
          config?: Record<string, unknown>;
          configured_at?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_integrations_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      clinic_integration_secrets: {
        Row: ClinicIntegrationSecret;
        Insert: {
          id?: string;
          integration_id: string;
          api_key?: string | null;
          api_secret?: string | null;
          account_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          integration_id?: never;
          api_key?: string | null;
          api_secret?: string | null;
          account_id?: string | null;
          created_at?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clinic_integration_secrets_integration_id_fkey";
            columns: ["integration_id"];
            isOneToOne: true;
            referencedRelation: "clinic_integrations";
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
      /**
       * Migration 0055. What the next patient inserted right now would be
       * given, without inserting one. Declared here rather than cast at the
       * call site so `supabase.rpc(...)` keeps its `this` binding — detaching
       * the method (`const rpc = supabase.rpc`) makes `this` undefined and
       * throws `Cannot read properties of undefined (reading 'rest')`, since
       * the client delegates to `this.rest`.
       */
      preview_next_patient_code: {
        Args: {
          p_clinic_id: string;
          p_prefix: string;
          p_format: string;
        };
        Returns: string;
      };
      /**
       * Migration 0056. Next bill / receipt code without creating one, using the
       * same LIKE patterns the triggers use.
       */
      preview_bill_number: {
        Args: {
          p_clinic_id: string;
          p_prefix: string;
          p_at?: string;
        };
        Returns: string;
      };
      preview_receipt_code: {
        Args: {
          p_clinic_id: string;
          p_prefix: string;
          p_at?: string;
        };
        Returns: string;
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
      /**
       * Migration 0060. Feature gate for the add-ons marketplace. SECURITY
       * DEFINER so a component or policy can name an add-on by slug without a
       * join; call only with a clinic_id the caller belongs to (see
       * `lib/actions/addons.ts`).
       */
      is_addon_active: {
        Args: {
          p_clinic_id: string;
          p_addon_slug: string;
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
          p_blood_sugar?: number | null;
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
};
