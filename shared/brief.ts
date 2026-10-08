/**
 * Investment Brief — the structured, versioned representation of what a user wants to achieve.
 *
 * The same schema is used for:
 *  - AI extraction output (validated at runtime),
 *  - the rule-based fallback interpreter,
 *  - persistence (stored as JSONB with `schemaVersion`),
 *  - the editable brief form in the UI.
 *
 * Every field is required-but-nullable so the schema is compatible with structured model output
 * (which does not permit optional properties) and so "unknown" is always explicit.
 */
import { z } from 'zod';

export const BRIEF_SCHEMA_VERSION = 1 as const;

export const OBJECTIVES = [
  'renovation_value_add',
  'long_term_rental',
  'renovation_resale',
  'general_screening',
] as const;
export type Objective = (typeof OBJECTIVES)[number];

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  renovation_value_add: 'Renovate and add value (hold)',
  long_term_rental: 'Long-term rental income',
  renovation_resale: 'Renovate and resell',
  general_screening: 'General screening',
};

export const PROPERTY_TYPES = [
  'detached',
  'semi_detached',
  'terraced',
  'end_of_terrace',
  'bungalow',
  'flat',
  'maisonette',
  'house_any',
  'other',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  detached: 'Detached house',
  semi_detached: 'Semi-detached house',
  terraced: 'Terraced house',
  end_of_terrace: 'End of terrace',
  bungalow: 'Bungalow',
  flat: 'Flat / apartment',
  maisonette: 'Maisonette',
  house_any: 'Any house',
  other: 'Other',
};

export const HOUSE_TYPES: readonly PropertyType[] = [
  'detached',
  'semi_detached',
  'terraced',
  'end_of_terrace',
  'bungalow',
];

/** Scoring components the ranking engine understands. Weights per brief live in `objectiveWeights`. */
export const SCORE_COMPONENTS = [
  'priceFit',
  'propertyFit',
  'conditionOpportunity',
  'extensionPotential',
  'valueUplift',
  'rentalYield',
  'cashFlow',
  'resaleMargin',
  'dataCompleteness',
  'riskAlignment',
] as const;
export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

export const SCORE_COMPONENT_LABELS: Record<ScoreComponent, string> = {
  priceFit: 'Price fit',
  propertyFit: 'Property fit',
  conditionOpportunity: 'Improvement opportunity',
  extensionPotential: 'Extension / plot signals',
  valueUplift: 'Value-uplift evidence',
  rentalYield: 'Rental yield',
  cashFlow: 'Monthly cash flow',
  resaleMargin: 'Resale margin',
  dataCompleteness: 'Data completeness',
  riskAlignment: 'Risk alignment',
};

const nullableNumber = z.number().nullable();

export const HardConstraintSchema = z.object({
  kind: z.enum([
    'location',
    'max_price',
    'min_price',
    'min_bedrooms',
    'max_bedrooms',
    'min_bathrooms',
    'property_type',
    'required_feature',
    'excluded_feature',
    'other',
  ]),
  description: z.string(),
});

export const SoftPreferenceSchema = z.object({
  kind: z.enum([
    'needs_modernisation',
    'large_plot',
    'garden',
    'parking',
    'extension_potential',
    'below_market',
    'no_chain',
    'good_condition',
    'other',
  ]),
  description: z.string(),
  /** 1 = nice to have, 3 = strongly preferred */
  importance: z.number().int().min(1).max(3),
});

export const InvestigationCriterionSchema = z.object({
  kind: z.enum([
    'extension_potential',
    'value_uplift',
    'planning',
    'tenant_demand',
    'rental_evidence',
    'resale_evidence',
    'condition',
    'other',
  ]),
  description: z.string(),
});

export const ObjectiveWeightsSchema = z.object({
  priceFit: z.number().min(0).max(5),
  propertyFit: z.number().min(0).max(5),
  conditionOpportunity: z.number().min(0).max(5),
  extensionPotential: z.number().min(0).max(5),
  valueUplift: z.number().min(0).max(5),
  rentalYield: z.number().min(0).max(5),
  cashFlow: z.number().min(0).max(5),
  resaleMargin: z.number().min(0).max(5),
  dataCompleteness: z.number().min(0).max(5),
  riskAlignment: z.number().min(0).max(5),
});
export type ObjectiveWeights = z.infer<typeof ObjectiveWeightsSchema>;

export const BriefCriteriaSchema = z.object({
  schemaVersion: z.literal(BRIEF_SCHEMA_VERSION),
  objective: z.enum(OBJECTIVES),
  location: z.object({
    /** Human place names, e.g. "Manchester", "Little Chalfont". */
    areas: z.array(z.string().min(1).max(80)).max(10),
    /** Full postcodes or outcodes, e.g. "M14", "HP7 9QX". */
    postcodes: z.array(z.string().min(2).max(10)).max(10),
    radiusMiles: nullableNumber,
  }),
  budget: z.object({ minimum: nullableNumber, maximum: nullableNumber }),
  propertyTypes: z.array(z.enum(PROPERTY_TYPES)).max(PROPERTY_TYPES.length),
  bedrooms: z.object({ minimum: z.number().int().nullable(), maximum: z.number().int().nullable() }),
  bathrooms: z.object({ minimum: z.number().int().nullable() }),
  requiredFeatures: z.array(z.string().max(120)).max(20),
  excludedFeatures: z.array(z.string().max(120)).max(20),
  hardConstraints: z.array(HardConstraintSchema).max(20),
  softPreferences: z.array(SoftPreferenceSchema).max(20),
  investigationCriteria: z.array(InvestigationCriterionSchema).max(20),
  financialTargets: z.object({
    minGrossYieldPct: nullableNumber,
    minMonthlyCashFlow: nullableNumber,
    minProfit: nullableNumber,
  }),
  renovation: z.object({
    appetite: z.enum(['none', 'cosmetic', 'moderate', 'extensive']).nullable(),
    maxBudget: nullableNumber,
  }),
  development: z.object({
    extensionInterest: z.boolean(),
    loftConversionInterest: z.boolean(),
  }),
  risk: z.object({ tolerance: z.enum(['low', 'medium', 'high']).nullable() }),
  objectiveWeights: ObjectiveWeightsSchema,
  /** Things the interpreter could not determine and that matter for the decision. */
  missingInformation: z.array(z.string().max(240)).max(20),
  /** Assumptions the interpreter made explicitly, shown to the user. */
  assumptions: z.array(z.string().max(240)).max(20),
  /** Focused questions to ask when an essential requirement is ambiguous. */
  clarificationQuestions: z.array(z.string().max(240)).max(5),
});
export type BriefCriteria = z.infer<typeof BriefCriteriaSchema>;

/** Default ranking weights per objective. Users can override them per brief. */
export function defaultWeights(objective: Objective): ObjectiveWeights {
  const base: ObjectiveWeights = {
    priceFit: 2,
    propertyFit: 2,
    conditionOpportunity: 0,
    extensionPotential: 0,
    valueUplift: 0,
    rentalYield: 0,
    cashFlow: 0,
    resaleMargin: 0,
    dataCompleteness: 1,
    riskAlignment: 1,
  };
  switch (objective) {
    case 'renovation_value_add':
      return { ...base, conditionOpportunity: 3, extensionPotential: 2, valueUplift: 3 };
    case 'long_term_rental':
      return { ...base, rentalYield: 3, cashFlow: 3, riskAlignment: 2 };
    case 'renovation_resale':
      return { ...base, conditionOpportunity: 2, valueUplift: 2, resaleMargin: 4, riskAlignment: 2 };
    case 'general_screening':
      return { ...base, valueUplift: 1, rentalYield: 1 };
  }
}

export function emptyCriteria(objective: Objective = 'general_screening'): BriefCriteria {
  return {
    schemaVersion: BRIEF_SCHEMA_VERSION,
    objective,
    location: { areas: [], postcodes: [], radiusMiles: null },
    budget: { minimum: null, maximum: null },
    propertyTypes: [],
    bedrooms: { minimum: null, maximum: null },
    bathrooms: { minimum: null },
    requiredFeatures: [],
    excludedFeatures: [],
    hardConstraints: [],
    softPreferences: [],
    investigationCriteria: [],
    financialTargets: { minGrossYieldPct: null, minMonthlyCashFlow: null, minProfit: null },
    renovation: { appetite: null, maxBudget: null },
    development: { extensionInterest: false, loftConversionInterest: false },
    risk: { tolerance: null },
    objectiveWeights: defaultWeights(objective),
    missingInformation: [],
    assumptions: [],
    clarificationQuestions: [],
  };
}

/**
 * Rebuild the hard-constraint list from the structured fields so the human-readable list can never drift
 * from what is actually enforced. Free-text `other` constraints the user added are preserved.
 */
export function deriveHardConstraints(c: BriefCriteria): BriefCriteria['hardConstraints'] {
  const out: BriefCriteria['hardConstraints'] = [];
  const places = [...c.location.areas, ...c.location.postcodes];
  if (places.length) {
    const radius = c.location.radiusMiles ? ` (within ${c.location.radiusMiles} miles)` : '';
    out.push({ kind: 'location', description: `Located in ${places.join(' or ')}${radius}` });
  }
  if (c.budget.maximum != null)
    out.push({ kind: 'max_price', description: `Asking price at or below £${c.budget.maximum.toLocaleString('en-GB')}` });
  if (c.budget.minimum != null)
    out.push({ kind: 'min_price', description: `Asking price at or above £${c.budget.minimum.toLocaleString('en-GB')}` });
  if (c.bedrooms.minimum != null)
    out.push({ kind: 'min_bedrooms', description: `At least ${c.bedrooms.minimum} bedroom(s)` });
  if (c.bedrooms.maximum != null)
    out.push({ kind: 'max_bedrooms', description: `At most ${c.bedrooms.maximum} bedroom(s)` });
  if (c.bathrooms.minimum != null)
    out.push({ kind: 'min_bathrooms', description: `At least ${c.bathrooms.minimum} bathroom(s)` });
  if (c.propertyTypes.length)
    out.push({
      kind: 'property_type',
      description: `Property type: ${c.propertyTypes.map((t) => PROPERTY_TYPE_LABELS[t]).join(', ')}`,
    });
  for (const f of c.requiredFeatures) out.push({ kind: 'required_feature', description: `Must have: ${f}` });
  for (const f of c.excludedFeatures) out.push({ kind: 'excluded_feature', description: `Must not have: ${f}` });
  for (const h of c.hardConstraints) if (h.kind === 'other') out.push(h);
  return out;
}

/** Normalise a brief after any edit: derive constraints, de-duplicate lists, clamp values. */
export function normaliseCriteria(input: BriefCriteria): BriefCriteria {
  const c = BriefCriteriaSchema.parse(input);
  const uniq = <T>(xs: T[]) => [...new Set(xs)];
  const clean: BriefCriteria = {
    ...c,
    location: {
      areas: uniq(c.location.areas.map((a) => a.trim()).filter(Boolean)),
      postcodes: uniq(c.location.postcodes.map((p) => p.trim().toUpperCase()).filter(Boolean)),
      radiusMiles: c.location.radiusMiles != null ? Math.min(Math.max(c.location.radiusMiles, 0.5), 50) : null,
    },
    propertyTypes: uniq(c.propertyTypes),
    requiredFeatures: uniq(c.requiredFeatures.map((s) => s.trim()).filter(Boolean)),
    excludedFeatures: uniq(c.excludedFeatures.map((s) => s.trim()).filter(Boolean)),
  };
  if (
    clean.budget.minimum != null &&
    clean.budget.maximum != null &&
    clean.budget.minimum > clean.budget.maximum
  ) {
    throw new z.ZodError([
      { code: 'custom', path: ['budget', 'minimum'], message: 'Minimum budget exceeds maximum budget', input: clean.budget },
    ]);
  }
  clean.hardConstraints = deriveHardConstraints(clean);
  return clean;
}

/** Is there enough in the brief to run a live search? Returns the blocking reasons, if any. */
export function searchReadiness(c: BriefCriteria): string[] {
  const reasons: string[] = [];
  if (!c.location.areas.length && !c.location.postcodes.length)
    reasons.push('Add at least one location (a town, city or postcode) so Valora knows where to search.');
  return reasons;
}

export const BriefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  originalRequest: z.string().nullable(),
  criteria: BriefCriteriaSchema,
  status: z.enum(['active', 'inactive']),
  interpreter: z.enum(['ai', 'rules', 'manual']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Brief = z.infer<typeof BriefSchema>;
