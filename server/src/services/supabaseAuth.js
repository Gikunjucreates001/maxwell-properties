import { getDb } from '../database.js';

const DEFAULT_SUPABASE_URL = 'https://gkxhhhqvoonemufmjhgp.supabase.co';

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).trim().replace(/\/$/, '');
}

function getSupabasePublicKey() {
  return String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
}

function getSupabaseServiceKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function createConfigError() {
  const error = new Error('Supabase Auth is not configured on the server');
  error.code = 'SUPABASE_AUTH_NOT_CONFIGURED';
  return error;
}

function parseProviderError(payload, fallback) {
  return payload?.msg || payload?.message || payload?.error_description || payload?.error || fallback;
}

async function requestSupabase(path, { method = 'GET', body, admin = false, accessToken } = {}) {
  const key = admin ? getSupabaseServiceKey() : getSupabasePublicKey();
  if (!key) throw createConfigError();

  const headers = {
    apikey: key,
    Authorization: `Bearer ${accessToken || key}`,
    'Content-Type': 'application/json',
  };
  const response = await fetch(`${getSupabaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Some Auth errors do not include a JSON response body.
  }

  if (!response.ok) {
    const error = new Error(parseProviderError(payload, `Supabase Auth returned ${response.status}`));
    error.code = 'SUPABASE_AUTH_REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function getSupabaseRecoveryRedirectUrl() {
  const appUrl = String(process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
  return `${appUrl}/reset-password`;
}

export async function requestSupabasePasswordReset(email) {
  return requestSupabase('/auth/v1/recover', {
    method: 'POST',
    body: { email, redirect_to: getSupabaseRecoveryRedirectUrl() },
  });
}

export async function getSupabaseAuthUser(accessToken) {
  if (!accessToken) {
    const error = new Error('Supabase Auth session is required');
    error.code = 'SUPABASE_AUTH_SESSION_REQUIRED';
    throw error;
  }
  return requestSupabase('/auth/v1/user', { accessToken });
}

export async function createSupabaseAuthUser({ email, password, name }) {
  const serviceKey = getSupabaseServiceKey();
  const metadata = { display_name: name, role: 'manager' };
  const payload = { email, password, user_metadata: metadata };

  if (serviceKey) {
    return requestSupabase('/auth/v1/admin/users', {
      method: 'POST',
      body: { ...payload, email_confirm: true },
      admin: true,
    });
  }

  const response = await requestSupabase('/auth/v1/signup', {
    method: 'POST',
    body: { email, password, options: { data: metadata } },
  });
  if (response?.user?.id) return response.user;

  // Hosted Supabase projects commonly hide the newly-created user object
  // while email confirmation is enabled. The server's database connection can
  // safely resolve the Auth UUID without exposing it to the browser.
  const createdUser = await getDb().prepare('SELECT id, email, user_metadata FROM auth.users WHERE lower(email) = ? LIMIT 1').get(email.toLowerCase());
  if (createdUser?.id) return createdUser;

  {
    const error = new Error('Supabase did not return a manager Auth account');
    error.code = 'SUPABASE_AUTH_ACCOUNT_NOT_CREATED';
    throw error;
  }
}

