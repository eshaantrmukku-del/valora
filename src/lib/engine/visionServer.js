/**
 * Server-side vision classification for Vite /api/vision.
 * Uses OPENAI_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY when present.
 * Never invents prices — only room condition labels.
 */

const VISION_PROMPT = `You are assessing UK residential property listing photos for a property investment tool.
Identify visible condition only. Do NOT estimate prices or rents.

Return ONLY valid JSON with this shape:
{
  "kitchen": "Poor|Average|Good|Unknown",
  "bathroom": "Poor|Average|Good|Unknown",
  "flooring": "Needs replacing|Average|Good|Unknown",
  "decorating": "Required|Good|Unknown",
  "walls": "Poor|Average|Good|Unknown",
  "windows": "Poor|Average|Good|Unknown",
  "roof": "Poor|Average|Good|Unknown",
  "garden": "Poor|Average|Good|Unknown",
  "external": "Poor|Average|Good|Unknown",
  "overall": "Poor|Fair|Good|Unknown",
  "notes": ["short visible cue", "..."]
}

Rules:
- If a room/area is not clearly visible, use Unknown.
- Estimate refurbishment category only — never money.
- Be conservative: when unsure between Good and Average, pick Average.`;

async function fetchImageAsDataUrl(url, timeout = 12000) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ValoraVision/1.0)',
      Accept: 'image/*,*/*',
    },
  });
  if (!res.ok) throw new Error(`image HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || 'image/jpeg';
  if (buf.length > 4_500_000) throw new Error('image too large');
  return `data:${ct.split(';')[0]};base64,${buf.toString('base64')}`;
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
      max_tokens: 800,
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
        generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
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
 * @param {string[]} imageUrls
 */
export async function classifyImagesServer(imageUrls = []) {
  const urls = [...new Set(imageUrls.filter(Boolean))].slice(0, 5);
  if (!urls.length) {
    return { ok: false, error: 'No images', rooms: {}, imagesUsed: 0 };
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!openaiKey && !groqKey && !geminiKey) {
    return {
      ok: false,
      error: 'No vision API key configured (set OPENAI_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY)',
      rooms: {},
      imagesUsed: 0,
      needsKey: true,
    };
  }

  const dataUrls = [];
  for (const url of urls) {
    try {
      dataUrls.push(await fetchImageAsDataUrl(url));
    } catch {
      /* skip broken image */
    }
  }
  if (!dataUrls.length) {
    return { ok: false, error: 'Could not download listing images', rooms: {}, imagesUsed: 0 };
  }

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

  return {
    ok: true,
    rooms: parsed,
    overall: parsed.overall || 'Unknown',
    notes: Array.isArray(parsed.notes) ? parsed.notes.slice(0, 5) : [],
    confidence: 'high',
    source,
    imagesUsed: dataUrls.length,
  };
}
