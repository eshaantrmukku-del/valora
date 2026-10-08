import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import MarketingLayout from './layouts/MarketingLayout';
import AppShell from './layouts/AppShell';
import RequireAuth from './components/RequireAuth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Discover from './pages/Discover';
import Analyse from './pages/Analyse';
import Portfolio from './pages/Portfolio';
import AreaIntel from './pages/AreaIntel';
import Settings from './pages/Settings';
import Compare from './pages/Compare';
import Tools from './pages/Tools';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <Routes>
            <Route element={<MarketingLayout />}>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Login />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/analyse" element={<Analyse />} />
                <Route path="/analyse/:id" element={<Analyse />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/tools" element={<Tools />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/area-intel" element={<AreaIntel />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>

            <Route path="/app" element={<Navigate to="/dashboard" replace />} />
            <Route path="/app/*" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
