/**
 * Relational data model (PostgreSQL via Drizzle ORM).
 *
 * Ownership: every user-owned table has a `user_id` with ON DELETE CASCADE so account deletion removes
 * all private data. Repository functions always filter by user id; see `server/src/lib/ownership.ts`.
 *
 * Canonical vs private property records: `properties.owner_user_id` is NULL for records created from a
 * provider listing (public listing data, shared across users) and set for records a user entered or
 * uploaded (private to that user).
 */
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { BriefCriteria } from '../../../shared/brief';
import type { DealInputs, ProvenanceMap } from '../../../shared/finance/deal';
import type { EvidenceBundle, FactOrigins, PropertyFacts } from '../../../shared/property';
import type { RankingResult } from '../../../shared/ranking';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const userRef = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

// ---------------------------------------------------------------- Accounts

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the session token; the raw token only exists in the user's cookie. */
    tokenHash: text('token_hash').primaryKey(),
    userId: userRef(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    createdAt: created(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const passwordResetTokens = pgTable('password_reset_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: userRef(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: created(),
});

export const userPreferences = pgTable('user_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  locations: text('locations').array().notNull().default(sql`'{}'::text[]`),
  budgetMin: integer('budget_min'),
  budgetMax: integer('budget_max'),
  propertyTypes: text('property_types').array().notNull().default(sql`'{}'::text[]`),
  objective: text('objective'),
  renovationAppetite: text('renovation_appetite'),
  riskTolerance: text('risk_tolerance'),
  buyerType: text('buyer_type').notNull().default('additional_property'),
  cashPurchase: boolean('cash_purchase').notNull().default(false),
  depositPct: doublePrecision('deposit_pct'),
  interestRatePct: doublePrecision('interest_rate_pct'),
  termYears: integer('term_years'),
  interestOnly: boolean('interest_only').notNull().default(true),
  targetGrossYieldPct: doublePrecision('target_gross_yield_pct'),
  targetMonthlyCashFlow: integer('target_monthly_cash_flow'),
  emailAlerts: boolean('email_alerts').notNull().default(false),
  updatedAt: updated(),
});

// ---------------------------------------------------------------- Briefs

export const investmentBriefs = pgTable(
  'investment_briefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    name: text('name').notNull(),
    originalRequest: text('original_request'),
    criteria: jsonb('criteria').$type<BriefCriteria>().notNull(),
    schemaVersion: integer('schema_version').notNull(),
    status: text('status', { enum: ['active', 'inactive'] }).notNull().default('active'),
    interpreter: text('interpreter', { enum: ['ai', 'rules', 'manual'] }).notNull(),
    interpreterModel: text('interpreter_model'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('briefs_user_idx').on(t.userId, t.updatedAt)],
);

// ---------------------------------------------------------------- Properties & evidence

export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** NULL = provider-sourced public listing data; otherwise private to this user. */
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Normalised identity used for cross-provider deduplication. */
    fingerprint: text('fingerprint'),
    facts: jsonb('facts').$type<PropertyFacts>().notNull(),
    factOrigins: jsonb('fact_origins').$type<FactOrigins>().notNull().default({}),
    origin: text('origin', { enum: ['provider', 'manual', 'document', 'listing_text'] }).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index('properties_owner_idx').on(t.ownerUserId),
    uniqueIndex('properties_public_fingerprint_idx').on(t.fingerprint).where(sql`${t.ownerUserId} is null`),
  ],
);

export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerListingId: text('provider_listing_id').notNull(),
    url: text('url'),
    status: text('status').notNull().default('unknown'),
    askingPrice: integer('asking_price'),
    raw: jsonb('raw').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('listings_provider_id_idx').on(t.provider, t.providerListingId),
    index('listings_property_idx').on(t.propertyId),
  ],
);

/** Cached evidence (comparables, rents, constraints) per property, with provenance and retrieval time. */
export const propertyEvidence = pgTable(
  'property_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    bundle: jsonb('bundle').$type<EvidenceBundle>().notNull(),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('evidence_property_idx').on(t.propertyId, t.retrievedAt)],
);

export const dataReports = pgTable('data_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: userRef(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  field: text('field').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: created(),
});

// ---------------------------------------------------------------- Discover

export const searchRuns = pgTable(
  'search_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    briefId: uuid('brief_id').references(() => investmentBriefs.id, { onDelete: 'set null' }),
    briefName: text('brief_name').notNull(),
    criteriaSnapshot: jsonb('criteria_snapshot').$type<BriefCriteria>().notNull(),
    trigger: text('trigger', { enum: ['manual', 'monitor'] }).notNull(),
    status: text('status', { enum: ['queued', 'running', 'completed', 'partial', 'failed'] }).notNull().default('queued'),
    stage: text('stage'),
    providerStatus: jsonb('provider_status')
      .$type<{ provider: string; status: 'ok' | 'failed' | 'skipped' | 'not_configured'; message: string; count: number }[]>()
      .notNull()
      .default([]),
    error: text('error'),
    candidateCount: integer('candidate_count').notNull().default(0),
    resultCount: integer('result_count').notNull().default(0),
    idempotencyKey: text('idempotency_key'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    index('search_runs_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('search_runs_idem_idx').on(t.userId, t.idempotencyKey),
  ],
);

export const searchResults = pgTable(
  'search_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    searchRunId: uuid('search_run_id')
      .notNull()
      .references(() => searchRuns.id, { onDelete: 'cascade' }),
    userId: userRef(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'set null' }),
    rank: integer('rank').notNull(),
    matchScore: integer('match_score').notNull(),
    confidence: integer('confidence').notNull(),
    ranking: jsonb('ranking').$type<RankingResult>().notNull(),
    factsSnapshot: jsonb('facts_snapshot').$type<PropertyFacts>().notNull(),
    isNew: boolean('is_new').notNull().default(true),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    index('search_results_run_idx').on(t.searchRunId, t.rank),
    uniqueIndex('search_results_run_property_idx').on(t.searchRunId, t.propertyId),
  ],
);

export const dismissedProperties = pgTable(
  'dismissed_properties',
  {
    userId: userRef(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    briefId: uuid('brief_id').references(() => investmentBriefs.id, { onDelete: 'cascade' }),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.propertyId] })],
);

// ---------------------------------------------------------------- Saved, analyses, comparisons

export const savedProperties = pgTable(
  'saved_properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    briefId: uuid('brief_id').references(() => investmentBriefs.id, { onDelete: 'set null' }),
    note: text('note'),
    status: text('status', { enum: ['watching', 'offer', 'owned', 'passed'] }).notNull().default('watching'),
    createdAt: created(),
  },
  (t) => [uniqueIndex('saved_user_property_idx').on(t.userId, t.propertyId)],
);

export const analyses = pgTable(
  'analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    briefId: uuid('brief_id').references(() => investmentBriefs.id, { onDelete: 'set null' }),
    briefName: text('brief_name'),
    criteriaSnapshot: jsonb('criteria_snapshot').$type<BriefCriteria>().notNull(),
    factsSnapshot: jsonb('facts_snapshot').$type<PropertyFacts>().notNull(),
    factOriginsSnapshot: jsonb('fact_origins_snapshot').$type<FactOrigins>().notNull(),
    evidenceSnapshot: jsonb('evidence_snapshot').$type<EvidenceBundle>().notNull(),
    inputs: jsonb('inputs').$type<DealInputs>().notNull(),
    inputProvenance: jsonb('input_provenance').$type<ProvenanceMap>().notNull(),
    ranking: jsonb('ranking').$type<RankingResult>().notNull(),
    report: jsonb('report').notNull(),
    narrativeStatus: text('narrative_status', { enum: ['generated', 'not_configured', 'failed', 'pending'] }).notNull(),
    narrativeError: text('narrative_error'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('analyses_user_idx').on(t.userId, t.createdAt), index('analyses_property_idx').on(t.propertyId)],
);

export const comparisons = pgTable(
  'comparisons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    name: text('name').notNull(),
    briefId: uuid('brief_id').references(() => investmentBriefs.id, { onDelete: 'set null' }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('comparisons_user_idx').on(t.userId)],
);

export const comparisonItems = pgTable(
  'comparison_items',
  {
    comparisonId: uuid('comparison_id')
      .notNull()
      .references(() => comparisons.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.comparisonId, t.propertyId] })],
);

// ---------------------------------------------------------------- Portfolio

export const portfolioAssets = pgTable(
  'portfolio_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
    label: text('label').notNull(),
    address: text('address'),
    postcode: text('postcode'),
    purchasePrice: integer('purchase_price'),
    purchaseDate: text('purchase_date'),
    ownershipPct: doublePrecision('ownership_pct').notNull().default(100),
    mortgageBalance: integer('mortgage_balance'),
    interestRatePct: doublePrecision('interest_rate_pct'),
    interestOnly: boolean('interest_only').notNull().default(true),
    monthlyMortgagePayment: doublePrecision('monthly_mortgage_payment'),
    monthlyRent: doublePrecision('monthly_rent'),
    monthlyOperatingCosts: doublePrecision('monthly_operating_costs'),
    currentValuation: integer('current_valuation'),
    valuationSource: text('valuation_source'),
    valuationDate: text('valuation_date'),
    notes: text('notes'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('portfolio_user_idx').on(t.userId)],
);

export const portfolioTransactions = pgTable(
  'portfolio_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => portfolioAssets.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    type: text('type', { enum: ['income', 'operating_expense', 'capital_expenditure', 'mortgage_payment', 'other'] }).notNull(),
    amount: doublePrecision('amount').notNull(),
    description: text('description'),
    createdAt: created(),
  },
  (t) => [index('portfolio_tx_asset_idx').on(t.assetId, t.date)],
);

// ---------------------------------------------------------------- Monitoring & notifications

export const monitors = pgTable(
  'monitors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    briefId: uuid('brief_id')
      .notNull()
      .references(() => investmentBriefs.id, { onDelete: 'cascade' }),
    frequencyHours: integer('frequency_hours').notNull().default(24),
    active: boolean('active').notNull().default(true),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    lastStatus: text('last_status'),
    lastError: text('last_error'),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex('monitors_brief_idx').on(t.briefId), index('monitors_due_idx').on(t.active, t.nextRunAt)],
);

/** Listings a monitor has already seen, for new-match and price-change detection. */
export const monitorSeen = pgTable(
  'monitor_seen',
  {
    monitorId: uuid('monitor_id')
      .notNull()
      .references(() => monitors.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    lastPrice: integer('last_price'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.monitorId, t.propertyId] })],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [uniqueIndex('notifications_dedupe_idx').on(t.userId, t.dedupeKey), index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  notificationId: uuid('notification_id')
    .notNull()
    .references(() => notifications.id, { onDelete: 'cascade' }),
  channel: text('channel', { enum: ['email'] }).notNull(),
  status: text('status', { enum: ['pending', 'sent', 'failed', 'not_configured'] }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: created(),
});

// ---------------------------------------------------------------- Jobs

export const jobs = pgTable(
  'jobs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed'] }).notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    dedupeKey: text('dedupe_key'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index('jobs_ready_idx').on(t.status, t.runAt),
    uniqueIndex('jobs_dedupe_active_idx').on(t.dedupeKey).where(sql`${t.status} in ('queued','running')`),
  ],
);

// ---------------------------------------------------------------- Documents

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    content: bytea('content').notNull(),
    extractedText: text('extracted_text'),
    extraction: jsonb('extraction'),
    status: text('status', { enum: ['uploaded', 'processing', 'extracted', 'failed'] }).notNull().default('uploaded'),
    error: text('error'),
    createdAt: created(),
  },
  (t) => [index('documents_user_idx').on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------- AI

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: userRef(),
    title: text('title').notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('ai_conv_user_idx').on(t.userId, t.updatedAt)],
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    /** Display text plus metadata (tools used, assumptions flagged). */
    content: jsonb('content').$type<{ text: string; toolsUsed?: string[]; context?: unknown }>().notNull(),
    /** Raw API message content for faithful replay of the conversation. */
    apiContent: jsonb('api_content'),
    createdAt: created(),
  },
  (t) => [index('ai_messages_conv_idx').on(t.conversationId, t.id)],
);

/** One row per AI call — for cost control (daily caps) and diagnostics. No prompt contents stored. */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    task: text('task').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    ok: boolean('ok').notNull(),
    createdAt: created(),
  },
  (t) => [index('ai_usage_user_idx').on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------- Audit & cache

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    /** Not a foreign key: audit rows for deleted accounts are kept (without personal data). */
    userId: uuid('user_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    meta: jsonb('meta'),
    createdAt: created(),
  },
  (t) => [index('audit_user_idx').on(t.userId, t.createdAt)],
);

export const providerCache = pgTable(
  'provider_cache',
  {
    key: text('key').primaryKey(),
    provider: text('provider').notNull(),
    value: jsonb('value').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('provider_cache_expiry_idx').on(t.expiresAt)],
);
