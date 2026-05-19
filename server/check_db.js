const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const regions = [
  'aws-0-us-west-1.pooler.supabase.com',
  'aws-0-us-west-2.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-us-east-2.pooler.supabase.com',
  'aws-0-eu-west-1.pooler.supabase.com',
  'aws-0-ap-southeast-1.pooler.supabase.com'
];

async function tryConnect() {
  const email = 'ermiasgesgis@gmail.com';
  const hashed = bcrypt.hashSync('Erma@1361f', 10);

  for (const host of regions) {
    const connectionString = `postgresql://postgres.zbmfruntrdeyyxjnvhiy:FriendsInfo@1361e@${host}:6543/postgres`;
    console.log(`Trying host: ${host}...`);
    const client = new Client({ 
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    try {
      await client.connect();
      console.log(`🎉 Connected successfully to host: ${host}!`);
      
      const res = await client.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      console.log('Users found:', res.rows);

      if (res.rows.length === 0) {
        await client.query(`
          INSERT INTO users (
            email, password, role, nickname, created_by_admin, status
          ) VALUES ($1, $2, 'super_admin', 'Super Admin', 1, 'active')
        `, [email, hashed]);
        console.log('Successfully seeded superadmin user!');
      } else {
        await client.query(`
          UPDATE users 
          SET role = 'super_admin', password = $2, totp_secret = NULL, status = 'active'
          WHERE LOWER(email) = LOWER($1)
        `, [email, hashed]);
        console.log('Successfully updated superadmin user!');
      }

      const verify = await client.query('SELECT id, email, role, status, totp_secret FROM users WHERE LOWER(email) = LOWER($1)', [email]);
      console.log('Verified state:', verify.rows);

      await client.end();
      return;
    } catch (err) {
      console.log(`Failed for host ${host}: ${err.message}`);
    }
  }
  console.log('Could not connect to any pooler region.');
}

tryConnect().catch(console.error);
