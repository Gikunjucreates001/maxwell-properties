import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

function hasSupabaseRecoveryHash() {
  if (typeof window === 'undefined' || !window.location.hash) return false;
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  return hashParams.has('access_token') || hashParams.get('type') === 'recovery';
}

const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated && hasSupabaseRecoveryHash()) {
    return (
      <Navigate
        to={{ pathname: '/reset-password', search: window.location.search, hash: window.location.hash }}
        replace
      />
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;

