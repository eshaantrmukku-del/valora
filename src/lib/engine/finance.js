/**
 * Financial engine — pure deterministic mathematics. No AI, no randomness.
 * Every output is reproducible from its inputs.
 */
import { mortgagePayment, stampDutyEngland } from '../investor';

const LEGAL_FEES_ESTIMATE = 1800; // conveyancing + searches, typical mid-range
const SURVEY_ESTIMATE = 600;

/**
 * Full deal financials.
 * @param {object} p
 * @param {number} p.price purchase price (£)
 * @param {number} p.monthlyRent expected rent (£/month)
 * @param {number} p.depositPct
 * @param {number} p.interestRate annual %
 * @param {number} p.termYears
 * @param {boolean} p.interestOnly
 * @param {number} p.refurbCost
 * @param {number} p.annualCostsPct running costs as % of rent (voids, mgmt, repairs)
 */
export function computeDealFinancials({
  price,
  monthlyRent,
  depositPct = 25,
  interestRate = 4.5,
  termYears = 25,
  interestOnly = true,
  refurbCost = 0,
  annualCostsPct = 25,
}) {
  const deposit = Math.round(price * (depositPct / 100));
  const loan = Math.max(0, price - deposit);
  const stampDuty = stampDutyEngland(price, { additionalDwelling: true });
  const legalFees = LEGAL_FEES_ESTIMATE + SURVEY_ESTIMATE;
  const totalCashRequired = deposit + stampDuty + legalFees + refurbCost;

  const monthlyMortgage = mortgagePayment(loan, interestRate, termYears, interestOnly);
  const annualRent = monthlyRent * 12;
  const annualRunningCosts = Math.round(annualRent * (annualCostsPct / 100));
  const annualMortgage = monthlyMortgage * 12;

  const annualCashFlow = Math.round(annualRent - annualRunningCosts - annualMortgage);
  const monthlyCashFlow = Math.round(annualCashFlow / 12);

  const grossYield = price > 0 ? Math.round((annualRent / price) * 1000) / 10 : null;
  const netYield = price > 0
    ? Math.round(((annualRent - annualRunningCosts) / price) * 1000) / 10
    : null;

  const cashOnCash = totalCashRequired > 0
    ? Math.round((annualCashFlow / totalCashRequired) * 1000) / 10
    : null;

  // Rent at which cash flow is zero
  const breakEvenRent = Math.ceil((annualMortgage / 12) / (1 - annualCostsPct / 100));

  const rentCoverage = monthlyMortgage > 0
    ? Math.round((monthlyRent / monthlyMortgage) * 100) / 100
    : null;

  return {
    price,
    deposit,
    depositPct,
    loan,
    interestRate,
    termYears,
    interestOnly,
    stampDuty,
    legalFees,
    refurbCost,
    totalCashRequired,
    monthlyMortgage: Math.round(monthlyMortgage),
    monthlyRent,
    annualRent,
    annualRunningCosts,
    annualCostsPct,
    monthlyCashFlow,
    annualCashFlow,
    grossYield,
    netYield,
    cashOnCash,
    breakEvenRent,
    rentCoverage,
  };
}
