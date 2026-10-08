/**
 * Condition classification from listing text + EPC + optional vision rooms.
 * AI/vision only classify — costs always come from refurbCosts rule table.
 *
 * Priority (highest wins):
 * 1. Strong COMPLETED renovation / turn-key language → Good
 * 2. Hard distress signals (damp, structural, cash-only) → Poor
 * 3. Clear project / needs-work language → Poor / Fair
 * 4. Soft marketing fluff alone → ignored (Unknown)
 *
 * Soft negatives must NEVER override strong completed-renovation language.
 */
import { costsFromRooms, overallFromRooms, worseLevel } from './refurbCosts.js';

/** Clear evidence the home has ALREADY been done up. */
const COMPLETED_RENOVATION = [
  /\bnewly (?:refurbished|renovated|decorated|modernised|modernized)\b/i,
  /\brecently (?:refurbished|renovated|modernised|modernized|updated|redecorated|refurbished throughout)\b/i,
  /\bfully (?:refurbished|renovated|modernised|modernized)\b/i,
  /\b(?:refurbished|renovated|modernised|modernized) throughout\b/i,
  /\b(?:has been|been) (?:fully |newly |recently )?(?:refurbished|renovated|modernised|modernized)\b/i,
  /\bcomplete(?:d)? (?:refurbishment|renovation|modernisation|modernization)\b/i,
  /\bafter (?:a )?(?:full |complete )?(?:refurbishment|renovation)\b/i,
  /\bimmaculate\b|\bpristine\b|\bturn[\s-]?key\b|\bmove[\s-]?in ready\b|\bready to move (?:in|into)\b/i,
  /\bshow[\s-]?home condition\b|\bbrand new\b|\bas new\b|\bnever lived in\b/i,
  /\bfinished to a high standard\b|\bhigh[\s-]?spec(?:ification)?\b/i,
  /\bno (?:further )?(?:work|works) (?:needed|required)\b/i,
];

const POSITIVE_FINISH = [
  /\bnew kitchen\b(?!\s+(?:required|needed))/i,
  /\bnew bathroom\b(?!\s+(?:required|needed))/i,
  /\bnew boiler\b(?!\s+(?:required|needed))/i,
  /\bnew (?:roof|windows|flooring)\b(?!\s+(?:required|needed))/i,
  /\bbeautifully presented\b|\bstunning condition\b|\bexcellent condition\b|\bgood condition\b/i,
];

/** Hard distress — can still apply even if marketing says "refurbished". */
const HARD_NEGATIVES = [
  { re: /\bdamp\b|\bwet rot\b|\bdry rot\b|\bsubsidence\b|structural (?:issues|problems|movement)/i, item: 'external', level: 'Poor' },
  { re: /\buninhabitable\b|\bfire damage\b|\bflood damage\b|\bboarded(?: up)?\b/i, item: 'external', level: 'Poor' },
  { re: /\bcash (?:buyers?|purchase) only\b|\bunmortgageable\b|\bnot mortgageable\b/i, item: 'external', level: 'Poor' },
  { re: /\bno central heating\b|\blacks central heating\b|\bsolid fuel only\b/i, item: 'general', level: 'Poor' },
];

/** Clear project / needs-work language. */
const PROJECT_NEGATIVES = [
  { re: /\b(?:in need of|needs|requires|requiring)\s+(?:complete|full|total|extensive|major|significant)\s+(?:refurbishment|renovation|modernisation|modernization|updating)\b/i, item: 'general', level: 'Poor' },
  { re: /\b(?:in need of|needs|requires|requiring)\s+(?:some\s+)?(?:refurbishment|renovation|modernisation|modernization|updating)\b/i, item: 'general', level: 'Fair' },
  { re: /\bdoer[\s-]?upper\b|\bproject property\b|\bblank canvas\b/i, item: 'general', level: 'Poor' },
  { re: /\brenovation opportunity\b|\brefurbishment opportunity\b|\brenovation project\b|\brefurbishment project\b/i, item: 'general', level: 'Poor' },
  { re: /\b(?:kitchen) (?:needs|requires|in need of)\b|\bkitchen to be replaced\b|\bneeds a new kitchen\b/i, item: 'kitchen', level: 'Poor' },
  { re: /\b(?:bathroom) (?:needs|requires|in need of)\b|\bbathroom to be replaced\b|\bneeds a new bathroom\b/i, item: 'bathroom', level: 'Poor' },
  { re: /\bnew kitchen (?:required|needed)\b|\bnew bathroom (?:required|needed)\b/i, item: 'general', level: 'Poor' },
  { re: /\bdated kitchen\b|\bkitchen is dated\b|\boriginal kitchen\b/i, item: 'kitchen', level: 'Fair' },
  { re: /\bdated bathroom\b|\bbathroom is dated\b|\boriginal bathroom\b/i, item: 'bathroom', level: 'Fair' },
  { re: /\b(?:in need of|needs|requires)\s+modernisation\b|\bdated throughout\b|\btired throughout\b/i, item: 'general', level: 'Fair' },
  { re: /\bovergrown\b|\bneglected\b/i, item: 'external', level: 'Fair' },
];

/**
 * Soft marketing phrases — ONLY used when there is NO completed-renovation language.
 * Deliberately excludes: "great potential", "fresh decoration", "replacement kitchen"
 * (those appear on good homes constantly).
 */
const SOFT_NEGATIVES = [
  { re: /\bpotential to (?:improve|modernise|modernize)\b|\bscope to improve\b|\bscope for improvement\b/i, item: 'general', level: 'Fair' },
  { re: /\b\bdated\b|\btired\b/i, item: 'general', level: 'Fair' },
  { re: /\bneeds decorating\b|\bredecoration required\b|\bcosmetic updates? (?:needed|required)\b/i, item: 'decorating', level: 'Fair' },
  { re: /\bcarpet(?:s)? (?:needed|required|worn)\b|\bflooring (?:needed|required|worn)\b/i, item: 'flooring', level: 'Fair' },
];

/** Soft EPC — never overrides completed renovation; F/G only nudge when no positive finish. */
const EPC_SOFT = {
  E: { item: 'external', level: 'Fair', note: 'EPC E' },
  F: { item: 'external', level: 'Fair', note: 'EPC F' },
  G: { item: 'external', level: 'Fair', note: 'EPC G' },
};

/** @deprecated */
const LEGACY_LEVEL = { poor: 'Poor', fair: 'Fair', good: 'Good' };

function collectMatches(patterns, text) {
  const hits = [];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) hits.push(m[0]);
  }
  return hits;
}

function applyList(rooms, signals, list, text) {
  for (const { re, item, level } of list) {
    const m = text.match(re);
    if (m) {
      signals.push(m[0]);
      rooms[item] = rooms[item] ? worseLevel(rooms[item], level) : level;
    }
  }
}

export function classifyCondition({ title = '', description = '', epc = null }) {
  const text = `${title} ${description}`;
  if (!text.trim() && !epc) {
    return emptyResult('No listing text');
  }

  const signals = [];
  const rooms = {};

  const completedHits = collectMatches(COMPLETED_RENOVATION, text);
  const finishHits = collectMatches(POSITIVE_FINISH, text);
  completedHits.forEach((h) => signals.push(h));
  finishHits.forEach((h) => signals.push(h));

  const isCompleted = completedHits.length > 0;
  const strongCompleted = completedHits.length >= 1 && (
    /newly|recently|fully|throughout|immaculate|pristine|turn[\s-]?key|move[\s-]?in/i.test(completedHits.join(' '))
    || completedHits.length >= 2
  );

  // 1) Hard distress always recorded
  applyList(rooms, signals, HARD_NEGATIVES, text);

  // 2) Project language — skipped when listing clearly says work is DONE
  if (!isCompleted) {
    applyList(rooms, signals, PROJECT_NEGATIVES, text);
    applyList(rooms, signals, SOFT_NEGATIVES, text);
  } else {
    // Only allow hard room-specific "needs new kitchen" style if present alongside "refurbished"
    // (rare contradiction — keep as caution, but don't set general Poor)
    for (const { re, item, level } of PROJECT_NEGATIVES) {
      if (item === 'general') continue;
      const m = text.match(re);
      if (m) {
        signals.push(m[0]);
        rooms[item] = level === 'Poor' ? 'Fair' : level; // soften contradiction
      }
    }
  }

  // 3) EPC soft nudge — never if completed renovation
  const letter = epc ? String(epc).trim().toUpperCase().charAt(0) : null;
  if (letter && EPC_SOFT[letter] && !isCompleted) {
    const soft = EPC_SOFT[letter];
    signals.push(soft.note);
    rooms[soft.item] = rooms[soft.item]
      ? worseLevel(rooms[soft.item], soft.level)
      : soft.level;
  } else if (letter && /[AB]/.test(letter)) {
    signals.push(`EPC ${letter}`);
  }

  let overall = 'Unknown';

  if (isCompleted && !rooms.general) {
    // Completed renovation wins unless hard general distress
    const hasHardExternal = rooms.external === 'Poor';
    overall = hasHardExternal ? 'Fair' : 'Good';
    // Clear soft room costs for a completed home unless specific rooms flagged
    if (overall === 'Good') {
      delete rooms.decorating;
      delete rooms.flooring;
      if (rooms.external === 'Fair') delete rooms.external;
    }
  } else if (Object.keys(rooms).length) {
    overall = overallFromRooms(rooms);
    if (rooms.general === 'Poor') overall = 'Poor';
    else if (rooms.general === 'Fair' && (overall === 'Unknown' || overall === 'Good')) overall = 'Fair';
  } else if (isCompleted || finishHits.length >= 2) {
    overall = 'Good';
  } else if (finishHits.length === 1 || strongCompleted) {
    overall = 'Good';
  }

  // Final safety: completed renovation language must never yield Poor
  if (isCompleted && overall === 'Poor') {
    overall = Object.keys(rooms).some((k) => rooms[k] === 'Poor' && k !== 'general')
      ? 'Fair'
      : 'Good';
    if (rooms.general === 'Poor') delete rooms.general;
  }

  const priced = costsFromRooms(rooms);
  const confidence = isCompleted || Object.keys(rooms).length >= 2
    ? 'high'
    : (Object.keys(rooms).length || finishHits.length ? 'medium' : 'low');

  return {
    overall,
    rooms,
    items: Object.fromEntries(
      Object.entries(rooms).map(([k, v]) => [k, (v || '').toLowerCase()]),
    ),
    refurbLow: priced.refurbLow,
    refurbHigh: priced.refurbHigh,
    lineItems: priced.lineItems,
    signals: signals.slice(0, 8),
    source: 'Classified from listing description'
      + (letter ? ` + EPC ${letter}` : ''),
    confidence,
    verdict: conditionVerdict(overall, signals, confidence),
  };
}

function emptyResult(source) {
  return {
    overall: 'Unknown',
    rooms: {},
    items: {},
    refurbLow: 0,
    refurbHigh: 0,
    lineItems: [],
    signals: [],
    source,
    confidence: 'none',
    verdict: conditionVerdict('Unknown', [], 'none'),
  };
}

/**
 * Merge text + vision.
 * Photos must be able to set overall when listing text is silent.
 * Text completed-renovation / Good must not be dragged to Poor by weak photo cues.
 */
export function mergeCondition(textCondition, visionCondition) {
  if (!visionCondition?.rooms || !Object.keys(visionCondition.rooms).length) {
    // If vision gave an overall without rooms, still use it when text is Unknown
    if (
      visionCondition?.overall
      && visionCondition.overall !== 'Unknown'
      && (textCondition.overall === 'Unknown' || !textCondition.overall)
    ) {
      return {
        ...textCondition,
        overall: visionCondition.overall === 'Average' ? 'Fair' : visionCondition.overall,
        signals: [...(textCondition.signals || []), ...(visionCondition.notes || [])].slice(0, 8),
        source: [textCondition.source, visionCondition.source].filter(Boolean).join(' + '),
        confidence: visionCondition.confidence || 'medium',
        verdict: conditionVerdict(
          visionCondition.overall === 'Average' ? 'Fair' : visionCondition.overall,
          visionCondition.notes || [],
          visionCondition.confidence || 'medium',
        ),
        vision: {
          rooms: {},
          confidence: visionCondition.confidence,
          source: visionCondition.source,
          imagesUsed: visionCondition.imagesUsed || 0,
        },
      };
    }
    return {
      ...textCondition,
      verdict: conditionVerdict(
        textCondition.overall,
        textCondition.signals,
        textCondition.confidence,
      ),
    };
  }

  const visionConf = visionCondition.confidence || 'low';
  const textOverall = textCondition.overall || 'Unknown';
  const textIsGood = textOverall === 'Good';
  const rooms = { ...(textCondition.rooms || {}) };

  for (const [room, rating] of Object.entries(visionCondition.rooms)) {
    if (!rating || rating === 'Unknown') continue;
    const optimistic = rating === 'Good' || rating === 'Average';
    const pessimistic = rating === 'Poor' || rating === 'Fair'
      || rating === 'Required' || rating === 'Needs replacing';

    // Low-confidence vision: can still fill empty text, but never worsen text-Good
    if (visionConf === 'low' || visionConf === 'none') {
      if (textIsGood && pessimistic) continue;
      if (optimistic && textOverall !== 'Unknown' && textOverall !== 'Fair') continue;
      rooms[room] = rooms[room] ? worseLevel(rooms[room], rating) : rating;
      continue;
    }

    if (textIsGood && optimistic) {
      rooms[room] = 'Good';
      continue;
    }
    if (textIsGood && pessimistic) {
      rooms[room] = rooms[room] ? worseLevel(rooms[room], 'Fair') : 'Fair';
      continue;
    }
    rooms[room] = rooms[room] ? worseLevel(rooms[room], rating) : rating;
  }

  const priced = costsFromRooms(rooms);
  let overall = textOverall;
  const fromVisionRooms = overallFromRooms(visionCondition.rooms);
  const visionOverallRaw = visionCondition.overall && visionCondition.overall !== 'Unknown'
    ? visionCondition.overall
    : fromVisionRooms;
  const visionOverall = visionOverallRaw === 'Average' ? 'Fair' : visionOverallRaw;

  if (textIsGood) {
    overall = 'Good';
  } else if (textOverall === 'Unknown' || !textOverall) {
    // Photos decide when the listing text is silent
    overall = visionOverall && visionOverall !== 'Unknown' ? visionOverall : 'Fair';
  } else if (visionConf === 'high' || visionConf === 'medium') {
    overall = worseLevel(
      visionOverall === 'Unknown' ? textOverall : visionOverall,
      textOverall,
    );
  } else {
    // Low-conf vision can nudge Unknown/Fair but not invent Poor alone
    if (visionOverall === 'Fair' || visionOverall === 'Good') {
      overall = worseLevel(textOverall, visionOverall === 'Good' ? 'Fair' : visionOverall);
    } else if (visionOverall === 'Poor') {
      overall = textOverall === 'Poor' ? 'Poor' : 'Fair';
    }
  }

  overall = overall === 'Average' ? 'Fair' : overall;
  if (textIsGood && overall === 'Poor') overall = 'Good';
  // If we analysed photos and somehow still Unknown, default Fair not "unclear"
  if (overall === 'Unknown' && (visionCondition.imagesUsed || 0) > 0) overall = 'Fair';

  const signals = [
    ...(textCondition.signals || []),
    ...(visionCondition.notes || []).slice(0, 3),
  ].slice(0, 8);

  const confidence = textIsGood || visionConf === 'high' || textCondition.confidence === 'high'
    ? 'high'
    : visionConf === 'medium' || textCondition.confidence === 'medium'
      ? 'medium'
      : (visionCondition.imagesUsed || 0) > 0
        ? 'medium'
        : 'low';

  return {
    overall,
    rooms,
    items: Object.fromEntries(
      Object.entries(rooms).map(([k, v]) => [k, (v || '').toLowerCase()]),
    ),
    refurbLow: textIsGood ? 0 : priced.refurbLow,
    refurbHigh: textIsGood ? 0 : priced.refurbHigh,
    lineItems: textIsGood ? [] : priced.lineItems,
    signals,
    source: [
      textCondition.source,
      visionCondition.source || 'Photo analysis',
    ].filter(Boolean).join(' + '),
    confidence,
    verdict: conditionVerdict(overall, signals, confidence),
    vision: {
      rooms: visionCondition.rooms,
      confidence: visionCondition.confidence,
      source: visionCondition.source,
      imagesUsed: visionCondition.imagesUsed || 0,
      overall: visionCondition.overall,
    },
  };
}

export function conditionVerdict(overall, signals = [], confidence = 'low') {
  if (overall === 'Good') {
    return {
      label: 'Good condition',
      tone: 'good',
      summary: 'Photos / listing indicate a refurbished or well-presented home.',
      evidence: signals.slice(0, 4),
    };
  }
  if (overall === 'Poor') {
    return {
      label: 'Needs significant work',
      tone: 'poor',
      summary: 'Photos / listing point to a renovation project.',
      evidence: signals.slice(0, 4),
    };
  }
  if (overall === 'Fair') {
    return {
      label: 'Needs updating',
      tone: 'fair',
      summary: 'Photos / listing suggest cosmetic or partial modernisation rather than turn-key.',
      evidence: signals.slice(0, 4),
    };
  }
  return {
    label: 'No photos to analyse',
    tone: 'unknown',
    summary: 'Listing had no usable photos or text cues — confirm on viewing / survey.',
    evidence: signals.slice(0, 4),
  };
}

export { LEGACY_LEVEL, COMPLETED_RENOVATION };
