import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppPage, { AppEmpty, AppStat } from '../components/AppPage';
import { IlluCompare } from '../components/AppIllustrations';
import { getAllStoredProperties, getProperty } from '../data/properties';
import { getRecent } from '../lib/storage';
import { useStore } from '../hooks/useStore';

function bedsOf(p) {
  if (!p) return null;
  if (p.beds != null) return p.beds;
  const tag = (p.tags || []).find((t) => /\d+\s*bed|studio/i.test(t));
  if (!tag) return null;
  if (/studio/i.test(tag)) return 0;
  const m = tag.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function rentOf(p) {
  if (!p) return null;
  return p.deal?.monthlyRent ?? p.listedRent ?? p.rental?.expected ?? p.rental?.monthlyRent ?? null;
}

function yieldOf(p) {
  if (!p) return null;
  const y = p.deal?.grossYield ?? parseFloat(p.rental?.grossYield);
  return Number.isFinite(Number(y)) ? Number(y) : null;
}

function cashFlowOf(p) {
  const cf = p?.deal?.monthlyCashFlow;
  return cf == null ? null : Number(cf);
}

function discountOf(p) {
  const d = p?.comparables?.deviationPct;
  return d == null ? null : Number(d);
}

function conditionOf(p) {
  return p?.condition?.overall || null;
}

function worksOf(p) {
  if (p?.flip?.works != null) return Number(p.flip.works);
  if (p?.condition?.refurbHigh) {
    return Math.round(((p.condition.refurbLow || 0) + p.condition.refurbHigh) / 2);
  }
  return null;
}

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 10_000) return `£${Math.round(v / 1000)}k`;
  return `£${Math.round(v).toLocaleString()}`;
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
  const beds = bedsOf(p);
  const bedBit = beds == null ? '' : beds === 0 ? ' · Studio' : ` · ${beds} bed`;
  const priceBit = p.price != null ? ` · £${Number(p.price).toLocaleString()}` : '';
  return `${p.name || 'Property'}${bedBit}${priceBit} · ${p.location || 'UK'}`;
}

function PropertySlot({ side, label, property, options, value, onChange, onOpen, disabledIds }) {
  const beds = bedsOf(property);
  const y = yieldOf(property);
  const isBmv = property?.comparables?.undervalued === 'strong'
    || property?.comparables?.undervalued === 'possible';

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
        <span className="cmp-slot-picker-label">Choose analysis</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
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
          <div className="cmp-slot-flag">Below sold median (Land Registry)</div>
        )}
        {conditionOf(property) && conditionOf(property) !== 'Unknown' && (
          <div className="cmp-slot-flag cmp-slot-flag--soft">
            Condition: {conditionOf(property)}
          </div>
        )}
      </div>

      <button type="button" className="app-btn app-btn--ghost cmp-slot-open" onClick={onOpen} disabled={!property}>
        Open full report
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
  useStore();
  const navigate = useNavigate();
  const recent = getRecent();
  const all = getAllStoredProperties();
  const options = all.length ? all : recent.map((r) => getProperty(r.id)).filter(Boolean);

  const [leftId, setLeftId] = useState(options[0]?.id || '');
  const [rightId, setRightId] = useState(options[1]?.id || options[0]?.id || '');

  useEffect(() => {
    const ids = new Set(options.map((p) => p.id));
    if (leftId && !ids.has(leftId)) setLeftId(options[0]?.id || '');
    if (rightId && !ids.has(rightId)) setRightId(options[1]?.id || options[0]?.id || '');
  }, [options, leftId, rightId]);

  const left = useMemo(() => getProperty(leftId), [leftId, options.length]);
  const right = useMemo(() => getProperty(rightId), [rightId, options.length]);
  const same = left && right && left.id === right.id;

  const deltas = useMemo(() => {
    if (!left || !right || same) return null;
    return {
      score: (left.score || 0) - (right.score || 0),
      yield: (yieldOf(left) || 0) - (yieldOf(right) || 0),
      price: (left.price || 0) - (right.price || 0),
      cash: (cashFlowOf(left) || 0) - (cashFlowOf(right) || 0),
    };
  }, [left, right, same]);

  const verdict = useMemo(() => {
    if (!left || !right) return null;
    if (same) return { tone: 'warn', text: 'Pick two different analyses to compare.' };
    const scoreDelta = deltas.score;
    const yieldDelta = deltas.yield;
    const aWins = [];
    const bWins = [];
    if (scoreDelta >= 3) aWins.push('score');
    if (scoreDelta <= -3) bWins.push('score');
    if (yieldDelta >= 0.3) aWins.push('yield');
    if (yieldDelta <= -0.3) bWins.push('yield');
    if (left.price != null && right.price != null) {
      if (left.price < right.price * 0.97) aWins.push('entry price');
      if (right.price < left.price * 0.97) bWins.push('entry price');
    }
    const aCf = cashFlowOf(left);
    const bCf = cashFlowOf(right);
    if (aCf != null && bCf != null) {
      if (aCf > bCf + 25) aWins.push('cash flow');
      if (bCf > aCf + 25) bWins.push('cash flow');
    }

    if (!aWins.length && !bWins.length) {
      return { tone: 'neutral', text: 'Closely matched — dig into condition, tenure, and street-level comps.' };
    }
    if (aWins.length > bWins.length) {
      return { tone: 'a', text: `Property A leads on ${aWins.join(', ')}.` };
    }
    if (bWins.length > aWins.length) {
      return { tone: 'b', text: `Property B leads on ${bWins.join(', ')}.` };
    }
    return { tone: 'neutral', text: `Split decision — A stronger on ${aWins.join(', ') || '—'}; B on ${bWins.join(', ') || '—'}.` };
  }, [left, right, same, deltas]);

  const swap = () => {
    setLeftId(rightId);
    setRightId(leftId);
  };

  if (options.length < 1) {
    return (
      <AppPage
        eyebrow="Decision desk"
        title="Compare"
        subtitle="Put two analyses side by side and see which metrics actually win."
        art={<IlluCompare className="app-illu app-illu--header" />}
      >
        <AppEmpty
          art={<IlluCompare className="app-illu app-illu--empty" />}
          title="Nothing to compare yet"
          description="Analyse a couple of listings first — they’ll appear here for a clean side-by-side."
          actionTo="/analyse"
          actionLabel="Analyse a listing"
        />
      </AppPage>
    );
  }

  return (
    <AppPage
      eyebrow="Decision desk"
      title="Compare"
      subtitle="Pick two analyses. Valora highlights the better figure on each line — then you decide."
      art={<IlluCompare className="app-illu app-illu--header" />}
      actions={(
        <>
          <button type="button" className="app-btn app-btn--ghost" onClick={swap} disabled={!leftId || !rightId}>
            Swap A ↔ B
          </button>
          <Link to="/analyse" viewTransition className="app-btn app-btn--primary">Analyse another</Link>
        </>
      )}
    >
      <div className="cmp">
        {deltas && !same && (
          <div className="app-stat-grid">
            <AppStat
              accent={deltas.score >= 0 ? 'green' : 'amber'}
              label="Score gap"
              value={`${deltas.score > 0 ? '+' : ''}${deltas.score}`}
              hint={deltas.score === 0 ? 'Tied' : deltas.score > 0 ? 'A ahead' : 'B ahead'}
              icon="◎"
            />
            <AppStat
              accent={deltas.yield >= 0 ? 'teal' : 'amber'}
              label="Yield gap"
              value={`${deltas.yield > 0 ? '+' : ''}${deltas.yield.toFixed(1)}%`}
              hint={deltas.yield === 0 ? 'Tied' : deltas.yield > 0 ? 'A ahead' : 'B ahead'}
              icon="%"
            />
            <AppStat
              accent="blue"
              label="Price gap"
              value={`${deltas.price > 0 ? '+' : ''}${money(deltas.price)}`}
              hint={deltas.price === 0 ? 'Same ask' : deltas.price < 0 ? 'A cheaper' : 'B cheaper'}
              icon="£"
            />
          </div>
        )}

        <div className="cmp-arena">
          <PropertySlot
            side="a"
            label="Property A"
            property={left}
            options={options}
            value={leftId}
            onChange={setLeftId}
            disabledIds={new Set([rightId])}
            onOpen={() => left && navigate(`/analyse/${left.id}`, { viewTransition: true })}
          />
          <div className="cmp-arena-mid">
            <button type="button" className="cmp-swap" onClick={swap} aria-label="Swap properties">
              ↔
            </button>
            <span className="cmp-vs">VS</span>
          </div>
          <PropertySlot
            side="b"
            label="Property B"
            property={right}
            options={options}
            value={rightId}
            onChange={setRightId}
            disabledIds={new Set([leftId])}
            onOpen={() => right && navigate(`/analyse/${right.id}`, { viewTransition: true })}
          />
        </div>

        {verdict && (
          <div className={`cmp-verdict cmp-verdict--${verdict.tone}`}>
            <div className="cmp-verdict-label">Verdict</div>
            <p>{verdict.text}</p>
          </div>
        )}

        <div className="app-panel">
          <div className="app-panel-head">
            <div className="app-panel-title">Deal quality</div>
          </div>
          <div className="app-panel-body cmp-rows">
            <MetricRow label="Investment score" a={left?.score} b={right?.score} hint="/100" />
            <MetricRow
              label="Asking price"
              a={left?.price}
              b={right?.price}
              format={money}
              better="lower"
              hint="Lower entry wins"
            />
            <MetricRow
              label="Vs sold median"
              a={discountOf(left)}
              b={discountOf(right)}
              format={(v) => `${v > 0 ? '+' : ''}${v}%`}
              better="lower"
              hint="Land Registry"
            />
            <MetricRow
              label="Est. market value"
              a={left?.marketValue}
              b={right?.marketValue}
              format={money}
              better="none"
            />
          </div>
        </div>

        <div className="app-panel">
          <div className="app-panel-head">
            <div className="app-panel-title">Income & cash</div>
          </div>
          <div className="app-panel-body cmp-rows">
            <MetricRow
              label="Gross yield"
              a={yieldOf(left)}
              b={yieldOf(right)}
              format={(v) => `${v}%`}
            />
            <MetricRow
              label="Est. rent / month"
              a={rentOf(left)}
              b={rentOf(right)}
              format={money}
            />
            <MetricRow
              label="Monthly cash flow"
              a={cashFlowOf(left)}
              b={cashFlowOf(right)}
              format={(v) => `${v > 0 ? '+' : ''}${money(v)}`}
            />
          </div>
        </div>

        <div className="app-panel">
          <div className="app-panel-head">
            <div className="app-panel-title">Property & works</div>
          </div>
          <div className="app-panel-body cmp-rows">
            <MetricRow
              label="Bedrooms"
              a={bedsOf(left)}
              b={bedsOf(right)}
              format={(v) => (v === 0 ? 'Studio' : String(v))}
            />
            <MetricRow
              label="Property type"
              a={left?.propertyType}
              b={right?.propertyType}
              format={(v) => (v ? String(v).charAt(0).toUpperCase() + String(v).slice(1) : v)}
              better="none"
            />
            <MetricRow
              label="Condition"
              a={conditionOf(left)}
              b={conditionOf(right)}
              better="none"
            />
            <MetricRow
              label="Works estimate"
              a={worksOf(left)}
              b={worksOf(right)}
              format={money}
              better="lower"
              hint="Where priced"
            />
            <MetricRow
              label="Strategy"
              a={left?.strategy}
              b={right?.strategy}
              better="none"
            />
          </div>
        </div>

        {options.length === 1 && (
          <p className="cmp-hint">
            Only one analysis saved — <Link to="/analyse" viewTransition>analyse another listing</Link> to unlock a real comparison.
          </p>
        )}
      </div>
    </AppPage>
  );
}
