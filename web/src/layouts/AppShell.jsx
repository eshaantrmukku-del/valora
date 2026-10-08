import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import AppNav from '../components/AppNav';
import AnalysisModal from '../components/AnalysisModal';
import LoadingOverlay from '../components/LoadingOverlay';
import ToastContainer from '../components/ToastContainer';

function sectionKey(pathname) {
  return pathname.split('/').filter(Boolean)[0] || 'home';
}

export default function AppShell() {
  const location = useLocation();
  const section = sectionKey(location.pathname);

  useEffect(() => {
    document.body.classList.add('app-route');
    document.body.classList.remove('marketing-route', 'landing-route', 'app-route--locked');
    return () => {
      document.body.classList.remove('app-route', 'app-route--locked');
    };
  }, []);

  useEffect(() => {
    const main = document.querySelector('.app-main');
    if (main) main.scrollTop = 0;
  }, [section]);

  return (
    <div className="app-shell">
      <AppNav />
      <main className="app-main">
        <div key={section} className="app-main-view">
          <Outlet />
        </div>
      </main>
      <AnalysisModal />
      <LoadingOverlay />
      <ToastContainer />
    </div>
  );
}
