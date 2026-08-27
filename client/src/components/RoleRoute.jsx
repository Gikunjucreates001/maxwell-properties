import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const RoleRoute = ({ allowedRoles }) => {
  const { user } = useAuth();
  return allowedRoles.includes(user?.role) ? <Outlet /> : <Navigate to="/" replace />;
};

export default RoleRoute;

