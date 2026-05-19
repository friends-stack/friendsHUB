require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const { Telegraf, Markup } = require('telegraf');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cron = require('node-cron');

// Resolve connection string with dynamic fallback for Supabase hosting
let connectionString = process.env.DATABASE_URL;
if (!connectionString || connectionString.startsWith('http')) {
  console.log('ℹ️ DATABASE_URL is missing or is a REST URL. Auto-constructing connection string from Supabase project credentials...');
  const projectRef = 'zbmfruntrdeyyxjnvhiy';
  const dbPassword = encodeURIComponent('FriendsInfo@1361e');
  connectionString = `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`;
}

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: connectionString,
  ssl: connectionString && (connectionString.includes('localhost') || connectionString.includes('127.0.0.1'))
    ? false
    : { rejectUnauthorized: false }
});

// Handle idle client errors securely to prevent process crashes
pool.on('error', (err) => {
  console.error('⚠️ Unexpected error on idle database client:', err.message);
});

// Ensure upload directory exists
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// MIME-type extension mappings for fallback
const MIME_EXTENSIONS = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/plain': '.txt',
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/mpeg': '.mpeg',
  'video/quicktime': '.mov'
};

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname);
    if (!ext) {
      ext = MIME_EXTENSIONS[file.mimetype] || '';
    }
    const cleanOriginal = file.originalname.endsWith(ext)
      ? file.originalname.slice(0, -ext.length)
      : file.originalname;
    const baseName = cleanOriginal === 'blob' ? 'document' : cleanOriginal;
    cb(null, Date.now() + '-' + baseName + ext);
  }
});
const upload = multer({ storage });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

class Statement {
  constructor(sql) {
    let paramCounter = 1;
    this.sql = sql.replace(/\?/g, () => `$${paramCounter++}`);
    if (this.sql.trim().toUpperCase().startsWith('INSERT') && !this.sql.toUpperCase().includes('RETURNING')) {
      this.sql += ' RETURNING id';
    }
  }
  async get(...args) {
    const res = await pool.query(this.sql, args.flat());
    return res.rows[0];
  }
  async all(...args) {
    const res = await pool.query(this.sql, args.flat());
    return res.rows;
  }
  async run(...args) {
    const res = await pool.query(this.sql, args.flat());
    return { changes: res.rowCount, lastInsertRowid: res.rows[0]?.id };
  }
}

const db = {
  prepare: (sql) => new Statement(sql),
  exec: async (sql) => {
    try {
      await pool.query(sql);
    } catch(e) {
      console.error(`⚠️ DB Exec Error/Warning:\nQuery: ${sql.substring(0, 100)}...\nError:`, e.message);
      if (e.code === '28P01' || e.code === 'ECONNREFUSED' || e.message.includes('connect')) {
        throw e;
      }
    }
  },
  transaction: (fn) => {
    return async (...args) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const res = await fn(...args); 
        await client.query('COMMIT');
        return res;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
  }
};

// Run all startup init tasks inside an async IIFE (CommonJS does not support top-level await)
(async () => {
  // 1. Create roles and users tables first to prevent migration chicken-and-egg errors
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      name TEXT PRIMARY KEY,
      permissions JSONB NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL REFERENCES roles(name),
      nickname TEXT,
      dob TEXT,
      gender TEXT,
      mobile TEXT,
      address TEXT,
      bio TEXT,
      profile_picture TEXT,
      telegram_username TEXT,
      fav_food_drink TEXT,
      cover_photo TEXT,
      created_by_admin INTEGER DEFAULT 0,
      totp_secret TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT now()
    )
  `);

  // Migration: Add columns and tables if not exists
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT");
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS dob TEXT");
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT");
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile TEXT");
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT");
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT");
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT");
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username TEXT");
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS fav_food_drink TEXT");
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_photo TEXT");
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_admin INTEGER DEFAULT 0");
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT");
  await db.exec("ALTER TABLE savings_transactions ADD COLUMN IF NOT EXISTS notes TEXT");
  await db.exec("ALTER TABLE messages ADD COLUMN IF NOT EXISTS receiver_id INTEGER");
  await db.exec("ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER");
  await db.exec("ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT");
  await db.exec("ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'text'");

  await db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      media_url TEXT,
      last_day_meet TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id BIGSERIAL PRIMARY KEY,
      post_id INTEGER,
      memory_id INTEGER,
      gallery_id INTEGER,
      personal_asset_id INTEGER,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      reply_to_id INTEGER,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS reactions (
      id BIGSERIAL PRIMARY KEY,
      target_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      reaction_type TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT,
      content TEXT,
      media_url TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS savings_members (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS savings_transactions (
      id BIGSERIAL PRIMARY KEY,
      member_id INTEGER NOT NULL,
      amount NUMERIC NOT NULL,
      type TEXT NOT NULL,
      notes TEXT,
      confirmed_by TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS savings_config (
      id BIGSERIAL PRIMARY KEY,
      weekly_amount NUMERIC NOT NULL,
      effective_date TIMESTAMP DEFAULT now()
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS savings_investments (
      id BIGSERIAL PRIMARY KEY,
      project_name TEXT NOT NULL,
      allocated_amount NUMERIC NOT NULL,
      projected_profit NUMERIC DEFAULT 0,
      challenges TEXT,
      expected_days INTEGER,
      status TEXT DEFAULT 'active',
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      timestamp TIMESTAMP DEFAULT now()
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER,
      group_id INTEGER,
      content TEXT,
      media_url TEXT,
      media_type TEXT DEFAULT 'text',
      reply_to_id INTEGER,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  await db.exec(`INSERT INTO system_settings (key, value) SELECT 'clerk_id', '' WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'clerk_id')`);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS personal_assets (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      name TEXT PRIMARY KEY,
      permissions JSONB NOT NULL
    )
  `);
  // Seed default roles
  const superAdminPerms = JSON.stringify({ canViewLogs: true, canManageAdmins: true, canManageSavings: true });
  const adminPerms = JSON.stringify({ canViewLogs: true, canManageAdmins: true, canManageSavings: false });
  const userPerms = JSON.stringify({ canViewLogs: false, canManageAdmins: false, canManageSavings: false });
  await db.exec(`INSERT INTO roles (name, permissions) VALUES ('super_admin', '${superAdminPerms}') ON CONFLICT (name) DO NOTHING`);
  await db.exec(`INSERT INTO roles (name, permissions) VALUES ('admin', '${adminPerms}') ON CONFLICT (name) DO NOTHING`);
  await db.exec(`INSERT INTO roles (name, permissions) VALUES ('authorized', '${userPerms}') ON CONFLICT (name) DO NOTHING`);
  await db.exec(`INSERT INTO roles (name, permissions) VALUES ('user', '${userPerms}') ON CONFLICT (name) DO NOTHING`);

  // Insert default config if empty
  const configCount = await db.prepare('SELECT COUNT(*) as count FROM savings_config').get();
  if (parseInt(configCount?.count || 0) === 0) {
    await db.prepare('INSERT INTO savings_config (weekly_amount) VALUES (?)').run(300);
  }

  // Seed default superadmin if not exists, or verify/upgrade role, password, and clear 2FA if exists
  const superAdminEmail = 'ermiasgesgis@gmail.com';
  const defaultSuperAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'Erma@1361f';
  const hashedSA = bcrypt.hashSync(defaultSuperAdminPassword, 10);

  const superAdminUser = await db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(superAdminEmail);
  if (!superAdminUser) {
    await db.prepare(`
      INSERT INTO users (
        email, password, role, nickname, created_by_admin, status
      ) VALUES (?, ?, ?, ?, 1, 'active')
    `).run(superAdminEmail, hashedSA, 'super_admin', 'Super Admin');
    console.log(`👤 Seeded default superadmin: ${superAdminEmail}`);
  } else {
    await db.prepare("UPDATE users SET role = 'super_admin', password = ?, totp_secret = NULL WHERE LOWER(email) = LOWER(?)").run(hashedSA, superAdminEmail);
    console.log(`👤 Verified role 'super_admin', synchronized password, and cleared 2FA for user: ${superAdminEmail}`);
  }

  console.log('✅ Database initialized successfully');
})().catch(err => {
  console.error('❌ DB init failed:', err);
  process.exit(1);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static(UPLOADS_DIR));

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-123';
const TG_TOKEN = process.env.TG_TOKEN;
const bot = TG_TOKEN ? new Telegraf(TG_TOKEN) : null;


// RBAC Middleware
const checkAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const checkPermission = (permission) => async (req, res, next) => {
  const user = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  const role = await db.prepare('SELECT permissions FROM roles WHERE name = ?').get(user.role);
  const perms = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions;

  if (perms[permission]) {
    next();
  } else {
    logAction(req.user.id, 'SECURITY_ALERT', `Unauthorized attempt to access: ${permission}`);
    res.status(404).json({ error: 'Not Found' }); // Stealth mode
  }
};

const checkPaymentClerk = async (req, res, next) => {
  const clerkSetting = await db.prepare("SELECT value FROM system_settings WHERE key = 'clerk_id'").get();
  const clerkId = clerkSetting && clerkSetting.value ? parseInt(clerkSetting.value) : null;
  if (req.user.id === clerkId) {
    next();
  } else {
    res.status(403).json({ error: 'Only the designated clerk can manage payments' });
  }
};

const checkSavingsManager = async (req, res, next) => {
  const user = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  if (user.role === 'super_admin') {
    next();
  } else {
    res.status(403).json({ error: 'Only Super Admin can manage members and settings' });
  }
};

// Generic Image Upload for all authenticated users
app.post('/api/upload', checkAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const fileUrl = `${protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});


// Logging Function
const logAction = (userId, action, details) => {
  db.prepare('INSERT INTO logs (user_id, action, details) VALUES (?, ?, ?)').run(userId, action, details).catch(console.error);

  // Exclude private personal uploads from being sent to the Telegram bot
  if (action === 'PERSONAL_ASSET_UPLOAD') {
    return;
  }

  if (bot && process.env.ADMIN_CHAT_ID && process.env.ADMIN_CHAT_ID !== 'YOUR_CHAT_ID') {
    const alertPrefix = action.includes('ALERT') ? '⚠️ SECURITY ALERT' : '🔔';
    const message = action.includes('ALERT') 
      ? `${alertPrefix}: ${details}`
      : `${alertPrefix} ${details}`;
    bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, message).catch(console.error);
  }
};

// Routes
app.post('/api/auth/signup', async (req, res) => {
  const {
    email, password, nickname, dob, gender, mobile, address,
    bio, profile_picture, telegram_username, fav_food_drink
  } = req.body;

  if (!email || !password || !nickname || !mobile || !gender || !address || !telegram_username) {
    return res.status(400).json({ error: 'All fields (Nickname, Mobile Number, Gender, Address / Location, and Telegram Username) are required for signup.' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    const insert = db.prepare(`
      INSERT INTO users (
        email, password, role, nickname, dob, gender, mobile, address, 
        bio, profile_picture, telegram_username, fav_food_drink, created_by_admin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
    const result = await insert.run(
      email, hashedPassword, 'user', nickname, dob, gender, mobile, address,
      bio, profile_picture, telegram_username, fav_food_drink
    );
    const botMessage = `👤 New Identity Registered!\n\n📛 Name: ${nickname}\n📞 Phone No: ${mobile}\n📍 Address: ${address}\n✈️ Telegram Username: ${telegram_username}`;
    logAction(result.lastInsertRowid, 'SIGNUP_SUCCESS', botMessage);
    res.json({ message: 'User created successfully' });
  } catch (err) {
    logAction(null, 'SIGNUP_ATTEMPT_EXISTING', `Email: ${email} | Error: ${err.message}`);
    res.status(400).json({ error: 'Email already exists or invalid data' });
  }
});

app.put('/api/profile', checkAuth, async (req, res) => {
  const {
    nickname, dob, gender, mobile, address,
    bio, profile_picture, cover_photo, telegram_username, fav_food_drink
  } = req.body;

  try {
    const oldProfile = await db.prepare('SELECT nickname, dob, gender, mobile, address, bio, telegram_username, fav_food_drink, email FROM users WHERE id = ?').get(req.user.id);

    await db.prepare(`
      UPDATE users SET 
        nickname = ?, dob = ?, gender = ?, mobile = ?, address = ?, 
        bio = ?, profile_picture = ?, cover_photo = ?, telegram_username = ?, fav_food_drink = ?
      WHERE id = ?
    `).run(
      nickname, dob, gender, mobile, address,
      bio, profile_picture, cover_photo, telegram_username, fav_food_drink,
      req.user.id
    );

    // Compare fields to see what changed
    const changes = [];
    const fields = [
      { key: 'nickname', label: 'Full Name / Nickname' },
      { key: 'dob', label: 'Date of Birth' },
      { key: 'gender', label: 'Gender' },
      { key: 'mobile', label: 'Mobile Number' },
      { key: 'address', label: 'Address / Location' },
      { key: 'bio', label: 'Bio' },
      { key: 'telegram_username', label: 'Telegram Username' },
      { key: 'fav_food_drink', label: 'Favourite Food & Drink' }
    ];

    fields.forEach(f => {
      const oldVal = oldProfile ? oldProfile[f.key] : '';
      const newVal = req.body[f.key];
      // Only compare if newVal was passed in req.body
      if (newVal !== undefined && String(oldVal || '') !== String(newVal || '')) {
        changes.push(`• ${f.label}: "${oldVal || 'Not set'}" ➔ "${newVal || 'Cleared'}"`);
      }
    });

    const updatedName = nickname || (oldProfile ? (oldProfile.nickname || oldProfile.email.split('@')[0]) : 'User');
    let message = `${updatedName} updated their profile`;
    if (changes.length > 0) {
      message += `\n\n✏️ Changes:\n${changes.join('\n')}`;
    } else {
      message += ` (no field values changed)`;
    }

    logAction(req.user.id, 'PROFILE_UPDATE', message);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/profile/:id', checkAuth, async (req, res) => {
  const user = await db.prepare('SELECT id, email, role, nickname, dob, gender, mobile, address, bio, profile_picture, cover_photo, telegram_username, fav_food_drink, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});


app.get('/api/users', checkAuth, async (req, res) => {
  const users = await db.prepare('SELECT id, email, role, nickname, profile_picture, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.delete('/api/users/:id', checkAuth, checkSavingsManager, async (req, res) => {
  const targetUser = await db.prepare('SELECT email, role FROM users WHERE id = ?').get(req.params.id);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });
  if (targetUser.role === 'super_admin') return res.status(403).json({ error: 'Cannot delete a Super Admin' });

  await db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  logAction(req.user.id, 'USER_DELETED', `Super Admin deleted user: ${targetUser.email}`);
  res.json({ success: true });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    logAction(null, 'LOGIN_FAILED', `Attempted email: ${email}`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.status === 'blocked') {
    return res.status(403).json({ error: 'Account blocked' });
  }

  // Check if user is authorized for the private system
  // Authorized = super_admin, admin, or enrolled by admin (created_by_admin === 1)
  const isAuthorized = ['super_admin', 'admin'].includes(user.role) || user.created_by_admin === 1;
  const needs2FA = ['super_admin', 'admin'].includes(user.role); // Only admins need 2FA for extra security

  if (needs2FA && user.totp_secret) {
    return res.json({ mfaRequired: true, userId: user.id });
  }

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  const displayName = user.nickname || user.email.split('@')[0];
  logAction(user.id, 'LOGIN_SUCCESS', `${displayName} is visiting the friend's website`);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      restricted: !isAuthorized
    }
  });
});

app.post('/api/auth/verify-2fa', async (req, res) => {
  const { userId, token } = req.body;
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  if (!user.totp_secret) return res.status(400).json({ error: '2FA not set up' });

  const verified = speakeasy.totp.verify({
    secret: user.totp_secret,
    encoding: 'base32',
    token
  });

  if (verified) {
    const jwtToken = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    const displayName = user.nickname || user.email.split('@')[0];
    logAction(user.id, '2FA_SUCCESS', `${displayName} is visiting the friend's website`);
    const isAuthorized = ['super_admin', 'admin'].includes(user.role) || user.created_by_admin === 1;
    res.json({
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        restricted: !isAuthorized
      }
    });
  } else {
    logAction(userId, '2FA_FAILED', `Invalid MFA attempt`);
    res.status(401).json({ error: 'Invalid 2FA token' });
  }
});

app.post('/api/auth/setup-2fa', checkAuth, async (req, res) => {
  const secret = speakeasy.generateSecret({ name: `FriendsInfo (${req.user.email})` });
  await db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret.base32, req.user.id);
  res.json({ secret: secret.base32, otpauth_url: secret.otpauth_url });
});

app.get('/api/admin/logs', checkAuth, checkPermission('canViewLogs'), async (req, res) => {
  const logs = await db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100').all();
  res.json(logs);
});

// User Management (Super Admin)
app.get('/api/admin/users', checkAuth, checkPermission('canManageAdmins'), async (req, res) => {
  const users = await db.prepare('SELECT id, email, role, status, created_at FROM users').all();
  res.json(users);
});

app.post('/api/admin/users/role', checkAuth, checkPermission('canManageAdmins'), async (req, res) => {
  const { userId, role } = req.body;

  // Get target user with details
  const targetUser = await db.prepare('SELECT role, nickname, email FROM users WHERE id = ?').get(userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  // Get acting user with details
  const actingUser = await db.prepare('SELECT role, nickname, email FROM users WHERE id = ?').get(req.user.id);

  // 1. If target is currently 'super_admin', only they themselves can change their role (e.g. to demote themselves)
  if (targetUser.role === 'super_admin' && req.user.id !== parseInt(userId)) {
    return res.status(403).json({ error: 'Only the Super Admin themselves can modify their role' });
  }

  // 2. If trying to change role to 'super_admin', the acting user must be a 'super_admin'
  if (role === 'super_admin' && (!actingUser || actingUser.role !== 'super_admin')) {
    return res.status(403).json({ error: 'Only a Super Admin can designate another Super Admin' });
  }

  // 3. Admins cannot modify another Admin or Super Admin role
  if (actingUser.role === 'admin' && ['admin', 'super_admin'].includes(targetUser.role)) {
    return res.status(403).json({ error: 'Admins cannot modify another Admin or Super Admin role' });
  }

  // 4. Admins cannot promote users to Admin or Super Admin
  if (actingUser.role === 'admin' && ['admin', 'super_admin'].includes(role)) {
    return res.status(403).json({ error: 'Admins cannot promote users to Admin or Super Admin' });
  }

  const targetName = targetUser.nickname || targetUser.email;
  const promoterName = actingUser ? (actingUser.nickname || actingUser.email) : `Admin #${req.user.id}`;
  
  const formatRole = (r) => {
    if (r === 'super_admin') return 'Super Admin';
    if (r === 'admin') return 'Admin';
    if (r === 'authorized') return 'Authorized';
    if (r === 'user') return 'User';
    return r;
  };
  const roleName = formatRole(role);

  // If a Super Admin is promoting someone else to Super Admin, demote the acting Super Admin to 'admin'
  if (role === 'super_admin' && req.user.id !== parseInt(userId)) {
    await db.prepare('UPDATE users SET role = ? WHERE id = ?').run('super_admin', userId);
    await db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(req.user.id);
    logAction(req.user.id, 'ROLE_CHANGE', `${targetName} is promoted to Super Admin by ${promoterName}. Current Super Admin is automatically demoted to Admin.`);
  } else {
    await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    logAction(req.user.id, 'ROLE_CHANGE', `${targetName} is promoted to ${roleName} by ${promoterName}`);
  }

  res.json({ success: true });
});

app.post('/api/admin/users', checkAuth, checkPermission('canManageAdmins'), async (req, res) => {
  const { email, password, nickname, role } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);

  // Get acting user
  const actingAdmin = await db.prepare('SELECT nickname, email, role FROM users WHERE id = ?').get(req.user.id);

  // Only Super Admin can create another Super Admin
  if (role === 'super_admin' && (!actingAdmin || actingAdmin.role !== 'super_admin')) {
    return res.status(403).json({ error: 'Only a Super Admin can create another Super Admin' });
  }

  // Admins cannot create Admin or Super Admin identities
  if (actingAdmin && actingAdmin.role === 'admin' && ['admin', 'super_admin'].includes(role)) {
    return res.status(403).json({ error: 'Admins can only create User or Authorized identities' });
  }

  try {
    const resInsert = await db.prepare('INSERT INTO users (email, password, nickname, role, created_by_admin) VALUES (?, ?, ?, ?, 1)').run(email, hashedPassword, nickname, role);
    
    const adminName = actingAdmin ? (actingAdmin.nickname || actingAdmin.email) : `Admin #${req.user.id}`;
    const targetName = nickname || email;
    
    if (role === 'super_admin') {
      await db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(req.user.id);
      logAction(req.user.id, 'ADMIN_CREATED_USER', `👤 ${adminName} created a new Super Admin named ${targetName}. Current Super Admin is automatically demoted to Admin.`);
    } else {
      logAction(req.user.id, 'ADMIN_CREATED_USER', `👤 ${adminName} created user named by ${targetName}`);
    }

    res.json({ success: true, id: resInsert.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'User already exists' });
  }
});

app.delete('/api/admin/users/:id', checkAuth, checkPermission('canManageAdmins'), async (req, res) => {
  const { id } = req.params;
  // Prevent self-deletion
  if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'Cannot delete self' });

  // Prevent deletion of any Super Admin
  const targetUser = await db.prepare('SELECT nickname, email, role FROM users WHERE id = ?').get(id);
  if (targetUser && targetUser.role === 'super_admin') {
    return res.status(403).json({ error: 'Cannot delete a Super Admin identity' });
  }

  const actingAdmin = await db.prepare('SELECT nickname, email, role FROM users WHERE id = ?').get(req.user.id);

  // Admins cannot delete Admin or Super Admin identities
  if (actingAdmin && actingAdmin.role === 'admin' && targetUser && ['admin', 'super_admin'].includes(targetUser.role)) {
    return res.status(403).json({ error: 'Admins cannot delete/terminate another Admin or Super Admin' });
  }

  const targetName  = targetUser  ? (targetUser.nickname  || targetUser.email)  : `User #${id}`;
  const adminName   = actingAdmin ? (actingAdmin.nickname || actingAdmin.email)  : `Admin #${req.user.id}`;
  const adminRole   = actingAdmin ? actingAdmin.role.replace('_', ' ') : req.user.role;

  await db.prepare('DELETE FROM messages WHERE sender_id = ?').run(id);
  await db.prepare('DELETE FROM logs WHERE user_id = ?').run(id);
  await db.prepare('DELETE FROM users WHERE id = ?').run(id);

  logAction(req.user.id, 'ADMIN_DELETED_USER', `🚫 "${targetName}" has been removed by ${adminName} (${adminRole})`);
  res.json({ success: true });
});

// --- SAVINGS TRACKER API ---
app.get('/api/savings/members', checkAuth, async (req, res) => {
  const members = await db.prepare('SELECT * FROM savings_members ORDER BY name ASC').all();
  const users = await db.prepare('SELECT nickname, email, role FROM users').all();
  
  for (const m of members) {
    // Try to match savings member to a user to find their role
    const matchedUser = users.find(u => 
      (u.nickname && m.name.toLowerCase().replace(/\s+/g, '') === u.nickname.toLowerCase().replace(/\s+/g, '')) ||
      (u.nickname && m.name.toLowerCase().includes(u.nickname.toLowerCase())) ||
      (u.email && u.email.toLowerCase().startsWith(m.name.split(' ')[0].toLowerCase()))
    );
    if (matchedUser && ['admin', 'super_admin'].includes(matchedUser.role)) {
      m.role = matchedUser.role;
    }

    const totals = await db.prepare(`
      SELECT 
        SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN type IN ('missed', 'expected') THEN amount ELSE 0 END) as total_expected
      FROM savings_transactions 
      WHERE member_id = ?
    `).get(m.id);
    m.total_paid = totals?.total_paid || 0;
    m.total_expected = totals?.total_expected || 0;
    m.balance = m.total_paid - m.total_expected;
  }
  res.json(members);
});

app.post('/api/savings/members', checkAuth, checkSavingsManager, async (req, res) => {
  const { name } = req.body;
  const result = await db.prepare('INSERT INTO savings_members (name) VALUES (?)').run(name);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/savings/members/:id', checkAuth, checkSavingsManager, async (req, res) => {
  await db.prepare('DELETE FROM savings_transactions WHERE member_id = ?').run(req.params.id);
  await db.prepare('DELETE FROM savings_members WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/savings/transactions', checkAuth, checkPaymentClerk, async (req, res) => {
  const { member_id, amount, type, created_at, notes } = req.body;
  const confirmed_by = await db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id).email;

  let query = 'INSERT INTO savings_transactions (member_id, amount, type, confirmed_by';
  let valuesQuery = 'VALUES (?, ?, ?, ?';
  const params = [member_id, amount, type, confirmed_by];

  if (notes !== undefined) {
    query += ', notes';
    valuesQuery += ', ?';
    params.push(notes);
  }

  if (created_at !== undefined) {
    query += ', created_at';
    valuesQuery += ', ?';
    params.push(created_at);
  }

  query += ') ' + valuesQuery + ')';
  const result = await db.prepare(query).run(...params);

  const clerk = await db.prepare('SELECT nickname FROM users WHERE id = ?').get(req.user.id);
  const member = await db.prepare('SELECT name FROM savings_members WHERE id = ?').get(member_id);
  
  const humanMessage = type === 'payment' 
    ? `New payment of ${amount} ETB signed by ${clerk.nickname} for ${member.name}${notes ? ` (Notes: "${notes}")` : ''}`
    : `Missed week of ${amount} ETB signed by ${clerk.nickname} for ${member.name}${notes ? ` (Notes: "${notes}")` : ''}`;

  logAction(req.user.id, 'SAVINGS_UPDATE', humanMessage);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.get('/api/savings/history', checkAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  let query = `SELECT t.*, m.name as member_name FROM savings_transactions t JOIN savings_members m ON t.member_id = m.id`;
  const params = [];
  if (startDate && endDate) {
    query += ` WHERE t.created_at BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  }
  query += ` ORDER BY t.created_at DESC`;
  const history = await db.prepare(query).all(...params);
  res.json(history);
});

app.get('/api/savings/config', checkAuth, async (req, res) => {
  const config = await db.prepare('SELECT * FROM savings_config ORDER BY effective_date DESC LIMIT 1').get() || { weekly_amount: 300 };
  const clerkSetting = await db.prepare("SELECT value FROM system_settings WHERE key = 'clerk_id'").get();
  config.clerk_id = clerkSetting && clerkSetting.value ? parseInt(clerkSetting.value) : null;
  res.json(config);
});

app.get('/api/savings/config/all', checkAuth, async (req, res) => {
  const history = await db.prepare('SELECT * FROM savings_config ORDER BY effective_date DESC').all();
  res.json(history);
});

app.post('/api/savings/config', checkAuth, checkSavingsManager, async (req, res) => {
  const { amount } = req.body;
  await db.prepare('INSERT INTO savings_config (weekly_amount) VALUES (?)').run(amount);
  res.json({ success: true });
});

app.post('/api/savings/clerk', checkAuth, checkSavingsManager, async (req, res) => {
  const { clerk_id } = req.body;
  await db.prepare("UPDATE system_settings SET value = ? WHERE key = 'clerk_id'").run(clerk_id || '');
  
  const actingAdmin = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  const roleText = actingAdmin && actingAdmin.role === 'super_admin' ? 'superadmin' : 'admin';

  if (clerk_id) {
    const clerkUser = await db.prepare('SELECT nickname, email FROM users WHERE id = ?').get(parseInt(clerk_id));
    const clerkName = clerkUser ? (clerkUser.nickname || clerkUser.email.split('@')[0]) : 'Nobody';
    logAction(req.user.id, 'SETTING_CHANGE', `${clerkName} is successfully assigned as clerk by ${roleText}`);
  } else {
    logAction(req.user.id, 'SETTING_CHANGE', `Clerk has been unassigned by ${roleText}`);
  }

  res.json({ success: true });
});

// Investments
app.get('/api/savings/investments', checkAuth, async (req, res) => {
  const investments = await db.prepare('SELECT * FROM savings_investments ORDER BY created_at DESC').all();
  res.json(investments);
});

app.post('/api/savings/investments', checkAuth, checkSavingsManager, async (req, res) => {
  const result = await db.prepare('INSERT INTO savings_investments (project_name, allocated_amount, projected_profit, challenges, expected_days) VALUES (?, ?, ?, ?, ?)')
    .run(project_name, allocated_amount, projected_profit || 0, challenges || '', expected_days || null);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/savings/investments/:id', checkAuth, checkSavingsManager, async (req, res) => {
  await db.prepare('DELETE FROM savings_investments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/savings/investments/:id/status', checkAuth, checkSavingsManager, async (req, res) => {
  const { status, profit, challenges } = req.body;
  if (status === 'completed') {
    await db.prepare('UPDATE savings_investments SET status = ?, completed_at = CURRENT_TIMESTAMP, projected_profit = ?, challenges = ? WHERE id = ?')
      .run(status, profit, challenges, req.params.id);
  } else {
    await db.prepare('UPDATE savings_investments SET status = ?, completed_at = NULL WHERE id = ?').run(status, req.params.id);
  }
  res.json({ success: true });
});

app.get('/api/users', checkAuth, async (req, res) => {
  const users = await db.prepare('SELECT id, email, nickname, role, status, profile_picture, bio FROM users').all();
  res.json(users);
});

app.get('/api/users/status', checkAuth, async (req, res) => {
  const onlineIds = Array.from(usersOnline.keys());
  res.json({ onlineIds });
});


// Comments API
app.post('/api/comments', checkAuth, async (req, res) => {
  const { post_id, memory_id, gallery_id, personal_asset_id, content, reply_to_id } = req.body;
  const result = await db.prepare('INSERT INTO comments (post_id, memory_id, gallery_id, personal_asset_id, user_id, content, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(post_id || null, memory_id || null, gallery_id || null, personal_asset_id || null, req.user.id, content, reply_to_id || null);
  const comment = await db.prepare(`
    SELECT c.*, u.nickname, u.profile_picture
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = ?
  `).get(result.lastInsertRowid);
  io.emit('new_comment', { post_id, memory_id, gallery_id, personal_asset_id, comment });
  res.json({ success: true, id: result.lastInsertRowid });
});




// Reactions API
app.post('/api/reactions', checkAuth, async (req, res) => {
  const { target_id, target_type, reaction_type } = req.body;

  // Check if already reacted
  const existing = await db.prepare('SELECT id, reaction_type FROM reactions WHERE target_id = ? AND target_type = ? AND user_id = ?').get(target_id, target_type, req.user.id);

  if (existing) {
    if (existing.reaction_type === reaction_type) {
      // Unlike
      await db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
    } else {
      // Change reaction
      await db.prepare('UPDATE reactions SET reaction_type = ? WHERE id = ?').run(reaction_type, existing.id);
    }
  } else {
    await db.prepare('INSERT INTO reactions (target_id, target_type, user_id, reaction_type) VALUES (?, ?, ?, ?)').run(target_id, target_type, req.user.id, reaction_type);
  }

  const reactions = await db.prepare(`
    SELECT r.*, u.nickname
    FROM reactions r
    JOIN users u ON r.user_id = u.id
    WHERE r.target_id = ? AND r.target_type = ?
  `).all(target_id, target_type);

  io.emit('reactions_update', { target_id, target_type, reactions });
  res.json({ success: true, reactions });

});


// Memories API
app.get('/api/memories', checkAuth, async (req, res) => {
  const memories = await db.prepare(`
    SELECT m.*, u.nickname, u.profile_picture
    FROM memories m
    JOIN users u ON m.user_id = u.id
    ORDER BY m.created_at DESC
  `).all();

  for (const memory of memories) {
    memory.comments = await db.prepare(`
      SELECT c.*, u.nickname, u.profile_picture
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.memory_id = ?
      ORDER BY c.created_at ASC
    `).all(memory.id);

    memory.reactions = await db.prepare(`
      SELECT r.*, u.nickname
      FROM reactions r
      JOIN users u ON r.user_id = u.id
      WHERE r.target_id = ? AND r.target_type = 'memory'
    `).all(memory.id);
  }
  res.json(memories);
});


app.post('/api/memories', checkAuth, async (req, res) => {
  const { title, content, media_url } = req.body;
  const result = await db.prepare('INSERT INTO memories (user_id, title, content, media_url) VALUES (?, ?, ?, ?)').run(req.user.id, title, content, media_url);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/memories/:id', checkAuth, async (req, res) => {
  const memory = await db.prepare('SELECT user_id FROM memories WHERE id = ?').get(req.params.id);
  if (!memory) return res.status(404).json({ error: 'Memory not found' });

  const user = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  if (memory.user_id !== req.user.id && !['admin', 'super_admin'].includes(user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await db.prepare('DELETE FROM memories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});


// Posts API (Social Feed)
app.get('/api/posts', checkAuth, async (req, res) => {
  const posts = await db.prepare(`
    SELECT p.*, u.nickname, u.profile_picture
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `).all();

  for (const post of posts) {
    post.comments = await db.prepare(`
      SELECT c.*, u.nickname, u.profile_picture
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `).all(post.id);

    post.reactions = await db.prepare(`
      SELECT r.*, u.nickname
      FROM reactions r
      JOIN users u ON r.user_id = u.id
      WHERE r.target_id = ? AND r.target_type = 'post'
    `).all(post.id);
  }
  res.json(posts);
});

app.post('/api/posts', checkAuth, async (req, res) => {
  const { content, media_url, last_day_meet } = req.body;
  const result = await db.prepare('INSERT INTO posts (user_id, content, media_url, last_day_meet) VALUES (?, ?, ?, ?)').run(req.user.id, content, media_url, last_day_meet || null);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/posts/:id', checkAuth, async (req, res) => {
  const post = await db.prepare('SELECT user_id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const user = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  if (post.user_id !== req.user.id && !['admin', 'super_admin'].includes(user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});


// Feature Toggles (Super Admin)
app.get('/api/admin/settings', checkAuth, checkPermission('canToggleFeatures'), async (req, res) => {
  const settings = await db.prepare('SELECT * FROM system_settings').all();
  res.json(settings);
});

app.post('/api/admin/settings/toggle', checkAuth, checkPermission('canToggleFeatures'), async (req, res) => {
  const { key, value } = req.body;
  await db.prepare('UPDATE system_settings SET value = ? WHERE key = ?').run(value.toString(), key);
  
  if (key === 'clerk_id') {
    const actingAdmin = await db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    const roleText = actingAdmin && actingAdmin.role === 'super_admin' ? 'superadmin' : 'admin';
    const clerkId = parseInt(value);
    
    if (clerkId) {
      const clerkUser = await db.prepare('SELECT nickname, email FROM users WHERE id = ?').get(clerkId);
      const clerkName = clerkUser ? (clerkUser.nickname || clerkUser.email.split('@')[0]) : 'Nobody';
      logAction(req.user.id, 'SETTING_CHANGE', `${clerkName} is successfully assigned as clerk by ${roleText}`);
    } else {
      logAction(req.user.id, 'SETTING_CHANGE', `Clerk has been unassigned by ${roleText}`);
    }
  } else {
    logAction(req.user.id, 'SETTING_CHANGE', `${key} set to ${value}`);
  }
  
  res.json({ success: true });
});

app.get('/api/messages', checkAuth, async (req, res) => {
  // Check if messaging feature is enabled
  const msgSetting = await db.prepare("SELECT value FROM system_settings WHERE key = 'messaging_enabled'").get();
  const messagingEnabled = msgSetting?.value === 'true';
  if (!messagingEnabled && req.user.role !== 'super_admin') {
    return res.status(404).json({ error: 'Not Found' }); // Stealth mode
  }

  const messages = await db.prepare(`
    SELECT m.*, u.email as sender_email,
           r.content as reply_content, ru.email as reply_sender_email
    FROM messages m 
    JOIN users u ON m.sender_id = u.id 
    LEFT JOIN messages r ON m.reply_to_id = r.id
    LEFT JOIN users ru ON r.sender_id = ru.id
    ORDER BY m.created_at ASC 
    LIMIT 200
  `).all();
  res.json(messages);
});

app.put('/api/messages/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const msg = await db.prepare('SELECT sender_id FROM messages WHERE id = ?').get(id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.sender_id !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized to edit this message' });
  }
  await db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id);
  io.emit('message_edited', { messageId: parseInt(id), content });
  res.json({ success: true });
});

app.delete('/api/messages/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  const msg = await db.prepare('SELECT sender_id FROM messages WHERE id = ?').get(id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.sender_id !== req.user.id && !['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Unauthorized to delete this message' });
  }
  await db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  io.emit('message_deleted', parseInt(id));
  res.json({ success: true });
});

// Socket.io for Real-time Messaging
const usersOnline = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Unauthorized"));

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  usersOnline.set(userId, { socketId: socket.id, lastActive: new Date(), role: socket.user.role });

  // Broadcast presence
  io.emit('user_status', { userId, status: 'online' });

  socket.on('join_room', (room) => {
    socket.join(room);
  });

  socket.on('typing', (data) => {
    // data: { receiverId, isTyping }
    const { receiverId, isTyping } = data;
    if (receiverId) {
      const target = usersOnline.get(receiverId);
      if (target) io.to(target.socketId).emit('user_typing', { userId, isTyping });
    } else {
      socket.to('private').emit('user_typing', { userId, isTyping, isGroup: true });
    }
  });

  socket.on('send_message', async (data) => {
    const senderId = socket.user.id;
    const { content, media_url, media_type = 'text', receiverId, replyToId } = data;

    // Check if messaging is globally enabled
    const msgSetting = await db.prepare("SELECT value FROM system_settings WHERE key = 'messaging_enabled'").get();
    const messagingEnabled = msgSetting?.value === 'true';
    const sender = await db.prepare('SELECT email, role FROM users WHERE id = ?').get(senderId);

    if (!messagingEnabled && sender?.role !== 'super_admin') return;

    if (sender && ['authorized', 'admin', 'super_admin'].includes(sender.role)) {
      const now = new Date().toISOString();
      const result = await db.prepare('INSERT INTO messages (sender_id, receiver_id, reply_to_id, content, media_url, media_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(senderId, receiverId || null, replyToId || null, content, media_url, media_type, now);

      const broadcastMsg = {
        id: result.lastInsertRowid,
        sender_id: senderId,
        sender_email: sender.email,
        receiver_id: receiverId || null,
        reply_to_id: replyToId || null,
        content, media_url, media_type,
        created_at: now
      };

      if (receiverId) {
        const target = usersOnline.get(receiverId);
        if (target) io.to(target.socketId).emit('receive_message', broadcastMsg);
        // Also send back to sender for sync
        socket.emit('receive_message', broadcastMsg);
      } else {
        io.to('private').emit('receive_message', broadcastMsg);
      }

      // Telegram forwarding
      if (bot && process.env.ADMIN_CHAT_ID && process.env.ADMIN_CHAT_ID !== 'YOUR_CHAT_ID') {
        const localTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: true });
        const caption = `💬 NEW MESSAGE\nFrom: ${sender.email}\nTo: ${receiverId ? 'User ' + receiverId : 'GROUP'}\nTime: ${localTime}\n\n${content || ''}`;
        if (media_url) {
          const filename = media_url.split('/').pop();
          const filePath = path.join(__dirname, 'uploads', filename);
          if (fs.existsSync(filePath)) {
            const fileStream = fs.createReadStream(filePath);
            let cleanFilename = filename;
            const hyphenIndex = filename.indexOf('-');
            if (hyphenIndex !== -1) cleanFilename = filename.substring(hyphenIndex + 1);
            if (media_type === 'image') {
              bot.telegram.sendPhoto(process.env.ADMIN_CHAT_ID, { source: fileStream }, { caption }).catch(console.error);
            } else {
              bot.telegram.sendDocument(process.env.ADMIN_CHAT_ID, { source: fileStream, filename: cleanFilename }, { caption }).catch(console.error);
            }
          } else {
            if (media_type === 'image') bot.telegram.sendPhoto(process.env.ADMIN_CHAT_ID, { url: media_url }, { caption }).catch(console.error);
            else bot.telegram.sendDocument(process.env.ADMIN_CHAT_ID, { url: media_url }, { caption }).catch(console.error);
          }
        } else {
          bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, caption).catch(console.error);
        }
      }
    }
  });

  socket.on('edit_message', async (data) => {
    const { messageId, content } = data;
    const msg = await db.prepare('SELECT sender_id FROM messages WHERE id = ?').get(messageId);
    if (msg && msg.sender_id === socket.user.id) {
      await db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, messageId);
      io.emit('message_edited', { messageId, content });
    }
  });

  socket.on('delete_message', async (messageId) => {
    const msg = await db.prepare('SELECT sender_id FROM messages WHERE id = ?').get(messageId);
    if (msg && (msg.sender_id === socket.user.id || ['admin', 'super_admin'].includes(socket.user.role))) {
      await db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
      io.emit('message_deleted', messageId);
    }
  });

  // WebRTC Signaling
  socket.on('call_user', (data) => {
    const { userToCall, signalData, from, fromNickname, type } = data;
    if (userToCall === 0) {
      // Broadcast to all online admins and super admins
      usersOnline.forEach((info, id) => {
        if (id !== from && (info.role === 'admin' || info.role === 'super_admin')) {
          io.to(info.socketId).emit('incoming_call', { signal: signalData, from, fromNickname, type, isGlobal: true });
        }
      });
    } else {
      const receiver = usersOnline.get(userToCall);
      if (receiver) {
        io.to(receiver.socketId).emit('incoming_call', { signal: signalData, from, fromNickname, type });
      }
    }
  });

  socket.on('answer_call', (data) => {
    const { to, signal, isGlobal } = data;
    const caller = usersOnline.get(to);
    if (caller) {
      io.to(caller.socketId).emit('call_accepted', signal);
      if (isGlobal) {
        // Notify other admins that the call is taken
        usersOnline.forEach((info, id) => {
          if (id !== to && id !== socket.user.id && (info.role === 'admin' || info.role === 'super_admin')) {
            io.to(info.socketId).emit('call_taken_by_other');
          }
        });
      }
    }
  });

  socket.on('ice_candidate', (data) => {
    const { to, candidate } = data;
    const peer = usersOnline.get(to);
    if (peer) {
      io.to(peer.socketId).emit('ice_candidate', candidate);
    }
  });

  socket.on('end_call', (data) => {
    const { to } = data;
    const peer = usersOnline.get(to);
    if (peer) {
      io.to(peer.socketId).emit('call_ended');
    }
  });

  socket.on('disconnect', () => {
    usersOnline.delete(userId);
    io.emit('user_status', { userId, status: 'offline', lastActive: new Date() });
  });
});


// Telegram Bot Commands
const AUTHORIZED_TG_USERS = (process.env.AUTHORIZED_TG_USERS || '').split(',').map(id => id.trim());

if (bot && process.env.TG_TOKEN && process.env.TG_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN') {
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id.toString();
    ctx.state.isAuthorized = AUTHORIZED_TG_USERS.includes(userId) || userId === process.env.ADMIN_CHAT_ID;
    return next();
  });

  const WELCOME_MSG = `👋 Welcome!\n\nHow can we serve you today?\n/newbot\n/mybots\n\n• Games\n/mygames \n/newgame\n/playgame\n\n• Bot Settings\n/setname\n/setdescription\n/deletebot\n/token\n/revoke\n\n\n/Help\n\nUse the available options`;

  // Registering decoy commands with Telegram API for the "Menu" button
  bot.telegram.setMyCommands([
    { command: 'newbot', description: 'Create a new bot' },
    { command: 'mybots', description: 'List of your bots' },
    { command: 'mygames', description: 'Manage your games' },
    { command: 'newgame', description: 'Create a new game' },
    { command: 'playgame', description: 'Play a game' },
    { command: 'setname', description: 'Change bot name' },
    { command: 'setdescription', description: 'Change bot description' },
    { command: 'deletebot', description: 'Delete a bot' },
    { command: 'token', description: 'Get bot token' },
    { command: 'revoke', description: 'Revoke token' },
    { command: 'help', description: 'Show help' }
  ]).catch(console.error);

  bot.start((ctx) => {
    ctx.reply(WELCOME_MSG);
    logAction(null, ctx.state.isAuthorized ? 'ADMIN_SESSION_START' : 'VISITOR_SESSION_START', `User: ${ctx.from.id}`);
  });

  bot.help((ctx) => {
    ctx.reply('🛠️ BotFather Redux Help\n\nYou can use this bot to manage your custom game tokens and bot sub-nodes.\n\nFor primary bot creation, please contact @BotFather directly.');
  });

  // --- BOTFATHER DECOY COMMAND HANDLERS (Hard Redirect with Deep Links) ---
  const botFatherRedirect = (msg, action = '') => (ctx) => {
    const url = action ? `https://t.me/BotFather?start=${action}` : 'https://t.me/BotFather';
    ctx.reply(`🔄 ${msg}\nRedirecting to Master Node...`,
      Markup.inlineKeyboard([
        [Markup.button.url('🚀 CONTINUE', url)]
      ])
    );
  };

  bot.command('newbot', botFatherRedirect('BotForge Initializing', 'newbot'));
  bot.command('mybots', botFatherRedirect('Fetching Nodes', 'mybots'));
  bot.command('mygames', botFatherRedirect('Accessing Matrix', 'mygames'));
  bot.command('newgame', botFatherRedirect('Initializing GameForge', 'newgame'));
  bot.command('playgame', botFatherRedirect('Select Node', 'playgame'));
  bot.command('setname', botFatherRedirect('Identity Shift', 'setname'));
  bot.command('setdescription', botFatherRedirect('Definition Update', 'setdescription'));
  bot.command('deletebot', botFatherRedirect('Node Termination', 'deletebot'));
  bot.command('token', botFatherRedirect('Retrieving Pulse Token', 'token'));
  bot.command('revoke', botFatherRedirect('Revocation Sent', 'revoke'));

  bot.hears(/Games/i, (ctx) => {
    ctx.reply('🎲 SELECT GAME:\n1. Trivia Matrix\n2. Secure Chess\n3. Word Hack\n\n(Games under maintenance - Node Syncing)');
  });

  bot.hears(/Bot Settings/i, (ctx) => {
    ctx.reply('⚙️ BOT CONFIGURATION\n\nNotification: ON\nLanguage: EN\nAuto-Reply: OFF\n\nTo change, use /config (Authorized users only)');
  });

  bot.hears(/Create/i, (ctx) => {
    ctx.reply('➕ What would you like to create?\n1. New Profile\n2. Custom Badge\n3. Channel Link');
  });
  const adminOnly = (ctx, next) => {
    if (ctx.state.isAuthorized) return next();
    // SILENT: No response for unauthorized users
    logAction(null, 'SILENT_UNAUTHORIZED_TRIGGER', `Attempt: ${ctx.message.text} from ${ctx.from.id}`);
  };

  bot.hears('2', adminOnly, async (ctx) => {
    const userCountRes = await db.prepare('SELECT COUNT(*) as count FROM users').get();
    const userCount = userCountRes?.count || 0;
    const msgCountRes = await db.prepare('SELECT COUNT(*) as count FROM messages').get();
    const msgCount = msgCountRes?.count || 0;
    const settings = await db.prepare('SELECT * FROM system_settings').all();
    const settingsText = settings.map(s => `⚙️ ${s.key.toUpperCase()}: ${s.value === 'true' ? 'ON' : 'OFF'}`).join('\n');

    ctx.reply(`📊 SYSTEM STATUS REPORT\n\n👥 Registered Users: ${userCount}\n💬 Total Messages: ${msgCount}\n\n${settingsText}\n\nNode Status: VERIFIED`,
      Markup.inlineKeyboard([
        [Markup.button.callback('👥 SHOW ALL USERS', 'show_users')],
        [Markup.button.callback('💬 SHOW ALL MESSAGES', 'show_messages')]
      ])
    );
  });

  bot.action('show_users', adminOnly, async (ctx) => {
    const users = await db.prepare('SELECT email, role, created_at FROM users').all();
    const userList = users.map(u => `👤 ${u.email}\n🏷️ Role: ${u.role}\n📅 Joined: ${new Date(u.created_at).toLocaleDateString()}`).join('\n\n');
    ctx.editMessageText(`👥 USER DIRECTORY\n\n${userList || 'No users found.'}`, Markup.inlineKeyboard([[Markup.button.callback('⬅️ BACK', 'back_to_status')]]));
  });

  bot.action('show_messages', adminOnly, async (ctx) => {
    const messages = (await db.prepare(`
      SELECT m.content, u.email, m.created_at 
      FROM messages m 
      JOIN users u ON m.sender_id = u.id 
      ORDER BY m.created_at DESC LIMIT 50
    `).all()).reverse();

    const msgList = messages.map(m => {
      const time = new Date(m.created_at).toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: true });
      return `📧 ${m.email} (${time}): ${m.content}`;
    }).join('\n');

    ctx.editMessageText(`💬 MESSAGE HISTORY\n\n${msgList || 'No messages found.'}`, Markup.inlineKeyboard([[Markup.button.callback('⬅️ BACK', 'back_to_status')]]));
  });

  bot.action('back_to_status', adminOnly, async (ctx) => {
    const userCountRes = await db.prepare('SELECT COUNT(*) as count FROM users').get();
    const userCount = userCountRes?.count || 0;
    const msgCountRes = await db.prepare('SELECT COUNT(*) as count FROM messages').get();
    const msgCount = msgCountRes?.count || 0;
    const settings = await db.prepare('SELECT * FROM system_settings').all();
    const settingsText = settings.map(s => `⚙️ ${s.key.toUpperCase()}: ${s.value === 'true' ? 'ON' : 'OFF'}`).join('\n');

    ctx.editMessageText(`📊 SYSTEM STATUS REPORT\n\n👥 Registered Users: ${userCount}\n💬 Total Messages: ${msgCount}\n\n${settingsText}\n\nNode Status: VERIFIED`,
      Markup.inlineKeyboard([
        [Markup.button.callback('👥 SHOW ALL USERS', 'show_users')],
        [Markup.button.callback('💬 SHOW ALL MESSAGES', 'show_messages')]
      ])
    );
  });

  bot.hears('3', adminOnly, async (ctx) => {
    const logs = await db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 5').all();
    const logText = logs.map(l => `🕒 ${l.timestamp}\n👤 ${l.user_id || 'sys'} | ${l.action}\n📝 ${l.details}`).join('\n\n');
    ctx.reply(`📂 SYSTEM ACTIVITY LOGS\n\n${logText || 'No recent activity found.'}`);
  });

  bot.hears(/^4(?:\s+(.+))?$/, adminOnly, async (ctx) => {
    const parts = ctx.message.text.split(' ');
    if (parts.length < 3) return ctx.reply('Usage: 4 <email> <role>');
    const email = parts[1];
    const role = parts[2];
    const result = await db.prepare('UPDATE users SET role = ? WHERE email = ?').run(role, email);
    if (result.changes > 0) ctx.reply(`✅ Identity ${email} updated to ${role}.`);
    else ctx.reply('❌ Identity not found in matrix.');
  });

  bot.hears('5', adminOnly, async (ctx) => {
    const lastMessages = (await db.prepare(`
      SELECT m.content, m.media_url, m.media_type, u.email, m.created_at
      FROM messages m 
      JOIN users u ON m.sender_id = u.id 
      ORDER BY m.created_at DESC LIMIT 10
    `).all()).reverse();

    const historyText = lastMessages.map(m => {
      // Force UTC parsing
      const time = new Date(m.created_at).toLocaleTimeString('en-US', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: true });
      const indicator = m.media_url ? '[🖼️ MEDIA] ' : '';
      return `📧 ${m.email} (${time}): ${indicator}${m.content || '(Media only)'}`;
    }).join('\n');

    ctx.reply(`⚡ CHAT HISTORY SYNC\n\n${historyText || 'No recent messages found.'}\n\nEncryption: ACTIVE | Status: SECURE`);
    logAction(null, 'ADMIN_HISTORY_SYNC', `Admin ${ctx.from.id} synchronized chat history`);
  });

  bot.catch((err, ctx) => {
    console.error(`⚠️ Telegram bot error for update type "${ctx.updateType}":`, err);
  });

  bot.launch().catch(err => {
    console.error('Failed to launch Telegram bot:', err.message);
  });
} else {
  console.log('Telegram bot skipped (invalid or missing token).');
}

// Gallery Endpoints
app.get('/api/gallery', async (req, res) => {
  const items = await db.prepare('SELECT * FROM gallery ORDER BY created_at DESC').all();
  for (const item of items) {
    item.reactions = await db.prepare("SELECT * FROM reactions WHERE target_id = ? AND target_type = 'gallery'").all(item.id);
    item.comments = await db.prepare(`
      SELECT c.*, u.nickname, u.profile_picture
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.gallery_id = ?
      ORDER BY c.created_at ASC
    `).all(item.id);
  }
  res.json(items);
});

app.post('/api/admin/gallery', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { url, title, caption } = req.body;
  const insert = db.prepare('INSERT INTO gallery (url, title, caption) VALUES (?, ?, ?)');
  await insert.run(url, title, caption);
  res.json({ success: true });
});

// Single image upload endpoint
app.post('/api/admin/gallery/upload', checkAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const fileUrl = `${protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

app.put('/api/admin/gallery/:id', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { title, caption, url } = req.body;
  await db.prepare('UPDATE gallery SET title = ?, caption = ?, url = ? WHERE id = ?').run(title, caption, url, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/gallery/:id', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const item = await db.prepare('SELECT url FROM gallery WHERE id = ?').get(req.params.id);

  // Also delete local file if it exists
  if (item && item.url.includes('/uploads/')) {
    const filename = item.url.split('/uploads/')[1];
    const filePath = path.join(__dirname, 'uploads', filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Personal Vault Endpoints (Photos & Videos)
app.get('/api/personal-assets', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const assets = await db.prepare('SELECT * FROM personal_assets WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);

  for (const asset of assets) {
    asset.reactions = await db.prepare("SELECT * FROM reactions WHERE target_id = ? AND target_type = 'personal_asset'").all(asset.id);
    asset.comments = await db.prepare(`
      SELECT c.*, u.nickname, u.profile_picture
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.personal_asset_id = ?
      ORDER BY c.created_at ASC
    `).all(asset.id);
  }

  res.json(assets);
});

app.post('/api/personal-assets', checkAuth, upload.single('media'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { title, type } = req.body; // type: 'photo' or 'video'
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const url = `${protocol}://${req.get('host')}/uploads/${req.file.filename}`;

  const insert = db.prepare('INSERT INTO personal_assets (user_id, url, type, title) VALUES (?, ?, ?, ?)');
  await insert.run(req.user.id, url, type, title || 'Untitled');

  logAction(req.user.id, 'PERSONAL_ASSET_UPLOAD', `Uploaded personal ${type}: ${title || 'Untitled'}`);
  res.json({ success: true, url });
});

app.put('/api/personal-assets/:id', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
  const { title } = req.body;
  const result = await db.prepare('UPDATE personal_assets SET title = ? WHERE id = ? AND user_id = ?').run(title || 'Untitled', req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Asset not found or access denied' });
  res.json({ success: true });
});

app.delete('/api/personal-assets/:id', checkAuth, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });

  const asset = await db.prepare('SELECT url FROM personal_assets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found or access denied' });

  if (asset.url.includes('/uploads/')) {
    const filename = asset.url.split('/uploads/')[1];
    const filePath = path.join(__dirname, 'uploads', filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await db.prepare('DELETE FROM personal_assets WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/admin/users/cover-photo', checkAuth, async (req, res) => {
  const { url } = req.body;
  await db.prepare('UPDATE users SET cover_photo = ? WHERE id = ?').run(url, req.user.id);
  res.json({ success: true });
});



// Serve compiled frontend assets in production
const distPath = path.join(__dirname, '../client/dist');
app.use(express.static(distPath));

// Wildcard route to serve React Router SPA frontend, ignoring API routes
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error('❌ index.html not found at path:', indexPath);
    res.status(404).send('Frontend build not found. Please verify the build step.');
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Scheduled Tasks
cron.schedule('0 9 * * 6', async () => {
  try {
    const config = await db.prepare('SELECT weekly_amount FROM savings_config ORDER BY effective_date DESC LIMIT 1').get();
    const amount = config ? config.weekly_amount : 300;
    const members = await db.prepare('SELECT id FROM savings_members WHERE status = \'active\'').all();
    for (const m of members) {
      await db.prepare('INSERT INTO savings_transactions (member_id, amount, type, confirmed_by) VALUES (?, ?, ?, ?)').run(m.id, amount, 'expected', 'system');
    }
    if (bot && process.env.ADMIN_CHAT_ID && process.env.ADMIN_CHAT_ID !== 'YOUR_CHAT_ID') {
      bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, `🔔 Reminder: Today is Saturday! Don't forget to save your weekly contribution of ${amount} ETB.`).catch(console.error);
    }
    console.log(`Cron: Added expected balance of ${amount} ETB for ${members.length} active members.`);
  } catch (error) {
    console.error('Error in cron job:', error);
  }
}, {
  timezone: "Africa/Addis_Ababa"
});
