import { Link } from 'react-router-dom';
import AiInsightPanel from './AiInsightPanel';

export default function AreaReportView({ report }) {
  const scoreColor = report.score >= 75 ? 'var(--green)' : report.score >= 60 ? 'var(--amber)' : 'var(--red)';
  const insight = report.insight;

  return (
    <div className="area-report-view">
      {report.isPrototype ? (
        <div className="prototype-banner prototype-banner--light">
          AI area estimate from regional benchmarks — connect live market data for verified figures.
        </div>
      ) : (
        <div className="prototype-banner prototype-banner--live">
          {report.source || 'Regional baseline figures'} — illustrative, not live transaction data. Verify with local agents.
        </div>
      )}
      <div className="area-report-header">
        <h2>{report.areaName}</h2>
        <p>{report.subtitle}</p>
      </div>
      <div className="score-row">
        <div className="score-box">
          <div className="sb-num" style={{ color: scoreColor }}>{report.score}</div>
          <div className="sb-label">Investment score</div>
          <div className="sb-sub">{report.scoreLabel}</div>
        </div>
        <div className="score-box">
          <div className="sb-num" style={{ color: 'var(--amber)' }}>{report.marketTemp}°</div>
          <div className="sb-label">Market temp</div>
          <div className="sb-sub">Activity index</div>
        </div>
        <div className="score-box">
          <div className="sb-num" style={{ color: 'var(--blue)' }}>£{(report.avgPrice / 1000).toFixed(0)}k</div>
          <div className="sb-label">Avg entry price</div>
          <div className="sb-sub">{report.growth} 5yr est.</div>
        </div>
      </div>
      <div className="section">
        <div className="section-title">Market data</div>
        <div className="area-metrics-grid">
          {report.metrics.map((m) => (
            <div key={m.label} className="area-metric-card">
              <div className="area-metric-label">{m.label}</div>
              <div className="area-metric-val" style={{ color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {(report.strengths?.length > 0 || report.watchouts?.length > 0) && (
        <div className="section">
          <div className="section-title">Area signals</div>
          <div className="pros-cons-grid pros-cons-grid--light">
            {report.strengths?.length > 0 && (
              <div className="pros-col">
                <div className="pros-cons-head">Strengths</div>
                <ul className="pros-cons-list">
                  {report.strengths.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>
            )}
            {report.watchouts?.length > 0 && (
              <div className="cons-col">
                <div className="pros-cons-head">Watchouts</div>
                <ul className="pros-cons-list">
                  {report.watchouts.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">AI insight</div>
        <AiInsightPanel footer={`Valora · ${report.postcode}`}>
          {insight?.opening && <p>{insight.opening}</p>}
          {insight?.trend && <p>{insight.trend}</p>}
          {insight?.investor && <p>{insight.investor}</p>}
          {insight?.closing && <p>{insight.closing}</p>}
          {!insight?.opening && typeof insight === 'string' && <p>{insight}</p>}
        </AiInsightPanel>
      </div>
      <div className="area-report-actions">
        <Link to="/discover" className="site-btn site-btn--primary">Find matching deals</Link>
        <Link to="/analyse" className="site-btn site-btn--ghost">Analyse a listing</Link>
      </div>
    </div>
  );
}
