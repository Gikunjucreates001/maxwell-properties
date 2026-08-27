import 'dotenv/config';
import { closeDb, getDb, initDb } from './database.js';

const EXPECTED_TABLES = ['users', 'properties', 'units', 'tenants', 'payments', 'issues', 'expenses', 'approval_requests', 'approval_comments', 'notification_jobs'];

async function verify() {
  await initDb({ bootstrap: false });
  const db = getDb();
  try {
    const tables = await db.prepare(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY(?::text[])
      ORDER BY table_name
    `).all(EXPECTED_TABLES);
    const actualTables = new Set(tables.map((row) => row.table_name));
    const missingTables = EXPECTED_TABLES.filter((table) => !actualTables.has(table));
    if (missingTables.length) throw new Error(`Missing Supabase tables: ${missingTables.join(', ')}`);

    const rlsRows = await db.prepare(`
      SELECT c.relname as table_name, c.relrowsecurity as rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY(?::text[])
    `).all(EXPECTED_TABLES);
    const rlsDisabled = rlsRows.filter((row) => !row.rls_enabled).map((row) => row.table_name);
    if (rlsDisabled.length) throw new Error(`RLS is disabled on: ${rlsDisabled.join(', ')}`);

    const invalidActiveTenants = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id
      LEFT JOIN units u ON u.id = t.unit_id
      WHERE t.status = 'active' AND (p.id IS NULL OR (u.id IS NULL AND p.type IN ('apartment', 'rental')) OR u.status = 'maintenance')
    `).get();
    if (Number(invalidActiveTenants.count) > 0) throw new Error(`Found ${invalidActiveTenants.count} invalid active tenant allocation(s)`);

    const counts = {};
    for (const table of EXPECTED_TABLES) {
      counts[table] = Number((await db.prepare(`SELECT COUNT(*) AS count FROM public.${table}`).get()).count);
    }
    console.log('Supabase verification passed');
    console.log(JSON.stringify({ tables: EXPECTED_TABLES, counts }, null, 2));
  } finally {
    await closeDb();
  }
}

verify().catch((error) => {
  console.error(`Supabase verification failed: ${error.message}`);
  process.exitCode = 1;
});

