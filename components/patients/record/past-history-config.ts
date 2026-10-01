/**
 * The six Past History answers from `docs/HEALTH INFO.txt`, and the single place
 * they are described.
 *
 * They appear in two very different surfaces — the autosaving textareas in the
 * Health Info tab and the full patient form popup — and those two must not be
 * allowed to drift: a label or placeholder that differs between them is how a
 * patient ends up unsure which box they already filled in. Hence one list, keyed
 * by the `patients` column (`column`) and by the camelCase form name (`name`)
 * that the submit path reads.
 */

/** The six `patients` columns added by migration 0046. */
export type PastHistoryColumn =
  | "past_illnesses"
  | "past_surgeries"
  | "hospitalizations"
  | "family_history"
  | "personal_history"
  | "immunization_history";

export const PAST_HISTORY_FIELDS = [
  {
    column: "past_illnesses",
    name: "pastIllnesses",
    label: "Past Illnesses",
    placeholder: "e.g. Diabetes since 2019, Hypertension since 2021",
    rule: false,
  },
  {
    column: "past_surgeries",
    name: "pastSurgeries",
    label: "Past Surgeries",
    placeholder: "e.g. Appendectomy 2018, Cholecystectomy 2022",
    rule: false,
  },
  {
    column: "hospitalizations",
    name: "hospitalizations",
    label: "Hospitalizations",
    placeholder: "e.g. Admitted for Dengue, City Hospital, 2020",
    rule: false,
  },
  {
    column: "family_history",
    name: "familyHistory",
    label: "Family History",
    placeholder:
      "e.g. Father — Hypertension, Diabetes. Mother — Thyroid Disorder",
    rule: false,
  },
  {
    column: "personal_history",
    name: "personalHistory",
    label: "Personal History",
    placeholder:
      "e.g. Non-smoker, Occasional Alcohol, Sedentary Lifestyle, Software Engineer",
    rule: false,
  },
  {
    column: "immunization_history",
    name: "immunizationHistory",
    label: "Immunization History",
    placeholder: "e.g. BCG ✓, OPV doses 1-2-3 ✓, DPT ✓, MMR Pending",
    rule: true,
  },
] as const satisfies ReadonlyArray<{
  column: PastHistoryColumn;
  name: string;
  label: string;
  placeholder: string;
  rule: boolean;
}>;

/**
 * The reference textarea from `docs/HEALTH INFO.txt`, with the mockup's literal
 * colours expressed as project tokens where they coincide — `#E5E3DB` is
 * `hairline`, `#1A1A1A` is `ink`, `#F0EFEB` is `hairline-soft`. The 1.5px border,
 * 10px radius, 13px type, 1.6 line-height, hidden overflow and 72px floor are
 * kept verbatim; only focus moves from the mockup's indigo to the project
 * primary, as the rest of the record already does.
 */
export const PAST_HISTORY_FIELD_CLASS =
  "w-full min-h-[72px] resize-none overflow-hidden rounded-[10px] border-[1.5px] border-hairline bg-white px-3 py-2.5 text-[13px] leading-[1.6] text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-faint focus:border-primary focus:shadow-[0_0_0_3px_rgba(13,148,136,0.1)] read-only:cursor-default read-only:bg-chip read-only:focus:border-hairline read-only:focus:shadow-none";

/** The card's final divider, drawn above immunisation history only. */
export const PAST_HISTORY_RULE_CLASS = "border-t border-hairline-soft pt-4";

/** The card's own panel — so a wrapper never puts a second border around it. */
export const PAST_HISTORY_CARD_CLASS =
  "flex flex-col gap-4 rounded-panel border border-hairline bg-surface px-[18px] py-4";

/**
 * One read-only Past History answer.
 *
 * The teal left rule is the one deliberate flourish in this tab: six identical
 * cards in a two-column grid need something to bind each heading to its own
 * paragraph, and a 2px rule does that at a glance without another badge. Empty
 * answers stay in the grid rather than collapsing, so the doctor can see that a
 * category exists and is unfilled instead of wondering whether the tab omits it.
 */
export const PAST_HISTORY_TILE_CLASS =
  "rounded-control border border-hairline border-l-2 border-l-primary bg-chip p-3";

/** The heading inside a read-only tile — sentence case, not an all-caps eyebrow. */
export const PAST_HISTORY_TILE_TITLE_CLASS =
  "mb-1 text-[12px] font-semibold text-ink";
