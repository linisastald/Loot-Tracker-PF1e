import CssBaseline from '@mui/material/CssBaseline';
import React, {Suspense, useCallback, useEffect, useRef, useState} from 'react';
import {BrowserRouter as Router, Navigate, Route, Routes} from 'react-router-dom';
import {ThemeProvider} from '@mui/material/styles';
import {Box, CircularProgress} from '@mui/material';

// Eagerly loaded (needed immediately for auth flow)
import Login from './components/pages/Login';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/hoc/ProtectedRoute';
import RoleRoute from './components/hoc/RoleRoute';
import ErrorBoundary from './components/ErrorBoundary';
import CampaignThemeProvider from './components/CampaignThemeProvider';
import ServerUnreachable from './components/ServerUnreachable';

// Lazy loaded page components
const Register = React.lazy(() => import('./components/pages/Register'));
const ForgotPassword = React.lazy(() => import('./components/pages/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./components/pages/ResetPassword'));
const LootEntry = React.lazy(() => import('./components/pages/LootEntry'));
const GoldTransactions = React.lazy(() => import('./components/pages/GoldTransactions'));
const UserSettings = React.lazy(() => import('./components/pages/UserSettings'));
const CharacterAndUserManagement = React.lazy(() => import('./components/pages/CharacterAndUserManagement'));
const Consumables = React.lazy(() => import('./components/pages/Consumables'));
const ItemManagement = React.lazy(() => import('./components/pages/ItemManagement'));
const GolarionCalendar = React.lazy(() => import('./components/pages/GolarionCalendar'));
const LootGenerator = React.lazy(() => import('./components/pages/LootGenerator'));
const SpellbookGenerator = React.lazy(() => import('./components/pages/SpellbookGenerator'));
const Tasks = React.lazy(() => import('./components/pages/Tasks'));
const Identify = React.lazy(() => import('./components/pages/Identify'));
const LootManagement = React.lazy(() => import('./components/pages/LootManagement'));
const Infamy = React.lazy(() => import('./components/pages/Infamy'));
const ShipManagement = React.lazy(() => import('./components/pages/ShipManagement'));
const OutpostManagement = React.lazy(() => import('./components/pages/OutpostManagement'));
const CrewManagement = React.lazy(() => import('./components/pages/CrewManagement'));
const HarrowTracker = React.lazy(() => import('./components/pages/HarrowTracker'));
const SessionsPage = React.lazy(() => import('./components/pages/Sessions/SessionsPage'));
const SessionManagement = React.lazy(() => import('./components/pages/DMSettings/SessionManagement'));
const TaskManagement = React.lazy(() => import('./components/pages/DMSettings/TaskManagement'));
const CityServices = React.lazy(() => import('./components/pages/CityServices'));


import theme from './theme';
import api from './utils/api';
import { ConfigProvider } from './contexts/ConfigContext';
import { AuthProvider, AuthUser } from './contexts/AuthContext';
import { CampaignProvider } from './contexts/CampaignContext';
import { SnackbarProvider } from 'notistack';

interface PageRoute {
  path: string;
  Page: React.ComponentType;
  /** Wrap in a role guard; only for pages that are DM-only / superadmin-only in the sidebar and on the server. */
  require?: 'dm' | 'superadmin';
}

// Every page under the authenticated layout. Each one gets its own keyed
// ErrorBoundary below, so a crash is contained to that page and navigating away
// clears it.
const PAGE_ROUTES: PageRoute[] = [
  { path: 'loot-entry', Page: LootEntry },
  { path: 'loot-management/*', Page: LootManagement },
  { path: 'gold-transactions', Page: GoldTransactions },
  // Account & Settings: campaign-agnostic (account, characters across
  // campaigns, and the superadmin's System Admin tab, gated inside the page)
  { path: 'user-settings/*', Page: UserSettings },
  { path: 'character-user-management/*', Page: CharacterAndUserManagement, require: 'dm' },
  { path: 'item-management/*', Page: ItemManagement, require: 'dm' },
  { path: 'golarion-calendar', Page: GolarionCalendar },
  { path: 'loot-generator', Page: LootGenerator, require: 'dm' },
  { path: 'spellbook-generator', Page: SpellbookGenerator, require: 'dm' },
  { path: 'consumables', Page: Consumables },
  { path: 'tasks', Page: Tasks },
  { path: 'identify', Page: Identify },
  { path: 'infamy', Page: Infamy },
  { path: 'ships', Page: ShipManagement },
  { path: 'outposts', Page: OutpostManagement },
  { path: 'crew', Page: CrewManagement },
  { path: 'harrow', Page: HarrowTracker },
  { path: 'sessions', Page: SessionsPage },
  { path: 'session-management', Page: SessionManagement, require: 'dm' },
  { path: 'task-management', Page: TaskManagement, require: 'dm' },
  { path: 'city-services', Page: CityServices },
];

// Old URLs that now live under /loot-management or /user-settings
const LEGACY_REDIRECTS: Array<[string, string]> = [
  ['system-admin', '/user-settings/system-admin'],
  ['unprocessed-loot', '/loot-management/unprocessed'],
  ['kept-party', '/loot-management/kept-party'],
  ['kept-character', '/loot-management/kept-character'],
  ['sold-loot', '/loot-management/sold'],
  ['given-away-or-trashed', '/loot-management/trashed'],
];

// GET /auth/status, as returned by the api utility (unwrapped body)
interface AuthStatusResponse {
  success?: boolean;
  data?: { user?: AuthUser };
}

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

const renderPageRoute = ({ path, Page, require }: PageRoute) => {
  const page = <ErrorBoundary key={path}><Page /></ErrorBoundary>;
  return (
    <Route
      key={path}
      path={path}
      element={require ? <RoleRoute require={require}>{page}</RoleRoute> : page}
    />
  );
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // The login check could not be completed (network, 5xx, rate limit). Shown as its
  // own screen; failedChecks drives the retry backoff.
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [failedChecks, setFailedChecks] = useState(0);
  const mounted = useRef(true);

  // Client-side leftovers of a session. The auth cookie itself is HTTP-only and
  // only the server can clear it.
  const clearClientSession = useCallback(() => {
    localStorage.removeItem('user');
    localStorage.removeItem('csrfToken');
    localStorage.removeItem('activeCampaignId');
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  // Returns false when a user-initiated logout could not reach the server, in
  // which case the session cookie is still valid and the user stays signed in.
  const handleLogout = useCallback(async (): Promise<boolean> => {
    try {
      await api.post('/auth/logout');
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      // 401: the session is already gone, which is what logging out wants
      if (status !== 401) {
        return false;
      }
    }
    clearClientSession();
    return true;
  }, [clearClientSession]);

  // The user is only trusted once the server confirms the session; nothing
  // is read from localStorage. Also used by the "can't reach the server" screen
  // to retry, so it never throws.
  const checkAuthStatus = useCallback(async (): Promise<void> => {
    try {
      // The api utility returns the unwrapped body: { success, message, data: { user } }
      const response = await api.get('/auth/status') as unknown as AuthStatusResponse;
      if (!mounted.current) return;

      setServerUnreachable(false);
      setFailedChecks(0);
      if (response?.success && response?.data?.user) {
        setIsAuthenticated(true);
        setUser(response.data.user);
        // Slide the 24h session window so active users aren't logged out mid-use
        api.post('/auth/refresh').catch(() => {});
      } else {
        // Server answered but there is no signed-in user
        clearClientSession();
      }
    } catch (error: unknown) {
      if (!mounted.current) return;
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        // Session invalid: also ask the server to drop the cookie
        setServerUnreachable(false);
        setFailedChecks(0);
        await handleLogout();
        clearClientSession();
      } else {
        // Could not verify (network, 5xx, rate limit): do not assume a session,
        // but do not log the user out server-side or wipe their stored selections.
        // Show the "can't reach the server" screen, which retries with a backoff.
        setIsAuthenticated(false);
        setUser(null);
        setServerUnreachable(true);
        setFailedChecks((count) => count + 1);
      }
    } finally {
      if (mounted.current) {
        setAuthLoading(false);
      }
    }
  }, [clearClientSession, handleLogout]);

  useEffect(() => {
    mounted.current = true;
    void checkAuthStatus();
    return () => {
      mounted.current = false;
    };
  }, [checkAuthStatus]);

  // Keep long-lived tabs alive while signed in: re-issue the token periodically.
  // Failures are ignored; an expired token just means the next API call
  // redirects to login with the "session expired" message.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const refreshInterval = setInterval(() => {
      api.post('/auth/refresh').catch(() => {});
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(refreshInterval);
  }, [isAuthenticated]);

  // Re-read the user (e.g. the active character changed); failures keep the current user
  const refreshUser = async () => {
    try {
      const response = await api.get('/auth/status') as unknown as AuthStatusResponse;
      if (response?.success && response?.data?.user) {
        setUser(response.data.user);
      }
    } catch {
      // keep the current user
    }
  };

  const handleLogin = (loggedInUser: AuthUser) => {
    // The token is in an HTTP-only cookie
    setIsAuthenticated(true);
    setUser(loggedInUser);
  };

  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {authLoading ? (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100vh',
              backgroundColor: 'background.default'
            }}
          >
            <CircularProgress size={40} role="status" aria-label="Loading application" />
          </Box>
        ) : serverUnreachable ? (
          <ServerUnreachable failedChecks={failedChecks} onRetry={checkAuthStatus} />
        ) : (
        /* Required for enqueueSnackbar everywhere (SessionManagement, SessionsPage, ...) —
            without a mounted provider those calls are silent no-ops */
        <SnackbarProvider maxSnack={3} autoHideDuration={5000}>
        <ConfigProvider>
          <AuthProvider user={user} isAuthenticated={isAuthenticated} onRefreshUser={refreshUser}>
          {/* CampaignProvider reads auth state from AuthContext and only fetches
              campaign info once authenticated (it is a no-op on the login page) */}
          <CampaignProvider>
          {/* Per-campaign theme override (Phase 4b). Wraps the Router so the
              app bar / campaign selector get the campaign theme too; renders
              children unchanged when no valid override exists (login page
              keeps the default theme since settings are only fetched once
              authenticated). */}
          <CampaignThemeProvider>
          <Router>
          <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={isAuthenticated ? <Navigate to="/loot-entry" /> : <Navigate to="/login" />} />
            <Route path="/login" element={
              // If already authenticated, redirect to main page
              isAuthenticated ?
                <Navigate to="/loot-entry" replace /> :
                <Login onLogin={handleLogin} />
            } />
            <Route path="/register" element={<Register onLogin={handleLogin} />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected routes using the ProtectedRoute component */}
            <Route path="/" element={<ProtectedRoute isAuthenticated={isAuthenticated}><MainLayout onLogout={handleLogout} /></ProtectedRoute>}>
              {PAGE_ROUTES.map(renderPageRoute)}
              {LEGACY_REDIRECTS.map(([from, to]) => (
                <Route key={from} path={from} element={<Navigate to={to} replace />} />
              ))}
            </Route>

            {/* Unknown URL: "/" sends signed-in users to Loot Entry and everyone else to login */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </Router>
          </CampaignThemeProvider>
          </CampaignProvider>
          </AuthProvider>
        </ConfigProvider>
        </SnackbarProvider>
        )}
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
