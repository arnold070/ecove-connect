// Naira currency formatting helpers.
// Backend stores amounts as integer kobo (1 NGN = 100 kobo) to avoid float drift.

const NAIRA_FORMATTER = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const NAIRA_FORMATTER_WITH_KOBO = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a Naira amount (in NGN, not kobo). */
export function formatNaira(amount: number, opts: { showKobo?: boolean } = {}): string {
  if (!Number.isFinite(amount)) return "₦0";
  return opts.showKobo
    ? NAIRA_FORMATTER_WITH_KOBO.format(amount)
    : NAIRA_FORMATTER.format(amount);
}

/** Convert kobo (integer) to Naira (number). */
export function koboToNaira(kobo: number): number {
  return Math.round(kobo) / 100;
}

/** Convert Naira (number) to kobo (integer). */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/** Format kobo directly as a Naira string. */
export function formatKobo(kobo: number, opts: { showKobo?: boolean } = {}): string {
  return formatNaira(koboToNaira(kobo), opts);
}
