import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppPage from '../components/AppPage';
import EmptyState from '../components/EmptyState';
import {
  deleteBrief,
  getBriefs,
  getNotificationPrefs,
  getProfile,
  saveNotificationPrefs,
  saveProfile,
  toggleBrief,
} from '../lib/storage';
import { getInvestorPrefs, saveInvestorPrefs } from '../lib/investor';
import { useStore } from '../hooks/useStore';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'investor', label: 'Investor' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'account', label: 'Account' },
];

export default function Settings() {
  useStore();
  const navigate = useNavigate();
  const { showToast } = useApp();
  const { user, logout } = useAuth();
  const [section, setSection] = useState('profile');
  const [profile, setProfile] = useState(() => {
    const stored = getProfile();
    return {
      firstName: stored.firstName || user?.firstName || '',
      lastName: stored.lastName || user?.lastName || '',
      email: stored.email || user?.email || '',
    };
  });
  const [prefs, setPrefs] = useState(getInvestorPrefs);
  const [notifications, setNotifications] = useState(getNotificationPrefs);
  const briefs = getBriefs();

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && SECTIONS.some((s) => s.id === hash)) setSection(hash);
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfile((p) => ({
      ...p,
      email: p.email || user.email || '',
      firstName: p.firstName || user.firstName || '',
      lastName: p.lastName || user.lastName || '',
    }));
  }, [user]);

  const saveProfileForm = () => {
    saveProfile(profile);
    showToast('Profile saved', 'Your details are stored in this browser');
  };

  const savePrefsForm = () => {
    saveInvestorPrefs(prefs);
    showToast('Investor prefs saved', 'Used as defaults across Analyse and Tools');
  };

  const toggleNotif = (key) => {
    const next = { ...notifications, [key]: !notifications[key] };
    setNotifications(next);
    saveNotificationPrefs(next);
    showToast('Saved', 'Notification preference updated');
  };

  const onLogout = () => {
    logout();
    navigate('/', { replace: true, viewTransition: true });
  };

  return (
    <AppPage
      title="Settings"
      subtitle="Profile, investor defaults, briefs, and alerts — stored in this browser"
    >
      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`settings-nav-item${section === s.id ? ' active' : ''}`}
              onClick={() => { setSection(s.id); window.location.hash = s.id; }}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {section === 'profile' && (
            <div className="settings-card">
              <div className="settings-card-head"><h2>Profile</h2><p>Used to personalise your overview</p></div>
              <div className="settings-card-body">
                <div className="form-grid">
                  <div className="form-row">
                    <label htmlFor="firstName">First name</label>
                    <input id="firstName" type="text" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} />
                  </div>
                  <div className="form-row">
                    <label htmlFor="lastName">Last name</label>
                    <input id="lastName" type="text" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} />
                  </div>
                </div>
                <div className="form-row" style={{ marginTop: 14 }}>
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
                </div>
                <button type="button" className="app-btn app-btn--primary" style={{ marginTop: 16 }} onClick={saveProfileForm}>
                  Save profile
                </button>
              </div>
            </div>
          )}

          {section === 'investor' && (
            <div className="settings-card">
              <div className="settings-card-head"><h2>Investor defaults</h2><p>Seed Analyse, Tools, and Discover with your criteria</p></div>
              <div className="settings-card-body">
                <div className="form-grid">
                  <div className="form-row">
                    <label htmlFor="strategy">Primary strategy</label>
                    <select id="strategy" value={prefs.strategy} onChange={(e) => setPrefs({ ...prefs, strategy: e.target.value })}>
                      <option value="buy-to-let">Buy-to-let</option>
                      <option value="hmo">HMO</option>
                      <option value="flip">Refurb / flip</option>
                      <option value="brr">BRR</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="risk">Risk tolerance</label>
                    <select id="risk" value={prefs.riskTolerance} onChange={(e) => setPrefs({ ...prefs, riskTolerance: e.target.value })}>
                      <option value="conservative">Conservative</option>
                      <option value="balanced">Balanced</option>
                      <option value="aggressive">Aggressive</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="yield">Target yield (%)</label>
                    <input id="yield" type="number" step="0.1" value={prefs.targetYield} onChange={(e) => setPrefs({ ...prefs, targetYield: +e.target.value })} />
                  </div>
                  <div className="form-row">
                    <label htmlFor="budget">Max budget (£)</label>
                    <input id="budget" type="number" value={prefs.maxBudget} onChange={(e) => setPrefs({ ...prefs, maxBudget: +e.target.value })} />
                  </div>
                  <div className="form-row">
                    <label htmlFor="deposit">Deposit (%)</label>
                    <input id="deposit" type="number" value={prefs.depositPct} onChange={(e) => setPrefs({ ...prefs, depositPct: +e.target.value })} />
                  </div>
                  <div className="form-row">
                    <label htmlFor="rate">Assumed rate (%)</label>
                    <input id="rate" type="number" step="0.1" value={prefs.interestRate} onChange={(e) => setPrefs({ ...prefs, interestRate: +e.target.value })} />
                  </div>
                  <div className="form-row">
                    <label htmlFor="term">Mortgage term (years)</label>
                    <input id="term" type="number" value={prefs.termYears} onChange={(e) => setPrefs({ ...prefs, termYears: +e.target.value })} />
                  </div>
                  <div className="form-row" style={{ gridColumn: '1 / -1' }}>
                    <label>Focus regions</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                      {['north', 'midlands', 'south', 'scotland', 'wales'].map((r) => {
                        const on = (prefs.regions || []).includes(r);
                        return (
                          <button
                            key={r}
                            type="button"
                            className={`app-example-chip${on ? ' is-on' : ''}`}
                            style={on ? { background: '#dbeafe', borderColor: '#93c5fd', color: '#1d4ed8' } : undefined}
                            onClick={() => {
                              const regions = on
                                ? (prefs.regions || []).filter((x) => x !== r)
                                : [...(prefs.regions || []), r];
                              setPrefs({ ...prefs, regions });
                            }}
                          >
                            {r.charAt(0).toUpperCase() + r.slice(1)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <button type="button" className="app-btn app-btn--primary" style={{ marginTop: 16 }} onClick={savePrefsForm}>
                  Save investor prefs
                </button>
                <p style={{ marginTop: 12, fontSize: 12, color: 'var(--v-muted)' }}>
                  These prefs drive Analyse scores, mortgage modelling, Tools defaults, and Discover brief matching.
                </p>
              </div>
            </div>
          )}

          {section === 'alerts' && (
            <div className="settings-card">
              <div className="settings-card-head"><h2>Saved briefs</h2><p>From Discover — used to match your analyses</p></div>
              <div className="settings-card-body">
                {briefs.length === 0 ? (
                  <EmptyState
                    title="No saved briefs"
                    description="Save a search brief on the Discover page to track criteria here."
                    actionTo="/discover"
                    actionLabel="Go to Discover"
                  />
                ) : (
                  briefs.map((b) => (
                    <div key={b.id} className="toggle-row">
                      <div className="toggle-info">
                        <div className="toggle-label">{b.query}</div>
                        <div className="toggle-desc">Saved {new Date(b.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div className="brief-actions">
                        <button type="button" className={`toggle${b.active ? ' on' : ''}`} onClick={() => toggleBrief(b.id)} aria-label="Toggle" />
                        <button type="button" className="row-btn" onClick={() => { deleteBrief(b.id); showToast('Deleted', 'Brief removed'); }}>Delete</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {section === 'notifications' && (
            <div className="settings-card">
              <div className="settings-card-head"><h2>Notifications</h2><p>Preferences for when email is connected</p></div>
              <div className="settings-card-body">
                {[
                  ['dealAlerts', 'Deal alerts when briefs match'],
                  ['weeklyDigest', 'Weekly market digest'],
                  ['portfolioPerformance', 'Portfolio performance updates'],
                ].map(([key, label]) => (
                  <div key={key} className="toggle-row">
                    <div className="toggle-info"><div className="toggle-label">{label}</div></div>
                    <button type="button" className={`toggle${notifications[key] ? ' on' : ''}`} onClick={() => toggleNotif(key)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === 'account' && (
            <div className="settings-card">
              <div className="settings-card-head"><h2>Account</h2><p>Signed in as {user?.email || '—'}</p></div>
              <div className="settings-card-body">
                <p style={{ fontSize: 14, color: 'var(--v-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                  Your workspace tabs stay locked until someone is signed in on this browser.
                </p>
                <button type="button" className="app-btn app-btn--ghost" onClick={onLogout}>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppPage>
  );
}
