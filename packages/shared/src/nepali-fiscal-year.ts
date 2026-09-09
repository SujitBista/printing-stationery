/**
 * Nepal's government fiscal year starts on Shrawan 1 (~16 July).
 * Bikram Sambat year is approximated as Gregorian year + 57 in Shrawan.
 */
const FISCAL_YEAR_START_MONTH = 7;
const FISCAL_YEAR_START_DAY = 16;
const AD_TO_BS_OFFSET = 57;

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const NEPALI_FISCAL_YEAR_PATTERN = /^(\d{4})-(\d{4})$/;

export function nepaliFiscalYearFromIsoDate(isoDate: string): string {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) {
    throw new Error("Purchase date must be a valid ISO date (YYYY-MM-DD)");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const fyStartAdYear =
    month > FISCAL_YEAR_START_MONTH ||
    (month === FISCAL_YEAR_START_MONTH && day >= FISCAL_YEAR_START_DAY)
      ? year
      : year - 1;
  const bsStart = fyStartAdYear + AD_TO_BS_OFFSET;
  return `${bsStart}-${bsStart + 1}`;
}

export function isNepaliFiscalYear(value: string): boolean {
  const match = NEPALI_FISCAL_YEAR_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  return end === start + 1;
}
