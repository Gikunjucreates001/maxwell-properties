import express from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { getDb } from '../database.js';
import { authenticateToken, generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../middleware/auth.js';
import { validatePassword } from '../utils/validation.js';

const router = express.Router();
const googleClient = new OAuth2Client();
const PORTAL_ROLES = new Set(['admin', 'manager']);

function getPortal(value) {
  const portal = typeof value === 'string' ? value.trim().toLowerCase() : 'admin';
  return PORTAL_ROLES.has(portal) ? portal : null;
}

function createSession(user) {
  const userData = { id: user.id, email: user.email, name: user.name, role: user.role };
  return {
    accessToken: generateAccessToken(userData),
    refreshToken: generateRefreshToken(userData),
    user: userData,
  };
}

router.post('/login', (req, res) => {
  try {
    const portal = getPortal(req.body?.portal);
    if (!portal) {
      return res.status(400).json({ success: false, error: 'Choose a valid sign-in portal' });
    }

    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'This account has been deactivated. Contact an administrator.' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (user.role !== portal) {
      return res.status(403).json({ success: false, error: 'This account is not authorized for the selected portal' });
    }

    res.json({ success: true, data: createSession(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'Refresh token required' });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }

    const user = getDb().prepare('SELECT id, email, name, role, is_active FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User account not found' });
    }
    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'This account has been deactivated' });
    }
    if (user.role !== decoded.role) {
      return res.status(401).json({ success: false, error: 'Account permissions have changed. Please sign in again.' });
    }

    const accessToken = generateAccessToken(user);
    res.json({ success: true, data: { accessToken } });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/change-password', authenticateToken, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new passwords are required' });
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, error: passwordError });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const validPassword = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid current password' });
    }

    const newHash = bcrypt.hashSync(newPassword, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

    res.json({ success: true, data: { message: 'Password updated successfully' } });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/google', async (req, res) => {
  try {
    const portal = getPortal(req.body?.portal);
    if (!portal) {
      return res.status(400).json({ success: false, error: 'Choose a valid sign-in portal' });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
    if (!clientId) {
      return res.status(503).json({ success: false, error: 'Google sign-in is not configured yet' });
    }
    if (!credential) {
      return res.status(400).json({ success: false, error: 'Google credential is required' });
    }

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      return res.status(401).json({ success: false, error: 'Google account could not be verified' });
    }

    const db = getDb();
    const googleUser = db.prepare('SELECT * FROM users WHERE google_id = ?').get(payload.sub);
    const emailUser = db.prepare('SELECT * FROM users WHERE email = ?').get(payload.email.toLowerCase());
    if (googleUser && emailUser && googleUser.id !== emailUser.id) {
      return res.status(403).json({ success: false, error: 'This Google account is already linked to another user' });
    }

    let user = googleUser || emailUser;
    if (user && !user.is_active) {
      return res.status(403).json({ success: false, error: 'This account has been deactivated. Contact an administrator.' });
    }

    if (!user) {
      return res.status(403).json({ success: false, error: `Ask an administrator to create your ${portal} account before using Google sign-in` });
    } else if (user.role !== portal) {
      return res.status(403).json({ success: false, error: 'This account is not authorized for the selected portal' });
    } else if (user.google_id && user.google_id !== payload.sub) {
      return res.status(403).json({ success: false, error: 'This email is already linked to a different Google account' });
    } else if (user.google_id !== payload.sub || !String(user.auth_provider || '').includes('google')) {
      db.prepare(`
        UPDATE users SET google_id = ?, auth_provider = CASE WHEN auth_provider = 'password' THEN 'password+google' ELSE auth_provider END
        WHERE id = ?
      `).run(payload.sub, user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    res.json({ success: true, data: createSession(user) });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(401).json({ success: false, error: 'Unable to sign in with Google' });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.user.id);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;

