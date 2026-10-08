/**
 * Outbound HTTP client for data providers.
 *
 * Security: requests may only target hosts on an explicit allowlist (provider APIs). Valora never fetches
 * arbitrary user-supplied URLs, which removes the SSRF surface entirely. Redirects are not followed
 * automatically; a redirect to a non-allowlisted host is rejected.
 *
 * Reliability: per-request timeout, bounded retries with backoff for 429/5xx/network errors, response size cap.
 */
import { AppError } from './errors';

export const ALLOWED_HOSTS = new Set([
  'api.propertydata.co.uk',
  'landregistry.data.gov.uk',
  'api.postcodes.io',
  'epc.opendatacommunities.org',
  'www.planning.data.gov.uk',
  'api.resend.com',
]);

export class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: unknown;
  maxBytes?: number;
  /** For tests: inject a fetch implementation. */
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function assertAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('bad_request', 'Invalid outbound URL');
  }
  if (url.protocol !== 'https:') throw new AppError('forbidden', 'Outbound requests must use HTTPS');
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new AppError('forbidden', `Outbound host not allowed: ${url.hostname}`);
  return url;
}

let fetchOverride: typeof fetch | null = null;
/** Tests only: route all provider HTTP through a stub. */
export function setFetchForTests(f: typeof fetch | null) {
  fetchOverride = f;
}

export async function fetchJson<T = unknown>(rawUrl: string, opts: FetchJsonOptions = {}): Promise<T> {
  const url = assertAllowedUrl(rawUrl);
  const f = opts.fetchImpl ?? fetchOverride ?? fetch;
  const retries = opts.retries ?? 2;
  const maxBytes = opts.maxBytes ?? 5_000_000;
  let lastErr: ProviderHttpError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await f(url, {
        method: opts.method ?? 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'Valora/2.0 (property investment research)', ...opts.headers },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        redirect: 'manual',
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new ProviderHttpError('Redirect without location', res.status, false);
        assertAllowedUrl(new URL(loc, url).toString());
        throw new ProviderHttpError(`Unexpected redirect to ${new URL(loc, url).hostname}`, res.status, false);
      }
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        lastErr = new ProviderHttpError(`HTTP ${res.status}`, res.status, retryable);
        if (retryable && attempt < retries) {
          const retryAfter = Number(res.headers.get('retry-after'));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 400 * 2 ** attempt);
          continue;
        }
        throw lastErr;
      }
      const len = Number(res.headers.get('content-length'));
      if (Number.isFinite(len) && len > maxBytes) throw new ProviderHttpError('Response too large', res.status, false);
      const text = await res.text();
      if (text.length > maxBytes) throw new ProviderHttpError('Response too large', res.status, false);
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ProviderHttpError('Malformed JSON response', res.status, false);
      }
    } catch (err) {
      if (err instanceof ProviderHttpError) {
        if (!err.retryable || attempt >= retries) throw err;
        lastErr = err;
        continue;
      }
      if (err instanceof AppError) throw err;
      const name = (err as Error)?.name;
      lastErr = new ProviderHttpError(name === 'TimeoutError' ? 'Request timed out' : `Network error: ${(err as Error)?.message ?? 'unknown'}`, null, true);
      if (attempt < retries) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new ProviderHttpError('Request failed', null, false);
}

/** Run async tasks with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}
