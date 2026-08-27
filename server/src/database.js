import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

let dbInstance = null;

export function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, 'maxwell.db');
  const db = new Database(dbPath);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      auth_provider TEXT NOT NULL DEFAULT 'password',
      google_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('rental', 'airbnb', 'apartment')),
      location TEXT,
      address TEXT,
      description TEXT,
      status TEXT DEFAULT 'active',
      monthly_rent REAL DEFAULT 0,
      rules TEXT,
      manager_name TEXT,
      manager_phone TEXT,
      manager_email TEXT,
      caretaker_name TEXT,
      caretaker_phone TEXT,
      caretaker_email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL,
      house_id TEXT NOT NULL,
      rent_amount REAL NOT NULL DEFAULT 0 CHECK(rent_amount >= 0),
      water_billing_type TEXT NOT NULL DEFAULT 'included' CHECK(water_billing_type IN ('included', 'fixed', 'metered')),
      water_rate REAL NOT NULL DEFAULT 0 CHECK(water_rate >= 0),
      water_notes TEXT,
      status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready', 'maintenance')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(property_id, house_id),
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER,
      unit_id INTEGER,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      type TEXT DEFAULT 'long-term' CHECK(type IN ('long-term', 'short-term')),
      lease_start DATE,
      lease_end DATE,
      rent_amount REAL DEFAULT 0,
      deposit_amount REAL DEFAULT 0,
      physical_contract_received INTEGER NOT NULL DEFAULT 0,
      contract_reference TEXT,
      onboarding_sent_at DATETIME,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties(id),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER,
      tenant_id INTEGER,
      amount REAL NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'rent' CHECK(payment_type IN ('deposit', 'rent', 'water', 'other')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('paid', 'pending', 'overdue', 'partial')),
      method TEXT CHECK(method IN ('mpesa', 'bank', 'cash', 'other')),
      payment_date DATE,
      due_date DATE,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER,
      unit_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
      status TEXT DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'resolved', 'closed')),
      category TEXT CHECK(category IN ('plumbing', 'electrical', 'structural', 'appliance', 'pest', 'other')),
      reported_date DATE DEFAULT CURRENT_DATE,
      resolved_date DATE,
      notes TEXT,
      repair_cost REAL NOT NULL DEFAULT 0 CHECK(repair_cost >= 0),
      expense_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties(id),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL,
      unit_id INTEGER,
      issue_id INTEGER,
      category TEXT NOT NULL CHECK(category IN ('repair', 'septic', 'manager_salary', 'caretaker', 'cleaner', 'custom')),
      description TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      expense_date DATE NOT NULL,
      notes TEXT,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties(id),
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
      FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS approval_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requested_by INTEGER NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('property', 'tenant', 'unit', 'expense', 'issue', 'payment')),
      entity_id TEXT,
      action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
      payload_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
      reviewed_by INTEGER,
      review_note TEXT,
      reviewed_at DATETIME,
      executed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requested_by) REFERENCES users(id),
      FOREIGN KEY (reviewed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS approval_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      approval_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (approval_id) REFERENCES approval_requests(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notification_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      channel TEXT NOT NULL CHECK(channel IN ('email', 'sms')),
      notification_type TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'sent', 'failed')),
      scheduled_for DATETIME,
      sent_at DATETIME,
      error TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);

  // Add account fields for databases created by earlier versions.
  const addColumnIfMissing = (column, definition) => {
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (!String(error.message).toLowerCase().includes('duplicate column name')) throw error;
    }
  };
  addColumnIfMissing('auth_provider', "TEXT NOT NULL DEFAULT 'password'");
  addColumnIfMissing('google_id', 'TEXT');
  addColumnIfMissing('is_active', 'INTEGER NOT NULL DEFAULT 1');
  const addPropertyColumnIfMissing = (column, definition) => {
    try {
      db.exec(`ALTER TABLE properties ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (!String(error.message).toLowerCase().includes('duplicate column name')) throw error;
    }
  };
  const addTenantColumnIfMissing = (column, definition) => {
    try {
      db.exec(`ALTER TABLE tenants ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (!String(error.message).toLowerCase().includes('duplicate column name')) throw error;
    }
  };
  const addPaymentColumnIfMissing = (column, definition) => {
    try {
      db.exec(`ALTER TABLE payments ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (!String(error.message).toLowerCase().includes('duplicate column name')) throw error;
    }
  };
  const addIssueColumnIfMissing = (column, definition) => {
    try {
      db.exec(`ALTER TABLE issues ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (!String(error.message).toLowerCase().includes('duplicate column name')) throw error;
    }
  };
  addPropertyColumnIfMissing('rules', 'TEXT');
  addPropertyColumnIfMissing('manager_name', 'TEXT');
  addPropertyColumnIfMissing('manager_phone', 'TEXT');
  addPropertyColumnIfMissing('manager_email', 'TEXT');
  addPropertyColumnIfMissing('caretaker_name', 'TEXT');
  addPropertyColumnIfMissing('caretaker_phone', 'TEXT');
  addPropertyColumnIfMissing('caretaker_email', 'TEXT');
  addTenantColumnIfMissing('unit_id', 'INTEGER');
  addTenantColumnIfMissing('deposit_amount', 'REAL NOT NULL DEFAULT 0');
  addTenantColumnIfMissing('physical_contract_received', 'INTEGER NOT NULL DEFAULT 0');
  addTenantColumnIfMissing('contract_reference', 'TEXT');
  addTenantColumnIfMissing('onboarding_sent_at', 'DATETIME');
  addPaymentColumnIfMissing('payment_type', "TEXT NOT NULL DEFAULT 'rent'");
  addPaymentColumnIfMissing('receipt_notifications_sent_at', 'DATETIME');
  addIssueColumnIfMissing('unit_id', 'INTEGER');
  addIssueColumnIfMissing('repair_cost', 'REAL NOT NULL DEFAULT 0');
  addIssueColumnIfMissing('expense_id', 'INTEGER');

  // Extend the approval entity list for financial record corrections while
  // preserving any approval requests created by an older database version.
  const approvalSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'approval_requests'").get();
  if (approvalSchema?.sql && !approvalSchema.sql.includes("'payment'")) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DROP INDEX IF EXISTS idx_approvals_status;
      DROP INDEX IF EXISTS idx_approvals_requested_by;
      DROP INDEX IF EXISTS idx_approval_comments_approval_id;
      ALTER TABLE approval_requests RENAME TO approval_requests_legacy;
      ALTER TABLE approval_comments RENAME TO approval_comments_legacy;
      CREATE TABLE approval_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requested_by INTEGER NOT NULL,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('property', 'tenant', 'unit', 'expense', 'issue', 'payment')),
        entity_id TEXT,
        action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
        payload_json TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
        reviewed_by INTEGER,
        review_note TEXT,
        reviewed_at DATETIME,
        executed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (requested_by) REFERENCES users(id),
        FOREIGN KEY (reviewed_by) REFERENCES users(id)
      );
      CREATE TABLE approval_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        approval_id INTEGER NOT NULL,
        author_id INTEGER NOT NULL,
        comment TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (approval_id) REFERENCES approval_requests(id) ON DELETE CASCADE,
        FOREIGN KEY (author_id) REFERENCES users(id)
      );
      INSERT INTO approval_requests (id, requested_by, entity_type, entity_id, action, payload_json, reason, status, reviewed_by, review_note, reviewed_at, executed_at, created_at)
        SELECT id, requested_by, entity_type, entity_id, action, payload_json, reason, status, reviewed_by, review_note, reviewed_at, executed_at, created_at FROM approval_requests_legacy;
      INSERT INTO approval_comments (id, approval_id, author_id, comment, created_at)
        SELECT id, approval_id, author_id, comment, created_at FROM approval_comments_legacy;
      DROP TABLE approval_comments_legacy;
      DROP TABLE approval_requests_legacy;
    `);
    db.pragma('foreign_keys = ON');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_units_property_id ON units(property_id);
    CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);
    CREATE INDEX IF NOT EXISTS idx_tenants_unit_id ON tenants(unit_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_tenant_per_unit ON tenants(unit_id) WHERE unit_id IS NOT NULL AND status = 'active';
    CREATE INDEX IF NOT EXISTS idx_tenants_property_id ON tenants(property_id);
    CREATE INDEX IF NOT EXISTS idx_payments_property_id ON payments(property_id);
    CREATE INDEX IF NOT EXISTS idx_payments_tenant_id ON payments(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_issues_property_id ON issues(property_id);
    CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
    CREATE INDEX IF NOT EXISTS idx_issues_unit_id ON issues(unit_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_property_id ON expenses(property_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_issue_id ON expenses(issue_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(status);
    CREATE INDEX IF NOT EXISTS idx_approvals_requested_by ON approval_requests(requested_by);
    CREATE INDEX IF NOT EXISTS idx_approval_comments_approval_id ON approval_comments(approval_id);
    CREATE INDEX IF NOT EXISTS idx_notification_jobs_status ON notification_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_notification_jobs_tenant_id ON notification_jobs(tenant_id);
  `);

  // Seed Admin User
  const userCheck = db.prepare('SELECT count(*) as count FROM users WHERE email = ?').get('maxwell@properties.com');
  if (userCheck.count === 0) {
    const hash = bcrypt.hashSync('Maxwell@2024!', 12);
    db.prepare(`
      INSERT INTO users (email, password_hash, name, role) 
      VALUES (?, ?, ?, ?)
    `).run('maxwell@properties.com', hash, 'Maxwell', 'admin');
  }

  // Seed Properties
  const propCheck = db.prepare('SELECT count(*) as count FROM properties').get();
  if (propCheck.count === 0) {
    const insertProp = db.prepare(`
      INSERT INTO properties (name, type, location, address, description, monthly_rent, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertTransaction = db.transaction(() => {
      insertProp.run('Rented House', 'rental', 'Nairobi', 'Nairobi, Kenya', 'Long-term rental house', 45000, 'active');
      insertProp.run('Mombasa Airbnb', 'airbnb', 'Mombasa', 'Mombasa, Kenya', 'Vacation rental property in Mombasa', 5000, 'active');
      insertProp.run('Ruai Apartment', 'apartment', 'Ruai, Nairobi', 'Ruai, Nairobi, Kenya', 'Rental apartment in Ruai', 25000, 'active');
    });
    
    insertTransaction();
  }

  dbInstance = db;
  return dbInstance;
}

