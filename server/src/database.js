import pg from 'pg';
import bcrypt from 'bcryptjs';
import { validatePassword } from './utils/validation.js';

const { Pool, types } = pg;

// Keep PostgreSQL numeric values convenient for the existing API response shape.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

let dbInstance = null;

function translateSql(sql) {
  let placeholder = 0;
  return sql
    .replace(/COLLATE\s+NOCASE/gi, '')
    .replace(/strftime\(\s*'%Y-%m'\s*,\s*([^\)]+)\)/gi, "to_char($1::date, 'YYYY-MM')")
    .replace(/date\(\s*'now'\s*\)/gi, 'CURRENT_DATE')
    .replace(/\bdate\(\s*([a-zA-Z_][\w.]*)\s*\)/gi, '($1::date)')
    .replace(/\?/g, () => `$${++placeholder}`);
}

function addReturningId(sql) {
  if (/^\s*INSERT\s+INTO\b/i.test(sql) && !/\bRETURNING\b/i.test(sql)) {
    return `${sql.trimEnd()} RETURNING id`;
  }
  return sql;
}

class PostgresDatabase {
  constructor(executor, pool = null) {
    this.executor = executor;
    this.pool = pool;
  }

  prepare(sql) {
    return {
      all: (...params) => this.all(sql, params),
      get: (...params) => this.get(sql, params),
      run: (...params) => this.run(sql, params),
    };
  }

  async query(sql, params = []) {
    return this.executor.query(translateSql(sql), params);
  }

  async all(sql, params = []) {
    const result = await this.query(sql, params);
    return result.rows;
  }

  async get(sql, params = []) {
    const result = await this.query(sql, params);
    return result.rows[0] || null;
  }

  async run(sql, params = []) {
    const result = await this.query(addReturningId(sql), params);
    return {
      changes: result.rowCount,
      lastInsertRowid: result.rows[0]?.id ?? null,
    };
  }

  transaction(callback) {
    return async (...args) => {
      if (!this.pool) return callback(this, ...args);
      const client = await this.pool.connect();
      const transactionDb = new PostgresDatabase(client);
      try {
        await client.query('BEGIN');
        const result = await callback(transactionDb, ...args);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    };
  }
}

async function ensureInitialAdmin(database) {
  const existing = await database.prepare('SELECT id FROM users LIMIT 1').get();
  if (existing) return;

  const email = String(process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || '';
  if (!email || !password) {
    throw new Error('The Supabase database has no users. Set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD before starting the API.');
  }
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(`INITIAL_ADMIN_PASSWORD is invalid: ${passwordError}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('INITIAL_ADMIN_EMAIL must be a valid email address');
  }

  const passwordHash = bcrypt.hashSync(password, 12);
  await database.prepare(`
    INSERT INTO users (email, password_hash, name, role, auth_provider, is_active)
    VALUES (?, ?, ?, 'admin', 'password', 1)
  `).run(email, passwordHash, process.env.INITIAL_ADMIN_NAME || 'Administrator');
}

export async function initDb({ bootstrap = true } = {}) {
  if (dbInstance) return dbInstance;

  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL is required. Configure the Supabase Postgres connection string before starting the API.');
  }

  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.SUPABASE_DB_SSL === 'false'
      ? false
      : { rejectUnauthorized: process.env.SUPABASE_DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
  });

  const database = new PostgresDatabase(pool, pool);
  try {
    await database.query('SELECT 1');
    if (bootstrap) await ensureInitialAdmin(database);
  } catch (error) {
    await pool.end();
    throw new Error(`Unable to initialize Supabase Postgres: ${error.message}`);
  }

  dbInstance = database;
  return dbInstance;
}

export function getDb() {
  if (!dbInstance) {
    throw new Error('Database has not been initialized. Call initDb() before serving requests.');
  }
  return dbInstance;
}

export async function closeDb() {
  if (!dbInstance?.pool) return;
  await dbInstance.pool.end();
  dbInstance = null;
}

