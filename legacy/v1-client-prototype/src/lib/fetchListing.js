import {
  isUsableListingMeta,
  parseJinaPayload,
  parseListingHtml,
  parseMicrolinkPayload,
} from './listingParser';

function mergeMeta(...parts) {
  const out = {};
  for (const p of parts) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p)) {
      if (v == null || v === '') continue;
      if (out[k] == null || out[k] === '') out[k] = v;
    }
  }
  out.fetched = isUsableListingMeta(out) || Boolean(out.title || out.price || out.monthlyRent);
  return out;
}

async function fetchJson(url, timeout = 14000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchText(url, timeout = 16000, headers = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function viaLocalApi(listingUrl) {
  const res = await fetch(`/api/listing?url=${encodeURIComponent(listingUrl)}`, {
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Listing API ${res.status}`);
  }
  if (data.error) throw new Error(data.error);
  return data;
}

async function viaMicrolink(listingUrl) {
  const api = `https://api.microlink.io/?${new URLSearchParams({ url: listingUrl })}`;
  const payload = await fetchJson(api, 16000);
  if (payload.status !== 'success') {
    throw new Error(payload.message || 'Microlink failed');
  }
  return parseMicrolinkPayload(payload, listingUrl);
}

async function viaJina(listingUrl) {
  const api = `https://r.jina.ai/${listingUrl}`;
  // Prefer JSON when available
  try {
    const res = await fetch(api, {
      signal: AbortSignal.timeout(22000),
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('json')) {
        return parseJinaPayload(await res.json(), listingUrl);
      }
      return parseJinaPayload(await res.text(), listingUrl);
    }
  } catch {
    /* fall through to markdown */
  }
  const text = await fetchText(api, 22000, { Accept: 'text/markdown' });
  return parseJinaPayload(text, listingUrl);
}

/**
 * Fetch live listing metadata for a portal URL.
 * Never invents data — returns { ok, meta, error, source }.
 */
export async function fetchListingMetadata(url) {
  const errors = [];
  let best = null;

  const trySource = async (name, fn) => {
    try {
      const meta = await fn();
      if (!meta) {
        errors.push(`${name}: empty`);
        return;
      }
      best = best ? mergeMeta(best, meta) : meta;
      best.source = best.source || name;
      if (isUsableListingMeta(best) && (best.price || best.monthlyRent)) {
        return true;
      }
    } catch (err) {
      errors.push(`${name}: ${err.message || err}`);
    }
    return false;
  };

  // 1) Local Vite/plugin API (direct fetch + server-side fallbacks)
  if (await trySource('api', () => viaLocalApi(url))) {
    return { ok: true, meta: best, error: null, source: best.source || 'api' };
  }

  // 2) Microlink OG metadata (works in browser; portals block direct bots)
  if (await trySource('microlink', () => viaMicrolink(url))) {
    return { ok: true, meta: best, error: null, source: 'microlink' };
  }

  // 3) Jina reader for fuller page text
  if (await trySource('jina', () => viaJina(url))) {
    return { ok: true, meta: best, error: null, source: 'jina' };
  }

  if (isUsableListingMeta(best)) {
    return { ok: true, meta: best, error: null, source: best.source || 'partial' };
  }

  return {
    ok: false,
    meta: best,
    error: errors.length
      ? `Could not read this listing. ${errors[0]}`
      : 'Could not read listing data from this URL',
    source: null,
  };
}

/** Used by the Vite middleware — same parsers, Node-side. */
export async function fetchListingMetadataServer(listingUrl) {
  const errors = [];
  let htmlMeta = null;

  try {
    const response = await fetch(listingUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });
    if (response.ok) {
      const html = await response.text();
      htmlMeta = parseListingHtml(html, listingUrl);
      if (isUsableListingMeta(htmlMeta) && (htmlMeta.price || htmlMeta.monthlyRent)) {
        return { ...htmlMeta, source: 'direct' };
      }
    } else {
      errors.push(`direct HTTP ${response.status}`);
    }
  } catch (err) {
    errors.push(`direct: ${err.message}`);
  }

  try {
    const api = `https://api.microlink.io/?${new URLSearchParams({ url: listingUrl })}`;
    const payload = await (await fetch(api)).json();
    const meta = parseMicrolinkPayload(payload, listingUrl);
    const merged = mergeMeta(htmlMeta, meta);
    if (isUsableListingMeta(merged)) {
      return { ...merged, source: 'microlink' };
    }
  } catch (err) {
    errors.push(`microlink: ${err.message}`);
  }

  try {
    const res = await fetch(`https://r.jina.ai/${listingUrl}`, {
      headers: { Accept: 'application/json' },
    });
    const body = await res.text();
    let parsed;
    try {
      parsed = parseJinaPayload(JSON.parse(body), listingUrl);
    } catch {
      parsed = parseJinaPayload(body, listingUrl);
    }
    const merged = mergeMeta(htmlMeta, parsed);
    if (isUsableListingMeta(merged)) {
      return { ...merged, source: 'jina' };
    }
  } catch (err) {
    errors.push(`jina: ${err.message}`);
  }

  if (isUsableListingMeta(htmlMeta)) {
    return { ...htmlMeta, source: 'direct-partial' };
  }

  const err = new Error(
    errors[0] || 'Portals blocked the request and no listing metadata was available',
  );
  err.details = errors;
  throw err;
}
