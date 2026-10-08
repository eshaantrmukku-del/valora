import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import AppPage, { AppCard, AppEmpty, AppStat } from '../components/AppPage';
import { IlluPortfolio } from '../components/AppIllustrations';
import { PROPERTY_TYPE_LABELS } from '../../../shared/brief';
import { useApi } from '../hooks/useApi';
import { useApp } from '../context/AppContext';
import { api, emitStoreChange, gbp, pct } from '../lib/api';

const STATUSES = [
  { id: 'all', label: 'All' },
  { id: 'watching', label: 'Watching' },
  { id: 'offer', label: 'Offer' },
  { id: 'owned', label: 'Owned' },
  { id: 'passed', label: 'Passed' },
];

const EMPTY_ASSET = {
  label: '',
  address: '',
  postcode: '',
  purchasePrice: '',
  purchaseDate: '',
  ownershipPct: '100',
  mortgageBalance: '',
  interestRatePct: '',
  interestOnly: true,
  monthlyMortgagePayment: '',
  monthlyRent: '',
  monthlyOperatingCosts: '',
  currentValuation: '',
  valuationSource: '',
  valuationDate: '',
  notes: '',
};

const VALUATION_SOURCES = [
  ['', 'No valuation'],
  ['surveyor', 'Surveyor / RICS valuation'],
  ['agent_estimate', 'Estate agent estimate'],
  ['automated_estimate', 'Automated estimate'],
  ['own_estimate', 'My own estimate'],
  ['purchase_price', 'Purchase price'],
];

const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/[£,\s%]/g, ''));
  return Number.isFinite(n) ? n : null;
};

function AssetForm({ initial, onCancel, onSaved }) {
  const { showToast } = useApp();
  const [f, setF] = useState(() => {
    if (!initial) return EMPTY_ASSET;
    const o = { ...EMPTY_ASSET };
    for (const k of Object.keys(EMPTY_ASSET))
      o[k] =
        initial[k] == null
          ? k === 'interestOnly'
            ? true
            : ''
          : typeof initial[k] === 'boolean'
            ? initial[k]
            : String(initial[k]);
    return o;
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) =>
    setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      label: f.label.trim(),
      address: f.address.trim() || null,
      postcode: f.postcode.trim() || null,
      purchasePrice: num(f.purchasePrice),
      purchaseDate: f.purchaseDate || null,
      ownershipPct: num(f.ownershipPct) ?? 100,
      mortgageBalance: num(f.mortgageBalance),
      interestRatePct: num(f.interestRatePct),
      interestOnly: f.interestOnly,
      monthlyMortgagePayment: num(f.monthlyMortgagePayment),
      monthlyRent: num(f.monthlyRent),
      monthlyOperatingCosts: num(f.monthlyOperatingCosts),
      currentValuation: num(f.currentValuation),
      valuationSource: f.valuationSource || null,
      valuationDate: f.valuationDate || null,
      notes: f.notes.trim() || null,
    };
    setBusy(true);
    try {
      if (initial?.id) await api(`/api/portfolio/${initial.id}`, { method: 'PUT', body });
      else await api('/api/portfolio', { method: 'POST', body });
      emitStoreChange();
      onSaved();
    } catch (err) {
      const d = err.details?.[0];
      showToast('Could not save', d ? `${err.message} (${d.path}: ${d.message})` : err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (k, label, props = {}) => (
    <div className="brief-field">
      <label htmlFor={`pa-${k}`}>{label}</label>
      <input id={`pa-${k}`} value={f[k]} onChange={set(k)} {...props} />
    </div>
  );

  return (
    <form className="app-panel" style={{ marginBottom: 16 }} onSubmit={submit}>
      <div className="app-panel-head">
        <div className="app-panel-title">{initial?.id ? 'Edit owned property' : 'Add an owned property'}</div>
      </div>
      <div className="app-panel-body" style={{ display: 'grid', gap: 14 }}>
        <div className="brief-grid">
          {field('label', 'Name *', { required: true, maxLength: 120, placeholder: 'e.g. Leeds flat' })}
          {field('address', 'Address')}
          {field('postcode', 'Postcode')}
          {field('purchaseDate', 'Purchase date', { type: 'date' })}
        </div>
        <div className="brief-grid">
          {field('purchasePrice', 'Purchase price (£)', { inputMode: 'numeric' })}
          {field('ownershipPct', 'Your ownership share (%)', { inputMode: 'decimal' })}
          {field('mortgageBalance', 'Mortgage balance (£)', { inputMode: 'numeric' })}
          {field('interestRatePct', 'Mortgage rate (%)', { inputMode: 'decimal' })}
          {field('monthlyMortgagePayment', 'Mortgage payment (£/mo)', {
            inputMode: 'decimal',
            placeholder: 'Calculated if interest-only',
          })}
          <div className="brief-field">
            <label htmlFor="pa-io">Mortgage type</label>
            <select
              id="pa-io"
              value={f.interestOnly ? 'io' : 'repay'}
              onChange={(e) => setF((x) => ({ ...x, interestOnly: e.target.value === 'io' }))}
            >
              <option value="io">Interest only</option>
              <option value="repay">Repayment</option>
            </select>
          </div>
        </div>
        <div className="brief-grid">
          {field('monthlyRent', 'Rent received (£/mo)', { inputMode: 'decimal' })}
          {field('monthlyOperatingCosts', 'Operating costs (£/mo)', { inputMode: 'decimal' })}
          {field('currentValuation', 'Current valuation (£)', { inputMode: 'numeric' })}
          <div className="brief-field">
            <label htmlFor="pa-vs">Valuation source</label>
            <select id="pa-vs" value={f.valuationSource} onChange={set('valuationSource')}>
              {VALUATION_SOURCES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {field('valuationDate', 'Valuation date', { type: 'date' })}
        </div>
        <div className="brief-field">
          <label htmlFor="pa-notes">Notes</label>
          <textarea id="pa-notes" className="app-textarea" rows={3} value={f.notes} onChange={set('notes')} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="app-btn app-btn--primary" disabled={busy || !f.label.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="app-btn app-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

function OwnedPortfolio() {
  const { showToast } = useApp();
  const { data, error, loading, reload } = useApi('/api/portfolio');
  const [editing, setEditing] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [txFor, setTxFor] = useState(null);
  const [tx, setTx] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'income',
    amount: '',
    description: '',
  });
  const s = data?.summary;
  const assets = data?.assets || [];

  const del = async (id) => {
    try {
      await api(`/api/portfolio/${id}`, { method: 'DELETE' });
      emitStoreChange();
      setConfirmId(null);
    } catch (err) {
      showToast('Could not delete', err.message);
    }
  };

  const addTx = async (e) => {
    e.preventDefault();
    try {
      await api(`/api/portfolio/${txFor}/transactions`, {
        method: 'POST',
        body: {
          date: tx.date,
          type: tx.type,
          amount: num(tx.amount) ?? 0,
          description: tx.description || null,
        },
      });
      emitStoreChange();
      setTx((t) => ({ ...t, amount: '', description: '' }));
      showToast('Transaction recorded', '');
    } catch (err) {
      showToast('Could not record', err.message);
    }
  };

  return (
    <>
      {error && (
        <div className="notice-banner notice-banner--error">
          {error.message}{' '}
          <button type="button" className="app-btn app-btn--ghost" onClick={() => reload()}>
            Retry
          </button>
        </div>
      )}
      {s && assets.length > 0 && (
        <div className="app-stat-grid">
          <AppStat accent="amber" label="Properties" value={s.assetCount} icon="▤" />
          <AppStat
            accent="blue"
            label="Recorded valuation"
            value={s.totalValuation != null ? gbp(s.totalValuation) : '—'}
            hint={s.valuationCoverage}
            icon="£"
          />
          <AppStat
            accent="teal"
            label="Equity"
            value={s.equity != null ? gbp(s.equity) : '—'}
            hint={s.loanToValuePct != null ? `LTV ${pct(s.loanToValuePct)}` : 'Needs all valuations'}
            icon="◆"
          />
          <AppStat
            accent={s.monthlyNetCashFlow >= 0 ? 'green' : 'amber'}
            label="Net cash flow / mo"
            value={gbp(s.monthlyNetCashFlow)}
            hint={`Rent ${gbp(s.monthlyRent)} − costs − mortgage`}
            icon="%"
          />
        </div>
      )}
      {s?.missing?.length > 0 && (
        <div className="notice-banner notice-banner--warn">{s.missing.join(' · ')}</div>
      )}
      {s && (
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          {s.note} Last 12 months recorded: income {gbp(s.last12Months.income)}, operating costs{' '}
          {gbp(s.last12Months.operatingExpenses)}, capital spend {gbp(s.last12Months.capitalExpenditure)}.
        </p>
      )}

      {editing ? (
        <AssetForm
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      ) : (
        <button
          type="button"
          className="app-btn app-btn--primary"
          style={{ marginBottom: 16 }}
          onClick={() => setEditing('new')}
        >
          Add owned property
        </button>
      )}

      {loading && !assets.length ? null : assets.length === 0 ? (
        <AppEmpty
          art={<IlluPortfolio className="app-illu app-illu--empty" />}
          title="No owned properties recorded"
          description="Add properties you own with their purchase price, mortgage, rent and costs. Totals are calculated from what you record."
        />
      ) : (
        <div className="app-card-list">
          {assets.map((a) => (
            <AppCard
              key={a.id}
              title={a.label}
              meta={[
                a.address,
                a.postcode,
                a.purchaseDate ? `bought ${a.purchaseDate}` : null,
                a.ownershipPct !== 100 ? `${a.ownershipPct}% share` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <span className="app-chip">Paid {gbp(a.purchasePrice)}</span>
              <span className="app-chip">
                {a.currentValuation != null
                  ? `Valued ${gbp(a.currentValuation)} (${(a.valuationSource || '').replace(/_/g, ' ')}, ${a.valuationDate})`
                  : 'No valuation'}
              </span>
              <span className="app-chip">Rent {gbp(a.monthlyRent)}/mo</span>
              <span className="app-chip">{a.transactions.length} transactions</span>
              <button
                type="button"
                className="app-chip"
                style={{ cursor: 'pointer', border: 'none' }}
                onClick={() => setEditing(a)}
              >
                Edit
              </button>
              <button
                type="button"
                className="app-chip"
                style={{ cursor: 'pointer', border: 'none' }}
                onClick={() => setTxFor(txFor === a.id ? null : a.id)}
              >
                Record income/cost
              </button>
              {confirmId === a.id ? (
                <>
                  <button
                    type="button"
                    className="app-chip"
                    style={{ cursor: 'pointer', border: 'none', color: 'var(--red)' }}
                    onClick={() => del(a.id)}
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    className="app-chip"
                    style={{ cursor: 'pointer', border: 'none' }}
                    onClick={() => setConfirmId(null)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="app-chip"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => setConfirmId(a.id)}
                >
                  Delete
                </button>
              )}
              {txFor === a.id && (
                <form
                  onSubmit={addTx}
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: '100%', marginTop: 8 }}
                >
                  <input
                    type="date"
                    aria-label="Date"
                    className="app-search-input"
                    style={{ minHeight: 'auto', width: 150 }}
                    value={tx.date}
                    onChange={(e) => setTx((t) => ({ ...t, date: e.target.value }))}
                  />
                  <select
                    aria-label="Type"
                    className="app-search-input"
                    style={{ minHeight: 'auto', width: 190 }}
                    value={tx.type}
                    onChange={(e) => setTx((t) => ({ ...t, type: e.target.value }))}
                  >
                    <option value="income">Rental income</option>
                    <option value="operating_expense">Operating cost</option>
                    <option value="capital_expenditure">Capital expenditure</option>
                    <option value="mortgage_payment">Mortgage payment</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    aria-label="Amount"
                    inputMode="decimal"
                    placeholder="£ amount"
                    className="app-search-input"
                    style={{ minHeight: 'auto', width: 120 }}
                    value={tx.amount}
                    onChange={(e) => setTx((t) => ({ ...t, amount: e.target.value }))}
                  />
                  <input
                    aria-label="Description"
                    placeholder="Description"
                    className="app-search-input"
                    style={{ minHeight: 'auto', flex: '1 1 160px' }}
                    value={tx.description}
                    onChange={(e) => setTx((t) => ({ ...t, description: e.target.value }))}
                  />
                  <button type="submit" className="app-btn app-btn--primary" disabled={!num(tx.amount)}>
                    Add
                  </button>
                </form>
              )}
              {txFor === a.id && a.transactions.length > 0 && (
                <div className="table-scroll" style={{ width: '100%' }}>
                  <table className="assumption-table">
                    <tbody>
                      {a.transactions.slice(0, 12).map((t) => (
                        <tr key={t.id}>
                          <td>{t.date}</td>
                          <td>{t.type.replace(/_/g, ' ')}</td>
                          <td>{gbp(t.amount)}</td>
                          <td>{t.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AppCard>
          ))}
        </div>
      )}
    </>
  );
}

function SavedProperties() {
  const navigate = useNavigate();
  const { openAnalysisModal, showToast, analyseProperty } = useApp();
  const { data, error, loading, reload } = useApi('/api/saved');
  const [filter, setFilter] = useState('all');
  const [noteId, setNoteId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const saved = useMemo(() => data?.saved || [], [data]);

  const filtered = useMemo(
    () => (filter === 'all' ? saved : saved.filter((s) => s.status === filter)),
    [saved, filter],
  );
  const priced = saved.filter((s) => s.facts.askingPrice != null);
  const scored = saved.filter((s) => s.latestAnalysis);

  const patch = async (id, body, msg) => {
    try {
      await api(`/api/saved/${id}`, { method: 'PATCH', body });
      emitStoreChange();
      if (msg) showToast(msg, '');
    } catch (err) {
      showToast('Could not update', err.message);
    }
  };
  const remove = async (id) => {
    try {
      await api(`/api/saved/${id}`, { method: 'DELETE' });
      emitStoreChange();
      showToast('Removed', 'Property removed from saved');
    } catch (err) {
      showToast('Could not remove', err.message);
    }
  };

  return (
    <>
      {error && (
        <div className="notice-banner notice-banner--error">
          {error.message}{' '}
          <button type="button" className="app-btn app-btn--ghost" onClick={() => reload()}>
            Retry
          </button>
        </div>
      )}
      {saved.length > 0 && (
        <>
          <div className="app-stat-grid">
            <AppStat accent="amber" label="Properties" value={saved.length} icon="▤" />
            <AppStat
              accent="blue"
              label="Total asking"
              value={priced.length ? gbp(priced.reduce((s, x) => s + x.facts.askingPrice, 0)) : '—'}
              hint={`${priced.length} with a price`}
              icon="£"
            />
            <AppStat
              accent="teal"
              label="Avg match"
              value={
                scored.length
                  ? Math.round(scored.reduce((s, x) => s + x.latestAnalysis.matchScore, 0) / scored.length)
                  : '—'
              }
              hint={`${scored.length} analysed`}
              icon="%"
            />
          </div>
          <div className="port-filters">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`port-filter${filter === s.id ? ' port-filter--on' : ''}`}
                onClick={() => setFilter(s.id)}
                aria-pressed={filter === s.id}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}

      {loading && !saved.length ? null : saved.length === 0 ? (
        <AppEmpty
          art={<IlluPortfolio className="app-illu app-illu--empty" />}
          title="No properties saved yet"
          description="Save properties from Discover or an analysis. Then set a status (Watching / Offer / Owned) and add notes."
          onAction={() => openAnalysisModal()}
          actionLabel="Analyse a property"
        />
      ) : filtered.length === 0 ? (
        <AppEmpty
          art={<IlluPortfolio className="app-illu app-illu--empty" />}
          title="Nothing in this status"
          description="Try another filter or update a property’s status."
        />
      ) : (
        <div className="app-card-list">
          {filtered.map((s) => {
            const p = s.facts;
            return (
              <AppCard
                key={s.id}
                title={p.address || p.postcode || 'Untitled property'}
                meta={[
                  p.propertyType ? PROPERTY_TYPE_LABELS[p.propertyType] : null,
                  p.bedrooms != null ? `${p.bedrooms} bed` : null,
                  s.briefName,
                  s.status,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                score={s.latestAnalysis?.matchScore}
                onClick={() =>
                  s.latestAnalysis
                    ? navigate(`/analyse/${s.latestAnalysis.id}`, { viewTransition: true })
                    : analyseProperty(s.propertyId, s.briefId)
                }
              >
                <span className="app-chip">{gbp(p.askingPrice)}</span>
                {s.isPrivate && <span className="app-chip">Your entry</span>}
                {s.note && (
                  <span className="app-chip" title={s.note}>
                    Note
                  </span>
                )}
                <select
                  className="port-status"
                  aria-label="Status"
                  value={s.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => patch(s.id, { status: e.target.value }, 'Status updated')}
                >
                  <option value="watching">Watching</option>
                  <option value="offer">Offer</option>
                  <option value="owned">Owned</option>
                  <option value="passed">Passed</option>
                </select>
                <button
                  type="button"
                  className="app-chip"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setNoteId(s.id);
                    setNoteDraft(s.note || '');
                  }}
                >
                  Note
                </button>
                <button
                  type="button"
                  className="app-chip"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(s.id);
                  }}
                >
                  Remove
                </button>
              </AppCard>
            );
          })}
        </div>
      )}

      {noteId && (
        <div className="port-note-overlay" onClick={() => setNoteId(null)}>
          <div
            className="port-note-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Note"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Note</h3>
            <textarea
              rows={5}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Offer notes, survey flags, agent comments…"
            />
            <div className="port-note-actions">
              <button type="button" className="app-btn app-btn--ghost" onClick={() => setNoteId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="app-btn app-btn--primary"
                onClick={async () => {
                  await patch(noteId, { note: noteDraft || null }, 'Note saved');
                  setNoteId(null);
                }}
              >
                Save note
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Portfolio() {
  const navigate = useNavigate();
  const { openAnalysisModal } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'owned' ? 'owned' : 'saved';

  return (
    <AppPage
      eyebrow={tab === 'owned' ? 'Your holdings' : 'Saved deals'}
      title="Portfolio"
      art={<IlluPortfolio className="app-illu app-illu--header" />}
      subtitle={
        tab === 'owned'
          ? 'Properties you own, with figures you record. Summaries are calculated from these records.'
          : 'Properties you’re seriously considering — set status, add notes and compare.'
      }
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="app-btn app-btn--ghost"
            onClick={() => navigate('/compare', { viewTransition: true })}
          >
            Compare
          </button>
          <button type="button" className="app-btn app-btn--primary" onClick={() => openAnalysisModal()}>
            Analyse property
          </button>
        </div>
      }
    >
      <div className="port-filters" style={{ marginBottom: 16 }} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'saved'}
          className={`port-filter${tab === 'saved' ? ' port-filter--on' : ''}`}
          onClick={() => setParams({})}
        >
          Saved properties
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'owned'}
          className={`port-filter${tab === 'owned' ? ' port-filter--on' : ''}`}
          onClick={() => setParams({ tab: 'owned' })}
        >
          Owned portfolio
        </button>
      </div>
      {tab === 'owned' ? <OwnedPortfolio /> : <SavedProperties />}
    </AppPage>
  );
}
