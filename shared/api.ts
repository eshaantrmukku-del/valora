/** Request/response contracts shared by the API and the web client. */
import { z } from 'zod';
import { BriefCriteriaSchema, OBJECTIVES, PROPERTY_TYPES } from './brief';
import { DealInputsSchema, PROVENANCES } from './finance/deal';
import { PropertyFactsSchema } from './property';

export const PreferencesSchema = z.object({
  locations: z.array(z.string().trim().min(1).max(80)).max(10),
  budgetMin: z.number().int().min(0).max(100_000_000).nullable(),
  budgetMax: z.number().int().min(0).max(100_000_000).nullable(),
  propertyTypes: z.array(z.enum(PROPERTY_TYPES)).max(PROPERTY_TYPES.length),
  objective: z.enum(OBJECTIVES).nullable(),
  renovationAppetite: z.enum(['none', 'cosmetic', 'moderate', 'extensive']).nullable(),
  riskTolerance: z.enum(['low', 'medium', 'high']).nullable(),
  buyerType: z.enum(['additional_property', 'first_time_buyer', 'home_mover']),
  cashPurchase: z.boolean(),
  depositPct: z.number().min(0).max(100).nullable(),
  interestRatePct: z.number().min(0).max(25).nullable(),
  termYears: z.number().int().min(1).max(40).nullable(),
  interestOnly: z.boolean(),
  targetGrossYieldPct: z.number().min(0).max(50).nullable(),
  targetMonthlyCashFlow: z.number().int().min(-100_000).max(100_000).nullable(),
  emailAlerts: z.boolean(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export const InterpretRequestSchema = z.object({ request: z.string().trim().min(8).max(2_000) });

export const BriefWriteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  originalRequest: z.string().max(2_000).nullable(),
  criteria: BriefCriteriaSchema,
  interpreter: z.enum(['ai', 'rules', 'manual']),
  status: z.enum(['active', 'inactive']).optional(),
});

export const ManualPropertySchema = z.object({
  facts: PropertyFactsSchema.partial().extend({
    askingPrice: z.number().int().min(1_000).max(100_000_000).nullable().optional(),
  }),
});

export const AnalyseRequestSchema = z.object({
  propertyId: z.string().uuid(),
  briefId: z.string().uuid().nullable(),
  inputs: DealInputsSchema.partial().optional(),
});

export const RecalculateSchema = z.object({
  inputs: DealInputsSchema,
  provenance: z.record(z.string(), z.enum(PROVENANCES)).optional(),
});

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
