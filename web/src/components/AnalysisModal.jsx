import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../lib/api';

const TYPE_OPTIONS = [
  ['', 'Unknown'],
  ['flat', 'Flat / apartment'],
  ['terraced', 'Terraced house'],
  ['end_of_terrace', 'End of terrace'],
  ['semi_detached', 'Semi-detached'],
  ['detached', 'Detached'],
  ['bungalow', 'Bungalow'],
  ['maisonette', 'Maisonette'],
  ['house_any', 'House (other)'],
];

const TABS = [
  ['url', 'Listing URL'],
  ['text', 'Paste listing text'],
  ['upload', 'Upload brochure'],
  ['manual', 'Manual entry'],
];

const toInt = (v) => {
  const n = parseInt(String(v).replace(/[£,\s]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

export default function AnalysisModal() {
  const {
    modalOpen,
    modalTab,
    closeAnalysisModal,
    runAnalysis,
    runManualAnalysis,
    runTextAnalysis,
    uploadDocument,
    analyseProperty,
    showToast,
  } = useApp();
  const [tab, setTab] = useState('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [textUrl, setTextUrl] = useState('');
  const [file, setFile] = useState(null);
  const [uploadState, setUploadState] = useState(null);
  const [manual, setManual] = useState({
    price: '',
    beds: '',
    postcode: '',
    propertyType: '',
    monthlyRent: '',
    address: '',
    floorArea: '',
  });

  useEffect(() => {
    if (modalOpen) setTab(modalTab || 'url');
  }, [modalOpen, modalTab]);

  if (!modalOpen) return null;

  const submitUrl = () => {
    const v = url.trim();
    if (!v) return;
    closeAnalysisModal();
    setUrl('');
    runAnalysis(v);
  };

  const submitText = () => {
    if (text.trim().length < 40) return;
    closeAnalysisModal();
    runTextAnalysis(text.trim(), textUrl.trim() || null);
    setText('');
    setTextUrl('');
  };

  const submitUpload = async () => {
    if (!file) return;
    setUploadState('Uploading…');
    const doc = await uploadDocument(file);
    if (!doc) {
      setUploadState(null);
      return;
    }
    setUploadState('Reading the document…');
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const r = await api(`/api/documents/${doc.id}`);
        if (r.document.status === 'failed') {
          setUploadState(null);
          showToast('Could not read the document', r.document.error || 'Try pasting the text instead.');
          return;
        }
        if (r.document.status === 'extracted') {
          const p = await api(`/api/documents/${doc.id}/property`, { method: 'POST' });
          setUploadState(null);
          setFile(null);
          closeAnalysisModal();
          await analyseProperty(p.property.id);
          return;
        }
      } catch (err) {
        setUploadState(null);
        showToast('Upload failed', err.message);
        return;
      }
    }
    setUploadState(null);
    showToast('Still processing', 'The document is taking longer than expected. Check back shortly.');
  };

  const submitManual = () => {
    const price = toInt(manual.price);
    const beds = manual.beds === '' ? null : toInt(manual.beds);
    if (!manual.postcode.trim() && !manual.address.trim()) return;
    closeAnalysisModal();
    runManualAnalysis({
      price,
      beds,
      postcode: manual.postcode.trim() || null,
      propertyType: manual.propertyType || null,
      monthlyRent: manual.monthlyRent ? toInt(manual.monthlyRent) : null,
      address: manual.address.trim() || null,
      floorAreaSqm: manual.floorArea ? Number(manual.floorArea) : null,
    });
    setManual({
      price: '',
      beds: '',
      postcode: '',
      propertyType: '',
      monthlyRent: '',
      address: '',
      floorArea: '',
    });
  };

  const setM = (k) => (e) => setManual((m) => ({ ...m, [k]: e.target.value }));
  const manualValid = manual.postcode.trim() || manual.address.trim();

  return (
    <div
      className="valora-modal-overlay open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="valora-modal-title"
      onClick={closeAnalysisModal}
    >
      <div className="valora-modal" onClick={(e) => e.stopPropagation()}>
        <div className="valora-modal-head">
          <h2 id="valora-modal-title">⬡ New Property Analysis</h2>
          <p>
            Listing link, listing text, brochure or your own figures · <kbd className="modal-kbd">⌘K</kbd>{' '}
            anytime
          </p>
        </div>
        <div className="valora-modal-tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`valora-modal-tab${tab === id ? ' is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'url' && (
          <div className="valora-modal-body">
            <label htmlFor="valora-url-input">Listing link from a connected data provider</label>
            <input
              id="valora-url-input"
              type="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitUrl()}
              autoFocus
            />
            <p className="vm-hint">
              Valora doesn’t read Rightmove, Zoopla or OnTheMarket pages directly (their terms forbid
              automated access). For those, paste the listing text or upload the brochure.
            </p>
          </div>
        )}

        {tab === 'text' && (
          <div className="valora-modal-body">
            <label htmlFor="vm-text">Listing description and key details</label>
            <textarea
              id="vm-text"
              rows={8}
              placeholder="Paste the price, address, bedrooms, description and key features…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            <label htmlFor="vm-text-url" style={{ marginTop: 10 }}>
              Original listing link (optional, for your reference)
            </label>
            <input
              id="vm-text-url"
              type="url"
              placeholder="https://…"
              value={textUrl}
              onChange={(e) => setTextUrl(e.target.value)}
            />
            <p className="vm-hint">Only details that appear word-for-word in your text are used.</p>
          </div>
        )}

        {tab === 'upload' && (
          <div className="valora-modal-body">
            <label htmlFor="vm-file">Property brochure (PDF or text, up to 10 MB)</label>
            <input
              id="vm-file"
              type="file"
              accept="application/pdf,text/plain,.pdf,.txt"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {uploadState && (
              <p className="vm-hint" role="status">
                {uploadState}
              </p>
            )}
          </div>
        )}

        {tab === 'manual' && (
          <div className="valora-modal-body valora-modal-body--grid">
            <div className="vm-field">
              <label htmlFor="vm-postcode">Postcode *</label>
              <input
                id="vm-postcode"
                placeholder="LS6 2AB"
                value={manual.postcode}
                onChange={setM('postcode')}
                autoFocus
              />
            </div>
            <div className="vm-field">
              <label htmlFor="vm-address">Address</label>
              <input
                id="vm-address"
                placeholder="12 Example Street, Leeds"
                value={manual.address}
                onChange={setM('address')}
              />
            </div>
            <div className="vm-field">
              <label htmlFor="vm-price">Asking price</label>
              <input
                id="vm-price"
                inputMode="numeric"
                placeholder="£250,000"
                value={manual.price}
                onChange={setM('price')}
              />
            </div>
            <div className="vm-field">
              <label htmlFor="vm-beds">Bedrooms</label>
              <input
                id="vm-beds"
                type="number"
                min="0"
                max="30"
                placeholder="3"
                value={manual.beds}
                onChange={setM('beds')}
              />
            </div>
            <div className="vm-field">
              <label htmlFor="vm-type">Property type</label>
              <select id="vm-type" value={manual.propertyType} onChange={setM('propertyType')}>
                {TYPE_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="vm-field">
              <label htmlFor="vm-area">Floor area (m², optional)</label>
              <input
                id="vm-area"
                inputMode="decimal"
                placeholder="85"
                value={manual.floorArea}
                onChange={setM('floorArea')}
              />
            </div>
            <div className="vm-field">
              <label htmlFor="vm-rent">Known rent (£/month, optional)</label>
              <input
                id="vm-rent"
                inputMode="numeric"
                placeholder="1,200"
                value={manual.monthlyRent}
                onChange={setM('monthlyRent')}
              />
            </div>
          </div>
        )}

        <div className="valora-modal-foot">
          <button type="button" className="valora-btn-cancel" onClick={closeAnalysisModal}>
            Cancel
          </button>
          {tab === 'url' && (
            <button type="button" className="valora-btn-primary" onClick={submitUrl} disabled={!url.trim()}>
              Analyse Property
            </button>
          )}
          {tab === 'text' && (
            <button
              type="button"
              className="valora-btn-primary"
              onClick={submitText}
              disabled={text.trim().length < 40}
            >
              Analyse Text
            </button>
          )}
          {tab === 'upload' && (
            <button
              type="button"
              className="valora-btn-primary"
              onClick={submitUpload}
              disabled={!file || Boolean(uploadState)}
            >
              {uploadState ? 'Working…' : 'Upload & Analyse'}
            </button>
          )}
          {tab === 'manual' && (
            <button
              type="button"
              className="valora-btn-primary"
              onClick={submitManual}
              disabled={!manualValid}
            >
              Analyse Details
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
