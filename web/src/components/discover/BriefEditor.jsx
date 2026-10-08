import { useState } from 'react';
import {
  OBJECTIVES,
  OBJECTIVE_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  SCORE_COMPONENTS,
  SCORE_COMPONENT_LABELS,
  defaultWeights,
  deriveHardConstraints,
} from '../../../../shared/brief';

const SOFT_KINDS = [
  ['needs_modernisation', 'Needs modernising'],
  ['large_plot', 'Good-sized plot'],
  ['garden', 'Garden'],
  ['parking', 'Parking'],
  ['extension_potential', 'Extension potential'],
  ['below_market', 'Priced below comparables'],
  ['no_chain', 'No onward chain'],
  ['good_condition', 'Good condition'],
];

const numOrNull = (v) => {
  const n = parseFloat(String(v).replace(/[£,\s%]/g, ''));
  return Number.isFinite(n) ? n : null;
};

function ListInput({ id, label, values, onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...values, v]);
    setDraft('');
  };
  return (
    <div className="brief-field">
      <label htmlFor={id}>{label}</label>
      <div className="chip-list" style={{ marginBottom: 6 }}>
        {values.map((v) => (
          <span key={v} className="app-chip">
            {v}
            <button
              type="button"
              className="chip-x"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        id={id}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

/** Editable structured Investment Brief. `criteria` is the full schema object; onChange receives a new object. */
export default function BriefEditor({ name, onNameChange, criteria: c, onChange }) {
  const [showWeights, setShowWeights] = useState(false);
  const set = (patch) => {
    const next = { ...c, ...patch };
    next.hardConstraints = deriveHardConstraints(next);
    onChange(next);
  };

  const toggleType = (t) =>
    set({
      propertyTypes: c.propertyTypes.includes(t)
        ? c.propertyTypes.filter((x) => x !== t)
        : [...c.propertyTypes, t],
    });
  const toggleSoft = (kind, label) => {
    const has = c.softPreferences.some((p) => p.kind === kind);
    set({
      softPreferences: has
        ? c.softPreferences.filter((p) => p.kind !== kind)
        : [...c.softPreferences, { kind, description: label, importance: 2 }],
    });
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="brief-grid">
        <div className="brief-field">
          <label htmlFor="bf-name">Brief name</label>
          <input id="bf-name" value={name} onChange={(e) => onNameChange(e.target.value)} maxLength={120} />
        </div>
        <div className="brief-field">
          <label htmlFor="bf-objective">Strategy</label>
          <select
            id="bf-objective"
            value={c.objective}
            onChange={(e) =>
              set({ objective: e.target.value, objectiveWeights: defaultWeights(e.target.value) })
            }
          >
            {OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {OBJECTIVE_LABELS[o]}
              </option>
            ))}
          </select>
        </div>
        <div className="brief-field">
          <label htmlFor="bf-radius">Search radius (miles)</label>
          <input
            id="bf-radius"
            inputMode="decimal"
            placeholder="Automatic"
            value={c.location.radiusMiles ?? ''}
            onChange={(e) => set({ location: { ...c.location, radiusMiles: numOrNull(e.target.value) } })}
          />
        </div>
      </div>

      <div className="brief-grid">
        <ListInput
          id="bf-areas"
          label="Towns / cities"
          values={c.location.areas}
          placeholder="Type and press Enter"
          onChange={(areas) => set({ location: { ...c.location, areas } })}
        />
        <ListInput
          id="bf-postcodes"
          label="Postcodes"
          values={c.location.postcodes}
          placeholder="e.g. M20 or M20 2AB"
          onChange={(postcodes) =>
            set({ location: { ...c.location, postcodes: postcodes.map((p) => p.toUpperCase()) } })
          }
        />
      </div>

      <div className="brief-grid">
        <div className="brief-field">
          <label htmlFor="bf-min">Min price (£)</label>
          <input
            id="bf-min"
            inputMode="numeric"
            placeholder="None"
            value={c.budget.minimum ?? ''}
            onChange={(e) => set({ budget: { ...c.budget, minimum: numOrNull(e.target.value) } })}
          />
        </div>
        <div className="brief-field">
          <label htmlFor="bf-max">Max price (£)</label>
          <input
            id="bf-max"
            inputMode="numeric"
            placeholder="None"
            value={c.budget.maximum ?? ''}
            onChange={(e) => set({ budget: { ...c.budget, maximum: numOrNull(e.target.value) } })}
          />
        </div>
        <div className="brief-field">
          <label htmlFor="bf-beds">Min bedrooms</label>
          <input
            id="bf-beds"
            inputMode="numeric"
            placeholder="Any"
            value={c.bedrooms.minimum ?? ''}
            onChange={(e) =>
              set({
                bedrooms: {
                  ...c.bedrooms,
                  minimum: numOrNull(e.target.value) == null ? null : Math.round(numOrNull(e.target.value)),
                },
              })
            }
          />
        </div>
        <div className="brief-field">
          <label htmlFor="bf-maxbeds">Max bedrooms</label>
          <input
            id="bf-maxbeds"
            inputMode="numeric"
            placeholder="Any"
            value={c.bedrooms.maximum ?? ''}
            onChange={(e) =>
              set({
                bedrooms: {
                  ...c.bedrooms,
                  maximum: numOrNull(e.target.value) == null ? null : Math.round(numOrNull(e.target.value)),
                },
              })
            }
          />
        </div>
      </div>

      <div className="brief-field">
        <label>Property types (hard requirement — leave all off for any)</label>
        <div className="chip-list">
          {PROPERTY_TYPES.filter((t) => t !== 'other').map((t) => (
            <button
              key={t}
              type="button"
              className={`app-example-chip${c.propertyTypes.includes(t) ? ' is-active' : ''}`}
              aria-pressed={c.propertyTypes.includes(t)}
              onClick={() => toggleType(t)}
            >
              {c.propertyTypes.includes(t) ? '✓ ' : ''}
              {PROPERTY_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="brief-field">
        <label>Preferences (affect ranking, never exclude)</label>
        <div className="chip-list">
          {SOFT_KINDS.map(([k, l]) => {
            const on = c.softPreferences.some((p) => p.kind === k);
            return (
              <button
                key={k}
                type="button"
                className={`app-example-chip${on ? ' is-active' : ''}`}
                aria-pressed={on}
                onClick={() => toggleSoft(k, l)}
              >
                {on ? '✓ ' : ''}
                {l}
              </button>
            );
          })}
        </div>
      </div>

      <div className="brief-grid">
        <ListInput
          id="bf-req"
          label="Must have (hard)"
          values={c.requiredFeatures}
          placeholder="e.g. garage"
          onChange={(requiredFeatures) => set({ requiredFeatures })}
        />
        <ListInput
          id="bf-excl"
          label="Must not have (hard)"
          values={c.excludedFeatures}
          placeholder="e.g. auction"
          onChange={(excludedFeatures) => set({ excludedFeatures })}
        />
      </div>

      <div className="brief-grid">
        <div className="brief-field">
          <label htmlFor="bf-yield">Target gross yield (%)</label>
          <input
            id="bf-yield"
            inputMode="decimal"
            placeholder="None"
            value={c.financialTargets.minGrossYieldPct ?? ''}
            onChange={(e) =>
              set({
                financialTargets: { ...c.financialTargets, minGrossYieldPct: numOrNull(e.target.value) },
              })
            }
          />
        </div>
        <div className="brief-field">
          <label htmlFor="bf-cf">Target cash flow (£/month)</label>
          <input
            id="bf-cf"
            inputMode="numeric"
            placeholder="None"
            value={c.financialTargets.minMonthlyCashFlow ?? ''}
            onChange={(e) =>
              set({
                financialTargets: { ...c.financialTargets, minMonthlyCashFlow: numOrNull(e.target.value) },
              })
            }
          />
        </div>
        <div className="brief-field">
          <label htmlFor="bf-reno">Renovation appetite</label>
          <select
            id="bf-reno"
            value={c.renovation.appetite ?? ''}
            onChange={(e) => set({ renovation: { ...c.renovation, appetite: e.target.value || null } })}
          >
            <option value="">Not specified</option>
            <option value="none">None</option>
            <option value="cosmetic">Cosmetic</option>
            <option value="moderate">Moderate</option>
            <option value="extensive">Extensive</option>
          </select>
        </div>
        <div className="brief-field">
          <label htmlFor="bf-risk">Risk tolerance</label>
          <select
            id="bf-risk"
            value={c.risk.tolerance ?? ''}
            onChange={(e) => set({ risk: { tolerance: e.target.value || null } })}
          >
            <option value="">Medium (default)</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div className="brief-field">
        <label>Needs investigation (assessed with evidence, never assumed)</label>
        <div className="chip-list">
          {c.investigationCriteria.length ? (
            c.investigationCriteria.map((i) => (
              <span key={i.description} className="app-chip">
                {i.description}
              </span>
            ))
          ) : (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>None</span>
          )}
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              textTransform: 'none',
              letterSpacing: 0,
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            <input
              type="checkbox"
              checked={c.development.extensionInterest}
              onChange={(e) =>
                set({ development: { ...c.development, extensionInterest: e.target.checked } })
              }
            />{' '}
            Interested in extension potential
          </label>
        </div>
      </div>

      <div>
        <button
          type="button"
          className="app-btn app-btn--ghost"
          onClick={() => setShowWeights((v) => !v)}
          aria-expanded={showWeights}
        >
          {showWeights ? 'Hide ranking priorities' : 'Adjust ranking priorities'}
        </button>
        {showWeights && (
          <div className="brief-grid" style={{ marginTop: 10 }}>
            {SCORE_COMPONENTS.map((k) => (
              <div key={k} className="brief-field">
                <label htmlFor={`bf-w-${k}`}>
                  {SCORE_COMPONENT_LABELS[k]}: {c.objectiveWeights[k]}
                </label>
                <input
                  id={`bf-w-${k}`}
                  type="range"
                  min="0"
                  max="5"
                  step="1"
                  value={c.objectiveWeights[k]}
                  onChange={(e) =>
                    set({ objectiveWeights: { ...c.objectiveWeights, [k]: Number(e.target.value) } })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="brief-grid">
        <div>
          <div className="brief-field">
            <label>Hard requirements (enforced)</label>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {c.hardConstraints.length ? (
              c.hardConstraints.map((h) => <li key={h.description}>{h.description}</li>)
            ) : (
              <li>None</li>
            )}
          </ul>
        </div>
        {(c.assumptions.length > 0 || c.missingInformation.length > 0) && (
          <div>
            <div className="brief-field">
              <label>Assumptions &amp; missing information</label>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--muted)' }}>
              {c.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
              {c.missingInformation.map((m) => (
                <li key={m}>Missing: {m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
