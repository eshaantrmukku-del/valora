import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, emitStoreChange } from '../lib/api';

const LOADING_STEPS = [
  'Checking the property record…',
  'Gathering sold prices, rents and planning data…',
  'Running the deterministic financial model…',
  'Scoring against your Investment Brief…',
  'Saving the report…',
];

const ACTIVE_BRIEF_KEY = 'valora_active_brief_id';

export function getActiveBriefId() {
  try {
    return localStorage.getItem(ACTIVE_BRIEF_KEY) || '';
  } catch {
    return '';
  }
}

export function setActiveBriefId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_BRIEF_KEY, id);
    else localStorage.removeItem(ACTIVE_BRIEF_KEY);
  } catch {
    /* preference only */
  }
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('url');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((title, sub) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, sub }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  /** Analyse an existing property record under a brief (or the default strategy). */
  const analyseProperty = useCallback(async (propertyId, briefId = getActiveBriefId() || null, inputs = undefined) => {
    setLoading(true);
    setLoadingStep(1);
    const timer = setInterval(() => setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1500);
    try {
      const r = await api('/api/analyses', { method: 'POST', body: { propertyId, briefId: briefId || null, ...(inputs ? { inputs } : {}) } });
      emitStoreChange();
      navigate(`/analyse/${r.analysis.id}`, { viewTransition: true });
      showToast('Analysis ready', `Match ${r.analysis.ranking.matchScore}/100 · ${r.analysis.briefName}`);
      return r.analysis;
    } catch (err) {
      showToast('Analysis failed', err.message);
      return null;
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }, [navigate, showToast]);

  const openAnalysisModal = useCallback((tab = 'url') => {
    setModalTab(typeof tab === 'string' ? tab : 'url');
    setModalOpen(true);
  }, []);
  const closeAnalysisModal = useCallback(() => setModalOpen(false), []);

  const runAnalysis = useCallback(async (url) => {
    const trimmed = (url || '').trim();
    if (!/^https:\/\//i.test(trimmed)) {
      showToast('Invalid link', 'Paste a full https:// link.');
      return;
    }
    setLoading(true);
    setLoadingStep(0);
    try {
      const r = await api('/api/properties/from-url', { method: 'POST', body: { url: trimmed } });
      setLoading(false);
      await analyseProperty(r.property.id);
    } catch (err) {
      setLoading(false);
      if (err.code === 'unsupported') {
        showToast('Listing link not supported', err.message);
        openAnalysisModal('text');
      } else showToast('Could not use that link', err.message);
    }
  }, [analyseProperty, openAnalysisModal, showToast]);

  const runManualAnalysis = useCallback(async (input) => {
    setLoading(true);
    setLoadingStep(0);
    try {
      const facts = {
        askingPrice: input.price ?? null,
        bedrooms: input.beds ?? null,
        postcode: input.postcode || null,
        propertyType: input.propertyType || null,
        address: input.address || null,
        floorAreaSqm: input.floorAreaSqm ?? null,
        tenure: input.tenure || null,
      };
      const r = await api('/api/properties', { method: 'POST', body: { facts } });
      setLoading(false);
      await analyseProperty(r.property.id, undefined, input.monthlyRent ? { monthlyRent: input.monthlyRent } : undefined);
    } catch (err) {
      setLoading(false);
      showToast('Could not save those details', err.message);
    }
  }, [analyseProperty, showToast]);

  const runTextAnalysis = useCallback(async (text, sourceUrl) => {
    setLoading(true);
    setLoadingStep(0);
    try {
      const r = await api('/api/properties/from-text', { method: 'POST', body: { text, sourceUrl: sourceUrl || null } });
      setLoading(false);
      if (r.extraction.rejected.length) {
        showToast('Some details were not used', `Couldn’t verify: ${r.extraction.rejected.join(', ')} — check them in the report.`);
      }
      await analyseProperty(r.property.id);
    } catch (err) {
      setLoading(false);
      showToast('Could not read that text', err.message);
    }
  }, [analyseProperty, showToast]);

  const uploadDocument = useCallback(async (file) => {
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await api('/api/documents', { method: 'POST', form });
      showToast('Brochure uploaded', 'Extracting details — this usually takes a few seconds.');
      emitStoreChange();
      return r.document;
    } catch (err) {
      showToast('Upload failed', err.message);
      return null;
    }
  }, [showToast]);

  const togglePortfolio = useCallback(async (propertyId, isSaved, briefId = null) => {
    try {
      if (isSaved) {
        await api(`/api/saved/${propertyId}`, { method: 'DELETE' });
        showToast('Removed from saved', 'Property removed from your saved list');
      } else {
        await api('/api/saved', { method: 'POST', body: { propertyId, briefId } });
        showToast('Saved', 'Property added to your saved list');
      }
      emitStoreChange();
    } catch (err) {
      showToast('Could not update saved list', err.message);
    }
  }, [showToast]);

  const removeAnalysis = useCallback(async (analysisId) => {
    try {
      await api(`/api/analyses/${analysisId}`, { method: 'DELETE' });
      emitStoreChange();
      showToast('Analysis deleted', 'Removed from your history');
      return true;
    } catch (err) {
      showToast('Could not delete', err.message);
      return false;
    }
  }, [showToast]);

  const shareReport = useCallback(async (analysisId) => {
    const url = `${window.location.origin}/analyse/${analysisId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied', 'Only you can open it while signed in — reports are private to your account.');
    } catch {
      showToast('Report link', url);
    }
  }, [showToast]);

  const exportReportJson = useCallback((property) => {
    const blob = new Blob([JSON.stringify(property.raw ?? property, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `valora-analysis-${property.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Exported', 'Report saved as JSON');
  }, [showToast]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') closeAnalysisModal();
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openAnalysisModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeAnalysisModal, openAnalysisModal]);

  useEffect(() => {
    document.body.classList.add('valora-app-ready');
    const openFromNav = () => openAnalysisModal();
    const runPending = (e) => {
      const url = e?.detail?.url;
      if (url) runAnalysis(url);
    };
    window.addEventListener('valora-open-analyse', openFromNav);
    window.addEventListener('valora-run-pending-analysis', runPending);
    return () => {
      window.removeEventListener('valora-open-analyse', openFromNav);
      window.removeEventListener('valora-run-pending-analysis', runPending);
    };
  }, [openAnalysisModal, runAnalysis]);

  return (
    <AppContext.Provider
      value={{
        modalOpen, modalTab, setModalTab, setModalOpen, openAnalysisModal, closeAnalysisModal,
        runAnalysis, runManualAnalysis, runTextAnalysis, uploadDocument, analyseProperty,
        loading, loadingStep, loadingSteps: LOADING_STEPS,
        toasts, showToast,
        togglePortfolio, shareReport, exportReportJson, removeAnalysis,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
