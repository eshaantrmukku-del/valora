/**
 * Vision condition — classifies rooms from listing photos.
 * Returns structured ratings only. Costs come from refurbCosts.js.
 *
 * Modes:
 * 1) Optional LLM vision via /api/vision (OPENAI_API_KEY / GROQ_API_KEY / GEMINI_API_KEY)
 * 2) Browser heuristic fallback via proxied images (labelled low confidence)
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

/**
 * Client: request vision classification for listing image URLs.
 */
export async function classifyConditionFromImages(imageUrls = []) {
  const urls = [...new Set((imageUrls || []).filter(Boolean))].slice(0, 6);
  if (!urls.length) return emptyVision('No listing images');

  // Prefer server vision (LLM) when available
  try {
    const res = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: urls }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.rooms && Object.keys(data.rooms).length) {
      return {
        rooms: normaliseRooms(data.rooms),
        overall: data.overall || 'Unknown',
        notes: data.notes || [],
        confidence: data.confidence || 'medium',
        source: data.source || 'Vision API',
        imagesUsed: data.imagesUsed || urls.length,
      };
    }
  } catch {
    /* fall through to heuristic */
  }

  // Browser heuristic on proxied images (no API key required)
  try {
    const heuristic = await heuristicFromImages(urls.slice(0, 4));
    if (Object.keys(heuristic.rooms).length) return heuristic;
  } catch {
    /* ignore */
  }

  return emptyVision('Vision unavailable for these images');
}

/**
 * Low-confidence visual heuristic: saturation / brightness / contrast of listing photos.
 * Does NOT invent room identity — only overall finish cues.
 */
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

  const rooms = {};
  const notes = [];

  // Low saturation + mid brightness often = beige / dated interiors
  if (avgSat < 0.18 && avgBright > 0.35 && avgBright < 0.75) {
    rooms.decorating = 'Required';
    rooms.flooring = 'Needs replacing';
    notes.push('Photos look low-saturation / dated finishes (heuristic)');
  } else if (avgSat < 0.25 && avgContrast < 0.22) {
    rooms.decorating = 'Required';
    notes.push('Muted, low-contrast interiors suggest cosmetic updates (heuristic)');
  }

  if (avgBright < 0.28) {
    rooms.walls = 'Average';
    notes.push('Dark photos — possible tired décor or poor lighting (heuristic)');
  }

  if (avgSat > 0.35 && avgBright > 0.45 && avgContrast > 0.28) {
    // Bright agent photography is not proof of good condition — note only
    notes.push('Bright photos — presentation may look fresher than reality (heuristic)');
  }

  let overall = 'Unknown';
  if (rooms.decorating === 'Required' || rooms.flooring === 'Needs replacing') overall = 'Fair';
  // Never promote to Good from colour heuristics alone

  return {
    rooms,
    overall,
    notes,
    confidence: 'low',
    source: 'Visual heuristic from listing photos (no Vision API key configured)',
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
        const luminances = [];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i] / 255;
          const g = data[i + 1] / 255;
          const b = data[i + 2] / 255;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const l = (max + min) / 2;
          const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
          sumB += l;
          sumS += sat;
          luminances.push(l);
        }
        const n = luminances.length;
        const brightness = sumB / n;
        const saturation = sumS / n;
        const mean = brightness;
        const variance = luminances.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
        resolve({ brightness, saturation, contrast: Math.sqrt(variance) });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}
