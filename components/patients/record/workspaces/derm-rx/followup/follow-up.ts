/**
 * Follow-up helpers. Storage policy: a picked date is stored as an ISO
 * `YYYY-MM-DD` string inside the existing `follow_up` TEXT column — a real
 * date without a schema migration; legacy chip labels ("1 Week") are parsed
 * into an approximate date for display and preview.
 */

export type FollowUpChips = {
  label: string;
  days: number | null;
  /** Legacy rows already holding this exact label are honoured as-is. */
  legacyLabel?: string;
};

export const FOLLOW_UP_CHIPS: FollowUpChips[] = [
  { label: "1 Week", days: 7 },
  { label: "2 Weeks", days: 14 },
  { label: "1 Month", days: 30 },
  { label: "Post-Biopsy 10 Days", days: 10, legacyLabel: "Post-Biopsy 10 Days" },
  { label: "6 Weeks", days: 42 },
  { label: "3 Months", days: 90 },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value.trim());
}

/** Absolute ISO date for a chip (or a validation None when days unknown). */
export function chipToDate(chip: FollowUpChips, fromIso: string): string | null {
  if (chip.days === null) return null;
  const base = isIsoDate(fromIso) ? new Date(fromIso) : new Date();
  base.setDate(base.getDate() + chip.days);
  return base.toISOString().slice(0, 10);
}

/** Human label for either an ISO date or a legacy text value. */
export function followUpLabel(value: string | null | undefined): string {
  if (!value) return "Not set";
  if (isIsoDate(value)) {
    const date = new Date(value);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return value;
}
