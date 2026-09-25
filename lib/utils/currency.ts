/**
 * Single source of truth for money formatting.
 *
 * Before this existed, amounts were rendered five different ways across the
 * app — `Rs.`, bare `PKR`, `$` hardcoded, and `Intl.NumberFormat("en-US", {
 * currency: "USD" })` — so the same clinic could see a service priced at
 * `$50.00` and its bill totalled in `Rs.`. Every money render should go through
 * `formatCurrency`.
 *
 * MARKET: Pakistan / PKR (decision D8 in docs/IMPLEMENTATION_PLAN.md). The
 * currency is still read from `patient_bills.currency` / `subscription_plans
 * .currency` per row rather than hardcoded, so a future market only needs a new
 * entry in `CURRENCY_SYMBOLS`.
 */

/** Fallback when a row has no currency of its own. Matches the DB default in 0025. */
export const DEFAULT_CURRENCY = "PKR";

/**
 * Symbols by ISO 4217 code. `Rs` (no trailing dot) is the conventional short
 * form for the Pakistani rupee; `₨`/`₹` are avoided because `₹` is the Indian
 * rupee sign and renders inconsistently in print stylesheets.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  PKR: "Rs",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "AED",
  SAR: "SAR",
};

/** The display symbol for a currency code, falling back to the code itself. */
export function currencySymbol(currency: string | null | undefined): string {
  const code = (currency ?? DEFAULT_CURRENCY).trim().toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? code;
}

/**
 * Format an amount for display, e.g. `Rs 1,500` or `Rs 1,500.50`.
 *
 * Decimals are shown only when the amount actually has paisa, because clinic
 * fees are near-always whole rupees and `Rs 1,500.00` is noise on a receipt.
 * Pass `alwaysShowDecimals` for columns that must align (invoice line items).
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string | null | undefined = DEFAULT_CURRENCY,
  options: { alwaysShowDecimals?: boolean } = {},
): string {
  const value = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  const safe = Number.isFinite(value) ? value : 0;
  const needsDecimals =
    options.alwaysShowDecimals || Math.round(safe * 100) % 100 !== 0;

  const formatted = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: needsDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safe);

  return `${currencySymbol(currency)} ${formatted}`;
}

/**
 * Amount only, no symbol — for inputs and cells that carry the currency in a
 * column header rather than on every row.
 */
export function formatAmount(
  amount: number | string | null | undefined,
  options: { alwaysShowDecimals?: boolean } = {},
): string {
  const value = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  const safe = Number.isFinite(value) ? value : 0;
  const needsDecimals =
    options.alwaysShowDecimals || Math.round(safe * 100) % 100 !== 0;

  return new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: needsDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(safe);
}
