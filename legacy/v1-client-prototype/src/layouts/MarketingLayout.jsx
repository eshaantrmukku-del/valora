import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ValoraNav from '../components/ValoraNav';

export default function MarketingLayout() {
  const { pathname } = useLocation();
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  useEffect(() => {
    document.body.classList.add('landing-route');
    document.body.classList.remove('marketing-route', 'app-route', 'app-route--locked');
    if (isAuthPage) document.body.classList.add('auth-route');
    else document.body.classList.remove('auth-route');
    return () => {
      document.body.classList.remove('landing-route', 'auth-route');
    };
  }, [isAuthPage]);

  return (
    <div className={`ac-shell ac-shell--landing${isAuthPage ? ' ac-shell--auth' : ''}`}>
      {!isAuthPage && <ValoraNav />}
      <main className="ac-main">
        <Outlet />
      </main>
    </div>
  );
}
