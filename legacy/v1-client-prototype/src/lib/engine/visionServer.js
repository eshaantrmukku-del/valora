/**
 * Server-side vision classification for Vite /api/vision.
 *
 * Priority:
 * 1) LLM vision when OPENAI / GROQ / GEMINI key is set (high confidence)
 * 2) Sharp-based photo analyser (always available — no key required)
 *
 * Never invents money — only room condition labels + overall Poor|Fair|Good.
 */

import sharp from 'sharp';

const VISION_PROMPT = `You are assessing UK residential property listing photos for a property investment tool.
Classify visible condition only. Do NOT estimate prices or rents.

Return ONLY valid JSON:
{
  "kitchen": "Poor|Average|Good|Unknown",
  "bathroom": "Poor|Average|Good|Unknown",
  "flooring": "Needs replacing|Average|Good|Unknown",
  "decorating": "Required|Average|Good|Unknown",
  "walls": "Poor|Average|Good|Unknown",
  "windows": "Poor|Average|Good|Unknown",
  "roof": "Poor|Average|Good|Unknown",
  "garden": "Poor|Average|Good|Unknown",
  "external": "Poor|Average|Good|Unknown",
  "overall": "Poor|Fair|Good",
  "notes": ["short visible cue", "..."]
}

Rules:
- overall MUST be Poor, Fair, or Good whenever any interior photo is visible. Do NOT use Unknown for overall.
- Poor = clearly dated / tired / needs full kitchen or bathroom / heavy wear.
- Fair = usable but needs modernising / partial updates / mixed finishes.
- Good = modern, recently refurbished, or well-presented contemporary finishes.
- If a specific room is not visible, that room may be Unknown — but still set overall from what you can see.
- Be decisive. Investors need a clear call, not "unclear".`;

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Expand portal CDN crop URLs so we have a second chance if the first 404s. */
function imageUrlCandidates(url) {
  const out = [url];
  try {
    if (/media\.rightmove\.co\.uk\/dir\/crop\//i.test(url)) {
      out.push(url.replace(/\/dir\/crop\/[^/]+\//i, '/'));
    }
    // Some RM thumbs use _IMG_00_0000 → try higher res sibling patterns already in URL
  } catch {
    /* ignore */
  }
  return [...new Set(out)];
}

async function fetchImageBuffer(url, timeout = 14000) {
  // data: URLs — used by tests and client fallbacks
  if (typeof url === 'string' && url.startsWith('data:')) {
    const m = url.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
    if (!m) throw new Error('bad data URL');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length < 200) throw new Error('image too small');
    return buf;
  }

  let lastErr;
  for (const candidate of imageUrlCandidates(url)) {
    try {
      const res = await fetch(candidate, {
        signal: AbortSignal.timeout(timeout),
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: candidate.includes('zoopla') ? 'https://www.zoopla.co.uk/' : 'https://www.rightmove.co.uk/',
          'Accept-Language': 'en-GB,en;q=0.9',
        },
        redirect: 'follow',
      });
      if (!res.ok) {
        lastErr = new Error(`image HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 200) {
        lastErr = new Error('image too small');
        continue;
      }
      if (buf.length > 6_000_000) throw new Error('image too large');
      return buf;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('image fetch failed');
}

function bufferToDataUrl(buf, contentType = 'image/jpeg') {
  return `data:${contentType};base64,${buf.toString('base64')}`;
}

function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function viaOpenAICompatible({ apiKey, baseUrl, model, dataUrls }) {
  const content = [
    { type: 'text', text: VISION_PROMPT },
    ...dataUrls.map((url) => ({
      type: 'image_url',
      image_url: { url },
    })),
  ];

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 900,
      messages: [{ role: 'user', content }],
    }),
    signal: AbortSignal.timeout(60000),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error?.message || `Vision HTTP ${res.status}`);
  }
  const text = payload.choices?.[0]?.message?.content || '';
  const parsed = extractJson(text);
  if (!parsed) throw new Error('Vision model returned no JSON');
  return parsed;
}

async function viaGemini({ apiKey, dataUrls }) {
  const parts = [
    { text: VISION_PROMPT },
    ...dataUrls.map((dataUrl) => {
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      return {
        inline_data: {
          mime_type: m?.[1] || 'image/jpeg',
          data: m?.[2] || '',
        },
      };
    }),
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 900 },
      }),
      signal: AbortSignal.timeout(60000),
    },
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error?.message || `Gemini HTTP ${res.status}`);
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') || '';
  const parsed = extractJson(text);
  if (!parsed) throw new Error('Gemini returned no JSON');
  return parsed;
}

/**
 * Analyse a single image buffer → finish cues.
 * Detects dated beige UK interiors vs bright modern finishes.
 */
async function analyseBuffer(buf) {
  const { data, info } = await sharp(buf)
    .rotate()
    .resize(96, 96, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const n = info.width * info.height;
  let sumL = 0;
  let sumS = 0;
  let sumWarm = 0;
  let sumCool = 0;
  let sumBeige = 0;
  let sumWhite = 0;
  let sumDark = 0;
  const luminances = [];

  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1) || 1);
    sumL += l;
    sumS += sat;
    luminances.push(l);

    if (r > g && r > b && sat > 0.08 && l > 0.25 && l < 0.8) sumWarm += 1;
    if (b > r && sat > 0.08) sumCool += 1;

    // Cream / beige / magnolia walls — classic dated UK interiors
    if (l > 0.42 && l < 0.88 && sat > 0.03 && sat < 0.38 && r >= g * 0.95 && g >= b * 0.9) sumBeige += 1;
    // Bright white / near-white finishes — modern / refurbished look
    if (l > 0.72 && sat < 0.14) sumWhite += 1;
    if (l < 0.22) sumDark += 1;
  }

  const brightness = sumL / n;
  const saturation = sumS / n;
  const mean = brightness;
  const variance = luminances.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
  const contrast = Math.sqrt(variance);

  return {
    brightness,
    saturation,
    contrast,
    warmRatio: sumWarm / n,
    coolRatio: sumCool / n,
    beigeRatio: sumBeige / n,
    whiteRatio: sumWhite / n,
    darkRatio: sumDark / n,
  };
}

/**
 * Deterministic photo → condition (no API key).
 * Uses multi-image vote so a single bright exterior doesn't dominate.
 */
export async function classifyFromImageBuffers(buffers = []) {
  const samples = [];
  for (const buf of buffers) {
    try {
      samples.push(await analyseBuffer(buf));
    } catch {
      /* skip corrupt */
    }
  }
  if (!samples.length) {
    return {
      ok: false,
      error: 'Could not analyse listing photos',
      rooms: {},
      overall: 'Unknown',
      notes: [],
      confidence: 'none',
      imagesUsed: 0,
    };
  }

  const avg = (key) => samples.reduce((s, x) => s + x[key], 0) / samples.length;
  const brightness = avg('brightness');
  const saturation = avg('saturation');
  const contrast = avg('contrast');
  const beige = avg('beigeRatio');
  const white = avg('whiteRatio');
  const warm = avg('warmRatio');
  const dark = avg('darkRatio');

  const rooms = {};
  const notes = [];
  let score = 0; // negative = worse condition

  // Dated beige / magnolia interiors
  if (beige > 0.22 && white < 0.18) {
    score -= 2;
    rooms.decorating = 'Required';
    rooms.walls = 'Average';
    notes.push('Cream / beige finishes typical of older décor');
  }

  // Low saturation interiors → tired look (skip when bright whites dominate)
  if (white < 0.22 && saturation < 0.16 && brightness > 0.32 && brightness < 0.78) {
    score -= 2;
    rooms.decorating = rooms.decorating || 'Required';
    rooms.flooring = 'Needs replacing';
    notes.push('Muted interiors suggest cosmetic modernisation');
  } else if (white < 0.2 && saturation < 0.22 && contrast < 0.18) {
    score -= 1;
    rooms.decorating = rooms.decorating || 'Required';
    notes.push('Low-contrast rooms — likely dated finishes');
  }

  // Dark, muddy photos
  if (dark > 0.28 || brightness < 0.28) {
    score -= 1;
    rooms.walls = rooms.walls || 'Average';
    notes.push('Dark interiors — tired décor or poor presentation');
  }

  // Warm-heavy + beige without whites → kitchen/bath often dated
  if (warm > 0.18 && beige > 0.18 && white < 0.15) {
    score -= 1;
    rooms.kitchen = 'Average';
    rooms.bathroom = 'Average';
    notes.push('Warm dated palette — kitchen/bath likely need updating');
  }

  // Bright white modern look — overrides dated cues when whites dominate
  if (white > 0.25 && brightness > 0.55) {
    score += 2;
    rooms.decorating = 'Good';
    rooms.walls = 'Good';
    rooms.flooring = rooms.flooring === 'Needs replacing' ? 'Average' : (rooms.flooring || 'Good');
    notes.push('Bright, high-finish presentation in photos');
  } else if (white > 0.16 && brightness > 0.5 && (contrast > 0.12 || white > 0.3)) {
    score += 1;
    rooms.decorating = rooms.decorating === 'Required' ? 'Average' : (rooms.decorating || 'Good');
    notes.push('Clean, well-lit finishes in listing photos');
  }

  // Very colourful / staged modern
  if (saturation > 0.32 && brightness > 0.45 && contrast > 0.24 && beige < 0.15) {
    score += 1;
    rooms.kitchen = rooms.kitchen || 'Good';
    notes.push('High-contrast modern styling in photos');
  }

  // Default room fill so we never leave empty when photos exist
  if (!Object.keys(rooms).length) {
    if (score <= -1) {
      rooms.decorating = 'Required';
      rooms.flooring = 'Needs replacing';
    } else if (score >= 1) {
      rooms.decorating = 'Good';
      rooms.walls = 'Good';
    } else {
      rooms.decorating = 'Average';
      rooms.walls = 'Average';
      rooms.flooring = 'Average';
      notes.push('Mixed presentation — assume light modernisation until viewing');
    }
  }

  let overall = 'Fair';
  if (score <= -3) overall = 'Poor';
  else if (score <= -1) overall = 'Fair';
  else if (score >= 2) overall = 'Good';
  else overall = 'Fair';

  // Never return Unknown overall when photos analysed
  if (!notes.length) {
    notes.push(overall === 'Good'
      ? 'Photo analysis leans modern / well presented'
      : overall === 'Poor'
        ? 'Photo analysis leans tired / needs work'
        : 'Photo analysis leans mid — likely needs updating');
  }

  return {
    ok: true,
    rooms,
    overall,
    notes: notes.slice(0, 5),
    confidence: samples.length >= 3 ? 'medium' : 'low',
    source: 'Photo analyser (listing images)',
    imagesUsed: samples.length,
  };
}

function finaliseLlmResult(parsed, imagesUsed, source) {
  const rooms = { ...parsed };
  delete rooms.overall;
  delete rooms.notes;

  let overall = parsed.overall || 'Fair';
  if (!/^(Poor|Fair|Good)$/i.test(String(overall))) {
    // Derive from rooms if model returned Unknown
    const vals = Object.values(rooms).map((v) => String(v));
    const bad = vals.filter((v) => /poor|required|needs replacing/i.test(v)).length;
    const good = vals.filter((v) => /^good$/i.test(v)).length;
    if (bad >= 2) overall = 'Poor';
    else if (good >= 2 && bad === 0) overall = 'Good';
    else overall = 'Fair';
  }
  overall = overall.charAt(0).toUpperCase() + overall.slice(1).toLowerCase();
  if (overall === 'Average') overall = 'Fair';

  return {
    ok: true,
    rooms,
    overall,
    notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, 5) : [],
    confidence: 'high',
    source,
    imagesUsed,
  };
}

/**
 * @param {string[]} imageUrls
 */
export async function classifyImagesServer(imageUrls = []) {
  const urls = [...new Set(imageUrls.filter(Boolean))].slice(0, 8);
  if (!urls.length) {
    return { ok: false, error: 'No images', rooms: {}, overall: 'Unknown', imagesUsed: 0 };
  }

  const buffers = [];
  for (const url of urls) {
    try {
      buffers.push(await fetchImageBuffer(url));
    } catch {
      /* skip */
    }
  }
  if (!buffers.length) {
    return { ok: false, error: 'Could not download listing images', rooms: {}, overall: 'Unknown', imagesUsed: 0 };
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  // Prefer LLM when keyed
  if (openaiKey || groqKey || geminiKey) {
    try {
      const dataUrls = buffers.slice(0, 5).map((b) => bufferToDataUrl(b));
      let parsed;
      let source;
      if (groqKey) {
        parsed = await viaOpenAICompatible({
          apiKey: groqKey,
          baseUrl: 'https://api.groq.com/openai/v1',
          model: process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
          dataUrls,
        });
        source = 'Groq vision';
      } else if (openaiKey) {
        parsed = await viaOpenAICompatible({
          apiKey: openaiKey,
          baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
          model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
          dataUrls,
        });
        source = 'OpenAI vision';
      } else {
        parsed = await viaGemini({ apiKey: geminiKey, dataUrls });
        source = 'Gemini vision';
      }
      return finaliseLlmResult(parsed, dataUrls.length, source);
    } catch (err) {
      // Fall through to photo analyser — never leave the user with Unknown
      console.warn('[valora-vision] LLM failed, using photo analyser:', err.message);
    }
  }

  return classifyFromImageBuffers(buffers);
}
