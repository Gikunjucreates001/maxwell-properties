import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import BrandMark from '../components/BrandMark';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { Eye, EyeOff, KeyRound, Loader2, Lock, Mail } from 'lucide-react';

const PORTALS = {
  admin: {
    label: 'Landlord (Admin)',
    submit: 'Verify credentials & sign in',
  },
  manager: {
    label: 'Manager Portal',
    submit: 'Sign in to manager portal',
  },
};

const MANAGER_COOLDOWNS = [5, 10, 30, 60, 120, 300];

const formatCooldown = (seconds) => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
};

const Login = () => {
  const [portal, setPortal] = useState('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [managerFailedAttempts, setManagerFailedAttempts] = useState(0);
  const [managerCooldown, setManagerCooldown] = useState(0);
  const [showManagerHelp, setShowManagerHelp] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const selectedPortal = PORTALS[portal];

  useEffect(() => {
    if (managerCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setManagerCooldown((seconds) => Math.max(seconds - 1, 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [managerCooldown]);

  const switchPortal = (nextPortal) => {
    setPortal(nextPortal);
    setPassword('');
    setManagerFailedAttempts(0);
    setManagerCooldown(0);
    setShowManagerHelp(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (portal === 'manager' && managerCooldown > 0) return;

    setIsLoading(true);
    const result = await login(email.trim().toLowerCase(), password, portal);
    setIsLoading(false);

    if (portal !== 'manager') return;
    if (result?.success) {
      setManagerFailedAttempts(0);
      setManagerCooldown(0);
      setShowManagerHelp(false);
      return;
    }

    // Apply a small progressive delay to failed manager sign-ins. The API's
    // IP-based rate limiter remains active as a separate server-side control.
    if ([401, 403, 429].includes(result?.status)) {
      const nextAttempt = managerFailedAttempts + 1;
      const waitTime = MANAGER_COOLDOWNS[Math.min(nextAttempt - 1, MANAGER_COOLDOWNS.length - 1)];
      setManagerFailedAttempts(nextAttempt);
      setManagerCooldown(waitTime);
      setShowManagerHelp(true);
    }
  };

  const handleGoogleCredential = async (credential) => {
    setIsGoogleLoading(true);
    await loginWithGoogle(credential, portal);
    setIsGoogleLoading(false);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
        <div className="absolute -left-24 top-20 h-72 w-72 rotate-45 border-[22px] border-white/10" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 -rotate-12 border-[28px] border-amber-200/20" />
        <div className="absolute left-1/2 top-[-10rem] h-80 w-80 -translate-x-1/2 rounded-full bg-teal-300/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_45%)]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <section className="rounded-2xl border border-white/10 bg-slate-900/95 p-5 text-white shadow-2xl backdrop-blur sm:p-8">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 p-2 shadow-lg">
              <BrandMark className="h-12 w-12 text-slate-700" />
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">Maxwell Properties</h1>
            <p className="mt-1 text-xs text-slate-400">Secured tenant &amp; property portal</p>
          </div>

          <div className="mt-7 border-b border-white/10" role="tablist" aria-label="Choose sign-in portal">
            {Object.entries(PORTALS).map(([key, value]) => {
              const isSelected = portal === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => switchPortal(key)}
                  className={`w-1/2 border-b-2 px-2 pb-3 text-[11px] font-bold uppercase tracking-wide transition-colors sm:text-xs ${
                    isSelected ? 'border-primary text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {value.label}
                </button>
              );
            })}
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email-address" className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Account email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="block w-full rounded-lg border border-white/15 bg-slate-950/80 py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder={portal === 'admin' ? 'admin@yourcompany.com' : 'manager@yourcompany.com'}
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor="password" className="block text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Password
                </label>
                <span className="text-[10px] text-slate-500">6–20 characters</span>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  minLength={6}
                  maxLength={20}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="block w-full rounded-lg border border-white/15 bg-slate-950/80 py-3 pl-10 pr-11 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-0 top-0 h-full px-3 text-slate-500 transition hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {portal === 'manager' && showManagerHelp && (
                <p className="mt-2 text-right text-xs text-slate-400">
                  Forgot your password? Ask an administrator for help.
                  {managerCooldown > 0 && <span className="ml-1 text-primary">Try again in {formatCooldown(managerCooldown)}.</span>}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || isGoogleLoading || managerCooldown > 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Signing in" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
              {isLoading ? 'Verifying…' : managerCooldown > 0 ? `Try again in ${formatCooldown(managerCooldown)}` : selectedPortal.submit}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
            <span className="h-px flex-1 bg-white/10" />
            <span>or</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <GoogleSignInButton onCredential={handleGoogleCredential} disabled={isLoading || isGoogleLoading} />
        </section>
      </div>
    </main>
  );
};

export default Login;

