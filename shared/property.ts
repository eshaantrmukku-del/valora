/**
 * Property facts and evidence — shared shapes with explicit provenance.
 *
 * A "fact" here means a value as reported by a named source (a listing provider, the user, an uploaded
 * document, or an official dataset). Listing text is an agent's claim and is labelled as such.
 */
import { z } from 'zod';
import { PROPERTY_TYPES } from './brief';

export const FACT_SOURCES = [
  'listing',
  'user',
  'document',
  'official_dataset',
  'provider_classification',
  'derived',
] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

export const FACT_SOURCE_LABELS: Record<FactSource, string> = {
  listing: 'Listing (agent’s claim)',
  user: 'Your input',
  document: 'Uploaded document',
  official_dataset: 'Official dataset',
  provider_classification: 'Data provider classification',
  derived: 'Derived by Valora',
};

export const FactOriginSchema = z.object({
  source: z.enum(FACT_SOURCES),
  label: z.string(),
  url: z.string().nullable(),
  retrievedAt: z.string().nullable(),
});
export type FactOrigin = z.infer<typeof FactOriginSchema>;

export const PropertyFactsSchema = z.object({
  address: z.string().nullable(),
  postcode: z.string().nullable(),
  outcode: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  country: z.string().nullable(),
  district: z.string().nullable(),
  propertyType: z.enum(PROPERTY_TYPES).nullable(),
  bedrooms: z.number().int().nullable(),
  bathrooms: z.number().int().nullable(),
  floorAreaSqm: z.number().nullable(),
  askingPrice: z.number().nullable(),
  priceQualifier: z.string().nullable(),
  tenure: z.enum(['freehold', 'leasehold', 'share_of_freehold', 'commonhold', 'unknown']).nullable(),
  leaseYearsRemaining: z.number().nullable(),
  epcRating: z.string().nullable(),
  councilTaxBand: z.string().nullable(),
  serviceChargeAnnual: z.number().nullable(),
  groundRentAnnual: z.number().nullable(),
  description: z.string().nullable(),
  keyFeatures: z.array(z.string()),
  images: z.array(z.string()),
  listingUrl: z.string().nullable(),
  listingStatus: z.enum(['for_sale', 'under_offer', 'sold_stc', 'withdrawn', 'unknown']).nullable(),
  daysOnMarket: z.number().nullable(),
  /** Provider-specific classifications, e.g. a sourcing list name. */
  providerTags: z.array(z.string()),
});
export type PropertyFacts = z.infer<typeof PropertyFactsSchema>;
export type FactKey = keyof PropertyFacts;

export function emptyFacts(): PropertyFacts {
  return {
    address: null,
    postcode: null,
    outcode: null,
    latitude: null,
    longitude: null,
    country: null,
    district: null,
    propertyType: null,
    bedrooms: null,
    bathrooms: null,
    floorAreaSqm: null,
    askingPrice: null,
    priceQualifier: null,
    tenure: null,
    leaseYearsRemaining: null,
    epcRating: null,
    councilTaxBand: null,
    serviceChargeAnnual: null,
    groundRentAnnual: null,
    description: null,
    keyFeatures: [],
    images: [],
    listingUrl: null,
    listingStatus: null,
    daysOnMarket: null,
    providerTags: [],
  };
}

export type FactOrigins = Partial<Record<FactKey, FactOrigin>>;

// ---------------- Evidence ----------------

export const SoldComparableSchema = z.object({
  price: z.number(),
  date: z.string(),
  postcode: z.string().nullable(),
  address: z.string().nullable(),
  propertyType: z.string().nullable(),
  newBuild: z.boolean(),
  tenure: z.string().nullable(),
});
export type SoldComparable = z.infer<typeof SoldComparableSchema>;

export const SoldEvidenceSchema = z.object({
  source: z.string(),
  sourceUrl: z.string().nullable(),
  retrievedAt: z.string(),
  scope: z.string(),
  comparables: z.array(SoldComparableSchema),
});
export type SoldEvidence = z.infer<typeof SoldEvidenceSchema>;

export const RentalEvidenceSchema = z.object({
  source: z.string(),
  sourceUrl: z.string().nullable(),
  retrievedAt: z.string(),
  scope: z.string(),
  bedrooms: z.number().nullable(),
  monthlyAverage: z.number().nullable(),
  monthlyRangeLow: z.number().nullable(),
  monthlyRangeHigh: z.number().nullable(),
  sampleSize: z.number().nullable(),
  /** Asking rents from current listings are not achieved rents. */
  basis: z.enum(['asking_rents', 'achieved_rents', 'user_supplied']),
});
export type RentalEvidence = z.infer<typeof RentalEvidenceSchema>;

export const PlanningConstraintSchema = z.object({
  dataset: z.string(),
  name: z.string(),
  reference: z.string().nullable(),
  source: z.string(),
  sourceUrl: z.string().nullable(),
  retrievedAt: z.string(),
});
export type PlanningConstraint = z.infer<typeof PlanningConstraintSchema>;

export const EvidenceBundleSchema = z.object({
  sold: SoldEvidenceSchema.nullable(),
  rental: RentalEvidenceSchema.nullable(),
  planningConstraints: z.array(PlanningConstraintSchema).nullable(),
  /** Per-source failures or unavailability, shown to the user. */
  unavailable: z.array(z.object({ source: z.string(), reason: z.string() })),
});
export type EvidenceBundle = z.infer<typeof EvidenceBundleSchema>;

export function emptyEvidence(): EvidenceBundle {
  return { sold: null, rental: null, planningConstraints: null, unavailable: [] };
}
