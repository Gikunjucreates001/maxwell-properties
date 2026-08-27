import React, { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

const GoogleSignInButton = ({ onCredential, disabled = false }) => {
  const buttonRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  callbackRef.current = onCredential;

  useEffect(() => {
    if (!clientId || disabled) return undefined;

    const renderButton = () => {
      if (!window.google?.accounts?.id || !buttonRef.current) return;
      buttonRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => callbackRef.current(response.credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: Math.min(360, buttonRef.current.clientWidth || 360),
      });
    };

    const existingScript = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', renderButton);
      renderButton();
      return () => existingScript.removeEventListener('load', renderButton);
    }

    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = renderButton;
    script.onerror = () => toast.error('Google sign-in could not be loaded');
    document.head.appendChild(script);
    return () => script.remove();
  }, [clientId]);

  if (!clientId) {
    return (
      <button type="button" disabled className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-white/15 bg-slate-950/80 text-sm font-semibold text-slate-300 opacity-80" aria-label="Sign in with Google">
        <span className="font-bold text-base text-blue-400" aria-hidden="true">G</span>
        Sign in with Google
      </button>
    );
  }

  return <div ref={buttonRef} className={`flex min-h-10 justify-center ${disabled ? 'pointer-events-none opacity-60' : ''}`} aria-label="Sign in with Google" />;
};

export default GoogleSignInButton;

