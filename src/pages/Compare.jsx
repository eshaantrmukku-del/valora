import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppPage, { AppEmpty } from '../components/AppPage';
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
  return p.listedRent ?? p.rental?.expected ?? p.rental?.monthlyRent ?? null;
}

function yieldOf(p) {
  if (!p) return null;
  const y = parseFloat(p.rental?.grossYield);
  return Number.isFinite(y) ? y : null;
}

function scoreTone(score) {
  if (score == null) return 'mid';
  if (score >= 80) return 'high';
  if (score >= 65) return 'mid';
  return 'low';
}

function MetricRow({ icon, label, a, b, format = (v) => v, better = 'higher', tieLabel = 'Even' }) {
  const av = a ?? null;
  const bv = b ?? null;
  let winner = null;
  if (av != null && bv != null && av !== bv && typeof av === 'number' && typeof bv === 'number') {
    winner = better === 'higher'
      ? (av > bv ? 'a' : 'b')
      : (av < bv ? 'a' : 'b');
  }

  const render = (side, value) => {
    const isWin = winner === side;
    const isTie = winner == null && av != null && bv != null;
    return (
      <div className={`cmp2-val${isWin ? ' cmp2-val--win' : ''}${isTie ? ' cmp2-val--tie' : ''}`}>
        <span className="cmp2-val-num">{value == null ? '—' : format(value)}</span>
        {isWin && <span className="cmp2-badge">Wins</span>}
        {isTie && <span className="cmp2-badge cmp2-badge--tie">{tieLabel}</span>}
      </div>
    );
  };

  return (
    <div className="cmp2-metric">
      <div className="cmp2-metric-label">
        <span className="cmp2-metric-icon" aria-hidden="true">{icon}</span>
        {label}
      </div>
      <div className="cmp2-metric-vals">
        {render('a', av)}
        <span className="cmp2-metric-vs">vs</span>
        {render('b', bv)}
      </div>
    </div>
  );
}

function PropertyPick({ side, property, options, value, onChange, onOpen }) {
  const beds = bedsOf(property);
  const rent = rentOf(property);
  return (
    <article className={`cmp2-card cmp2-card--${side}`}>
      <div className="cmp2-card-top">
        <div className="cmp2-card-media">
          {property?.image ? (
            <img src={property.image} alt="" />
          ) : (
            <span className="cmp2-card-emoji">{property?.emoji || '🏠'}</span>
          )}
        </div>
        <div className={`cmp2-score cmp2-score--${scoreTone(property?.score)}`}>
          <div className="cmp2-score-num">{property?.score ?? '—'}</div>
          <div className="cmp2-score-label">{property?.grade || 'Score'}</div>
        </div>
      </div>

      <label className="cmp2-picker">
        <span>Property {side === 'a' ? 'A' : 'B'}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.location}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="cmp2-card-body" onClick={onOpen}>
        <h3 className="cmp2-card-name">{property?.name || 'Select a property'}</h3>
        <p className="cmp2-card-meta">
          {[property?.location, property?.postcode, property?.propertyType].filter(Boolean).join(' · ') || '—'}
        </p>
        <div className="cmp2-chip-row">
          {property?.price != null && (
            <span className="cmp2-chip cmp2-chip--price">£{property.price.toLocaleString()}</span>
          )}
          {beds != null && (
            <span className="cmp2-chip">{beds === 0 ? 'Studio' : `${beds} bed`}</span>
          )}
          {property?.strategy && <span className="cmp2-chip">{property.strategy}</span>}
          {yieldOf(property) != null && (
            <span className="cmp2-chip cmp2-chip--yield">{yieldOf(property)}% yield</span>
          )}
          {rent != null && (
            <span className="cmp2-chip">£{Number(rent).toLocaleString()} pcm</span>
          )}
        </div>
      </button>

      <button type="button" className="cmp2-open" onClick={onOpen}>
        Open full report →
      </button>
    </article>
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

  const summary = useMemo(() => {
    if (!left || !right || left.id === right.id) {
      return left?.id === right?.id
        ? 'Pick two different analyses to see a meaningful comparison.'
        : null;
    }
    const scoreDelta = (left.score || 0) - (right.score || 0);
    const yieldDelta = (yieldOf(left) || 0) - (yieldOf(right) || 0);
    if (Math.abs(scoreDelta) < 1 && Math.abs(yieldDelta) < 0.15) {
      return 'These look closely matched — check strategy fit and local risks next.';
    }
    if (scoreDelta >= 3 || (scoreDelta >= 0 && yieldDelta > 0.2)) {
      return `Edge to Property A on ${scoreDelta >= 3 ? 'score' : 'yield'}${yieldDelta > 0.2 && scoreDelta >= 3 ? ' and yield' : ''}.`;
    }
    if (scoreDelta <= -3 || (scoreDelta <= 0 && yieldDelta < -0.2)) {
      return `Edge to Property B on ${scoreDelta <= -3 ? 'score' : 'yield'}${yieldDelta < -0.2 && scoreDelta <= -3 ? ' and yield' : ''}.`;
    }
    return 'Mixed signals — weigh yield against entry price and strategy.';
  }, [left, right]);

  if (options.length < 1) {
    return (
      <AppPage
        eyebrow="Side by side"
        title="Compare"
        subtitle="Put two analyses side by side to decide faster."
        art={<IlluCompare className="app-illu app-illu--header" />}
      >
        <AppEmpty
          art={<IlluCompare className="app-illu app-illu--empty" />}
          title="Analyse at least one listing first"
          description="Compare needs properties from your analysis history."
          actionTo="/analyse"
          actionLabel="Analyse a listing"
        />
      </AppPage>
    );
  }

  return (
    <AppPage
      eyebrow="Side by side"
      title="Compare"
      subtitle="Two colourful cards, clear winners on each metric."
      art={<IlluCompare className="app-illu app-illu--header" />}
      actions={(
        <Link to="/analyse" viewTransition className="app-btn app-btn--primary">Analyse another</Link>
      )}
    >
      <div className="cmp2">
        <div className="cmp2-grid">
          <PropertyPick
            side="a"
            property={left}
            options={options}
            value={leftId}
            onChange={setLeftId}
            onOpen={() => left && navigate(`/analyse/${left.id}`, { viewTransition: true })}
          />
          <div className="cmp2-vs-pill" aria-hidden="true">VS</div>
          <PropertyPick
            side="b"
            property={right}
            options={options}
            value={rightId}
            onChange={setRightId}
            onOpen={() => right && navigate(`/analyse/${right.id}`, { viewTransition: true })}
          />
        </div>

        {summary && (
          <div className="cmp2-summary">
            <span className="cmp2-summary-icon" aria-hidden="true">✦</span>
            {summary}
          </div>
        )}

        <div className="cmp2-metrics">
          <MetricRow icon="◎" label="Investment score" a={left?.score} b={right?.score} />
          <MetricRow
            icon="%"
            label="Gross yield"
            a={yieldOf(left)}
            b={yieldOf(right)}
            format={(v) => `${v}%`}
          />
          <MetricRow
            icon="£"
            label="Asking price"
            a={left?.price}
            b={right?.price}
            format={(v) => `£${Number(v).toLocaleString()}`}
            better="lower"
          />
          <MetricRow
            icon="⌂"
            label="Bedrooms"
            a={bedsOf(left)}
            b={bedsOf(right)}
            format={(v) => (v === 0 ? 'Studio' : `${v}`)}
          />
          <MetricRow
            icon="▤"
            label="Est. rent / month"
            a={rentOf(left)}
            b={rentOf(right)}
            format={(v) => `£${Number(v).toLocaleString()}`}
          />
          <MetricRow
            icon="◆"
            label="Est. market value"
            a={left?.marketValue}
            b={right?.marketValue}
            format={(v) => `£${Number(v).toLocaleString()}`}
          />
          <MetricRow
            icon="⚑"
            label="Strategy"
            a={left?.strategy}
            b={right?.strategy}
            format={(v) => v}
            better="none"
          />
          <MetricRow
            icon="▦"
            label="Property type"
            a={left?.propertyType}
            b={right?.propertyType}
            format={(v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v)}
            better="none"
          />
        </div>
      </div>
    </AppPage>
  );
}
