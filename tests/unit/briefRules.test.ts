import { describe, expect, it } from 'vitest';
import {
  interpretWithRules,
  parseBudget,
  parseBedrooms,
  parseLocation,
  parseObjective,
  parsePropertyTypes,
} from '../../server/src/domain/briefRules';
import { BriefCriteriaSchema, emptyCriteria, normaliseCriteria, searchReadiness } from '../../shared/brief';

describe('rule-based brief interpretation', () => {
  it('interprets the canonical renovation brief', () => {
    const r = interpretWithRules(
      'Find me a three-bedroom house in Manchester under £500,000 that needs modernising, has a good-sized plot and might have potential for an extension.',
    );
    const c = r.criteria;
    expect(BriefCriteriaSchema.safeParse(c).success).toBe(true);
    expect(c.objective).toBe('renovation_value_add');
    expect(c.location.areas).toEqual(['Manchester']);
    expect(c.budget.maximum).toBe(500_000);
    expect(c.bedrooms.minimum).toBe(3);
    expect(c.propertyTypes).toEqual(['house_any']);
    expect(c.softPreferences.map((p) => p.kind)).toEqual(
      expect.arrayContaining(['needs_modernisation', 'large_plot']),
    );
    expect(c.development.extensionInterest).toBe(true);
    expect(c.investigationCriteria.some((i) => i.kind === 'extension_potential')).toBe(true);
    // Extension potential is an investigation criterion, never a hard constraint.
    expect(c.hardConstraints.some((h) => /extension/i.test(h.description))).toBe(false);
    expect(c.hardConstraints.map((h) => h.kind)).toEqual(
      expect.arrayContaining(['location', 'max_price', 'min_bedrooms', 'property_type']),
    );
    expect(r.name).toMatch(/Manchester/);
  });

  it('recognises a rental strategy', () => {
    const c = interpretWithRules(
      'Find properties in Leeds suitable for long-term rental with reliable tenant demand and positive monthly cash flow.',
    ).criteria;
    expect(c.objective).toBe('long_term_rental');
    expect(c.financialTargets.minMonthlyCashFlow).toBe(0);
    expect(c.objectiveWeights.cashFlow).toBeGreaterThan(c.objectiveWeights.conditionOpportunity);
  });

  it('recognises renovate-and-resell', () => {
    expect(parseObjective('Find properties that could be renovated and resold at a profit')).toBe(
      'renovation_resale',
    );
    const c = interpretWithRules(
      'Find properties in Bristol that could be renovated and resold at a profit',
    ).criteria;
    expect(c.objectiveWeights.resaleMargin).toBeGreaterThan(0);
  });

  it('asks for a location when none is given', () => {
    const c = interpretWithRules('Find properties that could be renovated and resold at a profit').criteria;
    expect(c.clarificationQuestions.length).toBeGreaterThan(0);
    expect(searchReadiness(c).length).toBeGreaterThan(0);
  });

  it('parses budgets', () => {
    expect(parseBudget('under £450k')).toEqual({ minimum: null, maximum: 450_000 });
    expect(parseBudget('between £200k and £300k')).toEqual({ minimum: 200_000, maximum: 300_000 });
    expect(parseBudget('£150,000 - £250,000')).toEqual({ minimum: 150_000, maximum: 250_000 });
    expect(parseBudget('up to 1.2m')).toEqual({ minimum: null, maximum: 1_200_000 });
    expect(parseBudget('within 5 miles under 5 minutes')).toEqual({ minimum: null, maximum: null });
  });

  it('parses bedrooms', () => {
    expect(parseBedrooms('3 bed semi')).toEqual({ minimum: 3, maximum: null });
    expect(parseBedrooms('at least four bedrooms')).toEqual({ minimum: 4, maximum: null });
    expect(parseBedrooms('2-3 bed flats')).toEqual({ minimum: 2, maximum: 3 });
    expect(parseBedrooms('4+ bed')).toEqual({ minimum: 4, maximum: null });
  });

  it('parses property types without confusing semi-detached and detached', () => {
    expect(parsePropertyTypes('a semi-detached house')).toEqual(['semi_detached']);
    expect(parsePropertyTypes('detached or semi-detached')).toEqual(['semi_detached', 'detached']);
    expect(parsePropertyTypes('flats and apartments')).toEqual(['flat']);
  });

  it('parses locations, postcodes and radius', () => {
    expect(parseLocation('3 bed in Little Chalfont under £600k')).toMatchObject({
      areas: ['Little Chalfont'],
    });
    expect(parseLocation('houses near M14 4AB within 3 miles')).toMatchObject({
      postcodes: ['M14 4AB'],
      radiusMiles: 3,
    });
    expect(parseLocation('flats in Newcastle upon Tyne for rental').areas).toEqual(['Newcastle upon Tyne']);
  });
});

describe('brief normalisation', () => {
  it('derives hard constraints from structured fields so they cannot drift', () => {
    const c = emptyCriteria('long_term_rental');
    c.location.areas = ['Leeds'];
    c.budget.maximum = 200_000;
    c.hardConstraints = [
      { kind: 'max_price', description: 'stale text' },
      { kind: 'other', description: 'Must be freehold' },
    ];
    const n = normaliseCriteria(c);
    expect(n.hardConstraints.map((h) => h.description)).toEqual([
      'Located in Leeds',
      'Asking price at or below £200,000',
      'Must be freehold',
    ]);
  });
  it('rejects a minimum budget above the maximum', () => {
    const c = emptyCriteria();
    c.budget = { minimum: 300_000, maximum: 200_000 };
    expect(() => normaliseCriteria(c)).toThrow(/Minimum budget/);
  });
  it('rejects unknown schema versions', () => {
    expect(BriefCriteriaSchema.safeParse({ ...emptyCriteria(), schemaVersion: 2 }).success).toBe(false);
  });
});
