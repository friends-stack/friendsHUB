const bcrypt = require('bcryptjs');

const supabaseUrl = 'https://zbmfruntrdeyyxjnvhiy.supabase.co';
const serviceRoleKey = 'sb_secret_IFDdd9ZGcKl3yVLQPvkKeg_Za9_HWaZ';

async function run() {
  const email = 'ermiasgesgis@gmail.com';
  const hashed = bcrypt.hashSync('Erma@1361f', 10);

  // 1. Fetch user
  const fetchUrl = `${supabaseUrl}/rest/v1/users?email=ilike.${email}`;
  const response = await fetch(fetchUrl, {
    method: 'GET',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    console.error('Fetch failed:', await response.text());
    return;
  }

  const users = await response.json();
  console.log('Users found via REST:', users);

  if (users.length === 0) {
    // Insert
    const insertUrl = `${supabaseUrl}/rest/v1/users`;
    const insRes = await fetch(insertUrl, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        email: email,
        password: hashed,
        role: 'super_admin',
        nickname: 'Super Admin',
        created_by_admin: 1,
        status: 'active'
      })
    });
    console.log('Insert response:', await insRes.json());
  } else {
    // Update
    const updateUrl = `${supabaseUrl}/rest/v1/users?email=ilike.${email}`;
    const updRes = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        role: 'super_admin',
        password: hashed,
        totp_secret: null,
        status: 'active'
      })
    });
    console.log('Update response:', await updRes.json());
  }
}

run().catch(console.error);
