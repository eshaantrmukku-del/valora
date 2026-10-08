/**
 * Property records: canonical provider-sourced records (shared, public listing data) and private
 * user-entered records. Access rules live here so every route uses the same checks.
 */
import { and, eq, isNull, or } from 'drizzle-orm';
import { emptyFacts, type FactOrigins, type PropertyFacts } from '../../../shared/property';
import { getDb, schema } from '../db/client';
import { notFound } from '../lib/errors';
import type { ProviderListing } from '../providers/types';

export type PropertyRow = typeof schema.properties.$inferSelect;

function normAddressLine(address: string): string {
  return (address.split(',')[0] ?? address)
    .toLowerCase()
    .replace(/\b(flat|apartment|apt)\b/g, 'flat')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(avenue)\b/g, 'ave')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Cross-provider identity. Requires a full postcode AND an address line with a house number/name;
 * otherwise returns null and deduplication falls back to the provider's own listing id.
 */
export function propertyFingerprint(f: Partial<PropertyFacts>): string | null {
  const pc = f.postcode?.replace(/\s+/g, '').toUpperCase();
  if (!pc || !/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(pc) || !f.address) return null;
  const line = normAddressLine(f.address);
  if (line.length < 4 || !/\d/.test(line)) return null;
  return `${pc}|${line}`;
}

export function mergeFacts(base: PropertyFacts, incoming: Partial<PropertyFacts>): PropertyFacts {
  const out: PropertyFacts = { ...base };
  for (const [k, v] of Object.entries(incoming) as [keyof PropertyFacts, unknown][]) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      const merged = [...new Set([...(out[k] as unknown[]), ...v])];
      (out as Record<string, unknown>)[k] = merged;
    } else {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/**
 * Insert or update a provider listing and its canonical property, deduplicating by provider listing id
 * first and by property fingerprint second. Returns the property and listing ids.
 */
export async function upsertProviderListing(
  l: ProviderListing,
): Promise<{ propertyId: string; listingId: string; isNewProperty: boolean }> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [existingListing] = await tx
      .select()
      .from(schema.listings)
      .where(
        and(
          eq(schema.listings.provider, l.provider),
          eq(schema.listings.providerListingId, l.providerListingId),
        ),
      );

    let propertyId = existingListing?.propertyId ?? null;
    const fingerprint = propertyFingerprint(l.facts);
    if (!propertyId && fingerprint) {
      const [byFp] = await tx
        .select({ id: schema.properties.id })
        .from(schema.properties)
        .where(and(eq(schema.properties.fingerprint, fingerprint), isNull(schema.properties.ownerUserId)));
      propertyId = byFp?.id ?? null;
    }

    let isNewProperty = false;
    if (propertyId) {
      const [prop] = await tx.select().from(schema.properties).where(eq(schema.properties.id, propertyId));
      await tx
        .update(schema.properties)
        .set({
          facts: mergeFacts(prop!.facts, l.facts),
          factOrigins: { ...prop!.factOrigins, ...l.factOrigins },
          fingerprint: prop!.fingerprint ?? fingerprint,
          updatedAt: new Date(),
        })
        .where(eq(schema.properties.id, propertyId));
    } else {
      const [created] = await tx
        .insert(schema.properties)
        .values({
          facts: mergeFacts(emptyFacts(), l.facts),
          factOrigins: l.factOrigins,
          fingerprint,
          origin: 'provider',
          ownerUserId: null,
        })
        .returning({ id: schema.properties.id });
      propertyId = created!.id;
      isNewProperty = true;
    }

    let listingId: string;
    if (existingListing) {
      await tx
        .update(schema.listings)
        .set({
          url: l.url,
          askingPrice: l.facts.askingPrice ?? null,
          status: l.facts.listingStatus ?? 'unknown',
          raw: l.raw as object,
          lastCheckedAt: new Date(),
        })
        .where(eq(schema.listings.id, existingListing.id));
      listingId = existingListing.id;
    } else {
      const [created] = await tx
        .insert(schema.listings)
        .values({
          propertyId,
          provider: l.provider,
          providerListingId: l.providerListingId,
          url: l.url,
          askingPrice: l.facts.askingPrice ?? null,
          status: l.facts.listingStatus ?? 'unknown',
          raw: l.raw as object,
        })
        .returning({ id: schema.listings.id });
      listingId = created!.id;
    }
    return { propertyId, listingId, isNewProperty };
  });
}

export async function createPrivateProperty(
  userId: string,
  facts: Partial<PropertyFacts>,
  factOrigins: FactOrigins,
  origin: 'manual' | 'document' | 'listing_text',
): Promise<PropertyRow> {
  const [row] = await getDb()
    .insert(schema.properties)
    .values({
      ownerUserId: userId,
      facts: mergeFacts(emptyFacts(), facts),
      factOrigins,
      origin,
      fingerprint: null,
    })
    .returning();
  return row!;
}

/** A user may read provider-sourced records and their own private records — nothing else. */
export async function getAccessibleProperty(userId: string, id: string): Promise<PropertyRow> {
  const [row] = await getDb()
    .select()
    .from(schema.properties)
    .where(
      and(
        eq(schema.properties.id, id),
        or(isNull(schema.properties.ownerUserId), eq(schema.properties.ownerUserId, userId)),
      ),
    );
  if (!row) throw notFound('Property');
  return row;
}

/** Only private records can be edited, and only by their owner. */
export async function getOwnedProperty(userId: string, id: string): Promise<PropertyRow> {
  const [row] = await getDb()
    .select()
    .from(schema.properties)
    .where(and(eq(schema.properties.id, id), eq(schema.properties.ownerUserId, userId)));
  if (!row) throw notFound('Property');
  return row;
}

export async function listingsForProperty(propertyId: string) {
  return getDb().select().from(schema.listings).where(eq(schema.listings.propertyId, propertyId));
}
