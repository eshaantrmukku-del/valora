/**
 * UK residential property transaction taxes — dated, configurable rule sets.
 *
 *  - England & Northern Ireland: Stamp Duty Land Tax (SDLT)
 *  - Scotland: Land and Buildings Transaction Tax (LBTT) + Additional Dwelling Supplement (ADS)
 *  - Wales: Land Transaction Tax (LTT)
 *
 * Each rule set carries an `effectiveFrom` date and a `lastReviewed` date. Rates change, and the correct
 * treatment depends on individual circumstances (e.g. replacing a main residence, company purchases,
 * mixed-use, multiple dwellings relief abolition, non-resident status). Results are estimates only.
 *
 * Sources (reviewed when the rule set was written):
 *  - SDLT: https://www.gov.uk/stamp-duty-land-tax/residential-property-rates
 *  - LBTT: https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property
 *  - LTT:  https://www.gov.wales/land-transaction-tax-rates-and-bands
 */

export type Jurisdiction = 'england' | 'northern_ireland' | 'scotland' | 'wales';
export type BuyerType = 'additional_property' | 'first_time_buyer' | 'home_mover';

export interface Band {
  /** Upper bound of the band in £ (inclusive); null for the top band. */
  upTo: number | null;
  ratePct: number;
}

export interface TaxRuleSet {
  id: string;
  taxName: string;
  jurisdictions: Jurisdiction[];
  effectiveFrom: string; // ISO date
  effectiveTo: string | null;
  lastReviewed: string;
  sourceUrl: string;
  standardBands: Band[];
  /** Bands for purchases of additional dwellings, if the regime uses a separate band table (Wales). */
  higherRateBands: Band[] | null;
  /** Flat surcharge on the whole price for additional dwellings (SDLT surcharge / Scottish ADS). */
  additionalDwellingSurchargePct: number | null;
  /** Minimum price at which the additional-dwelling surcharge applies. */
  surchargeThreshold: number;
  firstTimeBuyer: { bands: Band[]; maxPrice: number } | null;
  nonResidentSurchargePct: number | null;
}

export const TAX_RULE_SETS: TaxRuleSet[] = [
  {
    id: 'sdlt-2025-04-01',
    taxName: 'Stamp Duty Land Tax',
    jurisdictions: ['england', 'northern_ireland'],
    effectiveFrom: '2025-04-01',
    effectiveTo: null,
    lastReviewed: '2026-10-08',
    sourceUrl: 'https://www.gov.uk/stamp-duty-land-tax/residential-property-rates',
    standardBands: [
      { upTo: 125_000, ratePct: 0 },
      { upTo: 250_000, ratePct: 2 },
      { upTo: 925_000, ratePct: 5 },
      { upTo: 1_500_000, ratePct: 10 },
      { upTo: null, ratePct: 12 },
    ],
    higherRateBands: null,
    additionalDwellingSurchargePct: 5,
    surchargeThreshold: 40_000,
    firstTimeBuyer: {
      bands: [
        { upTo: 300_000, ratePct: 0 },
        { upTo: 500_000, ratePct: 5 },
      ],
      maxPrice: 500_000,
    },
    nonResidentSurchargePct: 2,
  },
  {
    id: 'lbtt-2024-12-05',
    taxName: 'Land and Buildings Transaction Tax',
    jurisdictions: ['scotland'],
    effectiveFrom: '2024-12-05',
    effectiveTo: null,
    lastReviewed: '2026-10-08',
    sourceUrl: 'https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property',
    standardBands: [
      { upTo: 145_000, ratePct: 0 },
      { upTo: 250_000, ratePct: 2 },
      { upTo: 325_000, ratePct: 5 },
      { upTo: 750_000, ratePct: 10 },
      { upTo: null, ratePct: 12 },
    ],
    higherRateBands: null,
    additionalDwellingSurchargePct: 8,
    surchargeThreshold: 40_000,
    firstTimeBuyer: {
      bands: [
        { upTo: 175_000, ratePct: 0 },
        { upTo: 250_000, ratePct: 2 },
        { upTo: 325_000, ratePct: 5 },
        { upTo: 750_000, ratePct: 10 },
        { upTo: null, ratePct: 12 },
      ],
      maxPrice: Number.POSITIVE_INFINITY,
    },
    nonResidentSurchargePct: null,
  },
  {
    id: 'ltt-2024-12-11',
    taxName: 'Land Transaction Tax',
    jurisdictions: ['wales'],
    effectiveFrom: '2024-12-11',
    effectiveTo: null,
    lastReviewed: '2026-10-08',
    sourceUrl: 'https://www.gov.wales/land-transaction-tax-rates-and-bands',
    standardBands: [
      { upTo: 225_000, ratePct: 0 },
      { upTo: 400_000, ratePct: 6 },
      { upTo: 750_000, ratePct: 7.5 },
      { upTo: 1_500_000, ratePct: 10 },
      { upTo: null, ratePct: 12 },
    ],
    higherRateBands: [
      { upTo: 180_000, ratePct: 5 },
      { upTo: 250_000, ratePct: 8.5 },
      { upTo: 400_000, ratePct: 10 },
      { upTo: 750_000, ratePct: 12.5 },
      { upTo: 1_500_000, ratePct: 15 },
      { upTo: null, ratePct: 17 },
    ],
    additionalDwellingSurchargePct: null,
    surchargeThreshold: 40_000,
    firstTimeBuyer: null,
    nonResidentSurchargePct: null,
  },
];

export function selectTaxRules(
  jurisdiction: Jurisdiction,
  onDate: string = new Date().toISOString().slice(0, 10),
): TaxRuleSet | null {
  const candidates = TAX_RULE_SETS.filter(
    (r) =>
      r.jurisdictions.includes(jurisdiction) &&
      r.effectiveFrom <= onDate &&
      (r.effectiveTo == null || onDate < r.effectiveTo),
  ).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return candidates[0] ?? null;
}

export function applyBands(price: number, bands: Band[]): number {
  let tax = 0;
  let lower = 0;
  for (const band of bands) {
    const upper = band.upTo ?? Number.POSITIVE_INFINITY;
    if (price > lower) {
      const taxable = Math.min(price, upper) - lower;
      tax += (taxable * band.ratePct) / 100;
    }
    lower = upper;
    if (price <= upper) break;
  }
  return tax;
}

export interface TransactionTaxInput {
  price: number;
  jurisdiction: Jurisdiction;
  buyerType: BuyerType;
  nonResident?: boolean;
  completionDate?: string;
}

export interface TransactionTaxResult {
  amount: number;
  taxName: string;
  ruleSetId: string;
  effectiveFrom: string;
  lastReviewed: string;
  sourceUrl: string;
  breakdown: { label: string; amount: number }[];
  notes: string[];
}

/** Estimate the property transaction tax. Rounded down to the whole pound, as the tax authorities do. */
export function computeTransactionTax(input: TransactionTaxInput): TransactionTaxResult | null {
  const { price, jurisdiction, buyerType } = input;
  if (!Number.isFinite(price) || price < 0) return null;
  const rules = selectTaxRules(jurisdiction, input.completionDate);
  if (!rules) return null;

  const breakdown: { label: string; amount: number }[] = [];
  const notes: string[] = [
    `Estimate using ${rules.taxName} rates effective from ${rules.effectiveFrom} (rules last reviewed ${rules.lastReviewed}). Tax depends on individual circumstances and rates can change — confirm with a conveyancer.`,
  ];
  const isAdditional = buyerType === 'additional_property' && price >= rules.surchargeThreshold;

  let base: number;
  if (buyerType === 'first_time_buyer' && rules.firstTimeBuyer && price <= rules.firstTimeBuyer.maxPrice) {
    base = applyBands(price, rules.firstTimeBuyer.bands);
    breakdown.push({ label: 'First-time buyer rates', amount: base });
  } else {
    if (buyerType === 'first_time_buyer') {
      notes.push(
        rules.firstTimeBuyer
          ? 'Price exceeds the first-time buyer relief limit, so standard rates apply.'
          : `${rules.taxName} has no first-time buyer relief; standard rates apply.`,
      );
    }
    if (isAdditional && rules.higherRateBands) {
      base = applyBands(price, rules.higherRateBands);
      breakdown.push({ label: 'Higher rates (additional dwelling)', amount: base });
    } else {
      base = applyBands(price, rules.standardBands);
      breakdown.push({ label: 'Standard rates', amount: base });
    }
  }

  let total = base;
  if (isAdditional && rules.additionalDwellingSurchargePct != null) {
    const surcharge = (price * rules.additionalDwellingSurchargePct) / 100;
    total += surcharge;
    breakdown.push({
      label: `Additional dwelling surcharge (${rules.additionalDwellingSurchargePct}%)`,
      amount: surcharge,
    });
  }
  if (input.nonResident) {
    if (rules.nonResidentSurchargePct != null) {
      const s = (price * rules.nonResidentSurchargePct) / 100;
      total += s;
      breakdown.push({ label: `Non-resident surcharge (${rules.nonResidentSurchargePct}%)`, amount: s });
    } else {
      notes.push(`No non-resident surcharge is modelled for ${rules.taxName}.`);
    }
  }

  return {
    amount: Math.floor(total),
    taxName: rules.taxName,
    ruleSetId: rules.id,
    effectiveFrom: rules.effectiveFrom,
    lastReviewed: rules.lastReviewed,
    sourceUrl: rules.sourceUrl,
    breakdown: breakdown.map((b) => ({ ...b, amount: Math.floor(b.amount) })),
    notes,
  };
}

/** Map a postcodes.io `country` value to a tax jurisdiction. */
export function jurisdictionFromCountry(country: string | null | undefined): Jurisdiction | null {
  switch ((country ?? '').toLowerCase()) {
    case 'england':
      return 'england';
    case 'scotland':
      return 'scotland';
    case 'wales':
      return 'wales';
    case 'northern ireland':
      return 'northern_ireland';
    default:
      return null;
  }
}
