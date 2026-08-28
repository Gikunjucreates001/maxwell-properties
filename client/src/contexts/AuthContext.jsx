import React, { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    if (!supabase) return undefined;
    let mounted = true;
    const redirectRecoverySession = (session) => {
      if (mounted && session && window.location.pathname !== '/reset-password') {
        navigate('/reset-password', { replace: true });
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      redirectRecoverySession(data.session || null);
    }).catch(() => undefined);

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      redirectRecoverySession(session || null);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [navigate]);

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
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cooldownKey = `maxwell:password-reset:${portal}:${normalizedEmail}`;
    const cooldownEndsAt = Number(localStorage.getItem(cooldownKey) || 0);
    if (portal === 'admin' && cooldownEndsAt > Date.now()) {
      const minutes = Math.max(1, Math.ceil((cooldownEndsAt - Date.now()) / 60000));
      const message = `A reset request was already sent. Please wait about ${minutes} minute${minutes === 1 ? '' : 's'} before trying again.`;
      toast.error(message);
      return { success: false, status: 429, message };
    }

    try {
      const res = await client.post('/auth/password-reset/request', { email: normalizedEmail, portal });
      if (portal === 'admin') {
        // Supabase's built-in sender has a strict quota. One local guard keeps
        // accidental double-clicks and page refreshes from consuming it again.
        localStorage.setItem(cooldownKey, String(Date.now() + 60 * 60 * 1000));
      }
      return { success: true, message: res.data?.data?.message };
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Unable to request a password reset';
      if (portal === 'admin' && (error.response?.status === 429 || /rate limit|too many/i.test(message))) {
        localStorage.setItem(cooldownKey, String(Date.now() + 60 * 60 * 1000));
      }
      toast.error(message);
      return { success: false, status: error.response?.status, message };
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

