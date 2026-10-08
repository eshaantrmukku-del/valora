/**
 * Adapts API analysis records to the property shape the Valora report components render.
 * Every value comes from the server's analysis (facts, evidence, deterministic calculations, AI narrative).
 * Unknown values are shown as unknown — never filled with plausible-looking numbers.
 */
import { OBJECTIVE_LABELS, PROPERTY_TYPE_LABELS } from '../../../shared/brief';
import { gbp, pct } from './api';

const SOURCE_LABELS = {
  listing: 'Listing',
  user: 'You',
  document: 'Document',
  official_dataset: 'Official data',
  provider_classification: 'Provider',
  derived: 'Valora',
};

export function providerLabel(provider) {
  if (provider === 'propertydata') return 'PropertyData';
  if (provider === 'fixtures') return 'Test fixtures (not real listings)';
  return provider || 'Listing';
}

function grade(score, confidenceLabel) {
  const fit = score >= 75 ? 'Strong fit' : score >= 55 ? 'Partial fit' : 'Weak fit';
  return `${fit} · ${confidenceLabel} confidence`;
}

export function factLine(f) {
  return [
    f.propertyType ? PROPERTY_TYPE_LABELS[f.propertyType] : null,
    f.bedrooms != null ? `${f.bedrooms} bed` : null,
    f.bathrooms != null ? `${f.bathrooms} bath` : null,
    f.floorAreaSqm != null ? `${f.floorAreaSqm} m²` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function propertyTitle(f) {
  return (
    f.address ||
    (f.postcode ? `Property in ${f.postcode}` : f.outcode ? `Property in ${f.outcode}` : 'Untitled property')
  );
}

export function analysisToLegacy(a) {
  const f = a.facts;
  const det = a.report.deterministic;
  const fin = det.financials;
  const r = a.ranking;
  const narrative = a.report.narrative;
  const objective = a.criteria.objective;
  const strategyKey = objective === 'renovation_resale' ? 'flip' : 'btl';
  const origins = a.factOrigins || {};
  const listingOrigin = origins.askingPrice || origins.address;
  const comps = det.comparables;
  const rentalEv = a.evidence.rental;
  const discount = r.metrics.discountToComparablesPct;

  const sampleAvg = comps.sample?.length
    ? comps.sample.reduce((s, c) => s + c.price, 0) / comps.sample.length
    : null;

  const missingInputs = [...new Set([...(fin.missing?.rental || []), ...(fin.missing?.flip || [])])];

  const constraintsChecklist = r.constraints.map((c) => ({
    text: `${c.description} — ${c.detail}`,
    ok: c.status === 'pass',
    warn: c.status === 'unknown',
  }));

  const signalsComponent = r.components.find((c) => c.key === 'conditionOpportunity');

  return {
    id: a.id,
    propertyId: a.propertyId,
    briefId: a.briefId,
    raw: a,
    name: propertyTitle(f),
    address: [f.address, f.postcode].filter(Boolean).join(', ') || f.outcode || 'Address not supplied',
    location: f.district || f.outcode || f.postcode || '—',
    postcode: f.postcode || f.outcode,
    price: f.askingPrice,
    priceLabel:
      f.askingPrice != null
        ? `${f.priceQualifier ? `${f.priceQualifier} ` : ''}${gbp(f.askingPrice)}`
        : 'Price unknown',
    hasLiveData: listingOrigin?.source === 'listing',
    sourcePortal: listingOrigin ? listingOrigin.label : 'Your details',
    sourceUrl: f.listingUrl,
    images: f.images || [],
    tags: [
      f.propertyType ? PROPERTY_TYPE_LABELS[f.propertyType] : null,
      f.tenure && f.tenure !== 'unknown' ? f.tenure.replace(/_/g, ' ') : null,
      OBJECTIVE_LABELS[objective],
      ...(f.providerTags || []).slice(0, 2),
    ].filter(Boolean),
    facts: [
      { label: 'Asking price', value: f.askingPrice != null ? gbp(f.askingPrice) : 'Unknown' },
      { label: 'Bedrooms', value: f.bedrooms ?? 'Unknown' },
      { label: 'Floor area', value: f.floorAreaSqm != null ? `${f.floorAreaSqm} m²` : 'Unknown' },
      { label: 'EPC', value: f.epcRating || 'Unknown' },
    ],
    score: r.matchScore,
    confidence: r.confidence,
    grade: grade(r.matchScore, r.confidenceLabel),
    strategy: a.briefName || OBJECTIVE_LABELS[objective],
    strategyKey,
    brief: { name: a.briefName },
    briefMatch: a.briefId
      ? { matchPct: r.matchScore, briefName: a.briefName, checklist: constraintsChecklist }
      : null,
    narrativeStatus: a.narrativeStatus,
    narrativeError: a.narrativeError,
    narrativeStale: a.report.narrativeStale,
    groundingWarnings: a.report.groundingWarnings || [],
    narrative,
    aiInsight: narrative
      ? {
          opening: narrative.executiveSummary,
          yieldLine: narrative.investmentThesis,
          strategyLine: narrative.financingCommentary,
          valueLine: narrative.comparableCommentary,
          conditionLine:
            narrative.renovationCommentary || narrative.rentalCommentary || narrative.resaleCommentary,
          prefsLine: `${narrative.overall.verdict.replace(/_/g, ' ')} — ${narrative.overall.rationale}`,
        }
      : null,
    scoreBreakdown: r.components.map((c) => ({
      label: `${c.label} ×${c.weight} · ${c.score == null ? 'unknown' : `${c.score}/100`}`,
      text: c.explanation,
      impact:
        c.score == null ? 'neutral' : c.score >= 70 ? 'positive' : c.score <= 35 ? 'negative' : 'neutral',
      evidence: c.evidence,
    })),
    metrics: {
      land: gbp(f.askingPrice),
      build:
        fin.refurbishment.low != null
          ? `${gbp(fin.refurbishment.low)}–${gbp(fin.refurbishment.high)}`
          : 'Not estimated',
      total:
        strategyKey === 'flip'
          ? gbp(fin.flip?.totalCosts)
          : gbp(fin.rental?.cashInvested ?? fin.acquisition?.totalAcquisitionCost),
      returnLabel: strategyKey === 'flip' ? 'Net profit (est.)' : 'Gross yield',
      return: strategyKey === 'flip' ? gbp(fin.flip?.netProfit) : pct(fin.rental?.grossYieldPct),
    },
    deal: fin.acquisition
      ? {
          deposit: fin.acquisition.deposit,
          depositPct: a.inputs.cashPurchase ? 100 : a.inputs.depositPct,
          stampDuty: fin.acquisition.transactionTax,
          stampDutyLabel: fin.acquisition.transactionTaxDetail?.taxName || 'Transaction tax',
          legalFees: (fin.acquisition.legalFees || 0) + (fin.acquisition.surveyFees || 0),
          monthlyMortgage: fin.rental?.monthlyMortgagePayment ?? null,
          interestRate: a.inputs.interestRatePct,
          interestOnly: a.inputs.interestOnly,
          monthlyCashFlow: fin.rental?.monthlyCashFlow ?? null,
          breakEvenRent: fin.rental?.breakEvenMonthlyRent ?? null,
        }
      : null,
    flip: fin.flip
      ? {
          works: fin.flip.refurbishmentCost,
          gdv: fin.flip.resaleValue,
          totalIn: fin.flip.totalCosts,
          uplift: fin.flip.netProfit,
          upliftPct: fin.flip.profitOnCostPct,
        }
      : null,
    missingInputs,
    warnings: fin.warnings,
    undervalued:
      discount == null
        ? {
            tone: 'unknown',
            title: 'Price check',
            desc: 'Not enough comparable sold prices to compare the asking price.',
            badge: 'No comparison',
          }
        : {
            tone: discount >= 5 ? 'good' : discount <= -5 ? 'bad' : 'neutral',
            title:
              discount >= 0
                ? `${pct(discount)} below comparable median`
                : `${pct(-discount)} above comparable median`,
            desc: `Median of ${comps.count} Land Registry sales (${comps.confidence} confidence). Sold records exclude size and condition.`,
            badge: comps.confidence,
          },
    comparables: {
      available: comps.count > 0,
      median: comps.median,
      average: sampleAvg,
      deviationPct: discount == null ? null : -discount,
      count: comps.count,
      sample: (comps.sample || []).map((c) => ({ ...c, street: c.address })),
      note: (comps.caveats || []).join(' '),
      district: f.district,
      source: a.evidence.sold?.source || 'HM Land Registry Price Paid Data',
      confidence: comps.confidence,
    },
    condition: {
      verdict: signalsComponent
        ? {
            tone:
              signalsComponent.score == null ? 'unknown' : signalsComponent.score >= 70 ? 'good' : 'neutral',
            label:
              signalsComponent.score == null
                ? 'Condition unknown'
                : `Improvement opportunity ${signalsComponent.score}/100`,
            summary: signalsComponent.explanation,
            evidence: signalsComponent.evidence.map((e) => e.text),
          }
        : null,
      overall:
        signalsComponent?.score == null
          ? 'Unknown'
          : signalsComponent.score >= 70
            ? 'Needs work (per listing)'
            : 'No clear works signal',
      refurbLow: fin.refurbishment.low,
      refurbHigh: fin.refurbishment.high,
      signals: [],
      source: det.refurbishmentBasis || 'No refurbishment range: floor area and renovation budget unknown',
    },
    tenure: f.tenure && f.tenure !== 'unknown' ? f.tenure.replace(/_/g, ' ') : null,
    epc: f.epcRating,
    pros: narrative ? narrative.attractions.map((x) => x.text) : r.highlights,
    cons: narrative ? narrative.disadvantages.map((x) => x.text) : r.concerns,
    risks: [
      ...(narrative
        ? narrative.risks.map((x) => ({
            type: x.severity === 'high' ? 'risk' : x.severity === 'medium' ? 'warn' : 'info',
            text: x.text,
          }))
        : []),
      ...r.concerns.map((t) => ({ type: 'warn', text: t })),
    ],
    missing: det.missingInformation,
    dueDiligence: det.dueDiligence,
    scenarios: det.scenarios,
    sensitivity: det.sensitivity,
    rental: rentalEv?.monthlyAverage
      ? {
          conservative: rentalEv.monthlyRangeLow,
          expected: rentalEv.monthlyAverage,
          optimistic: rentalEv.monthlyRangeHigh,
          grossYield: pct(fin.rental?.grossYieldPct),
          netYield: pct(fin.rental?.netYieldPct),
        }
      : null,
    rentEstimate: rentalEv
      ? { confidence: rentalEv.basis.replace(/_/g, ' '), source: `${rentalEv.source} — ${rentalEv.scope}` }
      : null,
    planning: a.evidence.planningConstraints,
    unavailable: a.evidence.unavailable,
    provenance: {
      listing: listingOrigin
        ? `${listingOrigin.label}${listingOrigin.retrievedAt ? ` · ${new Date(listingOrigin.retrievedAt).toLocaleDateString('en-GB')}` : ''}`
        : 'Your input',
      soldPrices: a.evidence.sold ? `${a.evidence.sold.source} · ${a.evidence.sold.scope}` : 'Unavailable',
      geo: origins.district ? origins.district.label : f.district ? 'Supplied' : 'Unavailable',
      rent: rentalEv ? `${rentalEv.source} (${rentalEv.basis.replace(/_/g, ' ')})` : 'No rental evidence',
      areaStats: a.evidence.planningConstraints ? 'planning.data.gov.uk designations' : 'Unavailable',
      financials: 'Valora deterministic engine — assumptions labelled below',
      score: `Strategy-weighted match (${OBJECTIVE_LABELS[objective]}), not a probability of success`,
    },
    factOrigins: Object.entries(origins).map(([k, o]) => ({
      field: k,
      source: SOURCE_LABELS[o.source] || o.source,
      label: o.label,
    })),
    inputs: a.inputs,
    inputProvenance: a.inputProvenance,
  };
}
