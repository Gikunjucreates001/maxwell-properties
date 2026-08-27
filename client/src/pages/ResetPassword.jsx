import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import BrandMark from '../components/BrandMark';
import PasswordRequirements from '../components/PasswordRequirements';
import client from '../api/client';
import { validatePassword } from '../utils/passwordPolicy';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [complete, setComplete] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const passwordError = validatePassword(password);
    if (passwordError) return toast.error(passwordError);
    if (password !== confirmation) return toast.error('Passwords do not match');
    if (!token) return toast.error('This reset link is missing or invalid');

    setIsSaving(true);
    try {
      await client.post('/auth/password-reset/complete', { token, newPassword: password });
      setComplete(true);
      toast.success('Password updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to reset your password');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-8">
      <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
        <div className="absolute -left-24 top-20 h-72 w-72 rotate-45 border-[22px] border-white/10" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 -rotate-12 border-[28px] border-amber-200/20" />
        <div className="absolute left-1/2 top-[-10rem] h-80 w-80 -translate-x-1/2 rounded-full bg-teal-300/20 blur-3xl" />
      </div>
      <section className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 p-6 text-white shadow-2xl backdrop-blur sm:p-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 p-2 shadow-lg"><BrandMark className="h-12 w-12 text-slate-700" /></div>
          <h1 className="mt-5 text-2xl font-bold">Set a new password</h1>
          <p className="mt-2 text-sm text-slate-400">Choose a strong password for your Maxwell Properties account.</p>
        </div>

        {complete ? (
          <div className="mt-7 rounded-lg bg-emerald-500/10 p-4 text-center text-sm leading-6 text-emerald-200" role="status">
            Your password has been updated. <Link to="/login" className="font-semibold underline">Return to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="reset-password" className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-slate-400">New password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <input id="reset-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={6} maxLength={20} value={password} onChange={(event) => setPassword(event.target.value)} className="block w-full rounded-lg border border-white/15 bg-slate-950/80 py-3 pl-10 pr-11 text-sm text-white outline-none placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20" />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-0 top-0 h-full px-3 text-slate-500 hover:text-white" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
              <PasswordRequirements value={password} />
            </div>
            <div>
              <label htmlFor="reset-confirmation" className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-slate-400">Confirm password</label>
              <input id="reset-confirmation" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={6} maxLength={20} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="block w-full rounded-lg border border-white/15 bg-slate-950/80 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </div>
            <button type="submit" disabled={isSaving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {isSaving ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
};

export default ResetPassword;

