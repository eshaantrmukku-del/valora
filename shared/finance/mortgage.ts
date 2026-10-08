/** Mortgage arithmetic. Pure functions — no rounding until presentation. */

/** Monthly payment for a loan. Interest-only returns interest; repayment uses the standard annuity formula. */
export function monthlyMortgagePayment(
  principal: number,
  annualRatePct: number,
  termYears: number,
  interestOnly: boolean,
): number {
  if (principal <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (interestOnly) return principal * r;
  const n = Math.round(termYears * 12);
  if (n <= 0) throw new RangeError('Mortgage term must be positive for a repayment mortgage');
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Outstanding balance after `months` payments on a repayment mortgage. */
export function remainingBalance(
  principal: number,
  annualRatePct: number,
  termYears: number,
  months: number,
): number {
  const r = annualRatePct / 100 / 12;
  const n = Math.round(termYears * 12);
  if (months >= n) return 0;
  if (r === 0) return principal * (1 - months / n);
  const pmt = monthlyMortgagePayment(principal, annualRatePct, termYears, false);
  return principal * Math.pow(1 + r, months) - (pmt * (Math.pow(1 + r, months) - 1)) / r;
}
