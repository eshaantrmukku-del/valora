/**
 * Continuous brief monitoring — re-runs saved briefs periodically
 * and pushes deal alerts when a better match appears.
 *
 * Runs in the browser while Valora is open (no backend cron).
 * Interval: 4 hours (or on demand).
 */
import { runDiscover } from './runDiscover';
import {
  getBriefs,
  updateBrief,
  getBriefMatches,
  setBriefMatches,
  pushDealAlert,
  getNotificationPrefs,
} from '../storage';
import { saveCustom } from '../../data/properties';

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MIN_SCORE_FOR_ALERT = 60;

let timer = null;
let running = false;

function knownIds(briefId) {
  return new Set(getBriefMatches(briefId).map((m) => m.id));
}

async function checkBrief(brief) {
  const result = await runDiscover(brief.query, { maxAnalyse: 10 });
  if (!result.ok) {
    updateBrief(brief.id, { lastCheckedAt: Date.now(), lastError: result.error });
    return { brief, newMatches: [] };
  }

  const prev = knownIds(brief.id);
  const top = result.opportunities.slice(0, 12);
  const snapshot = top.map(({ property, rankScore, rating, matchPct }) => ({
    id: property.id,
    name: property.name,
    score: matchPct ?? property.score,
    invScore: property.score,
    rankScore,
    rating,
    price: property.price,
    yield: property.deal?.grossYield,
    location: property.location,
    listedAt: property.listedAt,
    seenAt: Date.now(),
  }));

  const newOnes = top.filter(({ property }) => !prev.has(property.id));
  const prefs = getNotificationPrefs();
  const briefName = brief.name || result.briefName || null;

  for (const { property, rating, reasons, matchPct, checklist } of newOnes) {
    try { saveCustom(property); } catch { /* ignore */ }

    const pct = matchPct ?? property.score;
    if (prefs.dealAlerts !== false && brief.notify !== false && pct >= MIN_SCORE_FOR_ALERT) {
      pushDealAlert({
        briefId: brief.id,
        briefQuery: brief.query,
        briefName,
        propertyId: property.id,
        title: 'New Match Found',
        score: pct,
        rating,
        location: property.location,
        price: property.price,
        yield: property.deal?.grossYield,
        cashFlow: property.deal?.monthlyCashFlow,
        listedAt: property.listedAt,
        reasons: reasons || checklist?.filter((c) => c.ok).map((c) => c.text),
        name: property.name,
        body: `A newly listed property in ${property.location} matches your ${briefName || 'Investment Brief'} with a ${pct}% compatibility score.`,
      });
    }
  }

  const bestScore = top[0]?.matchPct ?? top[0]?.property?.score ?? brief.bestScore;
  updateBrief(brief.id, {
    lastCheckedAt: Date.now(),
    lastError: null,
    matchCount: result.opportunities.length,
    bestScore,
    name: brief.name || briefName,
    filters: result.intent,
  });
  setBriefMatches(brief.id, snapshot);

  return { brief, newMatches: newOnes };
}

export async function runBriefMonitor(opts = {}) {
  if (running) return { skipped: true };
  running = true;
  try {
    const briefs = getBriefs().filter((b) => b.active !== false);
    const force = Boolean(opts.force);
    const due = briefs.filter((b) => {
      if (force) return true;
      if (!b.lastCheckedAt) return true;
      return Date.now() - b.lastCheckedAt >= CHECK_INTERVAL_MS;
    });

    const results = [];
    for (const brief of due.slice(0, 3)) { // max 3 briefs per cycle
      try {
        results.push(await checkBrief(brief));
      } catch (err) {
        updateBrief(brief.id, { lastCheckedAt: Date.now(), lastError: err.message });
      }
    }
    return { ok: true, results };
  } finally {
    running = false;
  }
}

export function startBriefMonitor() {
  if (timer) return;
  // First check after a short delay so the app can settle
  setTimeout(() => { runBriefMonitor().catch(() => {}); }, 20000);
  timer = setInterval(() => {
    runBriefMonitor().catch(() => {});
  }, CHECK_INTERVAL_MS);
}

export function stopBriefMonitor() {
  if (timer) clearInterval(timer);
  timer = null;
}

export { CHECK_INTERVAL_MS };
