const { Client } = require('pg');

const connectionString = "postgres://postgres.zbmfruntrdeyyxjnvhiy:FriendsInfo%401361e@aws-1-eu-north-1.pooler.supabase.com:6543/postgres";

async function diagnose() {
  const client = new Client({ 
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL.");

    // 1. Check roles table
    const rolesRes = await client.query("SELECT * FROM roles");
    console.log("\n--- seeded roles ---");
    console.log(rolesRes.rows);

    // 2. Check users columns
    const colsRes = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    console.log("\n--- users columns ---");
    console.log(colsRes.rows.map(c => `${c.column_name} (${c.data_type}, nullable=${c.is_nullable})`));

    // 3. Test insert mock user to see the exact error
    console.log("\n--- attempting mock user insert ---");
    try {
      const mockEmail = `mock_${Date.now()}@example.com`;
      await client.query(`
        INSERT INTO users (email, password, nickname, role, created_by_admin) 
        VALUES ($1, $2, $3, $4, 1)
      `, [mockEmail, "mockhashedpassword", "Mock User", "authorized"]);
      console.log("Mock user inserted successfully!");
      // Clean up mock user
      await client.query("DELETE FROM users WHERE email = $1", [mockEmail]);
    } catch (insertErr) {
      console.error("❌ Mock insert failed with error:", insertErr.message, insertErr.stack);
    }

    await client.end();
  } catch (err) {
    console.error("Diagnostic error:", err);
  }
}

diagnose();
