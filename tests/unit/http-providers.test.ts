import { afterEach, describe, expect, it } from 'vitest';
import { assertAllowedUrl, fetchJson, mapLimit, ProviderHttpError } from '../../server/src/lib/http';
import { mapPropertyType, mapSourcedProperty } from '../../server/src/providers/propertyData';
import { matchEpc } from '../../server/src/providers/epc';
import { normalisePostcode } from '../../server/src/providers/postcodes';
import { propertyFingerprint, mergeFacts } from '../../server/src/services/properties';
import { validateListing } from '../../server/src/services/discover';
import { checkGrounding } from '../../server/src/ai/narrative';
import { extractWithRules, verifyAgainstSource } from '../../server/src/ai/documentExtraction';
import { sniffType } from '../../server/src/services/documents';
import { emptyFacts } from '../../shared/property';

const res = (status: number, body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers });

describe('outbound HTTP client', () => {
  afterEach(() => undefined);

  it('only allows allowlisted HTTPS hosts (no SSRF surface)', () => {
    expect(() => assertAllowedUrl('https://evil.example.com/x')).toThrow(/not allowed/);
    expect(() => assertAllowedUrl('http://api.postcodes.io/x')).toThrow(/HTTPS/);
    expect(() => assertAllowedUrl('https://169.254.169.254/latest')).toThrow();
    expect(assertAllowedUrl('https://api.postcodes.io/postcodes/M1').hostname).toBe('api.postcodes.io');
  });

  it('retries 429/5xx then succeeds', async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return calls < 3 ? res(calls === 1 ? 429 : 503, '', { 'retry-after': '0' }) : res(200, '{"ok":1}');
    }) as unknown as typeof fetch;
    expect(await fetchJson('https://api.postcodes.io/x', { fetchImpl: f, retries: 2 })).toEqual({ ok: 1 });
    expect(calls).toBe(3);
  });

  it('does not retry 4xx and surfaces malformed JSON', async () => {
    let calls = 0;
    const f404 = (async () => {
      calls++;
      return res(404, 'nope');
    }) as unknown as typeof fetch;
    await expect(fetchJson('https://api.postcodes.io/x', { fetchImpl: f404 })).rejects.toBeInstanceOf(
      ProviderHttpError,
    );
    expect(calls).toBe(1);
    const bad = (async () => res(200, '<html>')) as unknown as typeof fetch;
    await expect(fetchJson('https://api.postcodes.io/x', { fetchImpl: bad })).rejects.toThrow(
      /Malformed JSON/,
    );
  });

  it('rejects redirects to other hosts and oversized responses', async () => {
    const redir = (async () =>
      res(302, '', { location: 'https://evil.example.com/' })) as unknown as typeof fetch;
    await expect(fetchJson('https://api.postcodes.io/x', { fetchImpl: redir })).rejects.toThrow();
    const big = (async () => res(200, 'x'.repeat(2000))) as unknown as typeof fetch;
    await expect(fetchJson('https://api.postcodes.io/x', { fetchImpl: big, maxBytes: 100 })).rejects.toThrow(
      /too large/,
    );
  });

  it('maps network failures to retryable errors', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(fetchJson('https://api.postcodes.io/x', { fetchImpl: down, retries: 0 })).rejects.toThrow(
      /Network error/,
    );
  });

  it('mapLimit preserves order with bounded concurrency', async () => {
    let active = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (x) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return x * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('PropertyData mapping', () => {
  it('maps a documented sourced-property record with provenance', () => {
    const l = mapSourcedProperty(
      {
        id: 1234,
        address: '12 Example Road, Manchester',
        postcode: 'm20 2ab',
        type: 'semi-detached_house',
        bedrooms: 3,
        price: '£285,000',
        sqf: 1000,
        days_on_market: 12,
        sstc: 0,
        lat: 53.4,
        lng: -2.2,
        url: 'https://www.example-portal.co.uk/p/1',
      },
      'unmodernised-properties',
      '2026-10-08T00:00:00Z',
    )!;
    expect(l.providerListingId).toBe('1234');
    expect(l.facts.askingPrice).toBe(285000);
    expect(l.facts.postcode).toBe('M20 2AB');
    expect(l.facts.outcode).toBe('M20');
    expect(l.facts.propertyType).toBe('semi_detached');
    expect(l.facts.floorAreaSqm).toBe(92.9);
    expect(l.facts.providerTags).toEqual(['unmodernised-properties']);
    expect(l.factOrigins.askingPrice?.source).toBe('listing');
    expect(l.factOrigins.providerTags?.source).toBe('provider_classification');
  });

  it('drops records without ids and never invents missing fields', () => {
    expect(mapSourcedProperty({ price: 100000 }, 'x', 'now')).toBeNull();
    const l = mapSourcedProperty({ id: 'a1', url: 'http://insecure.example/' }, 'x', 'now')!;
    expect(l.facts.askingPrice).toBeNull();
    expect(l.facts.bedrooms).toBeNull();
    expect(l.url).toBeNull();
  });

  it('maps property types', () => {
    expect(mapPropertyType('end_of_terrace_house')).toBe('end_of_terrace');
    expect(mapPropertyType('Flat')).toBe('flat');
    expect(mapPropertyType('detached_bungalow')).toBe('bungalow');
    expect(mapPropertyType(null)).toBeNull();
  });
});

describe('records, dedupe and validation', () => {
  it('fingerprints require a full postcode and a numbered address line', () => {
    expect(propertyFingerprint({ postcode: 'M20 2AB', address: '12 Example Road, Manchester' })).toBe(
      'M202AB|12examplerd',
    );
    expect(propertyFingerprint({ postcode: 'M20 2AB', address: '12 Example Rd' })).toBe('M202AB|12examplerd');
    expect(propertyFingerprint({ postcode: 'M20', address: '12 Example Road' })).toBeNull();
    expect(propertyFingerprint({ postcode: 'M20 2AB', address: 'Rose Cottage' })).toBeNull();
  });
  it('merges facts without erasing known values', () => {
    const m = mergeFacts(
      { ...emptyFacts(), bedrooms: 3, images: ['a'] },
      { bedrooms: null, askingPrice: 1, images: ['b'] },
    );
    expect(m.bedrooms).toBe(3);
    expect(m.askingPrice).toBe(1);
    expect(m.images).toEqual(['a', 'b']);
  });
  it('rejects implausible listings', () => {
    const base = { provider: 'p', providerListingId: '1', url: null, factOrigins: {}, raw: {} };
    expect(validateListing({ ...base, facts: { askingPrice: 5 } })).toMatch(/price/);
    expect(validateListing({ ...base, url: 'http://x', facts: {} })).toMatch(/https/);
    expect(validateListing({ ...base, facts: { bedrooms: 3, askingPrice: 250000 } })).toBeNull();
  });
  it('normalises postcodes', () => {
    expect(normalisePostcode('m202ab')).toBe('M20 2AB');
    expect(normalisePostcode('nonsense')).toBeNull();
  });
  it('matches EPC certificates by house number and street', () => {
    const recs = [
      {
        address: '12 Example Road',
        postcode: 'M20 2AB',
        rating: 'D',
        floorAreaSqm: 90,
        lodgementDate: '2019-01-01',
        certificateKey: 'a',
      },
      {
        address: '12 Example Road',
        postcode: 'M20 2AB',
        rating: 'C',
        floorAreaSqm: 91,
        lodgementDate: '2023-01-01',
        certificateKey: 'b',
      },
      {
        address: '14 Example Road',
        postcode: 'M20 2AB',
        rating: 'E',
        floorAreaSqm: 80,
        lodgementDate: '2024-01-01',
        certificateKey: 'c',
      },
    ];
    expect(matchEpc(recs, '12 Example Road, Manchester')?.certificateKey).toBe('b');
    expect(matchEpc(recs, '99 Other Street')).toBeNull();
  });
});

describe('AI grounding and extraction safety', () => {
  it('flags numbers in narratives that are not in the source data', () => {
    const n = {
      executiveSummary: 'Asking £285,000 with a 5.3% gross yield, and resale of £400,000 is likely.',
      investmentThesis: '',
      attractions: [],
      disadvantages: [],
      financingCommentary: '',
      rentalCommentary: null,
      renovationCommentary: null,
      resaleCommentary: null,
      comparableCommentary: '',
      risks: [],
      scenarioCommentary: '',
      dueDiligence: [],
      unknowns: [],
      overall: { verdict: 'insufficient_data' as const, rationale: '' },
    };
    const w = checkGrounding(n, [285000, 5.26]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/£400,000/);
  });

  it('extracts facts only when the quote appears in the source', () => {
    const text =
      'Guide price £325,000. Three bedroom semi-detached house. 3 bedrooms. Freehold. EPC rating D. ZZ99 1AA.';
    const e = extractWithRules(text);
    const { facts } = verifyAgainstSource(e, text);
    expect(facts.askingPrice).toBe(325000);
    expect(facts.bedrooms).toBe(3);
    expect(facts.epcRating).toBe('D');
    const forged = { ...e, bathrooms: { value: 4, quote: '4 bathrooms' } };
    const r = verifyAgainstSource(forged, text);
    expect(r.facts.bathrooms).toBeUndefined();
    expect(r.rejected).toContain('bathrooms');
  });

  it('ignores rents when extracting a sale price', () => {
    const e = extractWithRules('Currently let at £1,200 pcm. Offers over £210,000.');
    expect(e.askingPrice.value).toBe(210000);
  });

  it('sniffs file types by content', () => {
    expect(sniffType(Buffer.from('%PDF-1.7 ...'))).toBe('application/pdf');
    expect(sniffType(Buffer.from('plain text listing'))).toBe('text/plain');
    expect(sniffType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]))).toBeNull();
  });
});
