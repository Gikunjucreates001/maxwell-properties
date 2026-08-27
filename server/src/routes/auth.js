import express from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { getDb } from '../database.js';
import { authenticateToken, generateAccessToken, generateRefreshToken, verifyRefreshToken, requireRole } from '../middleware/auth.js';
import { validatePassword } from '../utils/validation.js';
import {
  approvePasswordReset,
  completePasswordReset,
  getPrimaryAdminEmail,
  hasActivePasswordReset,
  listPasswordResetRequests,
  rejectPasswordReset,
  requestManagerPasswordChange,
  requestPasswordReset,
} from '../services/passwordResets.js';

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

router.post('/login', async (req, res) => {
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
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (portal === 'admin' && email !== getPrimaryAdminEmail()) {
      return res.status(403).json({ success: false, error: 'This account is not authorized for the selected portal' });
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

router.post('/password-reset/request', async (req, res) => {
  try {
    const portal = getPortal(req.body?.portal);
    if (!portal) return res.status(400).json({ success: false, error: 'Choose a valid sign-in portal' });

    // The response is intentionally the same whether the account exists. This
    // prevents the reset form from becoming an email-account discovery tool.
    await requestPasswordReset({ email: req.body?.email, portal });
    res.json({
      success: true,
      data: {
        message: portal === 'manager'
          ? 'Your request has been sent to the administrator for approval.'
          : 'If this email belongs to the administrator account, a reset link has been sent.',
      },
    });
  } catch (error) {
    if (error.code === '23505' || String(error.message).includes('idx_one_open_password_reset_per_user')) {
      return res.json({
        success: true,
        data: { message: portal === 'manager' ? 'Your request has been sent to the administrator for approval.' : 'If this email belongs to the administrator account, a reset link has been sent.' },
      });
    }
    console.error('Password reset request error:', error);
    res.status(500).json({ success: false, error: 'Unable to process the password reset request' });
  }
});

router.post('/password-reset/complete', async (req, res) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) return res.status(400).json({ success: false, error: 'Reset link is required' });
    await completePasswordReset({ token, newPassword: req.body?.newPassword });
    res.json({ success: true, data: { message: 'Password updated successfully. You can now sign in.' } });
  } catch (error) {
    if (['INVALID_PASSWORD', 'INVALID_TOKEN'].includes(error.code)) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error('Complete password reset error:', error);
    res.status(500).json({ success: false, error: 'Unable to complete the password reset' });
  }
});

router.get('/password-reset/requests', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'open';
    const requests = await listPasswordResetRequests(status);
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('List password reset requests error:', error);
    res.status(500).json({ success: false, error: 'Unable to load password reset requests' });
  }
});

router.post('/password-reset/requests/:id/approve', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    await approvePasswordReset(req.params.id, req.user.id);
    res.json({ success: true, data: { message: 'Reset email sent to the manager' } });
  } catch (error) {
    if (['NOT_FOUND', 'INVALID_REQUEST'].includes(error.code)) {
      return res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({ success: false, error: error.message });
    }
    console.error('Approve password reset error:', error);
    res.status(500).json({ success: false, error: 'Unable to approve the password reset request' });
  }
});

router.post('/password-reset/requests/:id/reject', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const reviewNote = typeof req.body?.review_note === 'string' ? req.body.review_note.trim() : null;
    await rejectPasswordReset(req.params.id, req.user.id, reviewNote || null);
    res.json({ success: true, data: { message: 'Password reset request rejected' } });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ success: false, error: error.message });
    console.error('Reject password reset error:', error);
    res.status(500).json({ success: false, error: 'Unable to reject the password reset request' });
  }
});

router.post('/refresh', async (req, res) => {
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

    const user = await getDb().prepare('SELECT id, email, name, role, is_active FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User account not found' });
    }
    if (!user.is_active) {
      return res.status(403).json({ success: false, error: 'This account has been deactivated' });
    }
    if (user.role === 'admin' && user.email !== getPrimaryAdminEmail()) {
      return res.status(403).json({ success: false, error: 'Administrator access is restricted to the primary owner account' });
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

router.post('/change-password', authenticateToken, async (req, res) => {
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
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const validPassword = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid current password' });
    }

    if (req.user.role === 'manager') {
      const request = await requestManagerPasswordChange({ userId: req.user.id, requestedBy: req.user.id });
      return res.status(202).json({
        success: true,
        pending: true,
        data: { message: request.status === 'pending' ? 'Password change request sent to the administrator for approval' : 'A password change request is already awaiting administrator approval' },
      });
    }

    const newHash = bcrypt.hashSync(newPassword, 12);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

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
    const googleUser = await db.prepare('SELECT * FROM users WHERE google_id = ?').get(payload.sub);
    const emailUser = await db.prepare('SELECT * FROM users WHERE email = ?').get(payload.email.toLowerCase());
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
    } else if (portal === 'admin' && user.email !== getPrimaryAdminEmail()) {
      return res.status(403).json({ success: false, error: 'This account is not authorized for the selected portal' });
    } else if (portal === 'manager' && await hasActivePasswordReset(user.id)) {
      return res.status(403).json({ success: false, error: 'Google sign-in is unavailable while your password reset request is awaiting administrator action' });
    } else if (user.google_id && user.google_id !== payload.sub) {
      return res.status(403).json({ success: false, error: 'This email is already linked to a different Google account' });
    } else if (user.google_id !== payload.sub || !String(user.auth_provider || '').includes('google')) {
      await db.prepare(`
        UPDATE users SET google_id = ?, auth_provider = CASE WHEN auth_provider = 'password' THEN 'password+google' ELSE auth_provider END
        WHERE id = ?
      `).run(payload.sub, user.id);
      user = await db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    res.json({ success: true, data: createSession(user) });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(401).json({ success: false, error: 'Unable to sign in with Google' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = getDb();
    const user = await db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.user.id);
    
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

