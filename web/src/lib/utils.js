export function scoreClass(score) {
  if (score >= 80) return 'high';
  if (score >= 65) return 'mid';
  return 'low';
}

export function scoreColor(score) {
  const c = scoreClass(score);
  if (c === 'high') return 'var(--green)';
  if (c === 'mid') return 'var(--amber)';
  return 'var(--red)';
}

export function tagClass(tag) {
  const t = tag.toLowerCase();
  if (t.includes('demo') || t.includes('rebuild')) return 'demo';
  if (t.includes('undervalued') || t.includes('bmv')) return 'chain';
  if (t.includes('chain')) return 'chain';
  if (t.includes('regen')) return 'regen';
  if (t.includes('hmo')) return 'demo';
  return 'freehold';
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const RISK_ICONS = { ok: '✓', warn: '⚠', risk: '✕', info: 'ℹ' };
export function riskIcon(type) {
  return RISK_ICONS[type] || '•';
}
