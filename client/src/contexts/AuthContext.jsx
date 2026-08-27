import React, { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const res = await client.get('/auth/me');
          if (res.data?.data) {
            setUser(res.data.data);
          }
        } catch (error) {
          console.error('Auth initialization failed', error);
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const navigateToPortal = (role) => navigate(role === 'admin' ? '/admin' : '/manager');

  const login = async (email, password, portal = 'admin') => {
    try {
      const res = await client.post('/auth/login', { email, password, portal });
      const { accessToken, refreshToken, user: userData } = res.data.data;
      
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setUser(userData);
      navigateToPortal(userData.role);
      toast.success('Logged in successfully');
      return { success: true };
    } catch (error) {
      toast.error(error.response?.data?.error || 'Login failed');
      return { success: false, status: error.response?.status };
    }
  };

  const loginWithGoogle = async (credential, portal = 'admin') => {
    try {
      const res = await client.post('/auth/google', { credential, portal });
      const { accessToken, refreshToken, user: userData } = res.data.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setUser(userData);
      navigateToPortal(userData.role);
      toast.success('Signed in with Google');
      return { success: true };
    } catch (error) {
      toast.error(error.response?.data?.error || 'Google sign-in failed');
      return { success: false, status: error.response?.status };
    }
  };

  const requestPasswordReset = async (email, portal = 'admin') => {
    try {
      const res = await client.post('/auth/password-reset/request', { email, portal });
      return { success: true, message: res.data?.data?.message };
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to request a password reset');
      return { success: false, status: error.response?.status };
    }
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    navigate('/login');
    toast.success('Logged out');
  };

  const value = {
    user,
    loading,
    login,
    loginWithGoogle,
    requestPasswordReset,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

