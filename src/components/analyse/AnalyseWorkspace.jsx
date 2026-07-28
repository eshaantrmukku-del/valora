import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AnalyseSidebar from './AnalyseSidebar';
import PropertyReport from '../PropertyReport';
import PropertyChat from '../PropertyChat';
import { useApp } from '../../context/AppContext';
import { GENERAL_PROJECT_ID } from '../../lib/projects';
import { getInvestorPrefs } from '../../lib/investor';
import { useStore } from '../../hooks/useStore';
import { answerPropertyQuestion, getChatSuggestions, loadChat, saveChat } from '../../lib/propertyChat';
import { getBriefs, getActiveBriefId, setActiveBriefId } from '../../lib/storage';
import { parseIntent } from '../../lib/discover/parseIntent';
import { nameInvestmentBrief } from '../../lib/discover/investmentBrief';

const MODES = [
  { id: 'url', title: 'Analyse a listing', desc: 'Paste Rightmove, Zoopla, or OTM', action: 'composer' },
  { id: 'compare', title: 'Compare deals', desc: 'Side-by-side yield & score', to: '/compare' },
  { id: 'area', title: 'Area intel', desc: 'Postcode market report', to: '/area-intel' },
  { id: 'tools', title: 'Run the numbers', desc: 'Mortgage, yield, stamp duty', to: '/tools' },
  { id: 'discover', title: 'Investment Briefs', desc: 'Search by investment goals', to: '/discover' },
  { id: 'portfolio', title: 'Open portfolio', desc: 'Saved properties & statuses', to: '/portfolio' },
];

const STRATEGIES = [
  { id: 'buy-to-let', label: 'Buy-to-let' },
  { id: 'hmo', label: 'HMO' },
  { id: 'flip', label: 'Refurb / flip' },
  { id: 'brr', label: 'BRR' },
];

function briefLabel(b) {
  if (b.name) return b.name;
  return nameInvestmentBrief(b.filters || parseIntent(b.query), b.query);
}

export default function AnalyseWorkspace() {
  useStore();
  const { id } = useParams();
  const navigate = useNavigate();
  const prefs = getInvestorPrefs();
  const {
    runAnalysis,
    getProperty,
    isInPortfolio,
    togglePortfolio,
    shareReport,
    exportReport,
    exportReportJson,
    removeAnalysis,
    portfolioVersion,
    loading,
    showToast,
  } = useApp();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(GENERAL_PROJECT_ID);
  const [input, setInput] = useState('');
  const [strategy, setStrategy] = useState(prefs.strategy || 'buy-to-let');
  const [chatMessages, setChatMessages] = useState([]);
  const [briefs, setBriefs] = useState(() => getBriefs());
  const [briefId, setBriefId] = useState(() => getActiveBriefId() || '');

  void portfolioVersion;
  void exportReport;
  const property = id ? getProperty(id) : null;
  const saved = property ? isInPortfolio(property.id) : false;

  useEffect(() => {
    if (property?.id) setChatMessages(loadChat(property.id));
    else setChatMessages([]);
  }, [property?.id]);

  useEffect(() => {
    const onStore = () => {
      setBriefs(getBriefs());
      setBriefId(getActiveBriefId() || '');
    };
    window.addEventListener('valora-store-change', onStore);
    return () => window.removeEventListener('valora-store-change', onStore);
  }, []);

  const onBriefChange = (value) => {
    setBriefId(value);
    setActiveBriefId(value || null);
    if (value) {
      const b = briefs.find((x) => x.id === value);
      if (b) showToast?.('Investment Brief selected', briefLabel(b));
    } else {
      showToast?.('Default analysis', 'No Investment Brief applied');
    }
  };

  const submit = (e) => {
    e?.preventDefault();
    const url = input.trim();
    if (!url || loading) return;
    // If looking like a question while a report is open, treat as chat
    if (property && !/^https?:\/\//i.test(url)) {
      const userMsg = { role: 'user', text: url, at: Date.now() };
      const { answer } = answerPropertyQuestion(property, url);
      const next = [...chatMessages, userMsg, { role: 'assistant', text: answer, at: Date.now() }];
      setChatMessages(next);
      saveChat(property.id, next);
      setInput('');
      return;
    }
    runAnalysis(url, activeProjectId);
    setInput('');
  };

  const askChip = (q) => {
    if (!property) return;
    const userMsg = { role: 'user', text: q, at: Date.now() };
    const { answer } = answerPropertyQuestion(property, q);
    const next = [...chatMessages, userMsg, { role: 'assistant', text: answer, at: Date.now() }];
    setChatMessages(next);
    saveChat(property.id, next);
  };

  const handleDelete = () => {
    if (!property) return;
    if (!window.confirm('Delete this analysis?')) return;
    removeAnalysis(property.id);
    navigate('/analyse', { viewTransition: true });
  };

  return (
    <div className="ws-analyse">
      <AnalyseSidebar
        activeId={id}
        activeProjectId={activeProjectId}
        onProjectChange={setActiveProjectId}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="ws-main">
        {!property ? (
          <>
            <div className="ws-welcome">
              <div className="ws-welcome-inner">
                <div className="ws-welcome-kicker">
                  <span className="ws-kicker-mark" aria-hidden="true" />
                  Investment research assistant
                </div>
                <h1 className="ws-welcome-title">What would you like to do?</h1>
                <p className="ws-welcome-sub">
                  Analyse a listing, compare deals, check an area, or run the numbers — all in one workspace.
                </p>

                <div className="ws-strategy-row">
                  <span className="ws-strategy-label">Focus</span>
                  {STRATEGIES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`ws-strategy-chip${strategy === s.id ? ' ws-strategy-chip--on' : ''}`}
                      onClick={() => setStrategy(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <div className="ws-brief-select">
                  <label htmlFor="ws-brief">Analyse using</label>
                  <select
                    id="ws-brief"
                    value={briefId}
                    onChange={(e) => onBriefChange(e.target.value)}
                  >
                    <option value="">Default analysis</option>
                    {briefs.map((b) => (
                      <option key={b.id} value={b.id}>{briefLabel(b)}</option>
                    ))}
                  </select>
                  <Link to="/discover" viewTransition className="ws-brief-link">Manage briefs</Link>
                </div>

                <div className="ws-mode-grid">
                  {MODES.map((m) => (
                    m.to ? (
                      <Link key={m.id} to={m.to} viewTransition className="ws-mode-card">
                        <strong>{m.title}</strong>
                        <span>{m.desc}</span>
                      </Link>
                    ) : (
                      <button
                        key={m.id}
                        type="button"
                        className="ws-mode-card"
                        onClick={() => document.querySelector('.ws-composer-input')?.focus()}
                      >
                        <strong>{m.title}</strong>
                        <span>{m.desc}</span>
                      </button>
                    )
                  ))}
                </div>

                <p className="ws-prefs-hint">
                  Defaults from Settings: target {prefs.targetYield}% yield · budget £{Number(prefs.maxBudget).toLocaleString()} · {prefs.depositPct}% deposit
                  {' · '}
                  <Link to="/settings#investor" viewTransition>Edit prefs</Link>
                </p>
              </div>
            </div>
            <form className="ws-composer" onSubmit={submit}>
              <div className="ws-composer-inner">
                <input
                  className="ws-composer-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Paste a Rightmove, Zoopla, or OnTheMarket URL…"
                  disabled={loading}
                />
                <button type="submit" className="ws-composer-send" disabled={!input.trim() || loading}>
                  Analyse
                </button>
              </div>
              <p className="ws-composer-hint">Valora can make mistakes. Verify figures on the original listing.</p>
            </form>
          </>
        ) : (
          <>
            <div className="ws-thread">
              <div className="ws-thread-toolbar">
                <button type="button" className="ws-back" onClick={() => navigate('/analyse', { viewTransition: true })}>
                  ← All analyses
                </button>
                <div className="ws-thread-actions">
                  <button type="button" className={`ws-chip${saved ? ' ws-chip--on' : ''}`} onClick={() => togglePortfolio(property.id)}>
                    {saved ? 'Saved' : 'Save'}
                  </button>
                  <Link to="/compare" viewTransition className="ws-chip">Compare</Link>
                  <Link to="/tools" viewTransition className="ws-chip">Calculators</Link>
                  {property.sourceUrl && (
                    <a href={property.sourceUrl} target="_blank" rel="noopener noreferrer" className="ws-chip">Listing</a>
                  )}
                  <button type="button" className="ws-chip" onClick={() => shareReport(property.id)}>Share</button>
                  <button type="button" className="ws-chip" onClick={() => exportReportJson(property)}>Export</button>
                  <button type="button" className="ws-chip ws-chip--danger" onClick={handleDelete}>Delete</button>
                </div>
              </div>

              <div className="ws-messages">
                <div className="ws-msg ws-msg--user">
                  <div className="ws-msg-label">You</div>
                  <div className="ws-msg-body">
                    <a href={property.sourceUrl} target="_blank" rel="noopener noreferrer" className="ws-msg-link">
                      {property.sourceUrl || property.name}
                    </a>
                  </div>
                </div>

                <div className="ws-msg ws-msg--assistant">
                  <div className="ws-msg-avatar">V</div>
                  <div className="ws-msg-content">
                    <div className="ws-msg-label">Valora</div>
                    <div className="ws-msg-body">
                      {property.aiInsight ? (
                        <>
                          <p>{property.aiInsight.opening}</p>
                          <p>{property.aiInsight.yieldLine}</p>
                          <p>{property.aiInsight.strategyLine}</p>
                          {property.aiInsight.conditionLine && <p>{property.aiInsight.conditionLine}</p>}
                        </>
                      ) : (
                        <p>Analysis complete — score {property.score}, {property.rental?.grossYield} gross yield.</p>
                      )}
                      <div className="ws-msg-stats">
                        <span><strong>{property.score}</strong> score</span>
                        <span><strong>{property.strategy}</strong></span>
                        <span><strong>£{property.price.toLocaleString()}</strong> price</span>
                        {property.condition?.overall && (
                          <span><strong>{property.condition.overall}</strong> condition</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {chatMessages.map((m) => (
                  <div key={`${m.at}-${m.role}`} className={`ws-msg ${m.role === 'user' ? 'ws-msg--user' : 'ws-msg--assistant'}`}>
                    {m.role === 'assistant' && <div className="ws-msg-avatar">V</div>}
                    <div className={m.role === 'assistant' ? 'ws-msg-content' : undefined}>
                      <div className="ws-msg-label">{m.role === 'user' ? 'You' : 'Valora'}</div>
                      <div className="ws-msg-body" style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="ws-report-wrap">
                <div className="ws-report-label">Full report</div>
                <PropertyReport property={property} />
                <PropertyChat property={property} />
              </div>
            </div>

            <form className="ws-composer ws-composer--thread" onSubmit={submit}>
              <div className="prop-chat-suggestions" style={{ padding: '0 0 10px' }}>
                {getChatSuggestions(property).slice(0, 4).map((s) => (
                  <button key={s} type="button" className="prop-chat-chip" onClick={() => askChip(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="ws-composer-inner">
                <input
                  className="ws-composer-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about this property, or paste another listing URL…"
                  disabled={loading}
                />
                <button type="submit" className="ws-composer-send" disabled={!input.trim() || loading}>
                  {/^https?:\/\//i.test(input.trim()) ? 'Analyse' : 'Ask'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
