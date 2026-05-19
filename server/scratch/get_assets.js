const { Client } = require('pg');

const connectionString = "postgres://postgres.zbmfruntrdeyyxjnvhiy:FriendsInfo%401361e@aws-1-eu-north-1.pooler.supabase.com:6543/postgres";

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  const res = await client.query('SELECT * FROM personal_assets ORDER BY id DESC LIMIT 5');
  console.log("Recent Personal Assets in PostgreSQL:");
  console.log(res.rows);
  
  await client.end();
}

run();
