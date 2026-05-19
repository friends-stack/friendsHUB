const BASE_URL = 'http://localhost:5000/api';

async function run() {
  console.log("=== STARTING FRIENDS INFO SYSTEM INTEGRITY TEST ===");
  let token = '';
  
  // 1. Authenticate as Super Admin
  try {
    console.log("\n🔑 [TEST 1] Logging in as Super Admin...");
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ermiasgesgis@gmail.com',
        password: 'Erma@1361f'
      })
    });
    
    if (!loginRes.ok) {
      throw new Error(`Login responded with status ${loginRes.status}`);
    }
    
    const loginData = await loginRes.json();
    token = loginData.token;
    console.log("✅ Super Admin authenticated successfully! Token acquired.");
  } catch (err) {
    console.error("❌ Test 1 Failed: Login failed!", err.message);
    process.exit(1);
  }

  const authHeaders = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` 
  };

  // 2. Register a new user (User Enrollment test)
  let registeredUserId = null;
  const testEmail = `test_enroll_${Date.now()}@example.com`;
  try {
    console.log(`\n👤 [TEST 2] Registering user: ${testEmail}...`);
    const regRes = await fetch(`${BASE_URL}/admin/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        email: testEmail,
        password: 'SecurePassword123!',
        nickname: 'Test Integration User',
        role: 'authorized'
      })
    });
    
    const text = await regRes.text();
    console.log(`Response Status: ${regRes.status}`);
    console.log(`Response Body: ${text.substring(0, 500)}`);
    
    const regData = JSON.parse(text);
    if (!regRes.ok) {
      throw new Error(regData.error || `Status ${regRes.status}`);
    }
    
    registeredUserId = regData.id;
    console.log("✅ User registered successfully! ID:", registeredUserId);
  } catch (err) {
    console.error("❌ Test 2 Failed: User enrollment rejected!", err.message);
  }

  // 3. Curator memories test
  let memoryId = null;
  try {
    console.log("\n📸 [TEST 3] Creating new memory in Curator...");
    const memoryRes = await fetch(`${BASE_URL}/memories`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Integration Test Memory',
        content: 'Testing Curator upload and persistence.',
        media_url: 'http://localhost:5000/uploads/test-image.jpg'
      })
    });
    
    const memoryData = await memoryRes.json();
    if (!memoryRes.ok) {
      throw new Error(memoryData.error || `Status ${memoryRes.status}`);
    }
    memoryId = memoryData.id || (memoryData.success ? 'success' : null);
    console.log("✅ Memory created successfully!");
  } catch (err) {
    console.error("❌ Test 3 Failed: Curator memory creation rejected!", err.message);
  }

  console.log("\n=== SYSTEM INTEGRITY TEST COMPLETE ===");
}

run();
