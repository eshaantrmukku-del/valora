import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppPage, { AppCard, AppEmpty, AppStat } from '../components/AppPage';
import { IlluPortfolio } from '../components/AppIllustrations';
import { getProperty } from '../data/properties';
import { getPortfolioIds, removeFromPortfolio } from '../lib/storage';
import { getPortfolioNote, getPortfolioStatus, setPortfolioMeta } from '../lib/investor';
import { useStore } from '../hooks/useStore';
import { useApp } from '../context/AppContext';

const STATUSES = [
  { id: 'all', label: 'All' },
  { id: 'watching', label: 'Watching' },
  { id: 'offer', label: 'Offer' },
  { id: 'owned', label: 'Owned' },
  { id: 'passed', label: 'Passed' },
];

function formatMoney(n) {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `£${Math.round(n / 1000)}k`;
  return `£${n.toLocaleString()}`;
}

export default function Portfolio() {
  useStore();
  const navigate = useNavigate();
  const { openAnalysisModal, showToast } = useApp();
  const [filter, setFilter] = useState('all');
  const [noteId, setNoteId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');

  const entries = getPortfolioIds();
  const properties = entries.map((e) => ({ ...e, property: getProperty(e.id) })).filter((e) => e.property);

  const filtered = useMemo(() => {
    if (filter === 'all') return properties;
    return properties.filter(({ id }) => getPortfolioStatus(id) === filter);
  }, [properties, filter]);

  const totalValue = properties.reduce((s, { property: p }) => s + (p.marketValue || p.price || 0), 0);
  const avgYield = properties.length
    ? properties.reduce((s, { property: p }) => s + parseFloat(p.rental?.grossYield || '0'), 0) / properties.length
    : 0;
  const avgScore = properties.length
    ? Math.round(properties.reduce((s, { property: p }) => s + (p.score || 0), 0) / properties.length)
    : 0;

  const remove = (id, e) => {
    e.stopPropagation();
    removeFromPortfolio(id);
    showToast('Removed', 'Property removed from portfolio');
  };

  const setStatus = (id, status, e) => {
    e.stopPropagation();
    setPortfolioMeta(id, { status });
    showToast('Status updated', status);
  };

  const openNote = (id, e) => {
    e.stopPropagation();
    setNoteId(id);
    setNoteDraft(getPortfolioNote(id));
  };

  const saveNote = () => {
    if (!noteId) return;
    setPortfolioMeta(noteId, { note: noteDraft });
    setNoteId(null);
    showToast('Note saved', 'Attached to this portfolio item');
  };

  return (
    <AppPage
      eyebrow="Saved deals"
      title="Portfolio"
      art={<IlluPortfolio className="app-illu app-illu--header" />}
      subtitle={
        properties.length
          ? `${properties.length} ${properties.length === 1 ? 'property' : 'properties'} tracked — filter by status, add notes`
          : 'Save analyses here to track properties you are seriously considering'
      }
      actions={(
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => navigate('/compare', { viewTransition: true })}>
            Compare
          </button>
          <button type="button" className="app-btn app-btn--primary" onClick={openAnalysisModal}>
            Analyse listing
          </button>
        </div>
      )}
    >
      {properties.length > 0 && (
        <>
          <div className="app-stat-grid">
            <AppStat accent="amber" label="Properties" value={properties.length} icon="▤" />
            <AppStat accent="blue" label="Est. value" value={formatMoney(totalValue)} icon="£" />
            <AppStat accent="teal" label="Avg yield" value={`${avgYield.toFixed(1)}%`} hint={`Avg score ${avgScore}`} icon="%" />
          </div>

          <div className="port-filters">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`port-filter${filter === s.id ? ' port-filter--on' : ''}`}
                onClick={() => setFilter(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}

      {properties.length === 0 ? (
        <AppEmpty
          art={<IlluPortfolio className="app-illu app-illu--empty" />}
          title="No properties saved yet"
          description="Open any analysis and tap Save to add it here. Then set status (Watching / Offer / Owned) and notes."
          onAction={openAnalysisModal}
          actionLabel="Analyse a listing"
        />
      ) : filtered.length === 0 ? (
        <AppEmpty
          art={<IlluPortfolio className="app-illu app-illu--empty" />}
          title="Nothing in this status"
          description="Try another filter or update a property’s status."
        />
      ) : (
        <div className="app-card-list">
          {filtered.map(({ id, property: p }) => {
            const status = getPortfolioStatus(id);
            const note = getPortfolioNote(id);
            return (
              <AppCard
                key={id}
                title={p.name}
                meta={`${p.location} · ${p.sourcePortal || 'Listing'} · ${status}`}
                score={p.score}
                onClick={() => navigate(`/analyse/${id}`, { viewTransition: true })}
              >
                <span className="app-chip">£{p.price.toLocaleString()}</span>
                <span className="app-chip">{p.rental?.grossYield} yield</span>
                <span className="app-chip">{p.strategy}</span>
                {note && <span className="app-chip">Note</span>}
                <select
                  className="port-status"
                  value={status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setStatus(id, e.target.value, e)}
                >
                  <option value="watching">Watching</option>
                  <option value="offer">Offer</option>
                  <option value="owned">Owned</option>
                  <option value="passed">Passed</option>
                </select>
                <button type="button" className="app-chip" style={{ cursor: 'pointer', border: 'none' }} onClick={(e) => openNote(id, e)}>
                  Note
                </button>
                <button type="button" className="app-chip" style={{ cursor: 'pointer', border: 'none' }} onClick={(e) => remove(id, e)}>
                  Remove
                </button>
              </AppCard>
            );
          })}
        </div>
      )}

      {noteId && (
        <div className="port-note-overlay" onClick={() => setNoteId(null)}>
          <div className="port-note-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Portfolio note</h3>
            <textarea rows={5} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Offer notes, survey flags, agent comments…" />
            <div className="port-note-actions">
              <button type="button" className="app-btn app-btn--ghost" onClick={() => setNoteId(null)}>Cancel</button>
              <button type="button" className="app-btn app-btn--primary" onClick={saveNote}>Save note</button>
            </div>
          </div>
        </div>
      )}
    </AppPage>
  );
}
