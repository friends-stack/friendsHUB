require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const tables = [
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

  console.log('📊 Verifying Supabase PostgreSQL database tables:');
  for (const t of tables) {
    const res = await pool.query(`SELECT count(*) as c FROM ${t}`);
    console.log(`- ${t}: ${res.rows[0].c} records`);
  }

  const superAdmin = await pool.query("SELECT id, email, role, nickname FROM users WHERE role = 'super_admin'");
  console.log('\n👤 Super Admin:', superAdmin.rows);

  await pool.end();
}

run().catch(console.error);
