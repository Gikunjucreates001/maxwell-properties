import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { closeDb, getDb, initDb } from './database.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultSqlitePath = path.resolve(scriptDirectory, '..', 'data', 'maxwell.db');
const sqlitePath = path.resolve(process.env.LEGACY_SQLITE_PATH || defaultSqlitePath);
const shouldApply = process.argv.includes('--apply');
const isDryRun = !shouldApply;

const TABLES = [
  {
    name: 'users',
    columns: ['id', 'email', 'password_hash', 'name', 'role', 'auth_provider', 'google_id', 'is_active', 'created_at'],
  },
  {
    name: 'properties',
    columns: ['id', 'name', 'type', 'location', 'address', 'description', 'status', 'monthly_rent', 'rules', 'manager_name', 'manager_phone', 'manager_email', 'caretaker_name', 'caretaker_phone', 'caretaker_email', 'created_at', 'updated_at'],
  },
  {
    name: 'units',
    columns: ['id', 'property_id', 'house_id', 'rent_amount', 'water_billing_type', 'water_rate', 'water_notes', 'status', 'created_at', 'updated_at'],
  },
  {
    name: 'tenants',
    columns: ['id', 'property_id', 'unit_id', 'name', 'email', 'phone', 'type', 'lease_start', 'lease_end', 'rent_amount', 'deposit_amount', 'physical_contract_received', 'contract_reference', 'onboarding_sent_at', 'status', 'created_at'],
  },
  {
    name: 'payments',
    columns: ['id', 'property_id', 'tenant_id', 'amount', 'payment_type', 'status', 'method', 'payment_date', 'due_date', 'notes', 'receipt_notifications_sent_at', 'created_at'],
  },
  {
    name: 'issues',
    columns: ['id', 'property_id', 'unit_id', 'title', 'description', 'priority', 'status', 'category', 'reported_date', 'resolved_date', 'notes', 'repair_cost', 'expense_id', 'created_at'],
  },
  {
    name: 'expenses',
    columns: ['id', 'property_id', 'unit_id', 'issue_id', 'category', 'description', 'amount', 'expense_date', 'notes', 'created_by', 'created_at'],
  },
  {
    name: 'approval_requests',
    columns: ['id', 'requested_by', 'entity_type', 'entity_id', 'action', 'payload_json', 'reason', 'status', 'reviewed_by', 'review_note', 'reviewed_at', 'executed_at', 'created_at'],
  },
  {
    name: 'approval_comments',
    columns: ['id', 'approval_id', 'author_id', 'comment', 'created_at'],
  },
  {
    name: 'notification_jobs',
    columns: ['id', 'tenant_id', 'channel', 'notification_type', 'recipient', 'subject', 'body', 'status', 'scheduled_for', 'sent_at', 'error', 'created_by', 'created_at'],
  },
];

const TIMESTAMP_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'onboarding_sent_at',
  'receipt_notifications_sent_at',
  'reviewed_at',
  'executed_at',
  'scheduled_for',
  'sent_at',
]);

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return `${text.replace(' ', 'T')}Z`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeValue(column, value) {
  if (TIMESTAMP_COLUMNS.has(column)) {
    const timestamp = normalizeTimestamp(value);
    if (!timestamp && (column === 'created_at' || column === 'updated_at')) return new Date().toISOString();
    return timestamp;
  }
  if (column === 'entity_id' && value !== null && value !== undefined && value !== '') return String(value);
  return value === undefined ? null : value;
}

function readLegacyRows(sqlite, table, columns) {
  return sqlite.prepare(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY id ASC`).all();
}

async function insertRows(db, table, columns, rows) {
  if (!rows.length) return;
  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns.filter((column) => column !== 'id').map((column) => `${column} = EXCLUDED.${column}`).join(', ');
  const statement = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updates}`;
  for (const row of rows) {
    await db.prepare(statement).run(...columns.map((column) => normalizeValue(column, row[column])));
  }
}

async function resetSequences(db) {
  for (const { name } of TABLES) {
    await db.query(`SELECT setval(pg_get_serial_sequence('public.${name}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM public.${name}`);
  }
}

async function countRows(db, table) {
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  return Number(row.count);
}

async function migrate() {
  if (!fs.existsSync(sqlitePath)) throw new Error(`Legacy SQLite database was not found at ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true });
  try {
    const legacyRows = new Map(TABLES.map(({ name, columns }) => [name, readLegacyRows(sqlite, name, columns)]));
    const db = await initDb({ bootstrap: false });
    try {
      try {
        await db.transaction(async (tx) => {
          for (const { name, columns } of TABLES) {
            // The issue-to-expense foreign key is restored after both tables exist.
            const rows = name === 'issues'
              ? legacyRows.get(name).map((row) => ({ ...row, expense_id: null }))
              : legacyRows.get(name);
            await insertRows(tx, `public.${name}`, columns, rows);
          }

          for (const issue of legacyRows.get('issues')) {
            if (issue.expense_id === null || issue.expense_id === undefined) continue;
            const expenseExists = await tx.prepare('SELECT id FROM public.expenses WHERE id = ?').get(issue.expense_id);
            if (expenseExists) await tx.prepare('UPDATE public.issues SET expense_id = ? WHERE id = ?').run(issue.expense_id, issue.id);
          }
          await resetSequences(tx);
          if (isDryRun) {
            const error = new Error('Dry run requested; rolling back without changing Supabase');
            error.code = 'DRY_RUN';
            throw error;
          }
        })();
      } catch (error) {
        if (error.code !== 'DRY_RUN') throw error;
      }

      const counts = [];
      for (const { name } of TABLES) {
        const expected = legacyRows.get(name).length;
        const actual = isDryRun ? null : await countRows(db, `public.${name}`);
        counts.push({ table: name, expected, actual });
        if (!isDryRun && actual < expected) throw new Error(`Migration verification failed for ${name}: expected at least ${expected}, found ${actual}`);
      }
      console.log(`${isDryRun ? 'Dry run complete' : 'Migration complete'} for ${sqlitePath}`);
      for (const row of counts) console.log(`${row.table}: ${row.expected}${isDryRun ? '' : ` -> ${row.actual}`}`);
    } finally {
      await closeDb();
    }
  } finally {
    sqlite.close();
  }
}

migrate().catch((error) => {
  console.error(`SQLite to Supabase migration failed: ${error.message}`);
  process.exitCode = 1;
});

