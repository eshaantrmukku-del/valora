import { Link } from 'react-router-dom';
import ScoreRing from './ScoreRing';
import AiInsightPanel from './AiInsightPanel';
import { scoreColor, tagClass, riskIcon } from '../lib/utils';

export default function PropertyReport({ property: p }) {
  const color = scoreColor(p.score);
  const areaLink = p.postcode
    ? `/area-intel?q=${encodeURIComponent(p.postcode)}`
    : `/area-intel?q=${encodeURIComponent(p.location || '')}`;
  const area = p.areaIntel || {
    schools: '—',
    crime: '—',
    transport: '—',
    priceGrowth: '—',
  };
  const insight = p.aiInsight;

  return (
    <div className="page" id="analyse-report">
      {p.hasLiveData ? (
        <div className="prototype-banner prototype-banner--live">
          Live details from {p.sourcePortal}
          {p.dataSource ? ` (${p.dataSource})` : ''}: {p.priceLabel || `£${p.price?.toLocaleString()}`}
          {p.priceIsEstimated ? ' · purchase price estimated from area averages' : ''}.
          Yields and scores are modelled — verify on the listing.
        </div>
      ) : (
        <div className="prototype-banner">
          Could not fetch live listing data. Re-run with a live Rightmove, Zoopla, or OnTheMarket URL.
        </div>
      )}
      {p.briefMatch && (
        <div className="brief-match-banner">
          <div className="brief-match-pct">{p.briefMatch.matchPct}% match</div>
          <div className="brief-match-body">
            <div className="brief-match-title">
              {p.brief?.name || p.briefMatch.briefName || 'Investment Brief'}
            </div>
            <ul className="brief-match-list">
              {(p.briefMatch.checklist || []).slice(0, 6).map((c) => (
                <li key={c.text} className={c.ok ? 'is-ok' : c.warn ? 'is-warn' : 'is-no'}>
                  {c.ok ? '✓' : c.warn ? '⚠' : '·'} {c.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="page-hero">
        <div className="prop-images">
          {p.images?.length > 0 || p.image ? (
            <>
              <img
                className="prop-img main prop-img--photo"
                src={(p.images && p.images[0]) || p.image}
                alt=""
              />
              {p.images?.length > 1 && (
                <div className="prop-img-thumbs">
                  {p.images.slice(1, 5).map((src) => (
                    <img key={src} className="prop-img-thumb" src={src} alt="" />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="prop-img main">{p.emoji || '🏠'}</div>
          )}
        </div>
        <div className="prop-hero-info">
          <div className="prop-breadcrumb"><span>Analysis</span> › <span>{p.sourcePortal || 'Listing'}</span></div>
          <div className="prop-name">{p.name}</div>
          <div className="prop-address">{p.address}</div>
          {p.sourceUrl && (
            <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="prop-source-link">
              Open original listing →
            </a>
          )}
          <div className="prop-tags">
            {p.tags.map((t) => <span key={t} className={`ptag ${tagClass(t)}`}>{t}</span>)}
          </div>
          <div className="prop-quick-facts">
            {p.facts.map((f) => (
              <div key={f.label} className="pqf">
                <div className="pqf-val">{f.value}</div>
                <div className="pqf-label">{f.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="score-widget">
          <div className="sw-label">Investment score</div>
          <div className="sw-score" style={{ color }}>{p.score}</div>
          <div className="sw-grade" style={{ color }}>{p.grade}</div>
          <ScoreRing score={p.score} />
        </div>
      </div>

      <div className="page-body">
        <div className="main-col">
          {insight && (
            <div className="panel panel--ai">
              <div className="panel-head"><div className="panel-title">Valora AI summary</div></div>
              <div className="panel-body">
                <AiInsightPanel footer={`${p.location} · ${p.strategy} · every figure cited from data or calculation`}>
                  <p>{insight.opening}</p>
                  <p>{insight.yieldLine}</p>
                  <p>{insight.strategyLine}</p>
                  <p>{insight.valueLine}</p>
                  {insight.conditionLine && <p>{insight.conditionLine}</p>}
                  {insight.prefsLine && <p>{insight.prefsLine}</p>}
                </AiInsightPanel>
              </div>
            </div>
          )}

          {p.scoreBreakdown?.length > 0 && (
            <div className="panel">
              <div className="panel-head"><div className="panel-title">Score breakdown</div></div>
              <div className="panel-body">
                <div className="score-breakdown">
                  {p.scoreBreakdown.map((item) => (
                    <div key={item.text} className={`score-breakdown-item score-breakdown-item--${item.impact}`}>
                      <span className="score-breakdown-label">{item.label}</span>
                      <span className="score-breakdown-text">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">{p.strategyKey === 'flip' ? 'Refurb & flip economics' : 'Financial summary'}</div>
              <span className="panel-badge">Deterministic</span>
            </div>
            <div className="panel-body">
              <div className="metrics-4">
                <div className="mc"><div className="mc-l">Purchase price</div><div className="mc-v">{p.metrics.land}</div></div>
                <div className="mc"><div className="mc-l">Refurb est.</div><div className="mc-v">{p.metrics.build}</div></div>
                <div className="mc"><div className="mc-l">{p.strategyKey === 'flip' ? 'All-in cost' : (p.deal ? 'Cash required' : 'Total cost')}</div><div className="mc-v">{p.metrics.total}</div></div>
                <div className="mc"><div className="mc-l">{p.metrics.returnLabel}</div><div className="mc-v" style={{ color: 'var(--green)' }}>{p.metrics.return}</div></div>
              </div>
              {p.deal && p.strategyKey === 'flip' && p.flip && (
                <div className="deal-grid">
                  {[
                    ['Deposit', `£${p.deal.deposit.toLocaleString()}`, `${p.deal.depositPct}%`],
                    ['Stamp duty', `£${p.deal.stampDuty.toLocaleString()}`, 'incl. surcharge'],
                    ['Works (mid)', `£${p.flip.works.toLocaleString()}`, p.condition?.overall || 'rule-based'],
                    ['GDV proxy', p.flip.gdv ? `£${p.flip.gdv.toLocaleString()}` : '—', 'sold median'],
                    ['All-in cost', `£${p.flip.totalIn.toLocaleString()}`, 'price + works'],
                    ['Uplift vs GDV', p.flip.uplift != null ? `£${p.flip.uplift.toLocaleString()}` : '—', p.flip.upliftPct != null ? `${p.flip.upliftPct}%` : 'after works'],
                  ].map(([l, v, hint]) => (
                    <div key={l} className="deal-cell">
                      <div className="deal-cell-label">{l}</div>
                      <div className="deal-cell-val" style={l === 'Uplift vs GDV' && p.flip.uplift != null ? { color: p.flip.uplift >= 0 ? 'var(--green)' : 'var(--red, #dc2626)' } : undefined}>{v}</div>
                      <div className="deal-cell-hint">{hint}</div>
                    </div>
                  ))}
                </div>
              )}
              {p.deal && p.strategyKey !== 'flip' && (
                <div className="deal-grid">
                  {[
                    ['Deposit', `£${p.deal.deposit.toLocaleString()}`, `${p.deal.depositPct}%`],
                    ['Stamp duty', `£${p.deal.stampDuty.toLocaleString()}`, 'incl. surcharge'],
                    ['Legal & survey', `£${p.deal.legalFees.toLocaleString()}`, 'estimate'],
                    ['Mortgage / mo', `£${p.deal.monthlyMortgage.toLocaleString()}`, `${p.deal.interestRate}% ${p.deal.interestOnly ? 'IO' : 'repay'}`],
                    ['Cash flow / mo', `£${p.deal.monthlyCashFlow.toLocaleString()}`, `after ${p.deal.annualCostsPct}% costs`],
                    ['Break-even rent', `£${p.deal.breakEvenRent.toLocaleString()}`, 'per month'],
                  ].map(([l, v, hint]) => (
                    <div key={l} className="deal-cell">
                      <div className="deal-cell-label">{l}</div>
                      <div className="deal-cell-val" style={l === 'Cash flow / mo' ? { color: p.deal.monthlyCashFlow >= 0 ? 'var(--green)' : 'var(--red, #dc2626)' } : undefined}>{v}</div>
                      <div className="deal-cell-hint">{hint}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <div className={`uv-strip uv-strip--${p.undervalued?.tone || 'unknown'}`}>
                  <div className="uv-left">
                    <div className="uv-title">{p.undervalued?.title || 'Price check'}</div>
                    <div className="uv-desc">{p.undervalued?.desc}</div>
                    {p.comparables?.verdict?.label && (
                      <div className="uv-verdict">{p.comparables.verdict.label}</div>
                    )}
                  </div>
                  <div className="uv-badge">{p.undervalued?.badge}</div>
                </div>
              </div>
            </div>
          </div>

          {p.comparables && (
            <div className="panel">
              <div className="panel-head">
                <div className="panel-title">Sold comparables</div>
                <span className="panel-badge">{p.comparables.available ? 'HM Land Registry' : 'Unavailable'}</span>
              </div>
              <div className="panel-body">
                {p.comparables.available ? (
                  <>
                    <div className="metrics-4" style={{ marginBottom: 12 }}>
                      <div className="mc"><div className="mc-l">Sold median</div><div className="mc-v">£{p.comparables.median.toLocaleString()}</div></div>
                      <div className="mc"><div className="mc-l">Sold average</div><div className="mc-v">£{p.comparables.average.toLocaleString()}</div></div>
                      <div className="mc"><div className="mc-l">Asking vs median</div><div className="mc-v" style={{ color: p.comparables.deviationPct <= 0 ? 'var(--green)' : 'var(--text)' }}>{p.comparables.deviationPct > 0 ? '+' : ''}{p.comparables.deviationPct}%</div></div>
                      <div className="mc"><div className="mc-l">Records (2yr)</div><div className="mc-v">{p.comparables.count}</div></div>
                    </div>
                    <table className="comps-table">
                      <thead>
                        <tr><th>Sold</th><th>Price</th><th>Street</th><th>Postcode</th><th>Type</th></tr>
                      </thead>
                      <tbody>
                        {p.comparables.sample.map((c) => (
                          <tr key={`${c.date}-${c.price}-${c.postcode}`}>
                            <td>{c.date}</td>
                            <td>£{c.price.toLocaleString()}</td>
                            <td style={{ textTransform: 'capitalize' }}>{(c.street || '—').toLowerCase()}</td>
                            <td>{c.postcode || '—'}</td>
                            <td>{c.propertyType || '—'}{c.newBuild ? ' · new' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="panel-footnote">
                      {p.comparables.note} · {p.comparables.district ? `${p.comparables.district} district` : ''} · Source: {p.comparables.source}
                    </div>
                  </>
                ) : (
                  <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                    No sold transactions found for this district in the last two years, so no market-discount claim is made and the discount factor scores neutral.
                  </p>
                )}
              </div>
            </div>
          )}

          {p.condition && (
            <div className="panel">
              <div className="panel-head">
                <div className="panel-title">Condition &amp; refurbishment</div>
                <span className="panel-badge">
                  {p.condition.vision ? 'Text + photos' : 'Rule-based'}
                </span>
              </div>
              <div className="panel-body">
                {p.condition.verdict && (
                  <div className={`cond-verdict cond-verdict--${p.condition.verdict.tone || 'unknown'}`}>
                    <strong>{p.condition.verdict.label}</strong>
                    <p>{p.condition.verdict.summary}</p>
                    {p.condition.verdict.evidence?.length > 0 && (
                      <div className="cond-verdict-evidence">
                        {p.condition.verdict.evidence.map((e) => (
                          <span key={e} className="app-chip">{e}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="metrics-4" style={{ marginBottom: 12 }}>
                  <div className="mc"><div className="mc-l">Overall condition</div><div className="mc-v">{p.condition.overall}</div></div>
                  <div className="mc"><div className="mc-l">Refurb estimate</div><div className="mc-v">{p.condition.refurbHigh ? `£${p.condition.refurbLow.toLocaleString()}–£${p.condition.refurbHigh.toLocaleString()}` : 'Not priced (no works signals)'}</div></div>
                  <div className="mc"><div className="mc-l">Tenure</div><div className="mc-v">{p.tenure || 'Unknown'}</div></div>
                  <div className="mc"><div className="mc-l">EPC</div><div className="mc-v">{p.epc || 'Unknown'}</div></div>
                </div>

                {p.condition.vision?.rooms && Object.keys(p.condition.vision.rooms).length > 0 && (
                  <div className="vision-rooms" style={{ marginBottom: 12 }}>
                    <div className="panel-footnote" style={{ marginTop: 0, marginBottom: 8 }}>
                      Photo assessment · {p.condition.vision.confidence} confidence · {p.condition.vision.imagesUsed} images · {p.condition.vision.source}
                    </div>
                    <div className="vision-room-grid">
                      {Object.entries(p.condition.vision.rooms)
                        .filter(([, v]) => v && v !== 'Unknown')
                        .map(([room, rating]) => (
                          <div key={room} className="vision-room">
                            <span className="vision-room-name">{room}</span>
                            <span className={`vision-room-rating vision-room-rating--${String(rating).toLowerCase().replace(/\s+/g, '-')}`}>{rating}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {p.condition.lineItems?.length > 0 && (
                  <table className="refurb-table" style={{ marginBottom: 10 }}>
                    <thead>
                      <tr><th>Item</th><th>Rating</th><th className="cost">Est. cost</th></tr>
                    </thead>
                    <tbody>
                      {p.condition.lineItems.map((item) => (
                        <tr key={`${item.room}-${item.rating}`}>
                          <td style={{ textTransform: 'capitalize' }}>{item.room}</td>
                          <td>{item.rating}</td>
                          <td className="cost">£{item.low.toLocaleString()}–£{item.high.toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={2}>Total (rule table)</td>
                        <td className="cost">£{p.condition.refurbLow.toLocaleString()}–£{p.condition.refurbHigh.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {p.condition.signals?.length > 0 && (
                  <div className="risk-tags">
                    {p.condition.signals.map((s) => (
                      <span key={s} className="rtag info">“{s}”</span>
                    ))}
                  </div>
                )}
                <div className="panel-footnote">
                  {p.condition.source}. Vision classifies finish only — pounds always come from the fixed cost table, never from the model.
                </div>
              </div>
            </div>
          )}

          {(p.pros?.length > 0 || p.cons?.length > 0) && (
            <div className="panel">
              <div className="panel-head"><div className="panel-title">Pros &amp; cons</div></div>
              <div className="panel-body pros-cons-grid">
                <div className="pros-col">
                  <div className="pros-cons-head">Strengths</div>
                  <ul className="pros-cons-list">
                    {p.pros.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
                <div className="cons-col">
                  <div className="pros-cons-head">Watchouts</div>
                  <ul className="pros-cons-list">
                    {p.cons.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><div className="panel-title">Risk assessment</div></div>
            <div className="panel-body">
              <div className="risk-tags">
                {p.risks.map((r) => (
                  <span key={r.text} className={`rtag ${r.type}`}>{riskIcon(r.type)} {r.text}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="side-col">
          <div className="panel">
            <div className="panel-head"><div className="panel-title">Rental estimate</div></div>
            <div className="panel-body">
              <div className="rental-bars">
                {[
                  ['Conservative', p.rental.conservative, 70, 'var(--light)', false],
                  ['Expected', p.rental.expected, 82, 'var(--blue)', true],
                  ['Optimistic', p.rental.optimistic, 92, 'var(--green)', false],
                ].map(([label, val, w, bg, bold]) => (
                  <div key={label} className="rb-row">
                    <span className="rb-label" style={{ fontSize: 10, color: bold ? 'var(--text)' : 'var(--muted)', fontWeight: bold ? 600 : 400 }}>{label}</span>
                    <div className="rb-bar-wrap"><div className="rb-bar" style={{ width: `${w}%`, background: bg }} /></div>
                    <span className="rb-val" style={bold ? { color: 'var(--blue)', fontWeight: 700 } : {}}>£{val.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="gdv-box"><div className="gdv-label">Gross yield</div><div className="gdv-val" style={{ fontSize: 15 }}>{p.rental.grossYield}</div></div>
                  <div className="gdv-box"><div className="gdv-label">Net yield</div><div className="gdv-val" style={{ fontSize: 15 }}>{p.rental.netYield}</div></div>
                </div>
              </div>
              {p.rentEstimate && (
                <div className="panel-footnote">
                  Confidence: <strong style={{ textTransform: 'capitalize' }}>{p.rentEstimate.confidence}</strong> — {p.rentEstimate.source}
                </div>
              )}
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Area intelligence</div>
              <Link to={areaLink} className="panel-action">Full report →</Link>
            </div>
            <div className="panel-body">
              {[
                ['🏫 Schools', area.schools, 'var(--blue)'],
                ['🚔 Crime', area.crime, 'var(--green)'],
                ['🚇 Transport', area.transport, 'var(--green)'],
                ['📈 Price growth', area.priceGrowth, 'var(--green)'],
              ].map(([l, v, c]) => (
                <div key={l} className="area-row"><span className="area-label">{l}</span><span className="area-val" style={{ color: c }}>{v}</span></div>
              ))}
              {area.vsPropertyYield && (
                <div className="area-row area-row--highlight">
                  <span className="area-label">Yield vs area</span>
                  <span className="area-val" style={{ color: 'var(--blue)' }}>{area.vsPropertyYield}</span>
                </div>
              )}
            </div>
          </div>
          {p.provenance && (
            <div className="panel">
              <div className="panel-head"><div className="panel-title">Where every number comes from</div></div>
              <div className="panel-body provenance-list">
                {[
                  ['Listing', p.provenance.listing],
                  ['Sold prices', p.provenance.soldPrices],
                  ['Geocoding', p.provenance.geo],
                  ['Rent', p.provenance.rent],
                  ['Area stats', p.provenance.areaStats],
                  ['Financials', p.provenance.financials],
                  ['Score', p.provenance.score],
                ].map(([l, v]) => (
                  <div key={l} className="provenance-row">
                    <span className="provenance-label">{l}</span>
                    <span className="provenance-val">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
