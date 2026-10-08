import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildPropertyFromUrl, buildPropertyManual, getProperty as getPropertyById, saveCustom, deleteProperty } from '../data/properties';
import { fetchListingMetadata } from '../lib/fetchListing';
import {
  addToPortfolio,
  isInPortfolio,
  removeFromPortfolio,
  saveBrief,
  getActiveBrief,
} from '../lib/storage';
import { assignAnalysisToProject, GENERAL_PROJECT_ID } from '../lib/projects';
import { parseListingUrl } from '../lib/parseListingUrl';
import { matchSavedBriefs } from '../lib/matchBrief';
import { startBriefMonitor, stopBriefMonitor } from '../lib/discover/monitor';
import { parseIntent } from '../lib/discover/parseIntent';
import { nameInvestmentBrief } from '../lib/discover/investmentBrief';

const LOADING_STEPS = [
  'Reading listing URL…',
  'Extracting live listing data…',
  'Fetching sold prices from Land Registry…',
  'Assessing photos & running financial model…',
  'Scoring & writing analyst report…',
];

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [portfolioVersion, setPortfolioVersion] = useState(0);

  const showToast = useCallback((title, sub) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, title, sub }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  useEffect(() => {
    const onStore = () => setPortfolioVersion((v) => v + 1);
    window.addEventListener('valora-store-change', onStore);
    return () => window.removeEventListener('valora-store-change', onStore);
  }, []);

  const runAnalysis = useCallback(async (url, projectId = GENERAL_PROJECT_ID) => {
    const trimmed = url.trim();
    if (!trimmed) return;

    const parsed = parseListingUrl(trimmed);
    if (!parsed.valid && !/^https?:\/\//i.test(trimmed)) {
      showToast('Invalid URL', 'Paste a full https:// link from Rightmove, Zoopla, or OnTheMarket');
      return;
    }

    setLoading(true);
    setLoadingStep(0);

    const advance = (step) => new Promise((r) => {
      setLoadingStep(step);
      setTimeout(r, 420);
    });

    try {
      await advance(0);
      await advance(1);

      const result = await fetchListingMetadata(trimmed);
      if (!result.ok || !result.meta) {
        setLoading(false);
        showToast(
          'Could not read listing',
          result.error || 'Open the link in a browser and paste a live Rightmove, Zoopla, or OnTheMarket URL',
        );
        return;
      }

      setLoadingStep(2);

      let property;
      try {
        // If an Investment Brief is active, analysis adapts to that strategy.
        const activeBrief = getActiveBrief();
        // Always re-parse from query so stale filters (pre-rewrite) can't poison match %
        const briefWithIntent = activeBrief
          ? {
              ...activeBrief,
              name: activeBrief.name
                || nameInvestmentBrief(parseIntent(activeBrief.query), activeBrief.query),
              filters: parseIntent(activeBrief.query),
            }
          : null;
        const pipeline = buildPropertyFromUrl(trimmed, result.meta, { brief: briefWithIntent });
        await advance(3);
        property = await pipeline;
        await advance(4);
      } catch (err) {
        setLoading(false);
        showToast('Incomplete listing data', err.message || 'Missing price or bedrooms on this page');
        return;
      }

      saveCustom(property);
      assignAnalysisToProject(property.id, projectId || GENERAL_PROJECT_ID);
      setLoading(false);
      navigate(`/analyse/${property.id}`, { viewTransition: true });

      const matchedBriefs = matchSavedBriefs(property);
      const priceBit = property.priceLabel
        || (property.listedRent
          ? `£${property.listedRent.toLocaleString()} pcm`
          : `£${property.price.toLocaleString()}`);
      const briefBit = property.briefMatch
        ? ` · ${property.briefMatch.matchPct}% match · ${property.brief?.name || 'Investment Brief'}`
        : '';
      showToast(
        'Analysis ready',
        `${property.name.slice(0, 40)}${property.name.length > 40 ? '…' : ''} · ${priceBit}${briefBit}`,
      );
      if (matchedBriefs.length > 0 && !property.briefMatch) {
        setTimeout(() => {
          const b = matchedBriefs[0];
          showToast(
            'Matches an Investment Brief',
            (b.name || b.query || '').slice(0, 80),
          );
        }, 600);
      }
    } catch (err) {
      setLoading(false);
      showToast('Analysis failed', err.message || 'Something went wrong reading that link');
    }
  }, [navigate, showToast]);

  const runManualAnalysis = useCallback(async (input, projectId = GENERAL_PROJECT_ID) => {
    if (!input?.price || input.beds == null) {
      showToast('Missing details', 'Price and bedrooms are required for a manual analysis');
      return;
    }
    setLoading(true);
    setLoadingStep(2);
    try {
      const property = await buildPropertyManual(input);
      setLoadingStep(4);
      saveCustom(property);
      assignAnalysisToProject(property.id, projectId || GENERAL_PROJECT_ID);
      setLoading(false);
      navigate(`/analyse/${property.id}`, { viewTransition: true });
      showToast('Analysis ready', `Manual entry · £${property.price.toLocaleString()} · ${property.location}`);
    } catch (err) {
      setLoading(false);
      showToast('Analysis failed', err.message || 'Could not analyse those details');
    }
  }, [navigate, showToast]);

  const togglePortfolio = useCallback((propertyId) => {
    if (isInPortfolio(propertyId)) {
      removeFromPortfolio(propertyId);
      showToast('Removed from portfolio', 'Property removed from your tracker');
    } else {
      addToPortfolio(propertyId);
      showToast('Saved to portfolio', 'Property added to your portfolio');
    }
    setPortfolioVersion((v) => v + 1);
  }, [showToast]);

  const removeAnalysis = useCallback((propertyId) => {
    if (isInPortfolio(propertyId)) removeFromPortfolio(propertyId);
    deleteProperty(propertyId);
    setPortfolioVersion((v) => v + 1);
    showToast('Analysis deleted', 'Removed from your history');
  }, [showToast]);

  const shareReport = useCallback(async (propertyId) => {
    const property = getPropertyById(propertyId);
    let url = `${window.location.origin}/analyse/${propertyId}`;
    if (property) {
      try {
        const packed = btoa(unescape(encodeURIComponent(JSON.stringify(property))));
        url = `${window.location.origin}/analyse/${propertyId}#share=${packed}`;
      } catch {
        /* keep plain url */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Share link copied', 'Works for anyone who opens it — report is embedded in the link');
    } catch {
      showToast('Share link', url);
    }
  }, [showToast]);

  const exportReport = useCallback(() => {
    window.print();
  }, []);

  const exportReportJson = useCallback((property) => {
    const blob = new Blob([JSON.stringify(property, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `valora-${property.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Exported', 'Report saved as JSON');
  }, [showToast]);

  const saveSearchBrief = useCallback((query, extra = {}) => {
    saveBrief(query, extra);
    showToast('Brief saved', 'Valora will watch live listings matching this brief');
    setPortfolioVersion((v) => v + 1);
  }, [showToast]);

  const openAnalysisModal = useCallback(() => setModalOpen(true), []);
  const closeAnalysisModal = useCallback(() => setModalOpen(false), []);

  useEffect(() => {
    startBriefMonitor();
    return () => stopBriefMonitor();
  }, []);

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
    <AppContext.Provider value={{
      modalOpen, setModalOpen, openAnalysisModal, closeAnalysisModal,
      runAnalysis, runManualAnalysis, loading, loadingStep, loadingSteps: LOADING_STEPS,
      toasts, showToast,
      getProperty: getPropertyById,
      togglePortfolio, isInPortfolio, shareReport, exportReport, exportReportJson,
      saveSearchBrief, removeAnalysis, portfolioVersion,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
