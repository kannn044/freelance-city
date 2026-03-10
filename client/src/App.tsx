import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from './stores/authStore';
import LoginPage from './pages/LoginPage';
import ClassSelection from './pages/ClassSelection';
import DashboardPage from './pages/DashboardPage';
import MarketplacePage from './pages/MarketplacePage';
import QuestPage from './pages/QuestPage';
import CargoPage from './pages/CargoPage';
import PortPage from './pages/PortPage';
import WorldMapPage from './pages/WorldMapPage';

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
    </BrowserRouter>
  );
}

export default App;
