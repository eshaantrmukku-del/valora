/**
 * Deterministic deal calculator. The language model never performs this arithmetic.
 *
 * Conventions
 *  - All money is in GBP. Inputs are numbers or `null` (unknown). Unknown never silently becomes zero:
 *    a calculation that needs an unknown input returns `null` and lists the input in `missing`, and an
 *    optional cost that is unknown is excluded from totals with an explicit warning.
 *  - Every input carries a provenance label (user input, source data, default assumption).
 *  - Capital expenditure (refurbishment) is kept separate from recurring operating costs.
 */
import { z } from 'zod';
import { monthlyMortgagePayment } from './mortgage';
import { computeTransactionTax, type TransactionTaxResult } from './tax';

export const PROVENANCES = ['user', 'source', 'default', 'derived'] as const;
export type Provenance = (typeof PROVENANCES)[number];

const n = z.number().finite().nullable();

export const DealInputsSchema = z.object({
  purchasePrice: n,
  jurisdiction: z.enum(['england', 'northern_ireland', 'scotland', 'wales']).nullable(),
  buyerType: z.enum(['additional_property', 'first_time_buyer', 'home_mover']),
  nonResident: z.boolean(),
  /** Overrides the computed transaction tax when supplied (e.g. a conveyancer's figure). */
  transactionTaxOverride: n,

  cashPurchase: z.boolean(),
  depositPct: n,
  interestRatePct: n,
  termYears: n,
  interestOnly: z.boolean(),
  lenderFees: n,

  legalFees: n,
  surveyFees: n,
  otherAcquisitionCosts: n,

  monthlyRent: n,
  vacancyPct: n,
  managementPct: n,
  maintenancePct: n,
  insuranceAnnual: n,
  serviceChargeAnnual: n,
  groundRentAnnual: n,
  otherOperatingAnnual: n,

  refurbCostLow: n,
  refurbCostHigh: n,
  refurbContingencyPct: n,

  resaleValue: n,
  sellingAgentPct: n,
  sellingLegalFees: n,
  holdingMonths: n,
  holdingCostsMonthly: n,
});
export type DealInputs = z.infer<typeof DealInputsSchema>;
export type DealInputKey = keyof DealInputs;
export type ProvenanceMap = Partial<Record<DealInputKey, Provenance>>;

export const DEAL_INPUT_LABELS: Record<DealInputKey, string> = {
  purchasePrice: 'Purchase price',
  jurisdiction: 'Tax jurisdiction',
  buyerType: 'Buyer status',
  nonResident: 'Non-UK resident buyer',
  transactionTaxOverride: 'Transaction tax (override)',
  cashPurchase: 'Cash purchase',
  depositPct: 'Deposit',
  interestRatePct: 'Mortgage interest rate',
  termYears: 'Mortgage term',
  interestOnly: 'Interest-only mortgage',
  lenderFees: 'Lender / broker fees',
  legalFees: 'Legal fees (purchase)',
  surveyFees: 'Survey',
  otherAcquisitionCosts: 'Other acquisition costs',
  monthlyRent: 'Monthly rent',
  vacancyPct: 'Vacancy allowance',
  managementPct: 'Letting & management fee',
  maintenancePct: 'Maintenance allowance',
  insuranceAnnual: 'Landlord insurance (annual)',
  serviceChargeAnnual: 'Service charge (annual)',
  groundRentAnnual: 'Ground rent (annual)',
  otherOperatingAnnual: 'Other operating costs (annual)',
  refurbCostLow: 'Refurbishment budget (low)',
  refurbCostHigh: 'Refurbishment budget (high)',
  refurbContingencyPct: 'Refurbishment contingency',
  resaleValue: 'Resale value after works',
  sellingAgentPct: 'Selling agent fee',
  sellingLegalFees: 'Legal fees (sale)',
  holdingMonths: 'Holding period',
  holdingCostsMonthly: 'Holding costs while vacant (monthly)',
};

/**
 * Default planning assumptions. These are labelled `default` and shown to the user as editable
 * assumptions — they are not facts about any property.
 */
export const DEFAULT_ASSUMPTIONS: Readonly<Partial<DealInputs>> = {
  buyerType: 'additional_property',
  nonResident: false,
  cashPurchase: false,
  depositPct: 25,
  interestRatePct: 5.5,
  termYears: 25,
  interestOnly: true,
  lenderFees: 1_500,
  legalFees: 1_800,
  surveyFees: 600,
  otherAcquisitionCosts: 0,
  vacancyPct: 5,
  managementPct: 12,
  maintenancePct: 8,
  insuranceAnnual: 400,
  refurbContingencyPct: 15,
  sellingAgentPct: 1.5,
  sellingLegalFees: 1_500,
  holdingMonths: 6,
  holdingCostsMonthly: 250,
};

export function blankInputs(): DealInputs {
  return {
    purchasePrice: null,
    jurisdiction: null,
    buyerType: 'additional_property',
    nonResident: false,
    transactionTaxOverride: null,
    cashPurchase: false,
    depositPct: null,
    interestRatePct: null,
    termYears: null,
    interestOnly: true,
    lenderFees: null,
    legalFees: null,
    surveyFees: null,
    otherAcquisitionCosts: null,
    monthlyRent: null,
    vacancyPct: null,
    managementPct: null,
    maintenancePct: null,
    insuranceAnnual: null,
    serviceChargeAnnual: null,
    groundRentAnnual: null,
    otherOperatingAnnual: null,
    refurbCostLow: null,
    refurbCostHigh: null,
    refurbContingencyPct: null,
    resaleValue: null,
    sellingAgentPct: null,
    sellingLegalFees: null,
    holdingMonths: null,
    holdingCostsMonthly: null,
  };
}

/** Fill unknown inputs from defaults, recording provenance. Known values (user/source) are never replaced. */
export function withDefaults(
  inputs: DealInputs,
  provenance: ProvenanceMap,
): { inputs: DealInputs; provenance: ProvenanceMap } {
  const out: DealInputs = { ...inputs };
  const prov: ProvenanceMap = { ...provenance };
  for (const [k, v] of Object.entries(DEFAULT_ASSUMPTIONS) as [DealInputKey, unknown][]) {
    if (prov[k] === 'user' || prov[k] === 'source') continue;
    if (out[k] === null) {
      (out as Record<string, unknown>)[k] = v;
      prov[k] = 'default';
    } else if (prov[k] === undefined) {
      // Non-null value with no recorded origin (e.g. boolean flags) — it is the default choice.
      prov[k] = 'default';
    }
  }
  return { inputs: out, provenance: prov };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const pct = (num: number, den: number) => (den > 0 ? round2((num / den) * 100) : null);

export interface CostLine {
  key: string;
  label: string;
  annual: number | null;
  basis: string;
}

export interface AcquisitionResult {
  purchasePrice: number;
  transactionTax: number | null;
  transactionTaxDetail: TransactionTaxResult | null;
  legalFees: number;
  surveyFees: number;
  lenderFees: number;
  otherAcquisitionCosts: number;
  totalAcquisitionCost: number | null;
  deposit: number;
  loan: number;
}

export interface RentalResult {
  annualGrossRent: number;
  grossYieldPct: number | null;
  operatingCosts: CostLine[];
  annualOperatingCosts: number;
  netOperatingIncome: number;
  netYieldPct: number | null;
  monthlyMortgagePayment: number;
  annualDebtService: number;
  annualCashFlow: number;
  monthlyCashFlow: number;
  cashInvested: number | null;
  cashOnCashReturnPct: number | null;
  breakEvenMonthlyRent: number | null;
  interestCoverageRatio: number | null;
}

export interface FlipResult {
  resaleValue: number;
  refurbishmentCost: number;
  sellingCosts: number;
  holdingCosts: number;
  financeCostsDuringHold: number;
  totalCosts: number;
  grossProfit: number;
  netProfit: number;
  cashInvested: number;
  returnOnCashPct: number | null;
  profitOnCostPct: number | null;
}

export interface DealResult {
  acquisition: AcquisitionResult | null;
  refurbishment: { low: number | null; high: number | null; base: number | null; contingencyPct: number };
  rental: RentalResult | null;
  flip: FlipResult | null;
  missing: { rental: DealInputKey[]; flip: DealInputKey[]; acquisition: DealInputKey[] };
  warnings: string[];
}

function refurbBase(i: DealInputs): { low: number | null; high: number | null; base: number | null } {
  const contingency = (i.refurbContingencyPct ?? 0) / 100;
  const low = i.refurbCostLow;
  const high = i.refurbCostHigh ?? i.refurbCostLow;
  if (low == null && high == null) return { low: null, high: null, base: null };
  const lo = low ?? high!;
  const hi = high ?? lo;
  const mid = (lo + hi) / 2;
  return { low: round2(lo), high: round2(hi), base: round2(mid * (1 + contingency)) };
}

export function calculateDeal(raw: DealInputs): DealResult {
  const i = DealInputsSchema.parse(raw);
  const warnings: string[] = [];
  const missing: DealResult['missing'] = { rental: [], flip: [], acquisition: [] };

  const refurb = refurbBase(i);
  const refurbOut = { ...refurb, contingencyPct: i.refurbContingencyPct ?? 0 };

  // ---- Acquisition ----
  let acquisition: AcquisitionResult | null = null;
  if (i.purchasePrice == null || i.purchasePrice <= 0) {
    missing.acquisition.push('purchasePrice');
  } else {
    const price = i.purchasePrice;
    let taxDetail: TransactionTaxResult | null = null;
    let tax: number | null = null;
    if (i.transactionTaxOverride != null) {
      tax = i.transactionTaxOverride;
    } else if (i.jurisdiction) {
      taxDetail = computeTransactionTax({
        price,
        jurisdiction: i.jurisdiction,
        buyerType: i.buyerType,
        nonResident: i.nonResident,
      });
      tax = taxDetail?.amount ?? null;
    } else {
      missing.acquisition.push('jurisdiction');
      warnings.push(
        'Transaction tax not calculated: the property’s UK nation is unknown. Add a postcode or set the jurisdiction.',
      );
    }

    const optional = (v: number | null, key: DealInputKey) => {
      if (v == null) {
        warnings.push(`${DEAL_INPUT_LABELS[key]} unknown — excluded from totals.`);
        return 0;
      }
      return v;
    };
    const legal = optional(i.legalFees, 'legalFees');
    const survey = optional(i.surveyFees, 'surveyFees');
    const other = optional(i.otherAcquisitionCosts, 'otherAcquisitionCosts');

    let deposit = price;
    let loan = 0;
    let lenderFees = 0;
    if (!i.cashPurchase) {
      if (i.depositPct == null) {
        missing.acquisition.push('depositPct');
      } else {
        deposit = round2((price * i.depositPct) / 100);
        loan = round2(price - deposit);
        lenderFees = optional(i.lenderFees, 'lenderFees');
      }
    }

    acquisition = {
      purchasePrice: price,
      transactionTax: tax,
      transactionTaxDetail: taxDetail,
      legalFees: legal,
      surveyFees: survey,
      lenderFees,
      otherAcquisitionCosts: other,
      totalAcquisitionCost: tax == null ? null : round2(price + tax + legal + survey + lenderFees + other),
      deposit,
      loan,
    };
  }

  const financingKnown =
    acquisition != null &&
    (i.cashPurchase ||
      (i.depositPct != null && i.interestRatePct != null && (i.interestOnly || i.termYears != null)));
  const monthlyPayment =
    acquisition && financingKnown && !i.cashPurchase
      ? monthlyMortgagePayment(acquisition.loan, i.interestRatePct!, i.termYears ?? 25, i.interestOnly)
      : 0;
  if (!i.cashPurchase) {
    if (i.interestRatePct == null) missing.rental.push('interestRatePct');
    if (!i.interestOnly && i.termYears == null) missing.rental.push('termYears');
  }

  const cashInvestedBase =
    acquisition && acquisition.transactionTax != null
      ? acquisition.deposit +
        acquisition.transactionTax +
        acquisition.legalFees +
        acquisition.surveyFees +
        acquisition.lenderFees +
        acquisition.otherAcquisitionCosts
      : null;

  // ---- Rental ----
  let rental: RentalResult | null = null;
  if (i.monthlyRent == null) missing.rental.push('monthlyRent');
  if (acquisition == null) missing.rental.push('purchasePrice');
  if (i.monthlyRent != null && acquisition != null && financingKnown) {
    const gross = i.monthlyRent * 12;
    const v = (i.vacancyPct ?? 0) / 100;
    const m = (i.managementPct ?? 0) / 100;
    const k = (i.maintenancePct ?? 0) / 100;
    const collected = gross * (1 - v);
    const lines: CostLine[] = [];
    const pctLine = (key: DealInputKey, val: number | null, amount: number, basis: string) => {
      if (val == null) warnings.push(`${DEAL_INPUT_LABELS[key]} unknown — excluded from operating costs.`);
      lines.push({ key, label: DEAL_INPUT_LABELS[key], annual: val == null ? null : round2(amount), basis });
    };
    pctLine('vacancyPct', i.vacancyPct, gross * v, `${i.vacancyPct ?? '?'}% of gross rent`);
    pctLine('managementPct', i.managementPct, collected * m, `${i.managementPct ?? '?'}% of collected rent`);
    pctLine('maintenancePct', i.maintenancePct, gross * k, `${i.maintenancePct ?? '?'}% of gross rent`);
    const fixedKeys: DealInputKey[] = [
      'insuranceAnnual',
      'serviceChargeAnnual',
      'groundRentAnnual',
      'otherOperatingAnnual',
    ];
    let fixed = 0;
    for (const key of fixedKeys) {
      const val = i[key] as number | null;
      if (val == null) {
        if (key === 'insuranceAnnual' || key === 'otherOperatingAnnual') {
          warnings.push(`${DEAL_INPUT_LABELS[key]} unknown — excluded from operating costs.`);
        }
        lines.push({ key, label: DEAL_INPUT_LABELS[key], annual: null, basis: 'Unknown' });
      } else {
        fixed += val;
        lines.push({ key, label: DEAL_INPUT_LABELS[key], annual: round2(val), basis: 'Annual amount' });
      }
    }
    const opex = gross * v + collected * m + gross * k + fixed;
    const noi = gross - opex;
    const debt = monthlyPayment * 12;
    const cashFlow = noi - debt;
    const cashInvested = cashInvestedBase == null ? null : cashInvestedBase + (refurb.base ?? 0);
    const marginFactor = (1 - v) * (1 - m) - k;
    const annualInterest = acquisition.loan * ((i.interestRatePct ?? 0) / 100);
    rental = {
      annualGrossRent: round2(gross),
      grossYieldPct: pct(gross, acquisition.purchasePrice),
      operatingCosts: lines,
      annualOperatingCosts: round2(opex),
      netOperatingIncome: round2(noi),
      netYieldPct: pct(noi, acquisition.purchasePrice),
      monthlyMortgagePayment: round2(monthlyPayment),
      annualDebtService: round2(debt),
      annualCashFlow: round2(cashFlow),
      monthlyCashFlow: round2(cashFlow / 12),
      cashInvested: cashInvested == null ? null : round2(cashInvested),
      cashOnCashReturnPct: cashInvested ? pct(cashFlow, cashInvested) : null,
      breakEvenMonthlyRent: marginFactor > 0 ? round2((fixed + debt) / marginFactor / 12) : null,
      interestCoverageRatio: annualInterest > 0 ? round2(gross / annualInterest) : null,
    };
    if (refurb.base == null)
      warnings.push('No refurbishment budget supplied — cash invested excludes works.');
  }

  // ---- Renovate & resell ----
  let flip: FlipResult | null = null;
  if (i.resaleValue == null) missing.flip.push('resaleValue');
  if (refurb.base == null) missing.flip.push('refurbCostLow');
  if (acquisition == null) missing.flip.push('purchasePrice');
  if (i.holdingMonths == null) missing.flip.push('holdingMonths');
  if (
    acquisition &&
    acquisition.totalAcquisitionCost != null &&
    i.resaleValue != null &&
    refurb.base != null &&
    i.holdingMonths != null &&
    (i.cashPurchase || i.interestRatePct != null)
  ) {
    const months = i.holdingMonths;
    const selling = i.resaleValue * ((i.sellingAgentPct ?? 0) / 100) + (i.sellingLegalFees ?? 0);
    if (i.sellingAgentPct == null) warnings.push('Selling agent fee unknown — excluded from sale costs.');
    if (i.sellingLegalFees == null) warnings.push('Sale legal fees unknown — excluded from sale costs.');
    const holding = (i.holdingCostsMonthly ?? 0) * months;
    if (i.holdingCostsMonthly == null) warnings.push('Holding costs unknown — excluded.');
    // During a refurbishment hold, finance is modelled as interest-only on the loan.
    const finance = i.cashPurchase ? 0 : acquisition.loan * ((i.interestRatePct ?? 0) / 100 / 12) * months;
    const totalCosts = acquisition.totalAcquisitionCost + refurb.base + selling + holding + finance;
    const netProfit = i.resaleValue - totalCosts;
    const cashInvested = (cashInvestedBase ?? 0) + refurb.base + holding + finance;
    flip = {
      resaleValue: round2(i.resaleValue),
      refurbishmentCost: round2(refurb.base),
      sellingCosts: round2(selling),
      holdingCosts: round2(holding),
      financeCostsDuringHold: round2(finance),
      totalCosts: round2(totalCosts),
      grossProfit: round2(i.resaleValue - acquisition.purchasePrice - refurb.base),
      netProfit: round2(netProfit),
      cashInvested: round2(cashInvested),
      returnOnCashPct: pct(netProfit, cashInvested),
      profitOnCostPct: pct(netProfit, totalCosts),
    };
  }

  return {
    acquisition,
    refurbishment: refurbOut,
    rental,
    flip,
    missing: {
      rental: [...new Set(missing.rental)],
      flip: [...new Set(missing.flip)],
      acquisition: [...new Set(missing.acquisition)],
    },
    warnings: [...new Set(warnings)],
  };
}

// ---------------------------------------------------------------------------------------------
// Scenarios and sensitivity
// ---------------------------------------------------------------------------------------------

export interface ScenarioDefinition {
  id: 'cautious' | 'base' | 'optimistic';
  label: string;
  adjustments: string[];
  apply: (i: DealInputs) => DealInputs;
}

const scale = (v: number | null, f: number) => (v == null ? null : v * f);
const add = (v: number | null, d: number) => (v == null ? null : v + d);

export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'cautious',
    label: 'Cautious',
    adjustments: [
      'Rent 10% lower',
      'Vacancy +3 points',
      'Interest rate +1.5 points',
      'Refurbishment at the high end of the range plus 25%',
      'Resale value 10% lower',
      'Holding period +3 months',
    ],
    apply: (i) => ({
      ...i,
      monthlyRent: scale(i.monthlyRent, 0.9),
      vacancyPct: add(i.vacancyPct, 3),
      interestRatePct: add(i.interestRatePct, 1.5),
      refurbCostLow: scale(i.refurbCostHigh ?? i.refurbCostLow, 1.25),
      refurbCostHigh: scale(i.refurbCostHigh ?? i.refurbCostLow, 1.25),
      resaleValue: scale(i.resaleValue, 0.9),
      holdingMonths: add(i.holdingMonths, 3),
    }),
  },
  { id: 'base', label: 'Base', adjustments: ['Inputs as entered'], apply: (i) => i },
  {
    id: 'optimistic',
    label: 'Optimistic',
    adjustments: [
      'Rent 5% higher',
      'Interest rate −0.5 points',
      'Refurbishment at the low end of the range',
      'Resale value 5% higher',
    ],
    apply: (i) => ({
      ...i,
      monthlyRent: scale(i.monthlyRent, 1.05),
      interestRatePct: i.interestRatePct == null ? null : Math.max(0, i.interestRatePct - 0.5),
      refurbCostLow: i.refurbCostLow ?? i.refurbCostHigh,
      refurbCostHigh: i.refurbCostLow ?? i.refurbCostHigh,
      resaleValue: scale(i.resaleValue, 1.05),
    }),
  },
];

export interface ScenarioResult {
  id: ScenarioDefinition['id'];
  label: string;
  adjustments: string[];
  monthlyCashFlow: number | null;
  grossYieldPct: number | null;
  netYieldPct: number | null;
  cashOnCashReturnPct: number | null;
  flipNetProfit: number | null;
  flipReturnOnCashPct: number | null;
}

export function runScenarios(inputs: DealInputs): ScenarioResult[] {
  return SCENARIOS.map((s) => {
    const r = calculateDeal(s.apply(inputs));
    return {
      id: s.id,
      label: s.label,
      adjustments: s.adjustments,
      monthlyCashFlow: r.rental?.monthlyCashFlow ?? null,
      grossYieldPct: r.rental?.grossYieldPct ?? null,
      netYieldPct: r.rental?.netYieldPct ?? null,
      cashOnCashReturnPct: r.rental?.cashOnCashReturnPct ?? null,
      flipNetProfit: r.flip?.netProfit ?? null,
      flipReturnOnCashPct: r.flip?.returnOnCashPct ?? null,
    };
  });
}

export interface SensitivityRow {
  label: string;
  monthlyCashFlow: number | null;
  flipNetProfit: number | null;
}

export function sensitivity(inputs: DealInputs): SensitivityRow[] {
  const rows: [string, (i: DealInputs) => DealInputs][] = [
    ['As entered', (i) => i],
    ['Rent −10%', (i) => ({ ...i, monthlyRent: scale(i.monthlyRent, 0.9) })],
    ['Rent +10%', (i) => ({ ...i, monthlyRent: scale(i.monthlyRent, 1.1) })],
    ['Interest rate +1 point', (i) => ({ ...i, interestRatePct: add(i.interestRatePct, 1) })],
    ['Interest rate +2 points', (i) => ({ ...i, interestRatePct: add(i.interestRatePct, 2) })],
    [
      'Refurbishment +20%',
      (i) => ({
        ...i,
        refurbCostLow: scale(i.refurbCostLow, 1.2),
        refurbCostHigh: scale(i.refurbCostHigh, 1.2),
      }),
    ],
    ['Resale value −10%', (i) => ({ ...i, resaleValue: scale(i.resaleValue, 0.9) })],
  ];
  return rows.map(([label, f]) => {
    const r = calculateDeal(f(inputs));
    return {
      label,
      monthlyCashFlow: r.rental?.monthlyCashFlow ?? null,
      flipNetProfit: r.flip?.netProfit ?? null,
    };
  });
}
