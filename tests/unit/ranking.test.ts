import { describe, expect, it } from 'vitest';
import { rankProperty } from '../../server/src/domain/ranking';
import { detectSignals } from '../../server/src/domain/signals';
import { summariseComparables } from '../../server/src/domain/comparables';
import { interpretWithRules } from '../../server/src/domain/briefRules';
import { DEFAULT_ASSUMPTIONS } from '../../shared/finance/deal';
import { emptyEvidence, emptyFacts, type EvidenceBundle, type PropertyFacts } from '../../shared/property';

const renovation = interpretWithRules('3 bed house in Manchester under £500k that needs modernising with a good-sized plot and potential for an extension').criteria;
const rental = interpretWithRules('3 bed house in Manchester under £500k for long-term rental with positive cash flow').criteria;

function facts(over: Partial<PropertyFacts> = {}): PropertyFacts {
  return {
    ...emptyFacts(),
    address: '1 Example Road, Manchester',
    postcode: 'M20 1AA',
    outcode: 'M20',
    country: 'England',
    propertyType: 'semi_detached',
    bedrooms: 3,
    askingPrice: 300_000,
    floorAreaSqm: 95,
    tenure: 'freehold',
    images: ['x'],
    description: 'A three bedroom semi-detached house in need of modernisation throughout, set on a generous plot with scope to extend (STPP).',
    ...over,
  };
}

function evidence(): EvidenceBundle {
  const comps = Array.from({ length: 12 }, (_, i) => ({
    price: 330_000 + i * 5_000,
    date: `2025-0${(i % 9) + 1}-15`,
    postcode: `M20 ${i}AB`,
    address: null,
    propertyType: 'semi-detached',
    newBuild: false,
    tenure: 'freehold',
  }));
  return {
    ...emptyEvidence(),
    sold: { source: 'HM Land Registry Price Paid Data', sourceUrl: null, retrievedAt: '2026-10-01', scope: 'M20', comparables: comps },
    rental: {
      source: 'Test rental evidence',
      sourceUrl: null,
      retrievedAt: '2026-10-01',
      scope: 'M20, 3 bed',
      bedrooms: 3,
      monthlyAverage: 1_600,
      monthlyRangeLow: 1_400,
      monthlyRangeHigh: 1_800,
      sampleSize: 20,
      basis: 'asking_rents',
    },
  };
}

const financing = { ...DEFAULT_ASSUMPTIONS };

describe('signals', () => {
  it('detects listing claims with snippets', () => {
    const s = detectSignals(['Offered with no onward chain. Requires full modernisation. Large rear garden.']);
    expect(s.map((x) => x.kind)).toEqual(expect.arrayContaining(['needs_modernisation', 'no_chain', 'large_plot']));
    expect(s.find((x) => x.kind === 'needs_modernisation')!.snippet).toMatch(/Requires full modernisation/);
  });
  it('returns nothing for empty text', () => {
    expect(detectSignals([null, '', undefined])).toEqual([]);
  });
});

describe('ranking engine', () => {
  it('excludes properties that fail hard constraints', () => {
    const r = rankProperty({ criteria: renovation, facts: facts({ askingPrice: 650_000 }), evidence: evidence(), financing });
    expect(r.eligible).toBe(false);
    expect(r.matchScore).toBe(0);
    expect(r.constraints.find((c) => c.kind === 'max_price')!.status).toBe('fail');
  });

  it('keeps properties with unconfirmed constraints but reports them', () => {
    const r = rankProperty({ criteria: renovation, facts: facts({ bedrooms: null }), evidence: evidence(), financing });
    expect(r.eligible).toBe(true);
    expect(r.constraints.find((c) => c.kind === 'min_bedrooms')!.status).toBe('unknown');
    expect(r.missing.some((m) => m.includes('Unconfirmed requirement'))).toBe(true);
  });

  it('missing data lowers confidence and never raises the score', () => {
    const full = rankProperty({ criteria: renovation, facts: facts(), evidence: evidence(), financing });
    const sparse = rankProperty({ criteria: renovation, facts: facts({ description: null, floorAreaSqm: null }), evidence: emptyEvidence(), financing });
    expect(sparse.confidence).toBeLessThan(full.confidence);
    expect(sparse.matchScore).toBeLessThan(full.matchScore);
  });

  it('is strategy-aware: the same property scores differently per brief, facts unchanged', () => {
    const f = facts();
    const reno = rankProperty({ criteria: renovation, facts: f, evidence: evidence(), financing });
    const rent = rankProperty({ criteria: rental, facts: f, evidence: evidence(), financing });
    expect(reno.components.map((c) => c.key)).toContain('conditionOpportunity');
    expect(rent.components.map((c) => c.key)).toContain('cashFlow');
    expect(rent.components.map((c) => c.key)).not.toContain('conditionOpportunity');
    expect(reno.metrics.grossYieldPct).toBe(rent.metrics.grossYieldPct);
    expect(reno.matchScore).not.toBe(rent.matchScore);
  });

  it('ranks a modernisation opportunity above a refurbished one for a renovation brief', () => {
    const needsWork = rankProperty({ criteria: renovation, facts: facts(), evidence: evidence(), financing });
    const refurbished = rankProperty({
      criteria: renovation,
      facts: facts({ description: 'A newly refurbished three bedroom semi-detached house in walk-in condition.' }),
      evidence: evidence(),
      financing,
    });
    expect(needsWork.matchScore).toBeGreaterThan(refurbished.matchScore);
  });

  it('flats score low for extension potential', () => {
    const r = rankProperty({ criteria: { ...renovation, propertyTypes: [] }, facts: facts({ propertyType: 'flat' }), evidence: evidence(), financing });
    expect(r.components.find((c) => c.key === 'extensionPotential')!.score).toBeLessThanOrEqual(10);
  });

  it('computes value evidence from comparables', () => {
    const r = rankProperty({ criteria: renovation, facts: facts(), evidence: evidence(), financing });
    expect(r.metrics.comparableCount).toBe(12);
    expect(r.metrics.comparableMedian).toBe(357_500);
    expect(r.metrics.discountToComparablesPct).toBeCloseTo(16.1, 1);
  });

  it('every component explains itself', () => {
    const r = rankProperty({ criteria: renovation, facts: facts(), evidence: evidence(), financing });
    for (const c of r.components) expect(c.explanation.length).toBeGreaterThan(10);
  });
});

describe('comparables', () => {
  it('filters by type and reports confidence', () => {
    const s = summariseComparables(evidence().sold, { propertyType: 'flat', outcode: 'M20' });
    expect(s.count).toBe(0);
    expect(s.confidence).toBe('none');
  });
});
