import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from './stores/authStore';

// Eager-load login (first paint) — lazy-load everything else for faster initial bundle
import LoginPage from './pages/LoginPage';
const ClassSelection = lazy(() => import('./pages/ClassSelection'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'));
const QuestPage = lazy(() => import('./pages/QuestPage'));
const CargoPage = lazy(() => import('./pages/CargoPage'));
const PortPage = lazy(() => import('./pages/PortPage'));
const WorldMapPage = lazy(() => import('./pages/WorldMapPage'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/" replace />;
  if (user && !user.city_key) return <Navigate to="/select-class" replace />;
  return <>{children}</>;
}

function ClassRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/" replace />;
  if (user && user.city_key) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function App() {
  const { token, fetchMe, user } = useAuthStore();

  useEffect(() => {
    if (token && !user) {
      fetchMe();
    }
  }, [token, user, fetchMe]);

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-white">Loading...</div>}>
        <AnimatePresence mode="wait">
          <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route
            path="/select-class"
            element={
              <ClassRoute>
                <ClassSelection />
              </ClassRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/marketplace"
            element={
              <ProtectedRoute>
                <MarketplacePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quests"
            element={
              <ProtectedRoute>
                <QuestPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cargo"
            element={
              <ProtectedRoute>
                <CargoPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/port"
            element={
              <ProtectedRoute>
                <PortPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/world-map"
            element={
              <ProtectedRoute>
                <WorldMapPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AnimatePresence>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
