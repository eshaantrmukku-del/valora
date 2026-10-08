import { useEffect, useState } from 'react';
import { OBJECTIVES, OBJECTIVE_LABELS, PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from '../../../../shared/brief';

const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[£,\s%]/g, ''));
  return Number.isFinite(n) ? n : null;
};

export function prefsToForm(p) {
  return {
    locations: (p.locations || []).join(', '),
    budgetMin: p.budgetMin ?? '',
    budgetMax: p.budgetMax ?? '',
    propertyTypes: p.propertyTypes || [],
    objective: p.objective || '',
    renovationAppetite: p.renovationAppetite || '',
    riskTolerance: p.riskTolerance || '',
    buyerType: p.buyerType || 'additional_property',
    cashPurchase: Boolean(p.cashPurchase),
    depositPct: p.depositPct ?? '',
    interestRatePct: p.interestRatePct ?? '',
    termYears: p.termYears ?? '',
    interestOnly: p.interestOnly !== false,
    targetGrossYieldPct: p.targetGrossYieldPct ?? '',
    targetMonthlyCashFlow: p.targetMonthlyCashFlow ?? '',
    emailAlerts: Boolean(p.emailAlerts),
  };
}

export function formToPrefs(f) {
  return {
    locations: f.locations
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10),
    budgetMin: num(f.budgetMin),
    budgetMax: num(f.budgetMax),
    propertyTypes: f.propertyTypes,
    objective: f.objective || null,
    renovationAppetite: f.renovationAppetite || null,
    riskTolerance: f.riskTolerance || null,
    buyerType: f.buyerType,
    cashPurchase: f.cashPurchase,
    depositPct: num(f.depositPct),
    interestRatePct: num(f.interestRatePct),
    termYears: num(f.termYears) == null ? null : Math.round(num(f.termYears)),
    interestOnly: f.interestOnly,
    targetGrossYieldPct: num(f.targetGrossYieldPct),
    targetMonthlyCashFlow:
      num(f.targetMonthlyCashFlow) == null ? null : Math.round(num(f.targetMonthlyCashFlow)),
    emailAlerts: f.emailAlerts,
  };
}

/** Investor preferences form (all fields optional). Used by onboarding and Settings. */
export default function PreferencesForm({ initial, onSubmit, submitLabel = 'Save preferences', secondary }) {
  const [f, setF] = useState(() => prefsToForm(initial || {}));
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(prefsToForm(initial || {})), [initial]);
  const set = (k) => (e) =>
    setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleType = (t) =>
    setF((x) => ({
      ...x,
      propertyTypes: x.propertyTypes.includes(t)
        ? x.propertyTypes.filter((y) => y !== t)
        : [...x.propertyTypes, t],
    }));

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit(formToPrefs(f));
        setBusy(false);
      }}
    >
      <div className="form-grid">
        <div className="form-row">
          <label htmlFor="pf-loc">Preferred locations</label>
          <input
            id="pf-loc"
            placeholder="e.g. Manchester, Leeds, M20"
            value={f.locations}
            onChange={set('locations')}
          />
        </div>
        <div className="form-row">
          <label htmlFor="pf-obj">Main objective</label>
          <select id="pf-obj" value={f.objective} onChange={set('objective')}>
            <option value="">Not set</option>
            {OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {OBJECTIVE_LABELS[o]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="pf-bmin">Budget from (£)</label>
          <input id="pf-bmin" inputMode="numeric" value={f.budgetMin} onChange={set('budgetMin')} />
        </div>
        <div className="form-row">
          <label htmlFor="pf-bmax">Budget up to (£)</label>
          <input id="pf-bmax" inputMode="numeric" value={f.budgetMax} onChange={set('budgetMax')} />
        </div>
        <div className="form-row">
          <label htmlFor="pf-reno">Renovation appetite</label>
          <select id="pf-reno" value={f.renovationAppetite} onChange={set('renovationAppetite')}>
            <option value="">Not set</option>
            <option value="none">None</option>
            <option value="cosmetic">Cosmetic</option>
            <option value="moderate">Moderate</option>
            <option value="extensive">Extensive</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="pf-risk">Risk tolerance</label>
          <select id="pf-risk" value={f.riskTolerance} onChange={set('riskTolerance')}>
            <option value="">Not set</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <div className="form-row" style={{ marginTop: 14 }}>
        <label>Property types</label>
        <div className="chip-list">
          {PROPERTY_TYPES.filter((t) => t !== 'other').map((t) => (
            <button
              key={t}
              type="button"
              className={`app-example-chip${f.propertyTypes.includes(t) ? ' is-active' : ''}`}
              aria-pressed={f.propertyTypes.includes(t)}
              onClick={() => toggleType(t)}
            >
              {f.propertyTypes.includes(t) ? '✓ ' : ''}
              {PROPERTY_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <h3 style={{ fontSize: 14, margin: '20px 0 10px' }}>Financing assumptions</h3>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
        Used as labelled defaults in every analysis. Valora doesn’t assume you have finance approved.
      </p>
      <div className="form-grid">
        <div className="form-row">
          <label htmlFor="pf-buyer">Buyer status (for stamp duty)</label>
          <select id="pf-buyer" value={f.buyerType} onChange={set('buyerType')}>
            <option value="additional_property">Buying an additional property</option>
            <option value="first_time_buyer">First-time buyer</option>
            <option value="home_mover">Replacing my main home</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="pf-fin">Financing</label>
          <select
            id="pf-fin"
            value={f.cashPurchase ? 'cash' : f.interestOnly ? 'io' : 'repay'}
            onChange={(e) =>
              setF((x) => ({
                ...x,
                cashPurchase: e.target.value === 'cash',
                interestOnly: e.target.value !== 'repay',
              }))
            }
          >
            <option value="io">Mortgage — interest only</option>
            <option value="repay">Mortgage — repayment</option>
            <option value="cash">Cash</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="pf-dep">Deposit (%)</label>
          <input
            id="pf-dep"
            inputMode="decimal"
            placeholder="Default 25"
            value={f.depositPct}
            onChange={set('depositPct')}
          />
        </div>
        <div className="form-row">
          <label htmlFor="pf-rate">Interest rate (%)</label>
          <input
            id="pf-rate"
            inputMode="decimal"
            placeholder="Default 5.5"
            value={f.interestRatePct}
            onChange={set('interestRatePct')}
          />
        </div>
        <div className="form-row">
          <label htmlFor="pf-term">Term (years)</label>
          <input
            id="pf-term"
            inputMode="numeric"
            placeholder="Default 25"
            value={f.termYears}
            onChange={set('termYears')}
          />
        </div>
        <div className="form-row">
          <label htmlFor="pf-yield">Target gross yield (%)</label>
          <input
            id="pf-yield"
            inputMode="decimal"
            value={f.targetGrossYieldPct}
            onChange={set('targetGrossYieldPct')}
          />
        </div>
        <div className="form-row">
          <label htmlFor="pf-cf">Target cash flow (£/month)</label>
          <input
            id="pf-cf"
            inputMode="numeric"
            value={f.targetMonthlyCashFlow}
            onChange={set('targetMonthlyCashFlow')}
          />
        </div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, fontSize: 13 }}>
        <input type="checkbox" checked={f.emailAlerts} onChange={set('emailAlerts')} /> Email me monitoring
        alerts (when email delivery is configured)
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="submit" className="app-btn app-btn--primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {secondary}
      </div>
    </form>
  );
}
