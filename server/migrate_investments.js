require('dotenv').config();
const { Pool } = require('pg');
const Database = require('better-sqlite3');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await pool.query('ALTER TABLE savings_investments ADD COLUMN IF NOT EXISTS profit NUMERIC DEFAULT 0');
  const sqliteDb = new Database('./db/database.sqlite');
  const rows = sqliteDb.prepare('SELECT * FROM savings_investments').all();
  for (const row of rows) {
    const keys = Object.keys(row);
    const values = Object.values(row);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.map(k => `"${k}"`).join(', ');
    await pool.query(`INSERT INTO savings_investments (${columns}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`, values);
  }
  await pool.query("SELECT setval(pg_get_serial_sequence('savings_investments', 'id'), COALESCE(MAX(id), 1) + 1, false) FROM savings_investments");
  const count = await pool.query('SELECT count(*) FROM savings_investments');
  console.log('🎉 Migrated savings_investments successfully! Total rows in Supabase:', count.rows[0].count);
  await pool.end();
}

run().catch(console.error);
