import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import MarketingLayout from './layouts/MarketingLayout';
import AppShell from './layouts/AppShell';
import RequireAuth from './components/RequireAuth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import { ForgotPassword, ResetPassword } from './pages/PasswordReset';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Discover from './pages/Discover';
import Analyse from './pages/Analyse';
import Portfolio from './pages/Portfolio';
import AreaIntel from './pages/AreaIntel';
import Settings from './pages/Settings';
import Compare from './pages/Compare';
import Tools from './pages/Tools';
import Assistant from './pages/Assistant';
import PropertyPage from './pages/PropertyPage';

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
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
            </Route>

            <Route element={<RequireAuth />}>
              <Route element={<AppShell />}>
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/analyse" element={<Analyse />} />
                <Route path="/analyse/:id" element={<Analyse />} />
                <Route path="/properties/:id" element={<PropertyPage />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/tools" element={<Tools />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/saved" element={<Navigate to="/portfolio" replace />} />
                <Route path="/area-intel" element={<AreaIntel />} />
                <Route path="/assistant" element={<Assistant />} />
                <Route path="/notifications" element={<Navigate to="/settings#alerts" replace />} />
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
