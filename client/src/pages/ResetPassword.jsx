import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import BrandMark from '../components/BrandMark';
import PasswordRequirements from '../components/PasswordRequirements';
import client from '../api/client';
import { validatePassword } from '../utils/passwordPolicy';
import { supabase } from '../lib/supabase';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [authSession, setAuthSession] = useState(null);
  const [authReady, setAuthReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return undefined;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setAuthSession(data.session || null);
        setAuthReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setAuthSession(session || null);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const passwordError = validatePassword(password);
    if (passwordError) return toast.error(passwordError);
    if (password !== confirmation) return toast.error('Passwords do not match');
    if (!token && !authSession) return toast.error('This reset link is missing, invalid, or expired');
    if (supabase && !authReady) return toast.error('Still opening the secure reset session. Please try again in a moment.');

    setIsSaving(true);
    try {
      if (supabase && authSession?.access_token) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        await client.post('/auth/password-reset/sync-supabase', { newPassword: password }, {
          headers: { Authorization: `Bearer ${authSession.access_token}` },
        });
        await supabase.auth.signOut();
      } else {
        await client.post('/auth/password-reset/complete', { token, newPassword: password });
      }
      setComplete(true);
      toast.success('Password updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to reset your password');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-stone-50 to-slate-200 px-4 py-8">
      <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden="true">
        <div className="absolute -left-24 top-20 h-72 w-72 rotate-45 border-[22px] border-slate-400/35" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 -rotate-12 border-[28px] border-amber-500/25" />
        <div className="absolute left-1/2 top-[-10rem] h-80 w-80 -translate-x-1/2 rounded-full bg-teal-400/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.9),transparent_48%)]" />
      </div>
      <div className="relative z-10 w-full max-w-md">
      <section className="rounded-2xl border border-slate-200/90 bg-white/95 p-6 text-slate-900 shadow-2xl shadow-slate-900/10 backdrop-blur sm:p-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 p-2 shadow-lg"><BrandMark className="h-12 w-12 text-slate-700" /></div>
          <h1 className="mt-5 text-2xl font-bold">Set a new password</h1>
          <p className="mt-2 text-sm text-slate-500">Choose a strong password for your Maxwell Properties account.</p>
        </div>

        {complete ? (
          <div className="mt-7 rounded-lg bg-emerald-50 p-4 text-center text-sm leading-6 text-emerald-700" role="status">
            Your password has been updated. <Link to="/login" className="font-semibold underline">Return to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="reset-password" className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-slate-600">New password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <input id="reset-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={6} maxLength={20} value={password} onChange={(event) => setPassword(event.target.value)} className="block w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-11 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20" />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-0 top-0 h-full px-3 text-slate-500 hover:text-slate-900" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
              <PasswordRequirements value={password} />
            </div>
            <div>
              <label htmlFor="reset-confirmation" className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-slate-600">Confirm password</label>
              <input id="reset-confirmation" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={6} maxLength={20} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </div>
            <button type="submit" disabled={isSaving || (Boolean(supabase) && !authReady)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {isSaving ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </section>
      <footer className="mt-5 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Maxwell Properties · @gikunjucreates · All rights reserved.
      </footer>
      </div>
    </main>
  );
};

export default ResetPassword;

