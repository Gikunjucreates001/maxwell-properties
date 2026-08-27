import jwt from 'jsonwebtoken';
import { getDb } from '../database.js';

const DEVELOPMENT_SECRET = 'maxwell-props-secret-key-2024';

const getLegacyAccessSecret = () => {
  if (process.env.NODE_ENV === 'production') return null;
  return process.env.JWT_SECRET || DEVELOPMENT_SECRET;
};
const getLegacyRefreshSecret = () => process.env.NODE_ENV === 'production' ? null : process.env.JWT_REFRESH_SECRET;
const getAccessSecret = (role) => {
  const roleSecret = role === 'admin' ? process.env.ADMIN_JWT_SECRET : process.env.MANAGER_JWT_SECRET;
  return roleSecret || getLegacyAccessSecret();
};
const getRefreshSecret = (role) => {
  const roleSecret = role === 'admin' ? process.env.ADMIN_JWT_REFRESH_SECRET : process.env.MANAGER_JWT_REFRESH_SECRET;
  return roleSecret || getLegacyRefreshSecret() || getAccessSecret(role);
};

const uniqueSecrets = (secrets) => [...new Set(secrets.filter(Boolean))];

function verifyWithSecrets(token, secrets) {
  let lastError;
  for (const secret of uniqueSecrets(secrets)) {
    try {
      return jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No token verification secret is configured');
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access token required' });
  }

  let user;
  try {
    user = verifyWithSecrets(token, [
      getAccessSecret('admin'),
      getAccessSecret('manager'),
      getLegacyAccessSecret(),
    ]);
    if (user.tokenType && user.tokenType !== 'access') throw new Error('Wrong token type');
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  const account = getDb().prepare('SELECT id, email, name, role, is_active FROM users WHERE id = ?').get(user.id);
  if (!account || !account.is_active) {
    return res.status(401).json({ success: false, error: 'User account is inactive or no longer exists' });
  }
  try {
    // Once the account is known, verify the token against that role's key. This
    // prevents a manager-signed token from being replayed as an admin token.
    user = verifyWithSecrets(token, [getAccessSecret(account.role), getLegacyAccessSecret()]);
    if (user.tokenType && user.tokenType !== 'access') throw new Error('Wrong token type');
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
  if (account.role !== user.role) {
    return res.status(401).json({ success: false, error: 'Account permissions have changed. Please sign in again.' });
  }

  // Use current database values instead of trusting stale profile data in the token.
  req.user = account;
  next();
}

export function generateAccessToken(user) {
  const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
  return jwt.sign({ ...payload, tokenType: 'access' }, getAccessSecret(user.role), { algorithm: 'HS256', expiresIn: '1h' });
}

export function generateRefreshToken(user) {
  const payload = { id: user.id, email: user.email, name: user.name, role: user.role };
  return jwt.sign({ ...payload, tokenType: 'refresh' }, getRefreshSecret(user.role), { algorithm: 'HS256', expiresIn: '7d' });
}

export function verifyRefreshToken(token) {
  const decoded = verifyWithSecrets(token, [
    getRefreshSecret('admin'),
    getRefreshSecret('manager'),
    getLegacyRefreshSecret(),
    getLegacyAccessSecret(),
  ]);
  if (decoded.tokenType && decoded.tokenType !== 'refresh') throw new Error('Wrong token type');
  if (!['admin', 'manager'].includes(decoded.role)) throw new Error('Invalid token role');
  return verifyWithSecrets(token, [getRefreshSecret(decoded.role), getLegacyRefreshSecret(), getLegacyAccessSecret()]);
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'You do not have permission to perform this action' });
    }
    next();
  };
}

