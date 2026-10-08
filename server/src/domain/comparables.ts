/**
 * Comparable sold evidence summarisation. Deterministic and conservative.
 */
import type { PropertyType } from '../../../shared/brief';
import type { SoldComparable, SoldEvidence } from '../../../shared/property';

/** HM Land Registry property-type labels → Valora property types. */
const LR_TYPE_MAP: Record<string, PropertyType[]> = {
  detached: ['detached', 'bungalow'],
  'semi-detached': ['semi_detached'],
  terraced: ['terraced', 'end_of_terrace'],
  'flat-maisonette': ['flat', 'maisonette'],
};

export function lrTypeMatches(lrType: string | null, type: PropertyType | null): boolean {
  if (!type || !lrType) return true;
  const key = lrType.toLowerCase().replace(/\s+/g, '-');
  const mapped = LR_TYPE_MAP[key];
  if (!mapped) return false;
  if (type === 'house_any') return key !== 'flat-maisonette';
  return mapped.includes(type);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function quantile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export interface ComparableSummary {
  count: number;
  median: number | null;
  lowerQuartile: number | null;
  upperQuartile: number | null;
  sameOutcodeCount: number;
  oldest: string | null;
  newest: string | null;
  used: SoldComparable[];
  confidence: 'none' | 'low' | 'medium' | 'high';
  caveats: string[];
}

export function summariseComparables(
  evidence: SoldEvidence | null,
  subject: { propertyType: PropertyType | null; outcode: string | null },
): ComparableSummary {
  const caveats = [
    'Land Registry records do not include floor area or condition, so sold prices are only a rough guide to value.',
  ];
  if (!evidence || !evidence.comparables.length) {
    return {
      count: 0,
      median: null,
      lowerQuartile: null,
      upperQuartile: null,
      sameOutcodeCount: 0,
      oldest: null,
      newest: null,
      used: [],
      confidence: 'none',
      caveats,
    };
  }
  let pool = evidence.comparables.filter(
    (c) => c.price > 0 && lrTypeMatches(c.propertyType, subject.propertyType),
  );
  const established = pool.filter((c) => !c.newBuild);
  if (established.length >= 3) pool = established;
  const sameOut = subject.outcode
    ? pool.filter((c) => c.postcode?.toUpperCase().startsWith(`${subject.outcode!.toUpperCase()} `))
    : [];
  const used = (sameOut.length >= 5 ? sameOut : pool).slice(0, 30);
  const prices = used.map((c) => c.price);
  const dates = used.map((c) => c.date).sort();
  let confidence: ComparableSummary['confidence'] = 'none';
  if (used.length >= 10 && sameOut.length >= 5) confidence = 'high';
  else if (used.length >= 5) confidence = 'medium';
  else if (used.length >= 3) confidence = 'low';
  if (sameOut.length < 5)
    caveats.push('Few sales in the same postcode district; the sample covers a wider area.');
  return {
    count: used.length,
    median: median(prices),
    lowerQuartile: quantile(prices, 0.25),
    upperQuartile: quantile(prices, 0.75),
    sameOutcodeCount: sameOut.length,
    oldest: dates[0] ?? null,
    newest: dates[dates.length - 1] ?? null,
    used,
    confidence,
    caveats,
  };
}

/**
 * Indicative refurbishment cost range per m² of floor area by scope of works.
 * These are planning assumptions (UK mid-market, labour + materials, ex-VAT where applicable), NOT quotes.
 * Users should replace them with builder quotes.
 */
export const REFURB_RATES_PER_SQM: Record<'cosmetic' | 'moderate' | 'extensive', [number, number]> = {
  cosmetic: [250, 500],
  moderate: [600, 1_100],
  extensive: [1_200, 2_000],
};

export function indicativeRefurbRange(
  floorAreaSqm: number | null,
  scope: 'cosmetic' | 'moderate' | 'extensive',
): { low: number; high: number; basis: string } | null {
  if (floorAreaSqm == null || floorAreaSqm <= 0) return null;
  const [lo, hi] = REFURB_RATES_PER_SQM[scope];
  return {
    low: Math.round(floorAreaSqm * lo),
    high: Math.round(floorAreaSqm * hi),
    basis: `Indicative ${scope} refurbishment at £${lo}–£${hi} per m² × ${floorAreaSqm} m² (planning assumption, not a quote)`,
  };
}
