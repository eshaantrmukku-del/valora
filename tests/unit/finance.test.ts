import { describe, expect, it } from 'vitest';
import { monthlyMortgagePayment, remainingBalance } from '../../shared/finance/mortgage';
import { computeTransactionTax, selectTaxRules, applyBands } from '../../shared/finance/tax';
import {
  blankInputs,
  calculateDeal,
  runScenarios,
  sensitivity,
  withDefaults,
  type DealInputs,
} from '../../shared/finance/deal';

describe('mortgage', () => {
  it('computes a repayment mortgage payment (£150k, 5%, 25y = £876.89)', () => {
    expect(monthlyMortgagePayment(150_000, 5, 25, false)).toBeCloseTo(876.89, 2);
  });
  it('computes interest-only payments', () => {
    expect(monthlyMortgagePayment(150_000, 5.5, 25, true)).toBeCloseTo(687.5, 6);
  });
  it('handles zero principal and zero rate', () => {
    expect(monthlyMortgagePayment(0, 5, 25, false)).toBe(0);
    expect(monthlyMortgagePayment(120_000, 0, 10, false)).toBeCloseTo(1000, 6);
  });
  it('rejects a zero term for repayment mortgages', () => {
    expect(() => monthlyMortgagePayment(100_000, 5, 0, false)).toThrow(RangeError);
  });
  it('amortises to zero at the end of the term', () => {
    expect(remainingBalance(150_000, 5, 25, 300)).toBe(0);
    expect(remainingBalance(150_000, 5, 25, 0)).toBeCloseTo(150_000, 4);
  });
});

describe('transaction tax', () => {
  const tax = (price: number, jurisdiction: 'england' | 'scotland' | 'wales', buyerType: 'additional_property' | 'first_time_buyer' | 'home_mover', nonResident = false) =>
    computeTransactionTax({ price, jurisdiction, buyerType, nonResident, completionDate: '2026-10-08' })!.amount;

  it('selects dated rule sets per jurisdiction', () => {
    expect(selectTaxRules('england', '2026-10-08')?.id).toBe('sdlt-2025-04-01');
    expect(selectTaxRules('northern_ireland', '2026-10-08')?.id).toBe('sdlt-2025-04-01');
    expect(selectTaxRules('scotland', '2026-10-08')?.id).toBe('lbtt-2024-12-05');
    expect(selectTaxRules('wales', '2026-10-08')?.id).toBe('ltt-2024-12-11');
    expect(selectTaxRules('england', '2020-01-01')).toBeNull();
  });
  it('England SDLT', () => {
    expect(tax(300_000, 'england', 'home_mover')).toBe(5_000);
    expect(tax(300_000, 'england', 'additional_property')).toBe(20_000);
    expect(tax(450_000, 'england', 'first_time_buyer')).toBe(7_500);
    expect(tax(510_000, 'england', 'first_time_buyer')).toBe(15_500);
    expect(tax(1_600_000, 'england', 'home_mover')).toBe(105_750);
    expect(tax(300_000, 'england', 'additional_property', true)).toBe(26_000);
    expect(tax(30_000, 'england', 'additional_property')).toBe(0);
    expect(tax(125_000, 'england', 'home_mover')).toBe(0);
  });
  it('Scotland LBTT + ADS', () => {
    expect(tax(300_000, 'scotland', 'home_mover')).toBe(4_600);
    expect(tax(300_000, 'scotland', 'additional_property')).toBe(28_600);
    expect(tax(200_000, 'scotland', 'first_time_buyer')).toBe(500);
  });
  it('Wales LTT', () => {
    expect(tax(300_000, 'wales', 'home_mover')).toBe(4_500);
    expect(tax(300_000, 'wales', 'additional_property')).toBe(19_950);
    const r = computeTransactionTax({ price: 300_000, jurisdiction: 'wales', buyerType: 'first_time_buyer' })!;
    expect(r.amount).toBe(4_500);
    expect(r.notes.join(' ')).toMatch(/no first-time buyer relief/);
  });
  it('rejects invalid prices', () => {
    expect(computeTransactionTax({ price: -1, jurisdiction: 'england', buyerType: 'home_mover' })).toBeNull();
    expect(computeTransactionTax({ price: Number.NaN, jurisdiction: 'england', buyerType: 'home_mover' })).toBeNull();
  });
  it('band arithmetic stops at the price', () => {
    expect(applyBands(100, [{ upTo: 50, ratePct: 10 }, { upTo: null, ratePct: 20 }])).toBeCloseTo(15, 9);
  });
});

function rentalInputs(): DealInputs {
  return {
    ...blankInputs(),
    purchasePrice: 200_000,
    jurisdiction: 'england',
    buyerType: 'additional_property',
    depositPct: 25,
    interestRatePct: 5.5,
    termYears: 25,
    interestOnly: true,
    lenderFees: 1_500,
    legalFees: 1_800,
    surveyFees: 600,
    otherAcquisitionCosts: 0,
    monthlyRent: 1_000,
    vacancyPct: 5,
    managementPct: 12,
    maintenancePct: 8,
    insuranceAnnual: 400,
  };
}

describe('rental calculations', () => {
  it('matches an independently worked example', () => {
    const r = calculateDeal(rentalInputs());
    expect(r.acquisition?.transactionTax).toBe(11_500);
    expect(r.acquisition?.deposit).toBe(50_000);
    expect(r.acquisition?.loan).toBe(150_000);
    const rent = r.rental!;
    expect(rent.annualGrossRent).toBe(12_000);
    expect(rent.grossYieldPct).toBe(6);
    expect(rent.annualOperatingCosts).toBe(3_328);
    expect(rent.netOperatingIncome).toBe(8_672);
    expect(rent.netYieldPct).toBe(4.34);
    expect(rent.monthlyMortgagePayment).toBe(687.5);
    expect(rent.annualCashFlow).toBe(422);
    expect(rent.monthlyCashFlow).toBe(35.17);
    expect(rent.cashInvested).toBe(65_400);
    expect(rent.cashOnCashReturnPct).toBe(0.65);
    expect(rent.breakEvenMonthlyRent).toBe(953.48);
    expect(rent.interestCoverageRatio).toBe(1.45);
  });

  it('break-even rent produces zero cash flow', () => {
    const base = calculateDeal(rentalInputs()).rental!;
    const atBreakEven = calculateDeal({ ...rentalInputs(), monthlyRent: base.breakEvenMonthlyRent! }).rental!;
    expect(Math.abs(atBreakEven.annualCashFlow)).toBeLessThan(0.5);
  });

  it('cash purchases have no debt service', () => {
    const r = calculateDeal({ ...rentalInputs(), cashPurchase: true }).rental!;
    expect(r.annualDebtService).toBe(0);
    expect(r.annualCashFlow).toBe(r.netOperatingIncome);
    expect(r.interestCoverageRatio).toBeNull();
  });

  it('returns null and lists missing inputs instead of inventing rent', () => {
    const r = calculateDeal({ ...rentalInputs(), monthlyRent: null });
    expect(r.rental).toBeNull();
    expect(r.missing.rental).toContain('monthlyRent');
  });

  it('never treats unknown operating costs as silently zero', () => {
    const r = calculateDeal({ ...rentalInputs(), insuranceAnnual: null });
    expect(r.warnings.some((w) => w.includes('Landlord insurance') && w.includes('excluded'))).toBe(true);
    expect(r.rental!.operatingCosts.find((l) => l.key === 'insuranceAnnual')!.annual).toBeNull();
  });

  it('flags missing jurisdiction rather than guessing tax', () => {
    const r = calculateDeal({ ...rentalInputs(), jurisdiction: null });
    expect(r.acquisition!.transactionTax).toBeNull();
    expect(r.acquisition!.totalAcquisitionCost).toBeNull();
    expect(r.missing.acquisition).toContain('jurisdiction');
  });

  it('honours a transaction tax override', () => {
    const r = calculateDeal({ ...rentalInputs(), transactionTaxOverride: 9_999 });
    expect(r.acquisition!.transactionTax).toBe(9_999);
  });

  it('handles a zero purchase price as missing', () => {
    const r = calculateDeal({ ...rentalInputs(), purchasePrice: 0 });
    expect(r.acquisition).toBeNull();
    expect(r.rental).toBeNull();
  });

  it('rejects non-finite inputs', () => {
    expect(() => calculateDeal({ ...rentalInputs(), monthlyRent: Number.POSITIVE_INFINITY })).toThrow();
  });
});

describe('renovate and resell', () => {
  const flipInputs = (): DealInputs => ({
    ...blankInputs(),
    purchasePrice: 200_000,
    jurisdiction: 'england',
    buyerType: 'additional_property',
    cashPurchase: true,
    legalFees: 1_800,
    surveyFees: 600,
    otherAcquisitionCosts: 0,
    refurbCostLow: 20_000,
    refurbCostHigh: 30_000,
    refurbContingencyPct: 10,
    resaleValue: 280_000,
    sellingAgentPct: 1.5,
    sellingLegalFees: 1_500,
    holdingMonths: 6,
    holdingCostsMonthly: 250,
  });

  it('matches an independently worked example', () => {
    const f = calculateDeal(flipInputs()).flip!;
    expect(f.refurbishmentCost).toBe(27_500);
    expect(f.sellingCosts).toBe(5_700);
    expect(f.holdingCosts).toBe(1_500);
    expect(f.financeCostsDuringHold).toBe(0);
    expect(f.totalCosts).toBe(248_600);
    expect(f.grossProfit).toBe(52_500);
    expect(f.netProfit).toBe(31_400);
    expect(f.cashInvested).toBe(242_900);
    expect(f.returnOnCashPct).toBe(12.93);
    expect(f.profitOnCostPct).toBe(12.63);
  });

  it('includes interest during the hold for financed purchases', () => {
    const f = calculateDeal({ ...flipInputs(), cashPurchase: false, depositPct: 25, interestRatePct: 6, lenderFees: 0 }).flip!;
    // 150,000 × 6% / 12 × 6 months
    expect(f.financeCostsDuringHold).toBe(4_500);
  });

  it('requires a resale value — never assumes one', () => {
    const r = calculateDeal({ ...flipInputs(), resaleValue: null });
    expect(r.flip).toBeNull();
    expect(r.missing.flip).toContain('resaleValue');
  });
});

describe('defaults, scenarios and sensitivity', () => {
  it('fills only unknown inputs from defaults and labels them', () => {
    const { inputs, provenance } = withDefaults(
      { ...blankInputs(), purchasePrice: 250_000, depositPct: 40 },
      { purchasePrice: 'source', depositPct: 'user' },
    );
    expect(inputs.depositPct).toBe(40);
    expect(provenance.depositPct).toBe('user');
    expect(inputs.interestRatePct).toBe(5.5);
    expect(provenance.interestRatePct).toBe('default');
    expect(inputs.monthlyRent).toBeNull();
  });

  it('orders scenarios cautious ≤ base ≤ optimistic', () => {
    const s = runScenarios({ ...rentalInputs(), resaleValue: 260_000, refurbCostLow: 10_000, refurbCostHigh: 20_000, holdingMonths: 6 });
    const [c, b, o] = s;
    expect(c!.monthlyCashFlow!).toBeLessThan(b!.monthlyCashFlow!);
    expect(b!.monthlyCashFlow!).toBeLessThan(o!.monthlyCashFlow!);
    expect(c!.flipNetProfit!).toBeLessThan(b!.flipNetProfit!);
    expect(b!.flipNetProfit!).toBeLessThan(o!.flipNetProfit!);
  });

  it('sensitivity rows move in the expected direction', () => {
    const rows = sensitivity(rentalInputs());
    const get = (l: string) => rows.find((r) => r.label === l)!.monthlyCashFlow!;
    expect(get('Rent −10%')).toBeLessThan(get('As entered'));
    expect(get('Interest rate +2 points')).toBeLessThan(get('Interest rate +1 point'));
  });
});
