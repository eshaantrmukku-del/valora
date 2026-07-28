import { useMemo, useState } from 'react';
import AppPage from '../components/AppPage';
import { IlluTools } from '../components/AppIllustrations';
import {
  getInvestorPrefs,
  mortgagePayment,
  stampDutyEngland,
  yieldMetrics,
} from '../lib/investor';

const TABS = [
  { id: 'mortgage', label: 'Mortgage' },
  { id: 'yield', label: 'Yield' },
  { id: 'stamp', label: 'Stamp duty' },
  { id: 'afford', label: 'Affordability' },
];

function Field({ label, children }) {
  return (
    <label className="tool-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Result({ label, value, hint }) {
  return (
    <div className="tool-result">
      <div className="tool-result-label">{label}</div>
      <div className="tool-result-value">{value}</div>
      {hint && <div className="tool-result-hint">{hint}</div>}
    </div>
  );
}

export default function Tools() {
  const prefs = getInvestorPrefs();
  const [tab, setTab] = useState('mortgage');

  const [price, setPrice] = useState(prefs.maxBudget || 300000);
  const [depositPct, setDepositPct] = useState(prefs.depositPct || 25);
  const [depositCash, setDepositCash] = useState(() => Math.round((prefs.maxBudget || 300000) * ((prefs.depositPct || 25) / 100)));
  const [rate, setRate] = useState(prefs.interestRate || 4.5);
  const [years, setYears] = useState(prefs.termYears || 25);
  const [rent, setRent] = useState(1400);
  const [costs, setCosts] = useState(2400);
  const [income, setIncome] = useState(65000);
  const [ftb, setFtb] = useState(false);
  const [additional, setAdditional] = useState(true);
  const [interestOnly, setInterestOnly] = useState(true);

  const deposit = useMemo(() => Math.round(price * (depositPct / 100)), [price, depositPct]);
  const loan = Math.max(0, price - deposit);
  const payment = useMemo(
    () => mortgagePayment(loan, rate, years, interestOnly),
    [loan, rate, years, interestOnly],
  );
  const yields = useMemo(() => yieldMetrics({ price, monthlyRent: rent, costsAnnual: costs }), [price, rent, costs]);
  const sdlt = useMemo(
    () => stampDutyEngland(price, { firstTimeBuyer: ftb && !additional, additionalDwelling: additional }),
    [price, ftb, additional],
  );
  const maxLoan = income * 4.5;
  const maxPrice = maxLoan + depositCash;
  const coverage = payment > 0 ? (rent / payment) : null;

  return (
    <AppPage
      eyebrow="Calculators"
      title="Tools"
      subtitle="Mortgage, yield, stamp duty, and affordability — using your investor defaults where relevant."
      art={<IlluTools className="app-illu app-illu--header" />}
    >
      <div className="tool-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tool-tab${tab === t.id ? ' tool-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tool-grid">
        <div className="tool-panel">
          {tab === 'mortgage' && (
            <>
              <Field label="Property price (£)">
                <input type="number" value={price} onChange={(e) => setPrice(+e.target.value)} />
              </Field>
              <Field label={`Deposit (${depositPct}%) — £${deposit.toLocaleString()}`}>
                <input type="range" min="5" max="50" value={depositPct} onChange={(e) => setDepositPct(+e.target.value)} />
              </Field>
              <Field label="Interest rate (%)">
                <input type="number" step="0.1" value={rate} onChange={(e) => setRate(+e.target.value)} />
              </Field>
              <Field label="Term (years)">
                <input type="number" value={years} onChange={(e) => setYears(+e.target.value)} />
              </Field>
              <label className="tool-check">
                <input type="checkbox" checked={interestOnly} onChange={(e) => setInterestOnly(e.target.checked)} />
                Interest-only (common for BTL)
              </label>
              <Field label="Assumed monthly rent (£) for coverage">
                <input type="number" value={rent} onChange={(e) => setRent(+e.target.value)} />
              </Field>
            </>
          )}

          {tab === 'yield' && (
            <>
              <Field label="Purchase price (£)">
                <input type="number" value={price} onChange={(e) => setPrice(+e.target.value)} />
              </Field>
              <Field label="Monthly rent (£)">
                <input type="number" value={rent} onChange={(e) => setRent(+e.target.value)} />
              </Field>
              <Field label="Annual costs (£)">
                <input type="number" value={costs} onChange={(e) => setCosts(+e.target.value)} />
              </Field>
              <p className="tool-note">Your target yield is {prefs.targetYield}%. Current gross: {yields.grossYield}%.</p>
            </>
          )}

          {tab === 'stamp' && (
            <>
              <Field label="Purchase price (£)">
                <input type="number" value={price} onChange={(e) => setPrice(+e.target.value)} />
              </Field>
              <label className="tool-check">
                <input
                  type="checkbox"
                  checked={additional}
                  onChange={(e) => {
                    setAdditional(e.target.checked);
                    if (e.target.checked) setFtb(false);
                  }}
                />
                Additional dwelling / buy-to-let (+higher rates)
              </label>
              <label className="tool-check">
                <input
                  type="checkbox"
                  checked={ftb}
                  disabled={additional}
                  onChange={(e) => setFtb(e.target.checked)}
                />
                First-time buyer relief (England, main home only)
              </label>
              <p className="tool-note">Uses simplified England residential bands including higher rates for additional properties. Not advice — verify with a solicitor.</p>
            </>
          )}

          {tab === 'afford' && (
            <>
              <Field label="Gross household income (£)">
                <input type="number" value={income} onChange={(e) => setIncome(+e.target.value)} />
              </Field>
              <Field label="Cash deposit available (£)">
                <input type="number" value={depositCash} onChange={(e) => setDepositCash(+e.target.value)} />
              </Field>
              <p className="tool-note">Uses a simple 4.5× income stress. Buy-to-let lenders also stress rent coverage.</p>
            </>
          )}
        </div>

        <div className="tool-results">
          {tab === 'mortgage' && (
            <>
              <Result
                label={interestOnly ? 'Interest-only payment' : 'Repayment payment'}
                value={`£${Math.round(payment).toLocaleString()}`}
                hint={`${years} years @ ${rate}%`}
              />
              <Result label="Loan amount" value={`£${loan.toLocaleString()}`} hint={`${depositPct}% deposit = £${deposit.toLocaleString()}`} />
              <Result
                label="Rent coverage"
                value={coverage != null ? `${coverage.toFixed(2)}×` : '—'}
                hint={coverage != null && coverage < 1.25 ? 'Below typical 125% stress' : 'Vs monthly payment'}
              />
              {!interestOnly && (
                <Result label="Total repayable" value={`£${Math.round(payment * years * 12).toLocaleString()}`} />
              )}
            </>
          )}
          {tab === 'yield' && (
            <>
              <Result
                label="Gross yield"
                value={`${yields.grossYield}%`}
                hint={yields.grossYield >= prefs.targetYield ? `Meets your ${prefs.targetYield}% target` : `Target ${prefs.targetYield}%`}
              />
              <Result label="Net yield" value={`${yields.netYield}%`} hint="After annual costs" />
              <Result label="Annual rent" value={`£${yields.annualRent.toLocaleString()}`} />
            </>
          )}
          {tab === 'stamp' && (
            <>
              <Result
                label="Estimated SDLT"
                value={`£${Math.round(sdlt).toLocaleString()}`}
                hint={additional ? 'Higher rates (additional dwelling)' : ftb ? 'FTB relief applied' : 'Standard residential'}
              />
              <Result label="Effective rate" value={`${price ? ((sdlt / price) * 100).toFixed(2) : 0}%`} />
              <Result label="Total cash needed" value={`£${(deposit + Math.round(sdlt)).toLocaleString()}`} hint="Deposit + stamp (excl. fees)" />
            </>
          )}
          {tab === 'afford' && (
            <>
              <Result label="Indicative max loan" value={`£${Math.round(maxLoan).toLocaleString()}`} hint="4.5 × income" />
              <Result label="Max purchase with deposit" value={`£${Math.round(maxPrice).toLocaleString()}`} hint="Loan + cash deposit" />
              <Result label="Your cash deposit" value={`£${depositCash.toLocaleString()}`} />
            </>
          )}
        </div>
      </div>
    </AppPage>
  );
}
