import { useEffect, useState } from 'react';
import { DEAL_INPUT_LABELS } from '../../../../shared/finance/deal';
import { gbp, pct } from '../../lib/api';

const FIELDS = [
  ['purchasePrice', '£'],
  ['depositPct', '%'],
  ['interestRatePct', '%'],
  ['termYears', 'yrs'],
  ['lenderFees', '£'],
  ['legalFees', '£'],
  ['surveyFees', '£'],
  ['transactionTaxOverride', '£'],
  ['monthlyRent', '£'],
  ['vacancyPct', '%'],
  ['managementPct', '%'],
  ['maintenancePct', '%'],
  ['insuranceAnnual', '£'],
  ['serviceChargeAnnual', '£'],
  ['groundRentAnnual', '£'],
  ['otherOperatingAnnual', '£'],
  ['refurbCostLow', '£'],
  ['refurbCostHigh', '£'],
  ['refurbContingencyPct', '%'],
  ['resaleValue', '£'],
  ['sellingAgentPct', '%'],
  ['sellingLegalFees', '£'],
  ['holdingMonths', 'mo'],
  ['holdingCostsMonthly', '£'],
];

const PROV_LABEL = {
  user: 'Your input',
  source: 'Source data',
  default: 'Default assumption',
  derived: 'Derived',
};

function Prov({ p }) {
  if (!p) return <span className="prov-tag">Unknown</span>;
  return <span className={`prov-tag prov-tag--${p}`}>{PROV_LABEL[p] || p}</span>;
}

export default function AssumptionsPanel({ analysis, property, onRecalculate }) {
  const [draft, setDraft] = useState({});
  const [flags, setFlags] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = {};
    for (const [k] of FIELDS) d[k] = analysis.inputs[k] == null ? '' : String(analysis.inputs[k]);
    setDraft(d);
    setFlags({
      cashPurchase: analysis.inputs.cashPurchase,
      interestOnly: analysis.inputs.interestOnly,
      buyerType: analysis.inputs.buyerType,
      jurisdiction: analysis.inputs.jurisdiction || '',
    });
  }, [analysis]);

  const changed = FIELDS.filter(
    ([k]) => draft[k] !== (analysis.inputs[k] == null ? '' : String(analysis.inputs[k])),
  ).map(([k]) => k);
  const flagChanged = ['cashPurchase', 'interestOnly', 'buyerType'].filter(
    (k) => flags[k] !== analysis.inputs[k],
  );
  if ((flags.jurisdiction || null) !== (analysis.inputs.jurisdiction || null))
    flagChanged.push('jurisdiction');

  const submit = async (e) => {
    e.preventDefault();
    const inputs = { ...analysis.inputs };
    const provenance = {};
    for (const k of changed) {
      const raw = draft[k].replace(/[£,\s%]/g, '');
      inputs[k] = raw === '' ? null : Number(raw);
      provenance[k] = 'user';
    }
    for (const k of flagChanged) {
      inputs[k] = k === 'jurisdiction' ? flags[k] || null : flags[k];
      provenance[k] = 'user';
    }
    setBusy(true);
    await onRecalculate(inputs, provenance);
    setBusy(false);
  };

  const fin = analysis.report.deterministic.financials;

  return (
    <>
      <div className="app-panel" style={{ marginTop: 16 }}>
        <div className="app-panel-head">
          <div className="app-panel-title">Assumptions</div>
          <span className="panel-badge">Editable · every value labelled</span>
        </div>
        <form className="app-panel-body" onSubmit={submit}>
          <div className="brief-grid" style={{ marginBottom: 12 }}>
            <div className="brief-field">
              <label htmlFor="as-buyer">Buyer status</label>
              <select
                id="as-buyer"
                value={flags.buyerType || ''}
                onChange={(e) => setFlags((f) => ({ ...f, buyerType: e.target.value }))}
              >
                <option value="additional_property">Additional property</option>
                <option value="first_time_buyer">First-time buyer</option>
                <option value="home_mover">Replacing main home</option>
              </select>
            </div>
            <div className="brief-field">
              <label htmlFor="as-jur">UK nation (tax)</label>
              <select
                id="as-jur"
                value={flags.jurisdiction || ''}
                onChange={(e) => setFlags((f) => ({ ...f, jurisdiction: e.target.value }))}
              >
                <option value="">Unknown</option>
                <option value="england">England</option>
                <option value="northern_ireland">Northern Ireland</option>
                <option value="scotland">Scotland</option>
                <option value="wales">Wales</option>
              </select>
            </div>
            <div className="brief-field">
              <label htmlFor="as-cash">Financing</label>
              <select
                id="as-cash"
                value={flags.cashPurchase ? 'cash' : flags.interestOnly ? 'io' : 'repay'}
                onChange={(e) =>
                  setFlags((f) => ({
                    ...f,
                    cashPurchase: e.target.value === 'cash',
                    interestOnly: e.target.value !== 'repay',
                  }))
                }
              >
                <option value="io">Mortgage — interest only</option>
                <option value="repay">Mortgage — repayment</option>
                <option value="cash">Cash purchase</option>
              </select>
            </div>
          </div>
          <div className="table-scroll">
            <table className="assumption-table">
              <thead>
                <tr>
                  <th>Input</th>
                  <th>Value</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(([k, unit]) => (
                  <tr key={k}>
                    <td>
                      <label htmlFor={`as-${k}`}>{DEAL_INPUT_LABELS[k]}</label>
                    </td>
                    <td>
                      <input
                        id={`as-${k}`}
                        inputMode="decimal"
                        value={draft[k] ?? ''}
                        placeholder="unknown"
                        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                      />{' '}
                      <span style={{ color: 'var(--muted)' }}>{unit}</span>
                    </td>
                    <td>
                      {changed.includes(k) ? (
                        <span className="prov-tag prov-tag--user">Edited</span>
                      ) : (
                        <Prov p={analysis.inputProvenance[k]} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="submit"
              className="app-btn app-btn--primary"
              disabled={busy || (!changed.length && !flagChanged.length)}
            >
              {busy ? 'Recalculating…' : 'Recalculate'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Leave a field empty if it’s unknown — Valora won’t treat it as zero.
            </span>
          </div>
          {fin.warnings.length > 0 && (
            <ul style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)', paddingLeft: 18 }}>
              {fin.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {fin.acquisition?.transactionTaxDetail && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              {fin.acquisition.transactionTaxDetail.notes[0]}{' '}
              <a
                href={fin.acquisition.transactionTaxDetail.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Rates source
              </a>
            </p>
          )}
        </form>
      </div>

      <div className="app-panel" style={{ marginTop: 16 }}>
        <div className="app-panel-head">
          <div className="app-panel-title">Scenarios &amp; sensitivity</div>
          <span className="panel-badge">Deterministic</span>
        </div>
        <div className="app-panel-body">
          <div className="table-scroll">
            <table className="assumption-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Cash flow / mo</th>
                  <th>Gross yield</th>
                  <th>Net yield</th>
                  <th>Resale net profit</th>
                  <th>Adjustments</th>
                </tr>
              </thead>
              <tbody>
                {property.scenarios.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.label}</strong>
                    </td>
                    <td>{gbp(s.monthlyCashFlow)}</td>
                    <td>{pct(s.grossYieldPct)}</td>
                    <td>{pct(s.netYieldPct)}</td>
                    <td>{gbp(s.flipNetProfit)}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{s.adjustments.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-scroll" style={{ marginTop: 14 }}>
            <table className="assumption-table">
              <thead>
                <tr>
                  <th>Sensitivity</th>
                  <th>Cash flow / mo</th>
                  <th>Resale net profit</th>
                </tr>
              </thead>
              <tbody>
                {property.sensitivity.map((s) => (
                  <tr key={s.label}>
                    <td>{s.label}</td>
                    <td>{gbp(s.monthlyCashFlow)}</td>
                    <td>{gbp(s.flipNetProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {property.missingInputs.length > 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>
              Some figures can’t be calculated until you add:{' '}
              {property.missingInputs.map((k) => DEAL_INPUT_LABELS[k] || k).join(', ')}.
            </p>
          )}
        </div>
      </div>

      <div
        className="pros-cons-grid"
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <div className="app-panel">
          <div className="app-panel-head">
            <div className="app-panel-title">Missing information</div>
          </div>
          <div className="app-panel-body">
            {property.missing.length ? (
              <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, display: 'grid', gap: 4 }}>
                {property.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 13 }}>All assessed criteria had data.</p>
            )}
          </div>
        </div>
        <div className="app-panel">
          <div className="app-panel-head">
            <div className="app-panel-title">Suggested due diligence</div>
          </div>
          <div className="app-panel-body">
            <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, display: 'grid', gap: 4 }}>
              {property.dueDiligence.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>
              Research support only — not financial, legal or tax advice.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
