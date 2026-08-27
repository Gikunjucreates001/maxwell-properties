import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { closeDb, getDb, initDb } from './database.js';
import { getPrimaryAdminEmail } from './services/passwordResets.js';
import { validatePassword } from './utils/validation.js';

const PRIMARY_ADMIN_UID = String(process.env.PRIMARY_ADMIN_UID || 'de5516ae-cc87-4061-912f-0971cb40b102').trim();

async function countReferences(db, userId) {
  const row = await db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM expenses WHERE created_by = ?) +
      (SELECT COUNT(*) FROM approval_requests WHERE requested_by = ? OR reviewed_by = ?) +
      (SELECT COUNT(*) FROM approval_comments WHERE author_id = ?) +
      (SELECT COUNT(*) FROM notification_jobs WHERE created_by = ?) +
      (SELECT COUNT(*) FROM password_reset_requests WHERE requested_by = ? OR reviewed_by = ?) AS reference_count
  `).get(userId, userId, userId, userId, userId, userId, userId);
  return Number(row.reference_count || 0);
}

async function normalize() {
  const primaryEmail = getPrimaryAdminEmail();
  const db = await initDb({ bootstrap: false });
  try {
    let outcome = null;
    await db.transaction(async (tx) => {
      const emailMatch = await tx.prepare('SELECT * FROM users WHERE email = ? FOR UPDATE').get(primaryEmail);
      const uidMatch = PRIMARY_ADMIN_UID
        ? await tx.prepare('SELECT * FROM users WHERE auth_user_id = ? FOR UPDATE').get(PRIMARY_ADMIN_UID)
        : null;
      if (emailMatch && uidMatch && emailMatch.id !== uidMatch.id) {
        throw new Error('The primary admin email and UID belong to different records; no account was changed.');
      }

      let primary = emailMatch || uidMatch;
      if (primary?.auth_user_id && PRIMARY_ADMIN_UID && primary.auth_user_id !== PRIMARY_ADMIN_UID) {
        throw new Error('The existing primary admin record is linked to a different Auth UID; no account was changed.');
      }

      if (!primary) {
        const admins = await tx.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY created_at ASC, id ASC FOR UPDATE").all();
        if (admins.length === 1 && process.env.ALLOW_PRIMARY_ADMIN_REASSIGN !== 'false') {
          const existingAdmin = admins[0];
          await tx.prepare(`
            UPDATE users
            SET email = ?, auth_user_id = ?, role = 'admin', is_active = 1
            WHERE id = ?
          `).run(primaryEmail, PRIMARY_ADMIN_UID || null, existingAdmin.id);
          primary = await tx.prepare('SELECT * FROM users WHERE id = ?').get(existingAdmin.id);
          outcome = `Reassigned the existing administrator record to ${primaryEmail}.`;
        } else if (admins.length > 1) {
          throw new Error('More than one admin exists and the requested owner could not be matched. Review the admin records before retrying.');
        } else {
          const password = process.env.PRIMARY_ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD || '';
          const passwordError = validatePassword(password);
          if (passwordError) throw new Error(`No primary admin exists. Set PRIMARY_ADMIN_PASSWORD with a strong password before retrying (${passwordError}).`);
          const result = await tx.prepare(`
            INSERT INTO users (email, password_hash, name, role, auth_provider, auth_user_id, is_active)
            VALUES (?, ?, ?, 'admin', 'password', ?, 1)
          `).run(primaryEmail, bcrypt.hashSync(password, 12), process.env.PRIMARY_ADMIN_NAME || 'Administrator', PRIMARY_ADMIN_UID || null);
          primary = await tx.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
          outcome = `Created the primary administrator record for ${primaryEmail}.`;
        }
      } else {
        await tx.prepare(`
          UPDATE users
          SET email = ?, auth_user_id = COALESCE(auth_user_id, ?), role = 'admin', is_active = 1
          WHERE id = ?
        `).run(primaryEmail, PRIMARY_ADMIN_UID || null, primary.id);
        primary = await tx.prepare('SELECT * FROM users WHERE id = ?').get(primary.id);
        outcome = `Confirmed ${primaryEmail} as the primary administrator.`;
      }

      const otherAdmins = await tx.prepare("SELECT id, email FROM users WHERE role = 'admin' AND id <> ? FOR UPDATE").all(primary.id);
      const removed = [];
      const deactivated = [];
      for (const admin of otherAdmins) {
        const references = await countReferences(tx, admin.id);
        if (references === 0) {
          await tx.prepare("DELETE FROM users WHERE id = ? AND role = 'admin'").run(admin.id);
          removed.push(admin.email);
        } else {
          await tx.prepare("UPDATE users SET role = 'manager', is_active = 0, google_id = NULL WHERE id = ? AND role = 'admin'").run(admin.id);
          deactivated.push({ email: admin.email, references });
        }
      }

      const remaining = await tx.prepare("SELECT id, email FROM users WHERE role = 'admin'").all();
      if (remaining.length !== 1 || remaining[0].id !== primary.id) {
        throw new Error('Primary admin normalization did not leave exactly one administrator; transaction rolled back.');
      }
      outcome = { message: outcome, primaryAdmin: { id: primary.id, email: primary.email, authUserId: primary.auth_user_id }, removed, deactivated };
    })();
    console.log(JSON.stringify(outcome, null, 2));
  } finally {
    await closeDb();
  }
}

normalize().catch((error) => {
  console.error(`Primary admin normalization failed: ${error.message}`);
  process.exitCode = 1;
});

