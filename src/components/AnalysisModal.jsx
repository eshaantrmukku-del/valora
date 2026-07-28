import { useState } from 'react';
import { useApp } from '../context/AppContext';

const TYPE_OPTIONS = [
  ['', 'Auto-detect'],
  ['flat', 'Flat / apartment'],
  ['terraced', 'Terraced house'],
  ['semi', 'Semi-detached'],
  ['detached', 'Detached'],
  ['bungalow', 'Bungalow'],
  ['house', 'House (other)'],
  ['studio', 'Studio'],
];

export default function AnalysisModal() {
  const { modalOpen, closeAnalysisModal, runAnalysis, runManualAnalysis } = useApp();
  const [tab, setTab] = useState('url');
  const [url, setUrl] = useState('');
  const [manual, setManual] = useState({
    price: '', beds: '', postcode: '', propertyType: '', monthlyRent: '', address: '',
  });

  if (!modalOpen) return null;

  const submitUrl = () => {
    const v = url.trim();
    if (!v) return;
    closeAnalysisModal();
    setUrl('');
    runAnalysis(v);
  };

  const submitManual = () => {
    const price = parseInt(String(manual.price).replace(/[£,\s]/g, ''), 10);
    const beds = manual.beds === '' ? null : parseInt(manual.beds, 10);
    if (!price || beds == null || Number.isNaN(beds)) return;
    closeAnalysisModal();
    runManualAnalysis({
      price,
      beds,
      postcode: manual.postcode.trim() || null,
      propertyType: manual.propertyType || null,
      monthlyRent: manual.monthlyRent ? parseInt(String(manual.monthlyRent).replace(/[£,\s]/g, ''), 10) : null,
      address: manual.address.trim() || null,
      title: manual.address.trim()
        ? `${beds === 0 ? 'Studio' : `${beds}-bed`} ${manual.propertyType || 'property'}, ${manual.address.trim()}`
        : null,
    });
    setManual({ price: '', beds: '', postcode: '', propertyType: '', monthlyRent: '', address: '' });
  };

  const setM = (k) => (e) => setManual((m) => ({ ...m, [k]: e.target.value }));
  const manualValid = manual.price && manual.beds !== '';

  return (
    <div className="valora-modal-overlay open" role="dialog" aria-modal="true" onClick={closeAnalysisModal}>
      <div className="valora-modal" onClick={(e) => e.stopPropagation()}>
        <div className="valora-modal-head">
          <h2>⬡ New Property Analysis</h2>
          <p>Live listing URL or your own figures · <kbd className="modal-kbd">⌘K</kbd> anytime</p>
        </div>
        <div className="valora-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'url'}
            className={`valora-modal-tab${tab === 'url' ? ' is-active' : ''}`}
            onClick={() => setTab('url')}
          >
            Listing URL
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'manual'}
            className={`valora-modal-tab${tab === 'manual' ? ' is-active' : ''}`}
            onClick={() => setTab('manual')}
          >
            Manual entry
          </button>
        </div>
        {tab === 'url' ? (
          <div className="valora-modal-body">
            <label htmlFor="valora-url-input">Rightmove, Zoopla, or OnTheMarket URL</label>
            <input
              id="valora-url-input"
              type="url"
              placeholder="https://www.rightmove.co.uk/properties/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitUrl()}
              autoFocus
            />
          </div>
        ) : (
          <div className="valora-modal-body valora-modal-body--grid">
            <div className="vm-field">
              <label htmlFor="vm-price">Asking price *</label>
              <input id="vm-price" inputMode="numeric" placeholder="£250,000" value={manual.price} onChange={setM('price')} autoFocus />
            </div>
            <div className="vm-field">
              <label htmlFor="vm-beds">Bedrooms * (0 = studio)</label>
              <input id="vm-beds" type="number" min="0" max="12" placeholder="3" value={manual.beds} onChange={setM('beds')} />
            </div>
            <div className="vm-field">
              <label htmlFor="vm-postcode">Postcode</label>
              <input id="vm-postcode" placeholder="LS6 2AB" value={manual.postcode} onChange={setM('postcode')} />
            </div>
            <div className="vm-field">
              <label htmlFor="vm-type">Property type</label>
              <select id="vm-type" value={manual.propertyType} onChange={setM('propertyType')}>
                {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="vm-field">
              <label htmlFor="vm-rent">Known rent (£/month, optional)</label>
              <input id="vm-rent" inputMode="numeric" placeholder="1,200" value={manual.monthlyRent} onChange={setM('monthlyRent')} />
            </div>
            <div className="vm-field">
              <label htmlFor="vm-address">Address (optional)</label>
              <input id="vm-address" placeholder="12 Example Street, Leeds" value={manual.address} onChange={setM('address')} />
            </div>
          </div>
        )}
        <div className="valora-modal-foot">
          <button type="button" className="valora-btn-cancel" onClick={closeAnalysisModal}>Cancel</button>
          {tab === 'url' ? (
            <button type="button" className="valora-btn-primary" onClick={submitUrl}>Analyse Property</button>
          ) : (
            <button type="button" className="valora-btn-primary" onClick={submitManual} disabled={!manualValid}>Analyse Details</button>
          )}
        </div>
      </div>
    </div>
  );
}
