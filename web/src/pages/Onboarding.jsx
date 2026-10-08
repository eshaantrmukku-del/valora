import { useLocation, useNavigate } from 'react-router';
import AppPage from '../components/AppPage';
import PreferencesForm from '../components/settings/PreferencesForm';
import { useApi } from '../hooks/useApi';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from && location.state.from !== '/onboarding' ? location.state.from : '/dashboard';
  const { refresh } = useAuth();
  const { showToast } = useApp();
  const prefs = useApi('/api/preferences');

  const finish = async () => {
    await refresh();
    navigate(from, { replace: true, viewTransition: true });
  };

  const save = async (p) => {
    try {
      await api('/api/preferences', { method: 'PUT', body: { ...p, completeOnboarding: true } });
      await finish();
    } catch (err) {
      const d = err.details?.[0];
      showToast('Could not save', d ? `${d.path}: ${d.message}` : err.message);
    }
  };

  const skip = async () => {
    try {
      await api('/api/preferences/skip-onboarding', { method: 'POST' });
      await finish();
    } catch (err) {
      showToast('Could not continue', err.message);
    }
  };

  return (
    <AppPage eyebrow="Welcome" title="Set up your investment context" subtitle="Every question is optional. Valora uses these as labelled defaults and never assumes you have finance approved. You can change them any time in Settings.">
      <div className="settings-card">
        <div className="settings-card-body">
          {prefs.data ? (
            <PreferencesForm
              initial={prefs.data.preferences}
              onSubmit={save}
              submitLabel="Save and continue"
              secondary={<button type="button" className="app-btn app-btn--ghost" onClick={skip}>Skip for now</button>}
            />
          ) : (
            <p>{prefs.error ? prefs.error.message : 'Loading…'}</p>
          )}
        </div>
      </div>
    </AppPage>
  );
}
