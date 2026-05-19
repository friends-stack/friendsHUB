const { Client } = require('pg');

const connectionString = "postgres://postgres.zbmfruntrdeyyxjnvhiy:FriendsInfo%401361e@aws-1-eu-north-1.pooler.supabase.com:6543/postgres";

async function run() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  try {
    console.log("Testing insert into gallery...");
    const res = await client.query("INSERT INTO gallery (url, title, caption) VALUES ($1, $2, $3) RETURNING id", [
      "https://example.com/test.jpg",
      "Test Title",
      "Test Caption"
    ]);
    console.log("Insert Success! Row:", res.rows[0]);
  } catch (err) {
    console.error("Insert Failed:", err.message);
  }
  
  await client.end();
}

run();
