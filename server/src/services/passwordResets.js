import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb } from '../database.js';
import { cleanEmail, validatePassword } from '../utils/validation.js';
import { requestSupabasePasswordReset } from './supabaseAuth.js';

const RESET_TTL_MINUTES = Math.min(Math.max(Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30), 10), 120);
const SUPABASE_EMAIL_COOLDOWN_MINUTES = Math.min(Math.max(Number(process.env.SUPABASE_AUTH_EMAIL_COOLDOWN_MINUTES || 60), 10), 120);
const DEFAULT_PRIMARY_ADMIN_EMAIL = 'pnganga0133@gmail.com';

function isSupabaseRateLimited(error) {
  return error?.status === 429 || /rate limit|too many/i.test(error?.message || '');
}

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
      result = {
        accepted: true,
        status: existing.status,
        requestId: existing.id,
        user,
        rateLimited: existing.review_note === 'supabase_email_rate_limited',
      };
      return;
    }

    const request = await tx.prepare(`
      INSERT INTO password_reset_requests (user_id, requested_by, status)
      VALUES (?, ?, 'pending')
    `).run(user.id, requestedBy);

    result = { accepted: true, status: 'pending', requestId: request.lastInsertRowid, user };

    if (immediateAdmin) {
      await tx.prepare(`
        UPDATE password_reset_requests
        SET status = 'approved', token_hash = NULL,
            token_expires_at = CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'),
            reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(SUPABASE_EMAIL_COOLDOWN_MINUTES, user.id, request.lastInsertRowid);
      result.status = 'approved';
    }
  })();

  if (result.status === 'approved' && result.user) {
    try {
      await requestSupabasePasswordReset(result.user.email);
      result.emailDelivery = 'sent';
    } catch (error) {
      if (isSupabaseRateLimited(error)) {
        // Keep the approved row until the cooldown expires. This is a
        // database-backed guard across browsers and Vercel instances.
        await getDb().prepare(`
          UPDATE password_reset_requests
          SET review_note = 'supabase_email_rate_limited'
          WHERE id = ? AND status = 'approved'
        `).run(result.requestId);
        result.rateLimited = true;
      } else {
        await getDb().prepare(`
          UPDATE password_reset_requests
          SET status = 'cancelled', token_hash = NULL, token_expires_at = NULL,
              reviewed_by = NULL, reviewed_at = NULL
          WHERE id = ? AND status = 'approved'
        `).run(result.requestId);
      }
      throw error;
    }
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
      SELECT pr.*, u.email, u.name, u.role, u.is_active, u.auth_user_id
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

    if (!request.auth_user_id) {
      const error = new Error('This manager account is not linked to Supabase Auth yet. Edit the manager account and save it once to enable password recovery.');
      error.code = 'AUTH_ACCOUNT_NOT_LINKED';
      throw error;
    }
    await tx.prepare(`
      UPDATE password_reset_requests
      SET status = 'approved', token_hash = NULL,
           token_expires_at = CURRENT_TIMESTAMP + (? * INTERVAL '1 minute'),
           reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `).run(RESET_TTL_MINUTES, reviewedBy, requestId);
    result = { request };
  })();

  try {
    await requestSupabasePasswordReset(result.request.email);
    result.emailDelivery = 'sent';
  } catch (error) {
    await db.prepare(`
      UPDATE password_reset_requests
      SET status = 'pending', token_hash = NULL, token_expires_at = NULL,
          reviewed_by = NULL, reviewed_at = NULL
      WHERE id = ? AND status = 'approved'
    `).run(requestId);
    throw error;
  }
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

