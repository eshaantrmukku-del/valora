import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import AppPage, { AppEmpty, AppStat } from '../components/AppPage';
import { IlluCompare } from '../components/AppIllustrations';
import { OBJECTIVE_LABELS, PROPERTY_TYPE_LABELS } from '../../../shared/brief';
import { useApi } from '../hooks/useApi';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 10_000) return `£${Math.round(v / 1000)}k`;
  return `£${Math.round(v).toLocaleString()}`;
}

const bedsOf = (p) => p?.beds ?? null;
const yieldOf = (p) => p?.yieldPct ?? null;
const rentOf = (p) => p?.rent ?? null;
const cashFlowOf = (p) => p?.cashFlow ?? null;
const discountOf = (p) => p?.vsMedianPct ?? null;
const conditionOf = (p) => p?.conditionLabel ?? null;
const worksOf = (p) => p?.works ?? null;

/** Map a server comparison column to the fields the compare view renders. */
function columnToView(col, briefName, objective) {
  const f = col.facts;
  const r = col.ranking;
  const fin = col.report.financials;
  const cond = r.components.find((c) => c.key === 'conditionOpportunity');
  const refurb = fin.refurbishment;
  return {
    id: col.propertyId,
    score: r.matchScore,
    grade: `${r.confidence}% assessable`,
    name: f.address || f.postcode || 'Untitled property',
    location: f.district || f.outcode,
    postcode: f.postcode,
    price: f.askingPrice,
    beds: f.bedrooms,
    image: f.images?.[0] || null,
    yieldPct: fin.rental?.grossYieldPct ?? null,
    netYieldPct: fin.rental?.netYieldPct ?? null,
    rent: col.evidence.rental?.monthlyAverage ?? null,
    cashFlow: fin.rental?.monthlyCashFlow ?? null,
    vsMedianPct: r.metrics.discountToComparablesPct == null ? null : -r.metrics.discountToComparablesPct,
    compMedian: r.metrics.comparableMedian,
    compCount: r.metrics.comparableCount,
    conditionLabel: cond ? (cond.score == null ? 'Unknown' : `${cond.score}/100 improvement`) : null,
    works: refurb.low != null ? Math.round((refurb.low + refurb.high) / 2) : null,
    flipProfit: fin.flip?.netProfit ?? null,
    strategy: briefName || OBJECTIVE_LABELS[objective],
    propertyType: f.propertyType ? PROPERTY_TYPE_LABELS[f.propertyType] : null,
    confidence: r.confidence,
    missingCount: col.report.missingInformation.length,
    risks: r.concerns,
    isBmv: r.metrics.discountToComparablesPct != null && r.metrics.discountToComparablesPct >= 5,
  };
}

function scoreTone(score) {
  if (score == null) return 'mid';
  if (score >= 80) return 'high';
  if (score >= 65) return 'mid';
  return 'low';
}

function winnerSide(a, b, better) {
  if (a == null || b == null || a === b || typeof a !== 'number' || typeof b !== 'number') return null;
  if (better === 'none') return null;
  return better === 'higher' ? (a > b ? 'a' : 'b') : (a < b ? 'a' : 'b');
}

function optionLabel(p) {
  const priceBit = p.price != null ? ` · £${Number(p.price).toLocaleString()}` : '';
  return `${p.name || 'Property'}${priceBit}`;
}

function PropertySlot({ side, label, property, options, value, onChange, onOpen, disabledIds }) {
  const beds = bedsOf(property);
  const y = yieldOf(property);
  const isBmv = property?.isBmv;

  return (
    <article className={`cmp-slot cmp-slot--${side}`}>
      <div className="cmp-slot-head">
        <span className="cmp-slot-tag">{label}</span>
        <div className={`cmp-slot-score cmp-slot-score--${scoreTone(property?.score)}`}>
          <strong>{property?.score ?? '—'}</strong>
          <span>{property?.grade || 'Score'}</span>
        </div>
      </div>

      <div className="cmp-slot-media">
        {property?.image ? (
          <img src={property.image} alt="" />
        ) : (
          <div className="cmp-slot-media-fallback">{property?.emoji || 'Property'}</div>
        )}
      </div>

      <label className="cmp-slot-picker">
        <span className="cmp-slot-picker-label">Choose property</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {options.map((p) => (
            <option key={p.id} value={p.id} disabled={disabledIds?.has(p.id) && p.id !== value}>
              {optionLabel(p)}
            </option>
          ))}
        </select>
      </label>

      <div className="cmp-slot-body">
        <h3 className="cmp-slot-name">{property?.name || 'Select a property'}</h3>
        <p className="cmp-slot-meta">
          {[property?.location, property?.postcode].filter(Boolean).join(' · ') || '—'}
        </p>
        <div className="cmp-slot-facts">
          {property?.price != null && (
            <div>
              <span>Price</span>
              <strong>{money(property.price)}</strong>
            </div>
          )}
          {beds != null && (
            <div>
              <span>Beds</span>
              <strong>{beds === 0 ? 'Studio' : beds}</strong>
            </div>
          )}
          {y != null && (
            <div>
              <span>Yield</span>
              <strong>{y}%</strong>
            </div>
          )}
          {property?.strategy && (
            <div>
              <span>Strategy</span>
              <strong>{property.strategy}</strong>
            </div>
          )}
        </div>
        {isBmv && (
          <div className="cmp-slot-flag">Below comparable sold median (Land Registry)</div>
        )}
        {conditionOf(property) && conditionOf(property) !== 'Unknown' && (
          <div className="cmp-slot-flag cmp-slot-flag--soft">
            Condition: {conditionOf(property)}
          </div>
        )}
      </div>

      <button type="button" className="app-btn app-btn--ghost cmp-slot-open" onClick={onOpen} disabled={!property}>
        Analyse with this brief
      </button>
    </article>
  );
}

function MetricRow({ label, a, b, format = (v) => v, better = 'higher', hint }) {
  const av = a ?? null;
  const bv = b ?? null;
  const winner = winnerSide(av, bv, better);
  const bothNum = typeof av === 'number' && typeof bv === 'number';
  const maxAbs = bothNum ? Math.max(Math.abs(av), Math.abs(bv), 1) : 1;

  const cell = (side, value) => {
    const win = winner === side;
    const tie = winner == null && av != null && bv != null && better !== 'none';
    return (
      <div className={`cmp-row-val${win ? ' is-win' : ''}${tie ? ' is-tie' : ''}`}>
        <span className="cmp-row-num">{value == null || value === '' ? '—' : format(value)}</span>
        {win && <span className="cmp-row-badge">Better</span>}
      </div>
    );
  };

  return (
    <div className="cmp-row">
      <div className="cmp-row-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="cmp-row-track">
        {cell('a', av)}
        {bothNum && better !== 'none' ? (
          <div className="cmp-row-bars" aria-hidden="true">
            <div className="cmp-row-bar cmp-row-bar--a" style={{ width: `${Math.round((Math.abs(av) / maxAbs) * 100)}%` }} />
            <div className="cmp-row-bar cmp-row-bar--b" style={{ width: `${Math.round((Math.abs(bv) / maxAbs) * 100)}%` }} />
          </div>
        ) : (
          <span className="cmp-row-vs">vs</span>
        )}
        {cell('b', bv)}
      </div>
    </div>
  );
}

export default function Compare() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { showToast, analyseProperty } = useApp();
  const saved = useApi('/api/saved');
  const analyses = useApi('/api/analyses');
  const briefs = useApi('/api/briefs');
  const comparisons = useApi('/api/comparisons');
  const [comparisonId, setComparisonId] = useState(null);
  const [computed, setComputed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [briefId, setBriefId] = useState(params.get('brief') || '');

  const options = useMemo(() => {
    const map = new Map();
    for (const s of saved.data?.saved || []) map.set(s.propertyId, { id: s.propertyId, name: s.facts.address || s.facts.postcode || 'Untitled property', price: s.facts.askingPrice });
    for (const a of analyses.data?.analyses || []) if (!map.has(a.propertyId)) map.set(a.propertyId, { id: a.propertyId, name: a.address || a.postcode || 'Untitled property', price: a.askingPrice });
    return [...map.values()];
  }, [saved.data, analyses.data]);

  const load = useCallback(async (id) => {
    setBusy(true);
    try {
      const r = await api(`/api/comparisons/${id}`);
      setComputed(r);
      const ids = r.columns.map((c) => c.propertyId);
      setLeftId(ids[0] || '');
      setRightId(ids[1] || '');
      setBriefId(r.comparison.briefId || '');
    } catch (err) {
      showToast('Could not load comparison', err.message);
    } finally {
      setBusy(false);
    }
  }, [showToast]);

  // Use the most recent comparison; create one when the first properties are chosen.
  useEffect(() => {
    if (comparisonId || !comparisons.data) return;
    const first = comparisons.data.comparisons[0];
    if (first) {
      setComparisonId(first.id);
      load(first.id);
    }
  }, [comparisons.data, comparisonId, load]);

  const setPair = useCallback(async (a, b, brief) => {
    const ids = [a, b].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i);
    setLeftId(a || '');
    setRightId(b || '');
    setBusy(true);
    try {
      let id = comparisonId;
      if (!id) {
        const r = await api('/api/comparisons', { method: 'POST', body: { name: 'My comparison', briefId: brief || null, propertyIds: ids } });
        id = r.comparison.id;
        setComparisonId(id);
      } else {
        await api(`/api/comparisons/${id}`, { method: 'PATCH', body: { briefId: brief || null } });
        const current = computed?.columns.map((c) => c.propertyId) || [];
        for (const pid of current) if (!ids.includes(pid)) await api(`/api/comparisons/${id}/items/${pid}`, { method: 'DELETE' });
        for (const pid of ids) if (!current.includes(pid)) await api(`/api/comparisons/${id}/items`, { method: 'POST', body: { propertyId: pid } });
      }
      const r = await api(`/api/comparisons/${id}`);
      setComputed(r);
    } catch (err) {
      showToast('Could not update comparison', err.message);
    } finally {
      setBusy(false);
    }
  }, [comparisonId, computed, showToast]);

  // ?add=<propertyId> from Discover / Analyse
  const addParam = params.get('add');
  useEffect(() => {
    if (!addParam || !comparisons.data || busy) return;
    if (comparisonId && !computed) return;
    const a = leftId && leftId !== addParam ? leftId : addParam;
    const b = a === addParam ? (rightId && rightId !== addParam ? rightId : '') : addParam;
    setParams({});
    setPair(a, b, params.get('brief') || briefId);
  }, [addParam, comparisons.data, comparisonId, computed, busy, leftId, rightId, briefId, params, setParams, setPair]);

  const view = useMemo(() => {
    const m = new Map();
    for (const c of computed?.columns || []) m.set(c.propertyId, columnToView(c, computed.comparison.briefName, computed.comparison.objective));
    return m;
  }, [computed]);
  const left = view.get(leftId) || null;
  const right = view.get(rightId) || null;
  const same = left && right && left.id === right.id;
  const allOptions = useMemo(() => {
    const extra = [...view.values()].filter((v) => !options.some((o) => o.id === v.id)).map((v) => ({ id: v.id, name: v.name, price: v.price }));
    return [...options, ...extra];
  }, [options, view]);

  const deltas = useMemo(() => {
    if (!left || !right || same) return null;
    return {
      score: (left.score || 0) - (right.score || 0),
      yield: left.yieldPct != null && right.yieldPct != null ? left.yieldPct - right.yieldPct : null,
      price: left.price != null && right.price != null ? left.price - right.price : null,
    };
  }, [left, right, same]);

  const verdict = useMemo(() => {
    if (!left || !right) return null;
    if (same) return { tone: 'warn', text: 'Pick two different properties to compare.' };
    const aWins = [];
    const bWins = [];
    if (deltas.score >= 3) aWins.push('strategy match');
    if (deltas.score <= -3) bWins.push('strategy match');
    if (deltas.yield != null && deltas.yield >= 0.3) aWins.push('yield');
    if (deltas.yield != null && deltas.yield <= -0.3) bWins.push('yield');
    if (left.cashFlow != null && right.cashFlow != null) {
      if (left.cashFlow > right.cashFlow + 25) aWins.push('cash flow');
      if (right.cashFlow > left.cashFlow + 25) bWins.push('cash flow');
    }
    const caveat = Math.min(left.confidence, right.confidence) < 60 ? ' Some figures rest on incomplete data — check the missing-information counts below.' : '';
    if (!aWins.length && !bWins.length) return { tone: 'neutral', text: `Closely matched — dig into condition, tenure and street-level comparables.${caveat}` };
    if (aWins.length > bWins.length) return { tone: 'a', text: `Property A leads on ${aWins.join(', ')}.${caveat}` };
    if (bWins.length > aWins.length) return { tone: 'b', text: `Property B leads on ${bWins.join(', ')}.${caveat}` };
    return { tone: 'neutral', text: `Split decision — A stronger on ${aWins.join(', ')}; B on ${bWins.join(', ')}.${caveat}` };
  }, [left, right, same, deltas]);

  const swap = () => setPair(rightId, leftId, briefId);

  if (!saved.loading && !analyses.loading && allOptions.length < 1) {
    return (
      <AppPage eyebrow="Decision desk" title="Compare" subtitle="Put two properties side by side under the same strategy and assumptions." art={<IlluCompare className="app-illu app-illu--header" />}>
        <AppEmpty art={<IlluCompare className="app-illu app-illu--empty" />} title="Nothing to compare yet" description="Save or analyse a couple of properties first — they’ll appear here for a side-by-side." actionTo="/discover" actionLabel="Discover properties" />
      </AppPage>
    );
  }

  return (
    <AppPage
      eyebrow="Decision desk"
      title="Compare"
      subtitle="Both properties are evaluated with the same brief and the same financing assumptions. Valora highlights the better figure on each line — then you decide."
      art={<IlluCompare className="app-illu app-illu--header" />}
      actions={(
        <>
          <select className="app-search-input" style={{ minHeight: 'auto', maxWidth: 260 }} value={briefId} aria-label="Strategy for comparison" onChange={(e) => { setBriefId(e.target.value); setPair(leftId, rightId, e.target.value); }}>
            <option value="">General screening</option>
            {(briefs.data?.briefs || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button type="button" className="app-btn app-btn--ghost" onClick={swap} disabled={!leftId || !rightId || busy}>Swap A ↔ B</button>
          <Link to="/analyse" viewTransition className="app-btn app-btn--primary">Analyse another</Link>
        </>
      )}
    >
      <div className="cmp">
        {busy && <div className="notice-banner" role="status">Calculating with shared assumptions…</div>}
        {deltas && !same && (
          <div className="app-stat-grid">
            <AppStat accent={deltas.score >= 0 ? 'green' : 'amber'} label="Match gap" value={`${deltas.score > 0 ? '+' : ''}${deltas.score}`} hint={deltas.score === 0 ? 'Tied' : deltas.score > 0 ? 'A ahead' : 'B ahead'} icon="◎" />
            <AppStat accent="teal" label="Yield gap" value={deltas.yield == null ? '—' : `${deltas.yield > 0 ? '+' : ''}${deltas.yield.toFixed(1)}%`} hint={deltas.yield == null ? 'Needs rental evidence' : deltas.yield > 0 ? 'A ahead' : deltas.yield < 0 ? 'B ahead' : 'Tied'} icon="%" />
            <AppStat accent="blue" label="Price gap" value={deltas.price == null ? '—' : `${deltas.price > 0 ? '+' : ''}${money(deltas.price)}`} hint={deltas.price == null ? 'Price unknown' : deltas.price < 0 ? 'A cheaper' : deltas.price > 0 ? 'B cheaper' : 'Same ask'} icon="£" />
          </div>
        )}

        <div className="cmp-arena">
          <PropertySlot side="a" label="Property A" property={left} options={allOptions} value={leftId} onChange={(id) => setPair(id, rightId, briefId)} disabledIds={new Set([rightId])} onOpen={() => left && analyseProperty(left.id, briefId || null)} />
          <div className="cmp-arena-mid">
            <button type="button" className="cmp-swap" onClick={swap} aria-label="Swap properties">↔</button>
            <span className="cmp-vs">VS</span>
          </div>
          <PropertySlot side="b" label="Property B" property={right} options={allOptions} value={rightId} onChange={(id) => setPair(leftId, id, briefId)} disabledIds={new Set([leftId])} onOpen={() => right && analyseProperty(right.id, briefId || null)} />
        </div>

        {verdict && (
          <div className={`cmp-verdict cmp-verdict--${verdict.tone}`}>
            <div className="cmp-verdict-label">Verdict</div>
            <p>{verdict.text}</p>
          </div>
        )}

        <div className="app-panel">
          <div className="app-panel-head"><div className="app-panel-title">Deal quality</div></div>
          <div className="app-panel-body cmp-rows">
            <MetricRow label="Strategy match" a={left?.score} b={right?.score} hint="/100" />
            <MetricRow label="Data confidence" a={left?.confidence} b={right?.confidence} format={(v) => `${v}%`} hint="Share of criteria assessable" />
            <MetricRow label="Asking price" a={left?.price} b={right?.price} format={money} better="lower" hint="Lower entry wins" />
            <MetricRow label="Vs sold median" a={discountOf(left)} b={discountOf(right)} format={(v) => `${v > 0 ? '+' : ''}${v}%`} better="lower" hint="Land Registry" />
            <MetricRow label="Comparable median" a={left?.compMedian} b={right?.compMedian} format={money} better="none" hint="Not like-for-like across areas" />
          </div>
        </div>

        <div className="app-panel">
          <div className="app-panel-head"><div className="app-panel-title">Income &amp; cash</div></div>
          <div className="app-panel-body cmp-rows">
            <MetricRow label="Gross yield" a={yieldOf(left)} b={yieldOf(right)} format={(v) => `${v}%`} />
            <MetricRow label="Net yield" a={left?.netYieldPct} b={right?.netYieldPct} format={(v) => `${v}%`} />
            <MetricRow label="Rental evidence / month" a={rentOf(left)} b={rentOf(right)} format={money} hint="Asking rents" />
            <MetricRow label="Monthly cash flow" a={cashFlowOf(left)} b={cashFlowOf(right)} format={(v) => `${v > 0 ? '+' : ''}${money(v)}`} />
            <MetricRow label="Resale net profit (est.)" a={left?.flipProfit} b={right?.flipProfit} format={money} hint="Assumption-heavy" />
          </div>
        </div>

        <div className="app-panel">
          <div className="app-panel-head"><div className="app-panel-title">Property &amp; works</div></div>
          <div className="app-panel-body cmp-rows">
            <MetricRow label="Bedrooms" a={bedsOf(left)} b={bedsOf(right)} format={(v) => (v === 0 ? 'Studio' : String(v))} />
            <MetricRow label="Property type" a={left?.propertyType} b={right?.propertyType} better="none" />
            <MetricRow label="Condition signal" a={conditionOf(left)} b={conditionOf(right)} better="none" />
            <MetricRow label="Works estimate (mid)" a={worksOf(left)} b={worksOf(right)} format={money} better="lower" hint="Planning assumption" />
            <MetricRow label="Missing information" a={left?.missingCount} b={right?.missingCount} better="lower" hint="Items to check" />
          </div>
        </div>

        {(left?.risks?.length > 0 || right?.risks?.length > 0) && (
          <div className="app-panel">
            <div className="app-panel-head"><div className="app-panel-title">Main concerns</div></div>
            <div className="app-panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, fontSize: 13 }}>
              <div><strong>A</strong><ul style={{ paddingLeft: 18 }}>{(left?.risks || []).map((r) => <li key={r}>{r}</li>)}{!left?.risks?.length && <li>None flagged</li>}</ul></div>
              <div><strong>B</strong><ul style={{ paddingLeft: 18 }}>{(right?.risks || []).map((r) => <li key={r}>{r}</li>)}{!right?.risks?.length && <li>None flagged</li>}</ul></div>
            </div>
          </div>
        )}

        {computed && (
          <p className="cmp-hint">
            Shared assumptions: deposit {computed.assumptions.inputs.depositPct}% · rate {computed.assumptions.inputs.interestRatePct}% · {computed.assumptions.inputs.interestOnly ? 'interest-only' : 'repayment'} · change them in <Link to="/settings">Settings</Link>.
          </p>
        )}
        {allOptions.length === 1 && (
          <p className="cmp-hint">Only one property available — <button type="button" className="app-btn app-btn--ghost" onClick={() => navigate('/discover')}>discover more</button> to compare.</p>
        )}
      </div>
    </AppPage>
  );
}
