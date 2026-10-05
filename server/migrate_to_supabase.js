require('dotenv').config();
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in .env. Please provide your Supabase PostgreSQL connection string.');
    process.exit(1);
  }

  const sqlitePath = path.join(__dirname, 'db', 'database.sqlite');
  if (!fs.existsSync(sqlitePath)) {
    console.warn('⚠️ No local SQLite database found at:', sqlitePath);
    process.exit(0);
  }

  const sqliteDb = new Database(sqlitePath);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('🚀 Connecting to Supabase PostgreSQL...');
  await pool.query('SELECT NOW()');
  console.log('✅ Connected to Supabase PostgreSQL successfully!');

  // Apply schema first
  const schemaSql = fs.readFileSync(path.join(__dirname, 'db', 'supabase_schema.sql'), 'utf-8');
  console.log('📜 Ensuring all tables and schemas exist in Supabase...');
  await pool.query(schemaSql);
  console.log('✅ Schema applied successfully!');

  const tablesToMigrate = [
    'roles',
    'users',
    'posts',
    'comments',
    'reactions',
    'memories',
    'savings_members',
    'savings_transactions',
    'savings_config',
    'savings_investments',
    'savings_cycles',
    'logs',
    'messages',
    'system_settings',
    'personal_assets',
    'gallery',
    'bot_access'
  ];

  for (const table of tablesToMigrate) {
    try {
      const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
      if (!rows || rows.length === 0) {
        console.log(`ℹ️ Table ${table}: 0 rows in SQLite, skipping.`);
        continue;
      }
      console.log(`⏳ Migrating table ${table} (${rows.length} rows)...`);
      for (const row of rows) {
        const keys = Object.keys(row);
        const values = Object.values(row);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const columns = keys.map(k => `"${k}"`).join(', ');

        const conflictClause = table === 'roles' 
          ? 'ON CONFLICT (name) DO NOTHING'
          : table === 'system_settings'
          ? 'ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value'
          : table === 'bot_access'
          ? 'ON CONFLICT (telegram_id) DO NOTHING'
          : table === 'users'
          ? 'ON CONFLICT (email) DO UPDATE SET nickname = EXCLUDED.nickname, full_name = EXCLUDED.full_name'
          : 'ON CONFLICT DO NOTHING';

        const insertQuery = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) ${conflictClause}`;
        await pool.query(insertQuery, values);
      }
      console.log(`✅ Table ${table} migrated successfully.`);

      // Reset auto-increment sequence if id exists
      if (rows[0] && rows[0].id !== undefined) {
        try {
          await pool.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1) + 1, false) FROM ${table}`);
        } catch (seqErr) {}
      }
    } catch (err) {
      console.warn(`⚠️ Warning migrating ${table}:`, err.message);
    }
  }

  console.log('🎉 All SQLite data successfully uploaded to Supabase!');
  await pool.end();
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
