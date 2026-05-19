const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString = "postgres://postgres.zbmfruntrdeyyxjnvhiy:FriendsInfo%401361e@aws-1-eu-north-1.pooler.supabase.com:6543/postgres";

async function simulate() {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Find admin user
  const adminRes = await client.query("SELECT * FROM users WHERE email = 'ermiasgesgis@gmail.com'");
  const admin = adminRes.rows[0];
  console.log("Admin user:", admin);

  if (!admin) {
    console.log("Admin not found!");
    await client.end();
    return;
  }

  // Simulate registering a new user
  const newUser = {
    email: `test_reg_${Date.now()}@example.com`,
    nickname: "Test Reg",
    password: "Password123!",
    role: "authorized"
  };

  try {
    const hashedPassword = bcrypt.hashSync(newUser.password, 10);
    
    // Simulate checkPermission for canManageAdmins
    const userRoleRes = await client.query("SELECT permissions FROM roles WHERE name = $1", [admin.role]);
    const perms = userRoleRes.rows[0]?.permissions || {};
    console.log("Admin permissions:", perms);

    // Simulate SQL prepared statements from index.js
    const sqlInsert = "INSERT INTO users (email, password, nickname, role, created_by_admin) VALUES ($1, $2, $3, $4, 1) RETURNING id";
    console.log("Running Insert...");
    const resInsert = await client.query(sqlInsert, [newUser.email, hashedPassword, newUser.nickname, newUser.role]);
    console.log("Insert result:", resInsert.rows[0]);

    // Clean up
    await client.query("DELETE FROM users WHERE email = $1", [newUser.email]);
    console.log("Successfully ran registration flow and cleaned up!");
  } catch (err) {
    console.error("❌ Registration flow failed:", err.message, err.stack);
  }

  await client.end();
}

simulate();
