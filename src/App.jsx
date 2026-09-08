import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Analyze from './pages/Analyze';
import Calibration from './pages/Calibration';
import History from './pages/History';
import About from './pages/About';
import LoginPage from './pages/LoginPage';
import { ROLES, ALL_ROLES, getHomeRouteForRole } from './utils/roles';

function HomeRoute() {
  const { role } = useAuth();
  const targetRoute = getHomeRouteForRole(role);
  return <Navigate to={targetRoute} replace />;
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        {/* Smart Home route: Redirects automatically to role-specific dashboard */}
        <Route
          path="/"
          element={
            <ProtectedRoute allowedRoles={ALL_ROLES}>
              <HomeRoute />
            </ProtectedRoute>
          }
        />

        {/* 1. Full Admin Dashboard (Admin only) */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workers"
          element={
            <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
              <Dashboard initialTab="workers" />
            </ProtectedRoute>
          }
        />

        {/* 2. Safety Compliance Dashboard (Safety Officer & Admin) */}
        <Route
          path="/safety-dashboard"
          element={
            <ProtectedRoute allowedRoles={[ROLES.SAFETY_OFFICER, ROLES.ADMIN]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* 3. Team / Shift Dashboard (Supervisor & Admin) */}
        <Route
          path="/team-dashboard"
          element={
            <ProtectedRoute allowedRoles={[ROLES.SUPERVISOR, ROLES.ADMIN]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* 4. Personal Dosimeter Dashboard (Worker & Admin) */}
        <Route
          path="/personal-dashboard"
          element={
            <ProtectedRoute allowedRoles={[ROLES.WORKER, ROLES.ADMIN]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* DGMS Calibration Control (Admin only) */}
        <Route
          path="/calibration"
          element={
            <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
              <Calibration />
            </ProtectedRoute>
          }
        />

        {/* Operational Modules (Accessible by all 4 roles) */}
        <Route
          path="/analyze"
          element={
            <ProtectedRoute allowedRoles={ALL_ROLES}>
              <Analyze />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scan"
          element={
            <ProtectedRoute allowedRoles={ALL_ROLES}>
              <Analyze />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute allowedRoles={ALL_ROLES}>
              <History />
            </ProtectedRoute>
          }
        />
        <Route
          path="/about"
          element={
            <ProtectedRoute allowedRoles={ALL_ROLES}>
              <About />
            </ProtectedRoute>
          }
        />

        {/* Public Login page */}
        <Route path="/login" element={<LoginPage />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
