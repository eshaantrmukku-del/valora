/**
 * Property chat — answers only from verified analysis data.
 * Never invents prices, yields, or comps. Cites report fields.
 */

const SUGGESTIONS = [
  'Why this score?',
  'What will the refurb cost?',
  'Explain the cash required',
  'Biggest risks?',
  'Is it below market value?',
  'Walk me through the yield',
];

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return `£${Number(n).toLocaleString()}`;
}

function buildContext(property) {
  if (!property) return null;
  return {
    name: property.name,
    strategy: property.strategy,
    strategyKey: property.strategyKey,
    score: property.score,
    grade: property.grade,
    price: property.price,
    location: property.location,
    beds: property.beds,
    propertyType: property.propertyType,
    deal: property.deal,
    flip: property.flip,
    condition: property.condition,
    comparables: property.comparables,
    rental: property.rental,
    rentEstimate: property.rentEstimate,
    risks: property.risks,
    pros: property.pros,
    cons: property.cons,
    scoreBreakdown: property.scoreBreakdown,
    aiInsight: property.aiInsight,
    provenance: property.provenance,
  };
}

function answerRefurb(p) {
  const c = p.condition;
  const lines = [];
  if (!c) return 'No condition assessment is on this report yet.';

  if (c.verdict) {
    lines.push(`**${c.verdict.label}** — ${c.verdict.summary}`);
  } else {
    lines.push(`Condition is rated **${c.overall}** (${c.source || 'listing signals'}).`);
  }

  if (c.vision?.rooms) {
    const bits = Object.entries(c.vision.rooms)
      .filter(([, v]) => v && v !== 'Unknown')
      .map(([k, v]) => `${k}: ${v}`);
    if (bits.length) {
      lines.push(`From photos (${c.vision.confidence || 'n/a'} confidence, ${c.vision.imagesUsed || '?'} images): ${bits.join('; ')}.`);
    }
  }

  if (c.lineItems?.length) {
    lines.push('Rule-based works schedule (not AI-priced):');
    for (const item of c.lineItems) {
      lines.push(`• ${item.room} (${item.rating}): ${money(item.low)}–${money(item.high)}`);
    }
  }

  if (c.refurbHigh) {
    lines.push(`**Total works range: ${money(c.refurbLow)}–${money(c.refurbHigh)}.**`);
  } else {
    lines.push('No priced works items — either no clear renovation signals, or condition is unclear from the listing.');
  }

  if (p.flip) {
    lines.push(`All-in (price + mid works): ${money(p.flip.totalIn)}. GDV proxy (sold median): ${p.flip.gdv ? money(p.flip.gdv) : 'unavailable'}. Illustrative uplift: ${p.flip.uplift != null ? money(p.flip.uplift) : 'n/a'}.`);
  }

  lines.push('These costs come from a fixed rule table applied to classified condition — verify with a surveyor.');
  return lines.join('\n');
}

function answerScore(p) {
  const lines = [`Investment score **${p.score}/100** (${p.grade}).`];
  if (p.scoreBreakdown?.length) {
    lines.push('Breakdown from the weighted formula:');
    for (const item of p.scoreBreakdown.slice(0, 6)) {
      lines.push(`• **${item.label}**: ${item.text}`);
    }
  }
  if (p.provenance?.score) lines.push(`Formula: ${p.provenance.score}`);
  return lines.join('\n');
}

function answerCash(p) {
  const d = p.deal;
  if (!d) return 'No financial model on this report.';
  const lines = [
    `**Cash required: ${money(d.totalCashRequired)}**`,
    `• Deposit (${d.depositPct}%): ${money(d.deposit)}`,
    `• Stamp duty: ${money(d.stampDuty)}`,
    `• Legal & survey: ${money(d.legalFees)}`,
  ];
  if (d.refurbCost) lines.push(`• Refurb (mid): ${money(d.refurbCost)}`);
  if (p.strategyKey !== 'flip') {
    lines.push(`Mortgage ~${money(d.monthlyMortgage)}/mo → cash flow ${money(d.monthlyCashFlow)}/mo (${d.cashOnCash}% cash-on-cash).`);
  }
  return lines.join('\n');
}

function answerRisks(p) {
  if (!p.risks?.length && !p.cons?.length) return 'No structured risks were recorded on this report.';
  const lines = ['Biggest watchouts from the verified report:'];
  for (const r of (p.risks || []).filter((x) => x.type === 'warn').slice(0, 5)) {
    lines.push(`• ${r.text}`);
  }
  for (const c of (p.cons || []).slice(0, 3)) lines.push(`• ${c}`);
  return lines.join('\n');
}

function answerBmv(p) {
  const c = p.comparables;
  if (!c?.available) {
    return 'No HM Land Registry sold comps were available, so **no cheap-price / below-market claim** was made. Valora only judges value against real sold prices.';
  }
  const lines = [];
  if (c.verdict) {
    lines.push(`**${c.verdict.label}** — ${c.verdict.summary}`);
  }
  lines.push(`Sold median from ${c.sample?.length || c.count} comps: **${money(c.median)}**.`);
  lines.push(`Asking vs median: **${c.deviationPct > 0 ? '+' : ''}${c.deviationPct}%** (${c.confidence || 'n/a'} confidence).`);
  if (c.undervalued === 'strong') lines.push('Flagged as a **strong** potential discount — confirm condition and exact street.');
  else if (c.undervalued === 'possible') lines.push('Possible under-market entry — check comps carefully.');
  else lines.push('No meaningful below-market flag on this asking price.');
  if (p.flip?.uplift != null) {
    lines.push(`Illustrative uplift vs GDV after mid-point works: **${money(p.flip.uplift)}** (${p.flip.upliftPct}% on all-in cost).`);
  }
  lines.push(`Source: ${c.source || 'HM Land Registry'}.`);
  return lines.join('\n');
}

function answerYield(p) {
  const d = p.deal;
  if (!d) return 'No yield model on this report.';
  if (p.strategyKey === 'flip') {
    return `This report is on a **Refurb & Flip** strategy, so rental yield is secondary. Modelled gross yield is ${d.grossYield}% for reference only — focus on works, GDV, and uplift instead.`;
  }
  const conf = p.rentEstimate?.confidence || 'unknown';
  return [
    `Gross yield **${d.grossYield}%**, net **${d.netYield}%** (after ${d.annualCostsPct}% running costs).`,
    `Rent used: ${money(d.monthlyRent)}/mo — confidence **${conf}** (${p.rentEstimate?.source || 'model'}).`,
    `Break-even rent: ${money(d.breakEvenRent)}/mo.`,
  ].join('\n');
}

function answerCompare(p, q) {
  return [
    `I can only discuss **this** analysis (${p.name}).`,
    `Open Compare to put two reports side by side. For this one: score ${p.score}, ${money(p.price)}, strategy ${p.strategy}.`,
  ].join('\n');
}

function answerGeneral(p, question) {
  const q = question.toLowerCase();
  const lines = [];

  if (p.aiInsight?.opening) lines.push(p.aiInsight.opening);
  if (p.strategyKey === 'flip' && p.aiInsight?.yieldLine) lines.push(p.aiInsight.yieldLine);
  else if (p.aiInsight?.strategyLine) lines.push(p.aiInsight.strategyLine);

  lines.push('');
  lines.push('Ask me specifically about score, refurb cost, cash required, risks, yield, or whether it is below market — I will only cite figures from this report.');

  if (/photo|image|vision|look/i.test(q) && p.condition?.vision) {
    lines.push(`Photo assessment: ${p.condition.vision.source} (${p.condition.vision.confidence} confidence, ${p.condition.vision.imagesUsed} images).`);
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * Answer a user question about a property using only verified report data.
 */
export function answerPropertyQuestion(property, question) {
  const p = buildContext(property);
  if (!p) {
    return { answer: 'No property report loaded.', suggestions: SUGGESTIONS };
  }

  const q = (question || '').trim();
  if (!q) {
    return {
      answer: `Ask anything about this ${p.beds}-bed in ${p.location}. I only use numbers already on the report.`,
      suggestions: SUGGESTIONS,
    };
  }

  let answer;
  if (/refurb|rebuild|works|renovation|condition|kitchen|bathroom|cost to (?:fix|refurb)/i.test(q)) {
    answer = answerRefurb(p);
  } else if (/uplift|gdv|all-?in/i.test(q)) {
    answer = answerBmv(p);
  } else if (/score|why.*(rate|rank|score)|breakdown/i.test(q)) {
    answer = answerScore(p);
  } else if (/cash required|deposit|stamp|how much.*(need|put down)|total cash/i.test(q)) {
    answer = answerCash(p);
  } else if (/risk|watchout|downside|concern/i.test(q)) {
    answer = answerRisks(p);
  } else if (/below market|undervalued|bmv|discount|comparable|sold median|gdv/i.test(q)) {
    answer = answerBmv(p);
  } else if (/yield|rent|cash flow|mortgage payment/i.test(q)) {
    answer = answerYield(p);
  } else if (/compare|other propert|versus|vs\b/i.test(q)) {
    answer = answerCompare(p, q);
  } else {
    answer = answerGeneral(p, q);
  }

  return { answer, suggestions: SUGGESTIONS };
}

export function getChatSuggestions(property) {
  if (property?.strategyKey === 'flip') {
    return [
      'What will the refurb cost?',
      'Is it below market value?',
      'Explain the uplift vs GDV',
      'Biggest risks?',
      'Why this score?',
    ];
  }
  return SUGGESTIONS;
}

const CHAT_KEY = (id) => `valora_chat_${id}`;

export function loadChat(propertyId) {
  try {
    return JSON.parse(localStorage.getItem(CHAT_KEY(propertyId)) || '[]');
  } catch {
    return [];
  }
}

export function saveChat(propertyId, messages) {
  localStorage.setItem(CHAT_KEY(propertyId), JSON.stringify(messages.slice(-40)));
  window.dispatchEvent(new Event('valora-store-change'));
}
