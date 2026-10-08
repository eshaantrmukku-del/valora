/**
 * Brief monitoring: a backend scheduler re-runs active monitored briefs on their frequency, detects new
 * matches and price changes against what the monitor has already seen, and creates notifications.
 * Timestamps on the monitor record exactly when checks actually ran.
 */
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import type { PropertyFacts } from '../../../shared/property';
import { getDb, schema } from '../db/client';
import { createSearchRun } from './discover';
import { notify } from './notifications';

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

export async function scheduleDueMonitors(now = new Date()): Promise<number> {
  const db = getDb();
  const due = await db
    .select({ m: schema.monitors, b: schema.investmentBriefs })
    .from(schema.monitors)
    .innerJoin(schema.investmentBriefs, eq(schema.investmentBriefs.id, schema.monitors.briefId))
    .where(and(eq(schema.monitors.active, true), lte(schema.monitors.nextRunAt, now)))
    .limit(50);
  let scheduled = 0;
  for (const { m, b } of due) {
    // Claim the slot first so concurrent schedulers can't double-schedule.
    const claimed = await db
      .update(schema.monitors)
      .set({ nextRunAt: new Date(now.getTime() + m.frequencyHours * 3_600_000), updatedAt: new Date() })
      .where(and(eq(schema.monitors.id, m.id), eq(schema.monitors.nextRunAt, m.nextRunAt)))
      .returning({ id: schema.monitors.id });
    if (!claimed.length) continue;
    if (b.status !== 'active') {
      await db.update(schema.monitors).set({ lastStatus: 'skipped', lastError: 'Brief is inactive' }).where(eq(schema.monitors.id, m.id));
      continue;
    }
    try {
      await createSearchRun({
        userId: m.userId,
        briefId: b.id,
        briefName: b.name,
        criteria: b.criteria,
        trigger: 'monitor',
        idempotencyKey: `monitor:${m.id}:${now.toISOString().slice(0, 13)}`,
      });
      await db.update(schema.monitors).set({ lastRunAt: now, lastStatus: 'scheduled', lastError: null }).where(eq(schema.monitors.id, m.id));
      scheduled++;
    } catch (e) {
      await db.update(schema.monitors).set({ lastRunAt: now, lastStatus: 'failed', lastError: (e as Error).message }).where(eq(schema.monitors.id, m.id));
    }
  }
  return scheduled;
}

export async function recordMonitorMatches(
  userId: string,
  briefId: string,
  briefName: string,
  results: { propertyId: string; facts: PropertyFacts; matchScore: number }[],
) {
  const db = getDb();
  const [monitor] = await db.select().from(schema.monitors).where(and(eq(schema.monitors.briefId, briefId), eq(schema.monitors.userId, userId)));
  if (!monitor) return;
  const ids = results.map((r) => r.propertyId);
  const seen = ids.length
    ? await db.select().from(schema.monitorSeen).where(and(eq(schema.monitorSeen.monitorId, monitor.id), inArray(schema.monitorSeen.propertyId, ids)))
    : [];
  const [{ count: everSeen } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.monitorSeen)
    .where(eq(schema.monitorSeen.monitorId, monitor.id));
  const seenMap = new Map(seen.map((s) => [s.propertyId, s]));
  const baseline = everSeen === 0;
  let newCount = 0;

  for (const r of results) {
    const prev = seenMap.get(r.propertyId);
    const price = r.facts.askingPrice;
    const label = r.facts.address ?? r.facts.postcode ?? 'A property';
    if (!prev) {
      newCount++;
      if (!baseline) {
        await notify(userId, {
          type: 'monitor.new_match',
          title: `New match for “${briefName}”`,
          body: `${label}${price ? ` — ${gbp(price)}` : ''} matches your brief (score ${r.matchScore}/100).`,
          link: `/properties/${r.propertyId}?brief=${briefId}`,
          dedupeKey: `new:${monitor.id}:${r.propertyId}`,
        });
      }
    } else if (price != null && prev.lastPrice != null && price !== prev.lastPrice) {
      await notify(userId, {
        type: 'monitor.price_change',
        title: `Price ${price < prev.lastPrice ? 'reduced' : 'increased'}: ${label}`,
        body: `Asking price changed from ${gbp(prev.lastPrice)} to ${gbp(price)} (brief “${briefName}”).`,
        link: `/properties/${r.propertyId}?brief=${briefId}`,
        dedupeKey: `price:${monitor.id}:${r.propertyId}:${price}`,
      });
    }
    await db
      .insert(schema.monitorSeen)
      .values({ monitorId: monitor.id, propertyId: r.propertyId, lastPrice: price })
      .onConflictDoUpdate({
        target: [schema.monitorSeen.monitorId, schema.monitorSeen.propertyId],
        set: { lastPrice: price, lastSeenAt: new Date() },
      });
  }
  if (baseline) {
    await notify(userId, {
      type: 'monitor.baseline',
      title: `Monitoring started for “${briefName}”`,
      body: `First check complete: ${results.length} current match(es). You’ll be notified about new matches and price changes.`,
      link: `/discover?brief=${briefId}`,
      dedupeKey: `baseline:${monitor.id}`,
    });
  }
  await db.update(schema.monitors).set({ lastStatus: `completed (${newCount} new)`, lastError: null }).where(eq(schema.monitors.id, monitor.id));
}
