const { Client } = require('pg');

const connectionString = "postgres://postgres.zbmfruntrdeyyxjnvhiy:FriendsInfo%401361e@aws-1-eu-north-1.pooler.supabase.com:6543/postgres";

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  console.log("Tables in public schema:");
  console.log(res.rows.map(r => r.table_name));
  await client.end();
}

run();
