import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import AppPage from '../components/AppPage';
import PreferencesForm from '../components/settings/PreferencesForm';
import { useApi } from '../hooks/useApi';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { api, emitStoreChange } from '../lib/api';

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'investor', label: 'Investor' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'account', label: 'Account' },
];

function IntegrationRow({ name, configured, detail, setup, docsUrl }) {
  return (
    <div className="settings-row" style={{ display: 'grid', gap: 4, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <strong style={{ fontSize: 14 }}>{name}</strong>
        <span className={`status-pill status-pill--${configured ? 'ok' : 'warn'}`}>{configured ? 'Configured' : 'Not configured'}</span>
      </div>
      {detail && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{detail}</div>}
      {!configured && setup && <div style={{ fontSize: 12.5 }}>{setup}</div>}
      {docsUrl && /^https:/.test(docsUrl) && <a href={docsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>Provider documentation ↗</a>}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { showToast } = useApp();
  const { user, logout, refresh } = useAuth();
  const [section, setSection] = useState('profile');
  const prefs = useApi('/api/preferences');
  const briefs = useApi(section === 'alerts' ? '/api/briefs' : null);
  const notes = useApi(section === 'alerts' ? '/api/notifications' : null);
  const integrations = useApi(section === 'integrations' || section === 'alerts' ? '/api/integrations' : null);
  const dismissed = useApi(section === 'account' ? '/api/dismissed' : null);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [del, setDel] = useState({ password: '', confirm: '' });

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && SECTIONS.some((s) => s.id === hash)) setSection(hash);
  }, []);
  useEffect(() => setDisplayName(user?.displayName || ''), [user]);

  const saveProfile = async () => {
    try {
      await api('/api/account', { method: 'PATCH', body: { displayName: displayName.trim() || null } });
      await refresh();
      showToast('Profile saved', '');
    } catch (err) {
      showToast('Could not save', err.message);
    }
  };

  const savePrefs = async (p) => {
    try {
      await api('/api/preferences', { method: 'PUT', body: p });
      emitStoreChange();
      showToast('Investor preferences saved', 'Used as labelled defaults in analyses');
    } catch (err) {
      const d = err.details?.[0];
      showToast('Could not save', d ? `${d.path}: ${d.message}` : err.message);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: pw.current, newPassword: pw.next } });
      setPw({ current: '', next: '' });
      showToast('Password changed', 'Other sessions have been signed out.');
    } catch (err) {
      showToast('Could not change password', err.message);
    }
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    try {
      await api('/api/account', { method: 'DELETE', body: { password: del.password, confirm: del.confirm } });
      await logout();
      navigate('/', { replace: true });
    } catch (err) {
      showToast('Account not deleted', err.message);
    }
  };

  const onLogout = async () => {
    await logout();
    navigate('/', { replace: true, viewTransition: true });
  };

  const toggleMonitor = async (b) => {
    try {
      await api(`/api/briefs/${b.id}/monitor`, { method: 'PUT', body: { active: !b.monitor?.active, frequencyHours: b.monitor?.frequencyHours || 24 } });
      emitStoreChange();
    } catch (err) {
      showToast('Could not update monitoring', err.message);
    }
  };
  const setFrequency = async (b, hours) => {
    try {
      await api(`/api/briefs/${b.id}/monitor`, { method: 'PUT', body: { active: Boolean(b.monitor?.active), frequencyHours: hours } });
      emitStoreChange();
    } catch (err) {
      showToast('Could not update monitoring', err.message);
    }
  };

  const ints = integrations.data;

  return (
    <AppPage title="Settings" subtitle="Profile, investor defaults, alerts, integrations and account — stored securely in your Valora account">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={`settings-nav-item${section === s.id ? ' active' : ''}`} aria-current={section === s.id ? 'page' : undefined} onClick={() => { setSection(s.id); window.location.hash = s.id; }}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {section === 'profile' && (
            <div className="settings-card">
              <div className="settings-card-head"><h2>Profile</h2><p>Used to personalise your overview</p></div>
              <div className="settings-card-body">
                <div className="form-row"><label htmlFor="displayName">Name</label><input id="displayName" type="text" maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
                <div className="form-row" style={{ marginTop: 14 }}><label htmlFor="email">Email</label><input id="email" type="email" value={user?.email || ''} readOnly aria-readonly="true" /></div>
                <button type="button" className="app-btn app-btn--primary" style={{ marginTop: 16 }} onClick={saveProfile}>Save profile</button>
              </div>
            </div>
          )}

          {section === 'investor' && (
            <div className="settings-card">
              <div className="settings-card-head"><h2>Investor defaults</h2><p>Your strategy and financing assumptions. All optional.</p></div>
              <div className="settings-card-body">
                {prefs.error && <div className="notice-banner notice-banner--error">{prefs.error.message}</div>}
                {prefs.data ? <PreferencesForm initial={prefs.data.preferences} onSubmit={savePrefs} /> : <p>Loading…</p>}
              </div>
            </div>
          )}

          {section === 'alerts' && (
            <>
              <div className="settings-card">
                <div className="settings-card-head"><h2>Brief monitoring</h2><p>Valora’s background scheduler re-runs monitored briefs and records each check.</p></div>
                <div className="settings-card-body">
                  {(briefs.data?.briefs || []).length === 0 ? (
                    <p style={{ fontSize: 13 }}>No briefs yet. <Link to="/discover">Create one in Discover</Link>.</p>
                  ) : (
                    (briefs.data?.briefs || []).map((b) => (
                      <div key={b.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <strong style={{ fontSize: 14 }}>{b.name}</strong>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {b.monitor?.active ? `Monitoring every ${b.monitor.frequencyHours}h` : 'Not monitored'}
                            {b.monitor?.lastRunAt ? ` · last check ${new Date(b.monitor.lastRunAt).toLocaleString('en-GB')}` : ' · never checked'}
                            {b.monitor?.active ? ` · next ${new Date(b.monitor.nextRunAt).toLocaleString('en-GB')}` : ''}
                            {b.monitor?.lastStatus ? ` · ${b.monitor.lastStatus}` : ''}
                          </div>
                          {b.monitor?.lastError && <div style={{ fontSize: 12, color: 'var(--red)' }}>{b.monitor.lastError}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <select aria-label="Frequency" value={b.monitor?.frequencyHours || 24} onChange={(e) => setFrequency(b, Number(e.target.value))}>
                            <option value={6}>Every 6 hours</option><option value={12}>Every 12 hours</option><option value={24}>Daily</option><option value={72}>Every 3 days</option><option value={168}>Weekly</option>
                          </select>
                          <button type="button" className="app-btn app-btn--ghost" onClick={() => toggleMonitor(b)}>{b.monitor?.active ? 'Pause' : 'Monitor'}</button>
                        </div>
                      </div>
                    ))
                  )}
                  {ints && !ints.email.configured && <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 12 }}>Alerts appear in Valora. Email delivery is not configured on this server, so no alert emails are sent.</p>}
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-head"><h2>Recent alerts</h2><p>{notes.data ? `${notes.data.unread} unread` : ''}</p></div>
                <div className="settings-card-body">
                  {(notes.data?.notifications || []).length === 0 ? <p style={{ fontSize: 13 }}>No alerts yet.</p> : (
                    <>
                      <button type="button" className="app-btn app-btn--ghost" onClick={async () => { await api('/api/notifications/read-all', { method: 'POST' }); emitStoreChange(); }}>Mark all read</button>
                      {notes.data.notifications.map((n) => (
                        <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: n.readAt ? 0.7 : 1 }}>
                          <strong style={{ fontSize: 13.5 }}>{n.title}</strong>
                          <div style={{ fontSize: 12.5 }}>{n.body}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{new Date(n.createdAt).toLocaleString('en-GB')}{n.link && <> · <Link to={n.link}>Open</Link></>}</div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {section === 'integrations' && (
            <div className="settings-card" id="integrations">
              <div className="settings-card-head"><h2>Integrations</h2><p>What this Valora server is connected to. A provider is only “configured” when its credentials are present.</p></div>
              <div className="settings-card-body">
                {!ints ? <p>Loading…</p> : (
                  <>
                    <IntegrationRow name={`AI — ${ints.ai.provider}`} configured={ints.ai.configured} detail={ints.ai.configured ? `Model: ${ints.ai.model}` : 'Without AI, briefs use the rule-based parser and reports have no narrative. All calculations still work.'} setup={ints.ai.setup} />
                    {ints.providers.map((p) => (
                      <IntegrationRow key={p.id} name={p.name} configured={p.configured} detail={`${p.coverage} ${p.limitations.join(' ')}`} setup={p.setup} docsUrl={p.docsUrl} />
                    ))}
                    <IntegrationRow name="Email delivery (Resend)" configured={ints.email.configured} setup={ints.email.setup} />
                    <IntegrationRow name="Background scheduler" configured={ints.monitoring.schedulerRunning} detail={ints.monitoring.note} />
                  </>
                )}
              </div>
            </div>
          )}

          {section === 'account' && (
            <>
              <div className="settings-card">
                <div className="settings-card-head"><h2>Password</h2><p>At least 10 characters</p></div>
                <form className="settings-card-body" onSubmit={changePassword}>
                  <div className="form-grid">
                    <div className="form-row"><label htmlFor="pw-cur">Current password</label><input id="pw-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
                    <div className="form-row"><label htmlFor="pw-new">New password</label><input id="pw-new" type="password" autoComplete="new-password" minLength={10} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
                  </div>
                  <button type="submit" className="app-btn app-btn--primary" style={{ marginTop: 14 }} disabled={!pw.current || pw.next.length < 10}>Change password</button>
                </form>
              </div>
              <div className="settings-card">
                <div className="settings-card-head"><h2>Dismissed properties</h2><p>Excluded from future Discover results</p></div>
                <div className="settings-card-body">
                  {(dismissed.data?.dismissed || []).length === 0 ? <p style={{ fontSize: 13 }}>None.</p> : dismissed.data.dismissed.map((d) => (
                    <div key={d.propertyId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', fontSize: 13 }}>
                      <span>{d.address || d.propertyId}</span>
                      <button type="button" className="app-btn app-btn--ghost" onClick={async () => { await api(`/api/dismissed/${d.propertyId}`, { method: 'DELETE' }); emitStoreChange(); }}>Restore</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="settings-card">
                <div className="settings-card-head"><h2>Session</h2><p>{user?.email}</p></div>
                <div className="settings-card-body"><button type="button" className="app-btn app-btn--ghost" onClick={onLogout}>Sign out</button></div>
              </div>
              <div className="settings-card">
                <div className="settings-card-head"><h2>Delete account</h2><p>Permanently deletes your briefs, saved properties, analyses, documents, portfolio, conversations and alerts. This cannot be undone.</p></div>
                <form className="settings-card-body" onSubmit={deleteAccount}>
                  <div className="form-grid">
                    <div className="form-row"><label htmlFor="del-pw">Password</label><input id="del-pw" type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} /></div>
                    <div className="form-row"><label htmlFor="del-confirm">Type DELETE to confirm</label><input id="del-confirm" value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} /></div>
                  </div>
                  <button type="submit" className="app-btn app-btn--primary" style={{ marginTop: 14, background: 'var(--red)' }} disabled={!del.password || del.confirm !== 'DELETE'}>Delete my account</button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </AppPage>
  );
}
