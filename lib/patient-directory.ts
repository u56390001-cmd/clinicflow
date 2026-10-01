/**
 * Patient Directory / EMR workspace query-parameter contract, shared by the
 * server page (which executes the queries against the `patient_directory` view)
 * and the client panes (which build the search box, tabs, pills and pagination
 * links). Search, filters, sorting, segmentation and pagination all happen
 * server-side — the client only navigates.
 *
 * The whole workspace lives on one route, `/app/patients`. `?id=` selects which
 * record the right-hand pane shows, so a selection is shareable and the browser
 * Back button steps through selections. That is why there is no `[id]` page any
 * more (it redirects here).
 */

import { APP_ROUTES } from "@/lib/constants";
import type { VisitStatus } from "@/types/database";

export const PATIENT_PAGE_SIZE = 20;

/**
 * Today's queue state for the patients currently listed, keyed by patient id.
 * The directory view has no notion of a visit, so the list pane could otherwise
 * only show who a patient is — this is what lets it show where they are in the
 * queue. Patients with no visit today are simply absent from the map.
 */
export type PatientTodayQueue = Record<
  string,
  { status: VisitStatus; token: number | null }
>;

/**
 * The Today | All Patients tabs. Declared in render order; the *default* is
 * `all` (see `parsePatientDirectoryParams`), because `/app/patients` has always
 * listed the whole directory and silently switching that to an often-empty
 * "booked today" view would read as data loss.
 */
export const PATIENT_SCOPES = ["today", "all"] as const;
export type PatientScope = (typeof PATIENT_SCOPES)[number];

export const PATIENT_SCOPE_LABELS: Record<PatientScope, string> = {
  today: "Today",
  all: "All Patients",
};

/**
 * The All | Returning | First Visit pills, shown under the All Patients scope
 * tab. Driven by `visit_count` from the directory view, which counts `visits`
 * (patient actually checked in) rather than `appointments` (a booking that may
 * have been cancelled) — decision D3.
 */
export const PATIENT_SEGMENTS = ["all", "returning", "first_visit"] as const;

/**
 * The Waiting | Completed | All pills, shown under the Today scope tab. They
 * segment today's queue: patients with a live visit (waiting / checked in / in
 * consultation) versus those whose visit is done.
 */
export const PATIENT_TODAY_SEGMENTS = [
  "waiting",
  "completed",
  "all",
] as const;

export type PatientSegment =
  | (typeof PATIENT_SEGMENTS)[number]
  | (typeof PATIENT_TODAY_SEGMENTS)[number];

export const PATIENT_SEGMENT_LABELS: Record<PatientSegment, string> = {
  all: "All",
  returning: "Returning",
  first_visit: "First Visit",
  waiting: "Waiting",
  completed: "Completed",
};

/**
 * Appointment-shaped filters. These are no longer surfaced as a control — the
 * scope tabs and segment pills cover the day-to-day cases — but the page still
 * honours them so existing bookmarks and deep links keep working.
 */
export const PATIENT_FILTERS = ["all", "upcoming", "none", "recent"] as const;
export type PatientFilter = (typeof PATIENT_FILTERS)[number];

export const PATIENT_FILTER_LABELS: Record<PatientFilter, string> = {
  all: "All patients",
  upcoming: "Has upcoming",
  none: "No appointments",
  recent: "Added last 30 days",
};

export const PATIENT_SORTS = ["name", "newest", "last_appointment", "appointment_count"] as const;
export type PatientSort = (typeof PATIENT_SORTS)[number];

export const PATIENT_SORT_LABELS: Record<PatientSort, string> = {
  name: "Name (A–Z)",
  newest: "Newest first",
  last_appointment: "Last appointment",
  appointment_count: "Appointment count",
};

/**
 * Sub-tabs of the patient record (the detail pane). URL-driven like everything
 * else in the module, so a colleague can be sent a link straight to someone's
 * medications and the browser Back button steps back through tabs.
 *
 * The six tabs are the reference mockup's set, in its order (docs/pt001.txt):
 * Overview, Health Info, Vitals, Prescriptions, Documents, All Appointments.
 *
 * There is deliberately no separate Visit History tab. Overview and Visit
 * History used to sit next to each other showing partly the same facts in two
 * places, so they were merged into one Overview tab: it opens on the patient's
 * current state — AI summary, latest vitals, last encounter, recent encounters —
 * and continues into the full visit timeline below. The timeline was not
 * dropped, only folded in. `overview` is therefore the default, and the old
 * `history` id is kept as an alias so existing links still open it.
 *
 * Nor is there a separate Past History tab. Its content — the six narrative
 * answers (past illnesses, surgeries, hospitalizations, family, personal and
 * immunisation history) — is captured and edited directly in Health Info, per
 * `docs/HEALTH INFO.txt`, so a second tab would only have been a second place to
 * look for the same facts. The older category-based `medical_history` table is
 * untouched and still holds any entries recorded before that move.
 *
 * Nor a separate Prescription tab. It was a second writing surface for the very
 * same form the banner's "Write Prescription" overlay already opens, so the
 * overlay is the one way to write a prescription from the record — and the
 * Prescriptions tab is the one way to read what has been written.
 */
export const PATIENT_TABS = [
  "overview",
  "health_info",
  "vitals",
  "medications",
  "documents",
  "appointments",
] as const;
export type PatientTab = (typeof PATIENT_TABS)[number];

/** The tab a record opens on when the URL says nothing. */
export const DEFAULT_PATIENT_TAB: PatientTab = "overview";

export const PATIENT_TAB_LABELS: Record<PatientTab, string> = {
  overview: "Overview",
  health_info: "History",
  vitals: "Vitals",
  medications: "Prescriptions",
  documents: "Documents",
  appointments: "All Appointments",
};

/**
 * Retired and renamed `?tab=` values. `clinical` used to bundle health info with
 * vitals; it now resolves to History. `history` is the one that changed
 * shape rather than name — the old Visit History tab was merged into Overview
 * and now resolves there, so the id a link was shared with still opens the panel
 * it was pointing at. Mapping them here means an old bookmark or a shared link
 * still opens a panel instead of falling back with no explanation.
 */
const PATIENT_TAB_ALIASES: Record<string, PatientTab> = {
  visits: "overview",
  history: "overview",
  health: "health_info",
  clinical: "health_info",
  vitals: "vitals",
  prescriptions: "medications",
  // The retired Past History tab; its content now lives in Health Info.
  past_history: "health_info",
  medical_history: "health_info",
  // The retired Prescription tab; the read side is Prescriptions, and writing
  // now happens in the Write Prescription overlay the banner opens.
  prescription: "medications",
  rx: "medications",
};

export type PatientDirectoryParams = {
  q: string;
  scope: PatientScope;
  segment: PatientSegment;
  filter: PatientFilter;
  sort: PatientSort;
  page: number;
  /** `?id=` — a UHID (`CLI-2026-00001`) or a patient UUID. Empty = no selection. */
  selectedId: string;
  /** `?tab=` — which panel of the open record is showing. */
  tab: PatientTab;
};

/**
 * Parse raw `searchParams` into a validated, bounded param set. Unknown
 * scopes/segments/filters/sorts fall back to defaults and `page` is clamped to
 * >= 1, so a hand-edited URL can never reach the query builder unchecked.
 */
export function parsePatientDirectoryParams(
  searchParams: Record<string, string | string[] | undefined>,
): PatientDirectoryParams {
  const str = (key: string) =>
    typeof searchParams[key] === "string" ? (searchParams[key] as string) : "";

  const rawPage = Number.parseInt(str("page"), 10);
  const rawScope = str("scope");
  const rawSegment = str("segment");
  const rawFilter = str("filter");
  const rawSort = str("sort");
  const rawTab = str("tab");

  const scope: PatientScope = (PATIENT_SCOPES as readonly string[]).includes(
    rawScope,
  )
    ? (rawScope as PatientScope)
    : "all";
  // The segment vocabulary depends on the active scope: today's queue segments
  // (waiting / completed) are meaningless in the directory-wide view and vice
  // versa, so a stale `?segment=` falls back to the scope's default ("all").
  const scopeSegments: readonly string[] =
    scope === "today" ? PATIENT_TODAY_SEGMENTS : PATIENT_SEGMENTS;

  return {
    q: str("q").trim().slice(0, 120),
    scope,
    segment: scopeSegments.includes(rawSegment)
      ? (rawSegment as PatientSegment)
      : "all",
    filter: (PATIENT_FILTERS as readonly string[]).includes(rawFilter)
      ? (rawFilter as PatientFilter)
      : "all",
    sort: (PATIENT_SORTS as readonly string[]).includes(rawSort)
      ? (rawSort as PatientSort)
      : "name",
    page: Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1,
    // 64 chars comfortably fits a UUID (36) and any realistic UHID.
    selectedId: str("id").trim().slice(0, 64),
    tab: (PATIENT_TABS as readonly string[]).includes(rawTab)
      ? (rawTab as PatientTab)
      : (PATIENT_TAB_ALIASES[rawTab] ?? DEFAULT_PATIENT_TAB),
  };
}

/**
 * Build an `/app/patients?...` href. Defaults are omitted so the common URL
 * stays clean, and anything the caller leaves out is dropped rather than
 * inherited — spread the current params to keep them:
 * `patientDirectoryHref({ ...params, page: 2 })`.
 */
export function patientDirectoryHref(
  params: Partial<PatientDirectoryParams>,
): string {
  const search = new URLSearchParams();
  const q = params.q?.trim();
  if (q) search.set("q", q);
  if (params.scope && params.scope !== "all") search.set("scope", params.scope);
  if (params.segment && params.segment !== "all") search.set("segment", params.segment);
  if (params.filter && params.filter !== "all") search.set("filter", params.filter);
  if (params.sort && params.sort !== "name") search.set("sort", params.sort);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  if (params.selectedId) search.set("id", params.selectedId);
  // `tab` is meaningless without a selection, and the default tab is omitted so
  // the common URL stays clean.
  if (params.selectedId && params.tab && params.tab !== DEFAULT_PATIENT_TAB) {
    search.set("tab", params.tab);
  }

  const qs = search.toString();
  return `${APP_ROUTES.app.patients}${qs ? `?${qs}` : ""}`;
}

/**
 * The URL-facing key for a patient: the human-readable UHID when one has been
 * assigned, else the UUID. `?id=` accepts both, so rows that predate the 0029
 * backfill still link correctly.
 */
export function patientKey(patient: {
  id: string;
  patient_code: string | null;
}): string {
  return patient.patient_code ?? patient.id;
}

/**
 * True when `value` is a patient UUID rather than a UHID. The page uses this to
 * decide which column `?id=` should match.
 */
export function isPatientUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Escape a user search term so the `%`/`_`/`\` characters it may contain are
 * treated literally by PostgREST's ilike filters instead of acting as
 * wildcards. The wildcard we add ourselves is `*` (PostgREST's ilike form).
 */
export function escapeLikeSearchTerm(term: string): string {
  return term.replace(/[\\%_*]/g, (char) => `\\${char}`);
}
