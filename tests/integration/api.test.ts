import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUser, setTestEnv, type Client } from './helpers';

setTestEnv();
const { buildApp } = await import('../../server/src/app');
const { closeDb } = await import('../../server/src/db/client');
const { startWorker } = await import('../../server/src/jobs/worker');
const { resetConfig } = await import('../../server/src/config');

let app: FastifyInstance;
const worker = () => startWorker({ info() {}, warn() {}, error() {} }, { loop: false });

beforeAll(async () => {
  resetConfig();
  app = await buildApp({ logger: false });
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

async function createBrief(c: Client, request: string) {
  const interp = await c.req('POST', '/api/briefs/interpret', { request });
  expect(interp.status).toBe(200);
  const saved = await c.req('POST', '/api/briefs', {
    name: interp.json.name,
    originalRequest: request,
    criteria: interp.json.criteria,
    interpreter: interp.json.interpreter,
  });
  expect(saved.status).toBe(200);
  return saved.json.brief;
}

async function runSearch(c: Client, briefId: string) {
  const r = await c.req('POST', '/api/search-runs', {
    briefId,
    criteria: null,
    name: null,
    idempotencyKey: null,
  });
  expect(r.status).toBe(200);
  await worker().drain();
  const res = await c.req('GET', `/api/search-runs/${r.json.run.id}`);
  return res.json;
}

describe('authentication', () => {
  it('registers, reads the session and logs out', async () => {
    const c = await newUser(app);
    const me = await c.req('GET', '/api/auth/me');
    expect(me.json.user.email).toMatch(/@example.com/);
    expect(me.json.user.onboardingCompleted).toBe(false);
    await c.req('POST', '/api/auth/logout');
    const after = await c.req('GET', '/api/auth/me');
    expect(after.json.user).toBeNull();
  });

  it('rejects weak passwords, duplicate emails and wrong passwords', async () => {
    const h = { 'x-valora-client': '1', 'content-type': 'application/json' };
    const weak = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: h,
      payload: { email: 'weak@example.com', password: 'short' },
    });
    expect(weak.statusCode).toBe(422);
    const c = await newUser(app, 'dup');
    const dup = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: h,
      payload: { email: c.email.toUpperCase(), password: 'correct horse battery' },
    });
    expect(dup.statusCode).toBe(409);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: h,
      payload: { email: c.email, password: 'wrong password!!' },
    });
    expect(bad.statusCode).toBe(401);
  });

  it('requires the CSRF client header on writes', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'a@b.co', password: 'x' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('protects private endpoints', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/briefs' });
    expect(r.statusCode).toBe(401);
  });

  it('password reset tokens work once', async () => {
    const c = await newUser(app, 'reset');
    const { getDb, schema } = await import('../../server/src/db/client');
    const { randomToken, sha256 } = await import('../../server/src/auth/password');
    const { eq, sql } = await import('drizzle-orm');
    const [u] = await getDb()
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${c.email}`);
    const token = randomToken();
    await getDb()
      .insert(schema.passwordResetTokens)
      .values({ tokenHash: sha256(token), userId: u!.id, expiresAt: new Date(Date.now() + 60_000) });
    const ok = await c.req('POST', '/api/auth/password-reset/confirm', {
      token,
      password: 'another long password',
    });
    expect(ok.status).toBe(200);
    const again = await c.req('POST', '/api/auth/password-reset/confirm', {
      token,
      password: 'another long password',
    });
    expect(again.status).toBe(400);
    // existing sessions are revoked
    expect((await c.req('GET', '/api/auth/me')).json.user).toBeNull();
    void eq;
  });
});

describe('Journey A — onboarding and briefs persist', () => {
  it('skips onboarding, creates a brief and reopens it with identical criteria', async () => {
    const c = await newUser(app);
    expect((await c.req('POST', '/api/preferences/skip-onboarding')).status).toBe(200);
    expect((await c.req('GET', '/api/auth/me')).json.user.onboardingCompleted).toBe(true);
    const brief = await createBrief(
      c,
      'Three-bedroom house in Manchester under £500,000 that needs modernising with a good-sized plot and extension potential',
    );
    const reopened = await c.req('GET', `/api/briefs/${brief.id}`);
    expect(reopened.json.brief.criteria).toEqual(brief.criteria);
    expect(reopened.json.brief.criteria.budget.maximum).toBe(500000);
    expect(reopened.json.brief.criteria.development.extensionInterest).toBe(true);
  });

  it('renames, duplicates, deactivates and deletes briefs', async () => {
    const c = await newUser(app);
    const b = await createBrief(c, 'Rental flats in Leeds under £200k with positive cash flow');
    expect((await c.req('PATCH', `/api/briefs/${b.id}`, { name: 'Leeds BTL' })).json.brief.name).toBe(
      'Leeds BTL',
    );
    const dup = await c.req('POST', `/api/briefs/${b.id}/duplicate`);
    expect(dup.json.brief.status).toBe('inactive');
    expect((await c.req('PATCH', `/api/briefs/${b.id}`, { status: 'inactive' })).json.brief.status).toBe(
      'inactive',
    );
    expect((await c.req('DELETE', `/api/briefs/${b.id}`)).status).toBe(200);
    expect((await c.req('GET', `/api/briefs/${b.id}`)).status).toBe(404);
  });

  it('rejects invalid criteria', async () => {
    const c = await newUser(app);
    const interp = await c.req('POST', '/api/briefs/interpret', { request: 'houses in Leeds under 300k' });
    const bad = { ...interp.json.criteria, budget: { minimum: 400000, maximum: 300000 } };
    const r = await c.req('POST', '/api/briefs', {
      name: 'x',
      originalRequest: null,
      criteria: bad,
      interpreter: 'manual',
    });
    expect(r.status).toBe(422);
  });
});

describe('Journey B — Discover', () => {
  it('searches the configured provider, ranks, saves and reopens', async () => {
    const c = await newUser(app);
    const b = await createBrief(
      c,
      '3 bed house in Testville under £500k that needs modernising with a large garden',
    );
    const res = await runSearch(c, b.id);
    expect(res.run.status).toBe('completed');
    expect(res.run.providerStatus[0].provider).toMatch(/Test fixtures/);
    expect(res.results.length).toBeGreaterThan(0);
    for (const r of res.results) {
      expect(r.facts.askingPrice).toBeLessThanOrEqual(500000);
      expect(r.facts.bedrooms).toBeGreaterThanOrEqual(3);
      expect(r.facts.propertyType).not.toBe('flat');
      expect(r.ranking.components.length).toBeGreaterThan(0);
    }
    const scores = res.results.map((r: { matchScore: number }) => r.matchScore);
    expect([...scores].sort((a, b2) => b2 - a)).toEqual(scores);
    const top = res.results[0];
    expect((await c.req('POST', '/api/saved', { propertyId: top.propertyId, briefId: b.id })).status).toBe(
      200,
    );
    const saved = await c.req('GET', '/api/saved');
    expect(saved.json.saved.map((s: { propertyId: string }) => s.propertyId)).toContain(top.propertyId);
  });

  it('dismissed properties are excluded from later runs', async () => {
    const c = await newUser(app);
    const b = await createBrief(c, '3 bed house in Testville under £500k');
    const first = await runSearch(c, b.id);
    const victim = first.results[0];
    await c.req('POST', `/api/search-results/${victim.id}/dismiss`);
    const second = await runSearch(c, b.id);
    expect(second.results.map((r: { propertyId: string }) => r.propertyId)).not.toContain(victim.propertyId);
    // and nothing in the second run is "new" except properties not seen before
    expect(second.results.every((r: { isNew: boolean }) => r.isNew === false)).toBe(true);
  });

  it('reports a clear failure when the location cannot be resolved', async () => {
    const c = await newUser(app);
    const interp = await c.req('POST', '/api/briefs/interpret', {
      request: '3 bed house in Atlantis under £500k',
    });
    const r = await c.req('POST', '/api/search-runs', {
      briefId: null,
      criteria: interp.json.criteria,
      name: 'x',
      idempotencyKey: null,
    });
    await worker().drain();
    const run = await c.req('GET', `/api/search-runs/${r.json.run.id}`);
    expect(run.json.run.status).toBe('failed');
    expect(run.json.results).toHaveLength(0);
  });

  it('refuses to search without a location', async () => {
    const c = await newUser(app);
    const interp = await c.req('POST', '/api/briefs/interpret', {
      request: 'renovate and resell for a profit',
    });
    const r = await c.req('POST', '/api/search-runs', {
      briefId: null,
      criteria: interp.json.criteria,
      name: 'x',
      idempotencyKey: null,
    });
    expect(r.status).toBe(422);
  });

  it('idempotency keys prevent duplicate runs', async () => {
    const c = await newUser(app);
    const b = await createBrief(c, '3 bed house in Testville under £500k');
    const body = { briefId: b.id, criteria: null, name: null, idempotencyKey: 'same-key-12345' };
    const r1 = await c.req('POST', '/api/search-runs', body);
    const r2 = await c.req('POST', '/api/search-runs', body);
    expect(r1.json.run.id).toBe(r2.json.run.id);
  });
});

describe('Journey C — strategy-aware analysis', () => {
  it('keeps facts identical while scoring differs by brief; recalculation is deterministic', async () => {
    const c = await newUser(app);
    const reno = await createBrief(
      c,
      '3 bed house in Testville under £500k that needs modernising with extension potential',
    );
    const rental = await createBrief(
      c,
      '3 bed house in Testville under £500k for long-term rental with positive cash flow',
    );
    const res = await runSearch(c, reno.id);
    const pid = res.results[0].propertyId;
    const a1 = (await c.req('POST', '/api/analyses', { propertyId: pid, briefId: reno.id })).json.analysis;
    const a2 = (await c.req('POST', '/api/analyses', { propertyId: pid, briefId: rental.id })).json.analysis;
    expect(a1.facts).toEqual(a2.facts);
    expect(a1.inputs.purchasePrice).toBe(a2.inputs.purchasePrice);
    expect(a1.report.deterministic.financials.acquisition).toEqual(
      a2.report.deterministic.financials.acquisition,
    );
    const keys = (a: { ranking: { components: { key: string }[] } }) =>
      a.ranking.components.map((x) => x.key);
    expect(keys(a1)).toContain('conditionOpportunity');
    expect(keys(a2)).toContain('cashFlow');
    expect(a1.ranking.matchScore).not.toBe(a2.ranking.matchScore);
    expect(a1.narrativeStatus).toBe('not_configured');

    const inputs = { ...a1.inputs, monthlyRent: 2000 };
    const r = await c.req('PUT', `/api/analyses/${a1.id}/inputs`, {
      inputs,
      provenance: { monthlyRent: 'user' },
    });
    expect(r.json.analysis.inputProvenance.monthlyRent).toBe('user');
    expect(r.json.analysis.report.deterministic.financials.rental.annualGrossRent).toBe(24000);
    // snapshot: facts unchanged by recalculation
    expect(r.json.analysis.facts).toEqual(a1.facts);
  });

  it('manual entry creates a private property that only its owner can read', async () => {
    const owner = await newUser(app);
    const other = await newUser(app);
    const p = await owner.req('POST', '/api/properties', {
      facts: { postcode: 'ZZ99 9ZZ', askingPrice: 250000, bedrooms: 3, propertyType: 'terraced' },
    });
    expect(p.status).toBe(200);
    expect((await owner.req('GET', `/api/properties/${p.json.property.id}`)).status).toBe(200);
    expect((await other.req('GET', `/api/properties/${p.json.property.id}`)).status).toBe(404);
    expect(
      (await other.req('POST', '/api/analyses', { propertyId: p.json.property.id, briefId: null })).status,
    ).toBe(404);
  });

  it('pasted listing text is extracted only when quoted in the source', async () => {
    const c = await newUser(app);
    const text =
      'Guide price £325,000. A three bedroom semi-detached house, 3 bedrooms, 1 bathroom, freehold, EPC rating: D. Postcode ZZ99 1AA. In need of modernisation throughout with a large rear garden.';
    const r = await c.req('POST', '/api/properties/from-text', { text });
    expect(r.status).toBe(200);
    const prop = await c.req('GET', `/api/properties/${r.json.property.id}`);
    expect(prop.json.property.facts.askingPrice).toBe(325000);
    expect(prop.json.property.facts.bedrooms).toBe(3);
    expect(prop.json.property.facts.tenure).toBe('freehold');
    expect(prop.json.property.facts.floorAreaSqm).toBeNull();
  });

  it('portal links are explained, not scraped', async () => {
    const c = await newUser(app);
    const r = await c.req('POST', '/api/properties/from-url', {
      url: 'https://www.rightmove.co.uk/properties/123456',
    });
    expect(r.status).toBe(422);
    expect(r.json.error.message).toMatch(/Paste the listing text/);
  });
});

describe('Journey E — data isolation', () => {
  it('one user cannot read, edit or delete another user’s records', async () => {
    const a = await newUser(app, 'alice');
    const b = await newUser(app, 'bob');
    const brief = await createBrief(a, '3 bed house in Testville under £500k');
    const res = await runSearch(a, brief.id);
    const analysis = (
      await a.req('POST', '/api/analyses', { propertyId: res.results[0].propertyId, briefId: brief.id })
    ).json.analysis;
    const asset = (
      await a.req('POST', '/api/portfolio', {
        label: 'Mine',
        address: null,
        postcode: null,
        purchasePrice: 200000,
        purchaseDate: null,
        ownershipPct: 100,
        mortgageBalance: null,
        interestRatePct: null,
        interestOnly: true,
        monthlyMortgagePayment: null,
        monthlyRent: null,
        monthlyOperatingCosts: null,
        currentValuation: null,
        valuationSource: null,
        valuationDate: null,
        notes: null,
      })
    ).json.asset;

    expect((await b.req('GET', `/api/briefs/${brief.id}`)).status).toBe(404);
    expect(
      (
        await b.req('PUT', `/api/briefs/${brief.id}`, {
          name: 'x',
          originalRequest: null,
          criteria: brief.criteria,
          interpreter: 'manual',
        })
      ).status,
    ).toBe(404);
    expect((await b.req('DELETE', `/api/briefs/${brief.id}`)).status).toBe(404);
    expect((await b.req('GET', `/api/search-runs/${res.run.id}`)).status).toBe(404);
    expect((await b.req('GET', `/api/analyses/${analysis.id}`)).status).toBe(404);
    expect((await b.req('DELETE', `/api/analyses/${analysis.id}`)).status).toBe(404);
    expect((await b.req('DELETE', `/api/portfolio/${asset.id}`)).status).toBe(404);
    expect((await b.req('POST', `/api/search-results/${res.results[0].id}/dismiss`)).status).toBe(404);
    expect((await b.req('GET', '/api/analyses')).json.analyses).toHaveLength(0);
    // still intact for the owner
    expect((await a.req('GET', `/api/analyses/${analysis.id}`)).status).toBe(200);
  });

  it('account deletion removes private data', async () => {
    const c = await newUser(app);
    await createBrief(c, '3 bed house in Testville under £500k');
    const bad = await c.req('DELETE', '/api/account', { password: 'wrong password!', confirm: 'DELETE' });
    expect(bad.status).toBe(403);
    const ok = await c.req('DELETE', '/api/account', {
      password: 'correct horse battery',
      confirm: 'DELETE',
    });
    expect(ok.status).toBe(200);
    const { getDb, schema } = await import('../../server/src/db/client');
    const { sql } = await import('drizzle-orm');
    const users = await getDb()
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${c.email}`);
    expect(users).toHaveLength(0);
  });
});

describe('portfolio, comparisons, monitoring and documents', () => {
  it('portfolio summary is computed from records and requires valuation provenance', async () => {
    const c = await newUser(app);
    const base = {
      address: null,
      postcode: null,
      purchaseDate: '2020-01-01',
      ownershipPct: 50,
      interestOnly: true,
      monthlyMortgagePayment: null,
      monthlyOperatingCosts: 100,
      notes: null,
    };
    const noSource = await c.req('POST', '/api/portfolio', {
      ...base,
      label: 'A',
      purchasePrice: 200000,
      mortgageBalance: 150000,
      interestRatePct: 4,
      monthlyRent: 1000,
      currentValuation: 250000,
      valuationSource: null,
      valuationDate: null,
    });
    expect(noSource.status).toBe(422);
    await c.req('POST', '/api/portfolio', {
      ...base,
      label: 'A',
      purchasePrice: 200000,
      mortgageBalance: 150000,
      interestRatePct: 4,
      monthlyRent: 1000,
      currentValuation: 250000,
      valuationSource: 'surveyor',
      valuationDate: '2026-01-01',
    });
    const p = await c.req('GET', '/api/portfolio');
    const s = p.json.summary;
    expect(s.totalValuation).toBe(125000); // 50% share
    expect(s.totalDebt).toBe(75000);
    expect(s.equity).toBe(50000);
    // (1000 − 100 − 150000×4%/12) × 50% = (1000 − 100 − 500) × 0.5
    expect(s.monthlyNetCashFlow).toBe(200);
  });

  it('comparisons evaluate properties under one brief', async () => {
    const c = await newUser(app);
    const b = await createBrief(c, '3 bed house in Testville under £500k for long-term rental');
    const res = await runSearch(c, b.id);
    const ids = res.results.slice(0, 2).map((r: { propertyId: string }) => r.propertyId);
    const cmp = await c.req('POST', '/api/comparisons', { name: 'Test', briefId: b.id, propertyIds: ids });
    const view = await c.req('GET', `/api/comparisons/${cmp.json.comparison.id}`);
    expect(view.json.columns).toHaveLength(2);
    expect(view.json.columns[0].inputs.depositPct).toBe(view.json.columns[1].inputs.depositPct);
  });

  it('monitoring runs on the scheduler, baselines, then notifies on price changes', async () => {
    const c = await newUser(app);
    const b = await createBrief(c, '3 bed house in Testville under £500k');
    expect(
      (await c.req('PUT', `/api/briefs/${b.id}/monitor`, { active: true, frequencyHours: 24 })).status,
    ).toBe(200);
    const { scheduleDueMonitors } = await import('../../server/src/services/monitoring');
    expect(await scheduleDueMonitors()).toBeGreaterThanOrEqual(1);
    await worker().drain();
    let notes = (await c.req('GET', '/api/notifications')).json.notifications;
    expect(notes.some((n: { type: string }) => n.type === 'monitor.baseline')).toBe(true);
    // Not due again until the frequency elapses.
    expect(await scheduleDueMonitors()).toBe(0);

    // Simulate a price change on one seen property, then force the monitor due.
    const { getDb, schema } = await import('../../server/src/db/client');
    const { eq } = await import('drizzle-orm');
    const [m] = await getDb().select().from(schema.monitors).where(eq(schema.monitors.briefId, b.id));
    const [seen] = await getDb()
      .select()
      .from(schema.monitorSeen)
      .where(eq(schema.monitorSeen.monitorId, m!.id))
      .limit(1);
    await getDb()
      .update(schema.monitorSeen)
      .set({ lastPrice: (seen!.lastPrice ?? 0) + 5000 })
      .where(eq(schema.monitorSeen.propertyId, seen!.propertyId));
    await getDb()
      .update(schema.monitors)
      .set({ nextRunAt: new Date(Date.now() - 1000) })
      .where(eq(schema.monitors.id, m!.id));
    await scheduleDueMonitors(new Date(Date.now() + 2 * 3_600_000));
    await worker().drain();
    notes = (await c.req('GET', '/api/notifications')).json.notifications;
    expect(notes.some((n: { type: string }) => n.type === 'monitor.price_change')).toBe(true);
    const [after] = await getDb().select().from(schema.monitors).where(eq(schema.monitors.id, m!.id));
    expect(after!.lastRunAt).not.toBeNull();
  });

  it('rejects uploads that are not PDF or text', async () => {
    const c = await newUser(app);
    const boundary = '----valora';
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x01]),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const r = await app.inject({
      method: 'POST',
      url: '/api/documents',
      headers: {
        cookie: c.cookie,
        'x-valora-client': '1',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(r.statusCode).toBe(422);
  });

  it('processes a text brochure into a private property', async () => {
    const c = await newUser(app);
    const boundary = '----valora2';
    const text =
      'Offers over £210,000. Two bedroom terraced house, 2 bedrooms, leasehold with 92 years remaining. Council tax band B. ZZ99 3AD.';
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="b.txt"\r\nContent-Type: text/plain\r\n\r\n${text}\r\n--${boundary}--\r\n`,
    );
    const up = await app.inject({
      method: 'POST',
      url: '/api/documents',
      headers: {
        cookie: c.cookie,
        'x-valora-client': '1',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(up.statusCode).toBe(200);
    const id = JSON.parse(up.body).document.id;
    await worker().drain();
    const doc = await c.req('GET', `/api/documents/${id}`);
    expect(doc.json.document.status).toBe('extracted');
    const p = await c.req('POST', `/api/documents/${id}/property`);
    const prop = await c.req('GET', `/api/properties/${p.json.property.id}`);
    expect(prop.json.property.facts.askingPrice).toBe(210000);
    expect(prop.json.property.facts.leaseYearsRemaining).toBe(92);
    expect(prop.json.property.isPrivate).toBe(true);
  });

  it('dashboard metrics come from persisted records', async () => {
    const c = await newUser(app);
    const d0 = await c.req('GET', '/api/dashboard');
    expect(d0.json.counts).toEqual({ saved: 0, briefs: 0, analyses: 0, newMatches7d: 0 });
    expect(d0.json.portfolio).toBeNull();
    await createBrief(c, '3 bed house in Testville under £500k');
    expect((await c.req('GET', '/api/dashboard')).json.counts.briefs).toBe(1);
  });

  it('AI-dependent endpoints report not configured instead of failing silently', async () => {
    const c = await newUser(app);
    const r = await c.req('POST', '/api/assistant/messages', { conversationId: null, message: 'hello' });
    expect(r.status).toBe(503);
    const interp = await c.req('POST', '/api/briefs/interpret', {
      request: '3 bed house in Leeds under £300k',
    });
    expect(interp.json.interpreter).toBe('rules');
    expect(interp.json.notice).toMatch(/not configured/);
  });
});
