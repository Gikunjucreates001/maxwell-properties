import React, { lazy, Suspense } from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import ErrorBoundary from './components/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Properties = lazy(() => import('./pages/Properties'));
const PropertyDetail = lazy(() => import('./pages/PropertyDetail'));
const Tenants = lazy(() => import('./pages/Tenants'));
const Payments = lazy(() => import('./pages/Payments'));
const Issues = lazy(() => import('./pages/Issues'));
const Managers = lazy(() => import('./pages/Managers'));
const Units = lazy(() => import('./pages/Units'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Approvals = lazy(() => import('./pages/Approvals'));
const Notifications = lazy(() => import('./pages/Notifications'));
const NotFound = lazy(() => import('./pages/NotFound'));

const PortalLanding = () => {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'admin' ? '/admin' : '/manager'} replace />;
};

const PageLoader = () => (
  <div className="flex h-screen items-center justify-center bg-gray-50">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-primary" aria-label="Loading" />
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#333',
            color: '#fff',
          },
          success: {
            theme: {
              primary: '#0f766e',
            },
          },
        }}
      />
      <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<PortalLanding />} />
          <Route element={<RoleRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<Dashboard />} />
            <Route path="/admin/managers" element={<Managers />} />
            {/* Keep the old path working for existing bookmarks while the new UI uses /admin/managers. */}
            <Route path="/managers" element={<Managers />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={['manager']} />}>
            <Route path="/manager" element={<Dashboard />} />
          </Route>
          <Route path="/properties" element={<Properties />} />
          <Route path="/properties/:id" element={<PropertyDetail />} />
          <Route path="/tenants" element={<Tenants />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/issues" element={<Issues />} />
          <Route path="/units" element={<Units />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </AuthProvider>
  );
}

export default App;

