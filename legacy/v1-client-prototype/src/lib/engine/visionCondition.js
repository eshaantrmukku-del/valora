/**
 * Vision condition — classifies rooms from listing photos.
 * Prefers /api/vision (LLM if keyed, otherwise server photo analyser).
 * If the server cannot download portal CDNs, the browser loads via
 * /api/image-proxy and re-posts JPEG data URLs for analysis.
 */

const ROOM_KEYS = ['kitchen', 'bathroom', 'flooring', 'decorating', 'walls', 'windows', 'roof', 'garden', 'external'];

function emptyVision(reason) {
  return {
    rooms: {},
    overall: 'Unknown',
    notes: [],
    confidence: 'none',
    source: reason,
    imagesUsed: 0,
  };
}

/** Normalise model / heuristic ratings into our vocabulary. */
export function normaliseRooms(raw = {}) {
  const out = {};
  const map = {
    poor: 'Poor',
    bad: 'Poor',
    dated: 'Poor',
    fair: 'Average',
    average: 'Average',
    ok: 'Average',
    moderate: 'Average',
    good: 'Good',
    excellent: 'Good',
    new: 'Good',
    modern: 'Good',
    unknown: 'Unknown',
    'needs replacing': 'Needs replacing',
    'needs-replacing': 'Needs replacing',
    required: 'Required',
    needs_work: 'Poor',
  };

  for (const key of ROOM_KEYS) {
    const v = raw[key] ?? raw[key.charAt(0).toUpperCase() + key.slice(1)];
    if (v == null) continue;
    const s = String(v).trim();
    const mapped = map[s.toLowerCase()] || (
      /poor|bad|dated|worn|tired/i.test(s) ? 'Poor'
        : /fair|average|ok|moderate/i.test(s) ? 'Average'
          : /good|excellent|modern|new/i.test(s) ? 'Good'
            : /replac/i.test(s) ? 'Needs replacing'
              : /required|needed/i.test(s) ? 'Required'
                : 'Unknown'
    );
    if (key === 'flooring' && mapped === 'Poor') out[key] = 'Needs replacing';
    else if (key === 'decorating' && mapped === 'Poor') out[key] = 'Required';
    else out[key] = mapped;
  }
  return out;
}

function normaliseOverall(raw) {
  const s = String(raw || '').trim();
  if (/^poor$/i.test(s)) return 'Poor';
  if (/^fair$|^average$/i.test(s)) return 'Fair';
  if (/^good$|^excellent$/i.test(s)) return 'Good';
  return 'Unknown';
}

function parseVisionPayload(data, fallbackUsed = 0) {
  const rooms = normaliseRooms(data.rooms || {});
  let overall = normaliseOverall(data.overall);
  if (overall === 'Unknown' && Object.keys(rooms).length) {
    const vals = Object.values(rooms);
    const bad = vals.filter((v) => /Poor|Required|Needs replacing/i.test(v)).length;
    const good = vals.filter((v) => v === 'Good').length;
    overall = bad >= 2 ? 'Poor' : good >= 2 && bad === 0 ? 'Good' : 'Fair';
  }
  return {
    rooms,
    overall: overall === 'Unknown' ? 'Fair' : overall,
    notes: data.notes || [],
    confidence: data.confidence || 'medium',
    source: data.source || 'Photo analysis',
    imagesUsed: data.imagesUsed || fallbackUsed,
  };
}

async function postVision(images) {
  const res = await fetch('/api/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images }),
    signal: AbortSignal.timeout(55000),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/**
 * Load listing photos in the browser (via image-proxy) and encode as JPEG data URLs
 * so the server can analyse even when direct CDN fetch is blocked.
 */
async function imagesToDataUrls(urls, max = 5) {
  const out = [];
  for (const url of urls.slice(0, max)) {
    try {
      const dataUrl = await loadAsJpegDataUrl(`/api/image-proxy?url=${encodeURIComponent(url)}`);
      if (dataUrl) out.push(dataUrl);
    } catch {
      /* skip */
    }
  }
  return out;
}

function loadAsJpegDataUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const max = 640;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        canvas.width = Math.max(64, Math.round(img.width * scale));
        canvas.height = Math.max(64, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

/**
 * Client: request vision classification for listing image URLs.
 */
export async function classifyConditionFromImages(imageUrls = []) {
  const urls = [...new Set((imageUrls || []).filter(Boolean))].slice(0, 8);
  if (!urls.length) return emptyVision('No listing images');

  try {
    const { res, data } = await postVision(urls);
    if (res.ok && data?.ok !== false && (data?.rooms || data?.overall)) {
      return parseVisionPayload(data, urls.length);
    }

    // Server could not pull CDN images — re-post as browser-loaded data URLs
    if (data?.error && /download|images/i.test(data.error)) {
      const dataUrls = await imagesToDataUrls(urls);
      if (dataUrls.length) {
        const retry = await postVision(dataUrls);
        if (retry.res.ok && retry.data?.ok !== false && (retry.data?.rooms || retry.data?.overall)) {
          return parseVisionPayload(retry.data, dataUrls.length);
        }
      }
    }
  } catch {
    /* fall through */
  }

  // Last resort: browser colour heuristic (still decisive Poor/Fair/Good)
  try {
    const heuristic = await heuristicFromImages(urls.slice(0, 5));
    if (heuristic.overall !== 'Unknown' || Object.keys(heuristic.rooms).length) return heuristic;
  } catch {
    /* ignore */
  }

  return emptyVision('Vision unavailable for these images');
}

async function heuristicFromImages(urls) {
  const samples = [];
  for (const url of urls) {
    try {
      const stats = await sampleImageStats(`/api/image-proxy?url=${encodeURIComponent(url)}`);
      if (stats) samples.push(stats);
    } catch {
      /* skip */
    }
  }
  if (!samples.length) return emptyVision('Could not load listing images');

  const avgSat = samples.reduce((s, x) => s + x.saturation, 0) / samples.length;
  const avgBright = samples.reduce((s, x) => s + x.brightness, 0) / samples.length;
  const avgContrast = samples.reduce((s, x) => s + x.contrast, 0) / samples.length;
  const avgBeige = samples.reduce((s, x) => s + x.beigeRatio, 0) / samples.length;
  const avgWhite = samples.reduce((s, x) => s + x.whiteRatio, 0) / samples.length;

  const rooms = {};
  const notes = [];
  let score = 0;

  if (avgBeige > 0.22 && avgWhite < 0.18) {
    score -= 2;
    rooms.decorating = 'Required';
    rooms.walls = 'Average';
    notes.push('Cream / beige finishes typical of older décor');
  }

  if (avgWhite < 0.22 && avgSat < 0.18 && avgBright > 0.35 && avgBright < 0.75) {
    score -= 2;
    rooms.decorating = rooms.decorating || 'Required';
    rooms.flooring = 'Needs replacing';
    notes.push('Photos look low-saturation / dated finishes');
  } else if (avgWhite < 0.2 && avgSat < 0.25 && avgContrast < 0.22) {
    score -= 1;
    rooms.decorating = rooms.decorating || 'Required';
    notes.push('Muted interiors suggest cosmetic updates');
  }

  if (avgBright < 0.28) {
    score -= 1;
    rooms.walls = rooms.walls || 'Average';
    notes.push('Dark photos — possible tired décor');
  }

  if (avgWhite > 0.25 && avgBright > 0.55) {
    score += 2;
    rooms.decorating = 'Good';
    rooms.walls = 'Good';
    notes.push('Bright, high-finish presentation');
  } else if (avgSat > 0.32 && avgBright > 0.45 && avgContrast > 0.26 && avgBeige < 0.15) {
    score += 2;
    rooms.decorating = 'Good';
    rooms.walls = 'Good';
    notes.push('Bright, high-contrast presentation');
  } else if (avgSat > 0.22 && avgBright > 0.48) {
    score += 1;
    rooms.decorating = rooms.decorating || 'Average';
    notes.push('Well-lit listing photos');
  }

  if (!Object.keys(rooms).length) {
    rooms.decorating = 'Average';
    rooms.walls = 'Average';
    notes.push('Mixed photo presentation — light updates likely');
  }

  const overall = score <= -2 ? 'Poor' : score >= 2 ? 'Good' : 'Fair';

  return {
    rooms,
    overall,
    notes,
    confidence: 'low',
    source: 'Browser photo heuristic',
    imagesUsed: samples.length,
  };
}

function sampleImageStats(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let sumB = 0;
        let sumS = 0;
        let sumBeige = 0;
        let sumWhite = 0;
        const luminances = [];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] / 255;
          const g = data[i + 1] / 255;
          const b = data[i + 2] / 255;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const l = (max + min) / 2;
          const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1) || 1);
          sumB += l;
          sumS += sat;
          luminances.push(l);
          if (l > 0.42 && l < 0.88 && sat > 0.03 && sat < 0.38 && r >= g * 0.95 && g >= b * 0.9) sumBeige += 1;
          if (l > 0.72 && sat < 0.14) sumWhite += 1;
        }
        const n = luminances.length;
        const brightness = sumB / n;
        const saturation = sumS / n;
        const mean = brightness;
        const variance = luminances.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
        resolve({
          brightness,
          saturation,
          contrast: Math.sqrt(variance),
          beigeRatio: sumBeige / n,
          whiteRatio: sumWhite / n,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}
