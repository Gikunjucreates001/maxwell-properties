import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb } from '../database.js';
import { queueEmail } from './notifications.js';
import { cleanEmail, validatePassword } from '../utils/validation.js';

const RESET_TTL_MINUTES = Math.min(Math.max(Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30), 10), 120);
const DEFAULT_PRIMARY_ADMIN_EMAIL = 'pnganga0133@gmail.com';

export function getPrimaryAdminEmail() {
  return cleanEmail(process.env.PRIMARY_ADMIN_EMAIL || DEFAULT_PRIMARY_ADMIN_EMAIL) || DEFAULT_PRIMARY_ADMIN_EMAIL;
}

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, tokenHash: hashResetToken(token) };
}

function getResetUrl(token) {
  const configuredUrl = String(process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
  return `${configuredUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

function resetEmailBody({ name, token }) {
  return `Hello ${name || 'there'},

Use the secure link below to set a new Maxwell Properties password:
${getResetUrl(token)}

This link expires in ${RESET_TTL_MINUTES} minutes and can be used once. If you did not request this, you can ignore this email.

Maxwell Properties`;
}

async function findUserByResetIdentity(db, { email, portal, userId }) {
  if (userId != null) {
    return db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(userId, portal);
  }
  return db.prepare('SELECT * FROM users WHERE email = ? AND role = ?').get(email, portal);
}

async function expireOldApprovedRequest(tx, request) {
  if (request?.status === 'approved' && request.token_expires_at && new Date(request.token_expires_at).getTime() <= Date.now()) {
    await tx.prepare("UPDATE password_reset_requests SET status = 'expired' WHERE id = ? AND status = 'approved'").run(request.id);
    return null;
  }
  return request;
}

async function queueResetEmail({ user, token, createdBy }) {
  try {
    return await queueEmail({
      recipient: user.email,
      notificationType: 'password_reset',
      subject: 'Reset your Maxwell Properties password',
      body: resetEmailBody({ name: user.name, token }),
      createdBy,
    });
  } catch (error) {
    console.error('Password reset email queue error:', error);
    return null;
  }
}

async function createResetRequest({ email, portal, userId = null, requestedBy = null, immediateAdmin = false }) {
  const db = getDb();
  let result = { accepted: false, status: null, requestId: null, user: null, token: null };

  await db.transaction(async (tx) => {
    const user = await findUserByResetIdentity(tx, { email, portal, userId });
    if (!user || !user.is_active) return;
    if (portal === 'admin' && user.email !== getPrimaryAdminEmail()) return;

    let existing = await tx.prepare(`
      SELECT * FROM password_reset_requests
      WHERE user_id = ? AND status IN ('pending', 'approved')
      ORDER BY requested_at DESC LIMIT 1
    `).get(user.id);
    existing = await expireOldApprovedRequest(tx, existing);

    if (existing) {
      result = { accepted: true, status: existing.status, requestId: existing.id, user };
      return;
    }

    const request = await tx.prepare(`
      INSERT INTO password_reset_requests (user_id, requested_by, status)
      VALUES (?, ?, 'pending')
    `).run(user.id, requestedBy);

    result = { accepted: true, status: 'pending', requestId: request.lastInsertRowid, user };

    if (immediateAdmin) {
      const { token, tokenHash } = createResetToken();
      await tx.prepare(`
        UPDATE password_reset_requests
        SET status = 'approved', token_hash = ?,
            token_expires_at = CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'),
            reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(tokenHash, RESET_TTL_MINUTES, user.id, request.lastInsertRowid);
      result.status = 'approved';
      result.token = token;
    }
  })();

  if (result.token && result.user) {
    result.emailJobId = await queueResetEmail({ user: result.user, token: result.token, createdBy: result.user.id });
  }
  return result;
}

export async function requestPasswordReset({ email, portal }) {
  const normalizedEmail = cleanEmail(email);
  if (!normalizedEmail || !['admin', 'manager'].includes(portal)) return { accepted: true };
  return createResetRequest({
    email: normalizedEmail,
    portal,
    immediateAdmin: portal === 'admin',
  });
}

export async function requestManagerPasswordChange({ userId, requestedBy }) {
  return createResetRequest({
    userId,
    portal: 'manager',
    requestedBy: requestedBy || userId,
  });
}

export async function approvePasswordReset(requestId, reviewedBy) {
  const db = getDb();
  let result;
  await db.transaction(async (tx) => {
    const request = await tx.prepare(`
      SELECT pr.*, u.email, u.name, u.role, u.is_active
      FROM password_reset_requests pr
      JOIN users u ON u.id = pr.user_id
      WHERE pr.id = ? AND pr.status = 'pending'
      FOR UPDATE
    `).get(requestId);
    if (!request) {
      const error = new Error('Pending password reset request not found');
      error.code = 'NOT_FOUND';
      throw error;
    }
    if (request.role !== 'manager' || !request.is_active) {
      const error = new Error('Only active manager reset requests can be approved');
      error.code = 'INVALID_REQUEST';
      throw error;
    }

    const { token, tokenHash } = createResetToken();
    await tx.prepare(`
      UPDATE password_reset_requests
      SET status = 'approved', token_hash = ?,
          token_expires_at = CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'),
          reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `).run(tokenHash, RESET_TTL_MINUTES, reviewedBy, requestId);
    result = { request, token };
  })();

  result.emailJobId = await queueResetEmail({ user: result.request, token: result.token, createdBy: reviewedBy });
  return result;
}

export async function rejectPasswordReset(requestId, reviewedBy, reviewNote = null) {
  const result = await getDb().prepare(`
    UPDATE password_reset_requests
    SET status = 'rejected', reviewed_by = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `).run(reviewedBy, reviewNote, requestId);
  if (result.changes !== 1) {
    const error = new Error('Pending password reset request not found');
    error.code = 'NOT_FOUND';
    throw error;
  }
}

export async function listPasswordResetRequests(status = 'open') {
  const db = getDb();
  const params = [];
  let query = `
    SELECT pr.id, pr.user_id, pr.status, pr.review_note, pr.requested_at,
      pr.reviewed_at, pr.token_expires_at,
      requester.name as requester_name, requester.email as requester_email,
      reviewer.name as reviewer_name
    FROM password_reset_requests pr
    JOIN users requester ON requester.id = pr.user_id
    LEFT JOIN users reviewer ON reviewer.id = pr.reviewed_by
    WHERE 1 = 1
  `;
  if (status === 'open') query += " AND pr.status IN ('pending', 'approved')";
  else if (['pending', 'approved', 'rejected', 'completed', 'expired', 'cancelled'].includes(status)) {
    query += ' AND pr.status = ?';
    params.push(status);
  }
  query += ' ORDER BY CASE WHEN pr.status = \'pending\' THEN 0 WHEN pr.status = \'approved\' THEN 1 ELSE 2 END, pr.requested_at DESC';
  return db.prepare(query).all(...params);
}

export async function completePasswordReset({ token, newPassword }) {
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    const error = new Error(passwordError);
    error.code = 'INVALID_PASSWORD';
    throw error;
  }
  const tokenHash = hashResetToken(token);
  let completed = false;
  await getDb().transaction(async (tx) => {
    const request = await tx.prepare(`
      SELECT pr.id, pr.user_id, u.email
      FROM password_reset_requests pr
      JOIN users u ON u.id = pr.user_id
      WHERE pr.token_hash = ? AND pr.status = 'approved'
        AND pr.token_expires_at > CURRENT_TIMESTAMP AND u.is_active = 1
      FOR UPDATE
    `).get(tokenHash);
    if (!request) {
      const error = new Error('This password reset link is invalid or has expired');
      error.code = 'INVALID_TOKEN';
      throw error;
    }

    const passwordHash = bcrypt.hashSync(newPassword, 12);
    await tx.prepare("UPDATE users SET password_hash = ?, auth_provider = CASE WHEN auth_provider = 'google' THEN 'password' ELSE auth_provider END WHERE id = ? AND is_active = 1").run(passwordHash, request.user_id);
    const update = await tx.prepare(`
      UPDATE password_reset_requests
      SET status = 'completed', token_hash = NULL, token_expires_at = NULL, completed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'approved'
    `).run(request.id);
    completed = update.changes === 1;
  })();
  return completed;
}

export async function hasActivePasswordReset(userId) {
  const row = await getDb().prepare(`
    SELECT id FROM password_reset_requests
    WHERE user_id = ? AND status IN ('pending', 'approved')
      AND (status = 'pending' OR token_expires_at > CURRENT_TIMESTAMP)
    LIMIT 1
  `).get(userId);
  return Boolean(row);
}

