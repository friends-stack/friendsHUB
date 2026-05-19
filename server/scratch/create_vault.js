const { Client } = require('pg');

const connectionString = "postgres://postgres.zbmfruntrdeyyxjnvhiy:FriendsInfo%401361e@aws-1-eu-north-1.pooler.supabase.com:6543/postgres";

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected to Supabase PostgreSQL.");
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS personal_assets (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  console.log("Successfully created personal_assets table!");
  await client.end();
}

run();
