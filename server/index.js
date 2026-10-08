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

const { Pool } = require('pg');
const Database = require('better-sqlite3');

let pool = null;
let sqliteDb = null;
let isPostgres = false;

const PERMANENT_DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.edewgfzcthbjpgwzoqwh:Ermias%401361e@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';

if (PERMANENT_DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: PERMANENT_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
    pool.on('error', (err) => {
      console.warn('⚠️ Unexpected idle client error on PostgreSQL pool:', err.message);
    });
    isPostgres = true;
    console.log('🔌 Permanent Cloud PostgreSQL database connected successfully.');
  } catch (err) {
    console.warn('⚠️ Could not initialize PostgreSQL pool, falling back to SQLite:', err.message);
  }
}

if (!isPostgres) {
  let dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'db', 'database.sqlite');
  try {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    sqliteDb = new Database(dbPath);
  } catch (err) {
    console.warn(`⚠️ Could not use ${dbPath}, falling back to local database directory:`, err.message);
    dbPath = path.join(__dirname, 'db', 'database.sqlite');
    const fallbackDir = path.dirname(dbPath);
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
    sqliteDb = new Database(dbPath);
  }
  console.log('✅ SQLite Database connected successfully at:', dbPath);
}

// Ensure upload directory exists
let UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (err) {
  console.warn(`⚠️ Could not use ${UPLOADS_DIR}, falling back to local uploads directory:`, err.message);
  UPLOADS_DIR = path.join(__dirname, 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

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

const { createClient } = require('@supabase/supabase-js');
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Multer config (Memory Storage for Supabase upload)
const storage = multer.memoryStorage();
const upload = multer({ storage });

const saveFileToStorageBackup = async (fileName, buffer, mimeType) => {
  try {
    if (!db) return;
    const base64Data = buffer.toString('base64');
    const cleanName = path.basename(fileName);
    await db.prepare(`
      INSERT INTO file_storage (path, data, mime_type) 
      VALUES (?, ?, ?) 
      ON CONFLICT(path) DO UPDATE SET data = excluded.data, mime_type = excluded.mime_type
    `).run(cleanName, base64Data, mimeType || 'image/jpeg');
    console.log(`💾 Persisted backup for ${cleanName} into file_storage`);
  } catch (e) {
    console.error(`❌ Failed to persist ${fileName} into file_storage:`, e.message);
  }
};

const uploadToSupabase = async (file) => {
  let ext = path.extname(file.originalname);
  if (!ext) {
    if (file.mimetype.startsWith('image/')) ext = file.mimetype.replace('image/', '.');
    else if (file.mimetype.startsWith('video/')) ext = file.mimetype.replace('video/', '.');
  }
  if (ext === '.jpeg') ext = '.jpg';
  if (ext === '.quicktime') ext = '.mov';
  const baseName = file.originalname.replace(ext, '').replace(/[^a-zA-Z0-9]/g, '');
  const fileName = Date.now() + '-' + baseName + ext;
  
  // Persist backup in database table so Render container restarts never lose files
  await saveFileToStorageBackup(fileName, file.buffer, file.mimetype);

  if (supabase) {
    try {
      const uploadPromise = supabase.storage.from('friends-info-uploads').upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true
      });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Supabase upload timeout')), 4500)
      );
      const { data, error } = await Promise.race([uploadPromise, timeoutPromise]);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('friends-info-uploads').getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (err) {
      console.warn('⚠️ Supabase upload failed or timed out, saving to local uploads folder:', err.message);
    }
  }
  const localPath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(localPath, file.buffer);
  return `/uploads/${fileName}`;
};

const app = express();

// Custom handler for /uploads to recover files from database if disk was cleared by Render container restart
app.get('/uploads/:filename', async (req, res, next) => {
  const fileName = req.params.filename;
  const localFile = path.join(UPLOADS_DIR, fileName);
  if (fs.existsSync(localFile)) {
    return res.sendFile(localFile);
  }
  try {
    if (db) {
      const cleanName = path.basename(fileName);
      const record = await db.prepare('SELECT data, mime_type FROM file_storage WHERE path = ? OR path = ?').get(
        cleanName,
        `/uploads/${cleanName}`
      );
      if (record && record.data) {
        const buffer = Buffer.from(record.data, 'base64');
        try {
          fs.writeFileSync(localFile, buffer);
        } catch (e) {}
        if (record.mime_type) res.setHeader('Content-Type', record.mime_type);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return res.send(buffer);
      }

      // If specific file not found in file_storage, fallback to any valid image from file_storage
      // so visitors and users NEVER see broken placeholder cards
      const isImageRequest = /\.(jpe?g|png|gif|webp|heic)$/i.test(cleanName);
      if (isImageRequest) {
        const fallbackRecord = await db.prepare("SELECT data, mime_type FROM file_storage WHERE mime_type LIKE 'image/%' LIMIT 1").get();
        if (fallbackRecord && fallbackRecord.data) {
          const buffer = Buffer.from(fallbackRecord.data, 'base64');
          if (fallbackRecord.mime_type) res.setHeader('Content-Type', fallbackRecord.mime_type);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.send(buffer);
        }
      }
    }
  } catch (err) {
    console.error('Error recovering file from database storage:', err.message);
  }
  next();
});

app.use('/uploads', express.static(UPLOADS_DIR));
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

class PgStatement {
  constructor(sql) {
    let paramCounter = 1;
    this.rawSql = sql;
    this.sql = sql.replace(/\?/g, () => `$${paramCounter++}`);
    const upper = this.sql.trim().toUpperCase();
    if (upper.startsWith('INSERT') && !upper.includes('RETURNING')) {
      if (!upper.includes('INTO ROLES') && !upper.includes('INTO SYSTEM_SETTINGS') && !upper.includes('INTO FILE_STORAGE')) {
        this.sql += ' RETURNING id';
      }
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
    return {
      changes: res.rowCount,
      lastInsertRowid: res.rows?.[0]?.id !== undefined ? res.rows[0].id : null
    };
  }
}

const db = {
  prepare: (sql) => {
    if (isPostgres) {
      return new PgStatement(sql);
    }
    // Normalize Postgres parameter placeholders ($1, $2) to SQLite placeholders (?)
    let normalizedSql = sql.replace(/\$\d+/g, '?');
    // Strip Postgres RETURNING clauses if present
    normalizedSql = normalizedSql.replace(/\s+RETURNING\s+[\w\*]+$/i, '');
    const stmt = sqliteDb.prepare(normalizedSql);
    return {
      get: async (...args) => stmt.get(...args.flat()),
      all: async (...args) => stmt.all(...args.flat()),
      run: async (...args) => {
        const res = stmt.run(...args.flat());
        return { changes: res.changes, lastInsertRowid: res.lastInsertRowid };
      }
    };
  },
  exec: async (sql) => {
    if (isPostgres) {
      try {
        return await pool.query(sql);
      } catch (e) {
        if (e.message.includes('already exists') || e.message.includes('duplicate')) return;
        console.error(`⚠️ Postgres Exec Error/Warning:\nQuery: ${sql.substring(0, 100)}...\nError:`, e.message);
      }
      return;
    }
    try {
      let cleanSql = sql
        .replace(/BIGSERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
        .replace(/TIMESTAMP DEFAULT now\(\)/gi, 'DATETIME DEFAULT CURRENT_TIMESTAMP')
        .replace(/JSONB/gi, 'TEXT')
        .replace(/::jsonb/gi, '');
      if (cleanSql.toUpperCase().includes('ALTER TABLE') && cleanSql.toUpperCase().includes('ADD COLUMN IF NOT EXISTS')) {
        cleanSql = cleanSql.replace(/ADD COLUMN IF NOT EXISTS/gi, 'ADD COLUMN');
      }
      return sqliteDb.exec(cleanSql);
    } catch(e) {
      if (e.message.includes('duplicate column name') || e.message.includes('already exists')) return;
      console.error(`⚠️ DB Exec Error/Warning:\nQuery: ${sql.substring(0, 100)}...\nError:`, e.message);
    }
  },
  transaction: (fn) => {
    if (isPostgres) {
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
      };
    }
    return sqliteDb.transaction(fn);
  }
};

// Run all startup init tasks inside an async IIFE (CommonJS does not support top-level await)
(async () => {
  if (pool) {
    let connected = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`🔌 Testing PostgreSQL (Supabase) connection (attempt ${attempt}/5)...`);
        await pool.query('SELECT 1');
        isPostgres = true;
        connected = true;
        console.log('✅ Connected to PostgreSQL (Supabase) successfully!');
        break;
      } catch (pgErr) {
        console.warn(`⚠️ PostgreSQL connection attempt ${attempt} failed:`, pgErr.message);
        if (attempt < 5) await new Promise(r => setTimeout(r, 2000));
      }
    }
    if (!connected) {
      console.warn('⚠️ Could not connect to PostgreSQL after 5 attempts, falling back to SQLite');
      isPostgres = false;
      if (!sqliteDb) {
        let dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'db', 'database.sqlite');
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        sqliteDb = new Database(dbPath);
        console.log('✅ SQLite fallback active at:', dbPath);
      }
    }
  }

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
      full_name TEXT,
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
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT");
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
  await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id TEXT");

  // Automatically link Super Admin Telegram ID if configured
  if (process.env.ADMIN_CHAT_ID) {
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'ermiasgesgis@gmail.com').toLowerCase();
    await db.prepare('UPDATE users SET telegram_id = ? WHERE LOWER(email) = ?').run(process.env.ADMIN_CHAT_ID, superAdminEmail);
  }

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
      custom_advance_balance NUMERIC DEFAULT NULL,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  try {
    await db.exec(`ALTER TABLE savings_members ADD COLUMN custom_advance_balance NUMERIC DEFAULT NULL`);
  } catch (e) {}
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
      week_number INTEGER,
      effective_date TIMESTAMP DEFAULT now()
    )
  `);
  try {
    await db.exec(`ALTER TABLE savings_config ADD COLUMN week_number INTEGER`);
  } catch (e) {}

  try {
    const existingConfigs = await db.prepare('SELECT id, week_number FROM savings_config ORDER BY id ASC').all();
    let counter = 1;
    for (const cfg of existingConfigs) {
      if (!cfg.week_number) {
        await db.prepare('UPDATE savings_config SET week_number = ? WHERE id = ?').run(counter, cfg.id);
      }
      counter++;
    }
  } catch (e) {}
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
    CREATE TABLE IF NOT EXISTS savings_cycles (
      id BIGSERIAL PRIMARY KEY,
      cycle_name TEXT NOT NULL,
      cash_in_hand NUMERIC NOT NULL,
      money_at_work NUMERIC NOT NULL,
      total_wealth NUMERIC NOT NULL,
      archived_by TEXT NOT NULL,
      snapshot_data TEXT NOT NULL,
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
  await db.exec(`INSERT INTO system_settings (key, value) SELECT 'messaging_enabled', 'true' WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'messaging_enabled')`);
  await db.exec(`INSERT INTO system_settings (key, value) SELECT 'signup_enabled', 'true' WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'signup_enabled')`);
  await db.exec(`INSERT INTO system_settings (key, value) SELECT 'private_dashboard_enabled', 'true' WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'private_dashboard_enabled')`);

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
    CREATE TABLE IF NOT EXISTS gallery (
      id BIGSERIAL PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT,
      caption TEXT,
      created_at TIMESTAMP DEFAULT now()
    )
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS bot_access (
      id BIGSERIAL PRIMARY KEY,
      telegram_id TEXT UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      username TEXT,
      role TEXT DEFAULT 'pending',
      user_id INTEGER,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    )
  `);
  try {
    await db.exec(`ALTER TABLE users ADD COLUMN telegram_id TEXT`);
  } catch (e) {}
  await db.exec(`
    CREATE TABLE IF NOT EXISTS file_storage (
      path TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      mime_type TEXT,
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
  const superAdminPerms = JSON.stringify({ canViewLogs: true, canManageAdmins: true, canManageSavings: true, canToggleFeatures: true });
  const adminPerms = JSON.stringify({ canViewLogs: true, canManageAdmins: true, canManageSavings: false, canToggleFeatures: true });
  const userPerms = JSON.stringify({ canViewLogs: false, canManageAdmins: false, canManageSavings: false, canToggleFeatures: false });
  await db.exec(`INSERT INTO roles (name, permissions) VALUES ('super_admin', '${superAdminPerms}') ON CONFLICT (name) DO NOTHING`);
  await db.exec(`INSERT INTO roles (name, permissions) VALUES ('admin', '${adminPerms}') ON CONFLICT (name) DO NOTHING`);
  await db.exec(`INSERT INTO roles (name, permissions) VALUES ('authorized', '${userPerms}') ON CONFLICT (name) DO NOTHING`);
  await db.exec(`INSERT INTO roles (name, permissions) VALUES ('user', '${userPerms}') ON CONFLICT (name) DO NOTHING`);

  // Migration: Ensure existing admin and super_admin roles have canToggleFeatures
  if (isPostgres) {
    await db.exec(`UPDATE roles SET permissions = permissions || '{"canToggleFeatures": true}'::jsonb WHERE name IN ('super_admin', 'admin')`);
  } else {
    try {
      await db.exec(`UPDATE roles SET permissions = '${adminPerms}' WHERE name = 'admin'`);
      await db.exec(`UPDATE roles SET permissions = '${superAdminPerms}' WHERE name = 'super_admin'`);
    } catch (e) {}
  }

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
        email, password, role, nickname, full_name, created_by_admin, status
      ) VALUES (?, ?, ?, ?, ?, 1, 'active')
    `).run(superAdminEmail, hashedSA, 'super_admin', 'Ermias Gesgis', 'Ermias Gesgis');
    console.log(`👤 Seeded default superadmin: ${superAdminEmail}`);
  } else {
    await db.prepare("UPDATE users SET role = 'super_admin', nickname = 'Ermias Gesgis', full_name = 'Ermias Gesgis', password = ?, totp_secret = NULL WHERE LOWER(email) = LOWER(?)").run(hashedSA, superAdminEmail);
    console.log(`👤 Verified role 'super_admin', synchronized password, and cleared 2FA for user: ${superAdminEmail}`);
  }

  // Demote any other users who have super_admin role to admin (Ermias Gesgis is the ONLY Super Admin)
  await db.prepare("UPDATE users SET role = 'admin' WHERE role = 'super_admin' AND LOWER(email) != LOWER(?)").run(superAdminEmail);

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

const JWT_SECRET = process.env.JWT_SECRET || 'friends_info_secret_key_2026';
const TG_TOKEN = process.env.TG_TOKEN || '8783688702:AAHFs9AJBXfLX-t6lfuAtXB1Cpr1bYTPprI';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '5046785167';
const bot = TG_TOKEN ? new Telegraf(TG_TOKEN) : null;


// RBAC Middleware
const checkAuth = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    let user = null;
    try {
      user = await db.prepare('SELECT id, email, role, nickname, full_name, status, created_by_admin, profile_picture, cover_photo, mobile, address, gender, dob, bio, telegram_username, fav_food_drink FROM users WHERE id = ?').get(decoded.id);
    } catch (dbErr) {
      console.warn('DB checkAuth warning:', dbErr.message);
    }

    if (user && (user.status === 'blocked' || user.status === 'deleted')) {
      return res.status(401).json({ error: 'Identity not found or account terminated' });
    }

    req.user = user 
      ? { ...user, id: parseInt(user.id) } 
      : { ...decoded, id: parseInt(decoded.id) };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const checkPermission = (permission) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  // Super admin always has all permissions
  if (req.user.role === 'super_admin') {
    return next();
  }

  // Admin role has canToggleFeatures, canViewLogs
  if (req.user.role === 'admin' && (permission === 'canToggleFeatures' || permission === 'canViewLogs')) {
    return next();
  }

  const role = await db.prepare('SELECT permissions FROM roles WHERE name = ?').get(req.user.role);
  let perms = {};
  if (role) {
    perms = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions;
  }

  if (perms && perms[permission]) {
    next();
  } else {
    // If it's canToggleFeatures, never send security alert
    if (permission !== 'canToggleFeatures') {
      logAction(req.user.id, 'SECURITY_ALERT', `Unauthorized attempt to access: ${permission}`);
    }
    res.status(404).json({ error: 'Not Found' }); // Stealth mode
  }
};

const checkPaymentClerk = async (req, res, next) => {
  const clerkSetting = await db.prepare("SELECT value FROM system_settings WHERE key = 'clerk_id'").get();
  const clerkId = clerkSetting && clerkSetting.value ? parseInt(clerkSetting.value) : null;
  const user = await db.prepare('SELECT role, email FROM users WHERE id = ?').get(req.user.id);
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'ermiasgesgis@gmail.com').toLowerCase();
  const isSuperAdmin = (user && user.role === 'super_admin' && user.email && user.email.toLowerCase() === superAdminEmail);
  
  if (req.user.id === clerkId || user?.role === 'clerk' || isSuperAdmin) {
    next();
  } else {
    res.status(403).json({ error: 'Only the designated clerk or Super Admin can perform this action' });
  }
};

const checkSavingsManager = async (req, res, next) => {
  const user = await db.prepare('SELECT role, email FROM users WHERE id = ?').get(req.user.id);
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'ermiasgesgis@gmail.com').toLowerCase();
  if (user && user.role === 'super_admin' && user.email && user.email.toLowerCase() === superAdminEmail) {
    next();
  } else {
    res.status(403).json({ error: 'Only Super Admin (ermiasgesgis@gmail.com) can manage members and savings settings' });
  }
};

// Generic Image Upload for authenticated users
app.post('/api/upload', checkAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const fileUrl = await uploadToSupabase(req.file);
    res.json({ url: fileUrl });
  } catch (error) {
    console.error('Supabase upload error:', error);
    res.status(500).json({ error: 'Failed to upload image to cloud storage' });
  }
});

// Logging Function
const logAction = (userId, action, details) => {
  db.prepare('INSERT INTO logs (user_id, action, details) VALUES (?, ?, ?)').run(userId, action, details).catch(console.error);

  // Exclude private personal uploads from being sent to the Telegram bot
  if (action === 'PERSONAL_ASSET_UPLOAD') {
    return;
  }

  // Never send canToggleFeatures alerts to Telegram
  if (details && String(details).includes('canToggleFeatures')) {
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

// Comprehensive User Deletion Helper
const deleteUserCompletely = async (id, actingUser) => {
  const targetUser = await db.prepare('SELECT id, nickname, full_name, email, role FROM users WHERE id = ?').get(id);
  if (!targetUser) return { error: 'User not found', status: 404 };
  if (targetUser.role === 'super_admin') return { error: 'Cannot delete a Super Admin identity', status: 403 };

  // Only Super Admin can delete admins
  if (targetUser.role === 'admin' && actingUser.role !== 'super_admin') {
    return { error: 'Only Super Admin can remove an Admin', status: 403 };
  }

  const targetName = targetUser.full_name || targetUser.nickname || targetUser.email || `User #${id}`;
  const adminName = actingUser.full_name || actingUser.nickname || actingUser.email || `Admin #${actingUser.id}`;

  // 1. Remove from savings_members and their transactions
  const matchNames = [targetUser.nickname, targetUser.full_name, targetUser.email].filter(Boolean);
  for (const name of matchNames) {
    const mems = await db.prepare('SELECT id FROM savings_members WHERE LOWER(name) = LOWER(?)').all(name);
    for (const m of mems) {
      await db.prepare('DELETE FROM savings_transactions WHERE member_id = ?').run(m.id);
      await db.prepare('DELETE FROM savings_members WHERE id = ?').run(m.id);
    }
  }

  // 2. Cascade delete from all user-related tables
  await db.prepare('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?').run(id, id);
  await db.prepare('DELETE FROM personal_assets WHERE user_id = ?').run(id);
  await db.prepare('DELETE FROM comments WHERE user_id = ?').run(id);
  await db.prepare('DELETE FROM reactions WHERE user_id = ?').run(id);
  await db.prepare('DELETE FROM posts WHERE user_id = ?').run(id);
  await db.prepare('DELETE FROM memories WHERE user_id = ?').run(id);
  await db.prepare('DELETE FROM bot_access WHERE user_id = ?').run(id);
  if (targetUser.telegram_id) {
    await db.prepare('DELETE FROM bot_access WHERE telegram_id = ?').run(targetUser.telegram_id);
  }
  if (targetUser.telegram_username) {
    const cleanTg = targetUser.telegram_username.replace(/^@/, '');
    await db.prepare('DELETE FROM bot_access WHERE LOWER(username) = LOWER(?)').run(cleanTg);
  }
  await db.prepare('DELETE FROM logs WHERE user_id = ?').run(id);
  await db.prepare("UPDATE system_settings SET value = '' WHERE key = 'clerk_id' AND value = ?").run(String(id));

  // 3. Delete from users table
  await db.prepare('DELETE FROM users WHERE id = ?').run(id);

  logAction(actingUser.id, 'ADMIN_DELETED_USER', `🚫 "${targetName}" has been permanently removed by ${adminName}`);

  // 4. Real-time broadcast to all connected dashboards
  io.emit('user_deleted', { id: parseInt(id) });
  io.emit('savings_update');

  return { success: true };
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
    nickname, full_name, dob, gender, mobile, address,
    bio, profile_picture, cover_photo, telegram_username, fav_food_drink
  } = req.body;

  try {
    const oldProfile = await db.prepare('SELECT nickname, full_name, dob, gender, mobile, address, bio, telegram_username, fav_food_drink, email FROM users WHERE id = ?').get(req.user.id);

    await db.prepare(`
      UPDATE users SET 
        nickname = COALESCE(?, nickname),
        full_name = COALESCE(?, full_name),
        dob = ?, gender = ?, mobile = ?, address = ?, 
        bio = ?, profile_picture = ?, cover_photo = ?, telegram_username = ?, fav_food_drink = ?
      WHERE id = ?
    `).run(
      nickname !== undefined ? nickname : (oldProfile ? oldProfile.nickname : null),
      full_name !== undefined ? full_name : (oldProfile ? oldProfile.full_name : null),
      dob, gender, mobile, address,
      bio, profile_picture, cover_photo, telegram_username, fav_food_drink,
      req.user.id
    );

    // Compare fields to see what changed
    const changes = [];
    const fields = [
      { key: 'full_name', label: 'Full Name' },
      { key: 'nickname', label: 'Nickname / Handle' },
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

    const updatedName = full_name || nickname || (oldProfile ? (oldProfile.full_name || oldProfile.nickname || oldProfile.email.split('@')[0]) : 'User');
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
  const user = await db.prepare('SELECT id, email, role, nickname, full_name, dob, gender, mobile, address, bio, profile_picture, cover_photo, telegram_username, fav_food_drink, created_at FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});


app.get('/api/auth/me', checkAuth, async (req, res) => {
  const isAuthorized = ['super_admin', 'admin'].includes(req.user.role) || req.user.created_by_admin === 1;
  res.json({
    user: {
      ...req.user,
      restricted: !isAuthorized
    }
  });
});

app.get('/api/users', checkAuth, async (req, res) => {
  const users = await db.prepare("SELECT id, email, role, nickname, full_name, profile_picture, telegram_username, mobile, bio, created_at FROM users WHERE status != 'deleted' ORDER BY created_at DESC").all();
  res.json(users);
});

app.delete('/api/users/:id', checkAuth, checkSavingsManager, async (req, res) => {
  const result = await deleteUserCompletely(req.params.id, req.user);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
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
  const displayName = user.full_name || user.nickname || user.email.split('@')[0];
  logAction(user.id, 'LOGIN_SUCCESS', `${displayName} is visiting the friend's website`);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      nickname: user.nickname,
      full_name: user.full_name,
      created_by_admin: user.created_by_admin,
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
    const displayName = user.full_name || user.nickname || user.email.split('@')[0];
    logAction(user.id, '2FA_SUCCESS', `${displayName} is visiting the friend's website`);
    const isAuthorized = ['super_admin', 'admin'].includes(user.role) || user.created_by_admin === 1;
    res.json({
      token: jwtToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        nickname: user.nickname,
        full_name: user.full_name,
        created_by_admin: user.created_by_admin,
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

// User Management (Super Admin & Admin)
app.get('/api/admin/users', checkAuth, checkPermission('canManageAdmins'), async (req, res) => {
  const users = await db.prepare('SELECT id, email, role, nickname, full_name, telegram_username, telegram_id, status, created_by_admin, created_at, profile_picture, mobile, bio FROM users ORDER BY created_at DESC').all();
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
  const { email, password, nickname, full_name, telegram_username, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const hashedPassword = bcrypt.hashSync(password, 10);

  // Get acting user
  const actingAdmin = await db.prepare('SELECT nickname, full_name, email, role FROM users WHERE id = ?').get(req.user.id);

  // Default role to 'admin' so the enrolled identity has full administrative access
  const requestedRole = role || 'admin';
  // Ermias Gesgis is the ONLY Super Admin. Force role to admin if super_admin is requested for anyone else.
  const assignedRole = (requestedRole === 'super_admin' && (email || '').toLowerCase() !== 'ermiasgesgis@gmail.com') ? 'admin' : requestedRole;
  
  const displayName = nickname || full_name || email.split('@')[0];
  const userFullName = full_name || nickname || displayName;
  const cleanTg = telegram_username ? ('@' + telegram_username.trim().replace(/^@/, '')) : null;

  try {
    const resInsert = await db.prepare(`
      INSERT INTO users (email, password, nickname, full_name, telegram_username, role, created_by_admin) 
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(email, hashedPassword, displayName, userFullName, cleanTg, assignedRole);
    
    // Auto-enroll into savings_members so they are immediately part of Friends Sharing / Savings
    try {
      const existingMember = await db.prepare('SELECT id FROM savings_members WHERE LOWER(name) = LOWER(?)').get(userFullName);
      if (!existingMember) {
        await db.prepare('INSERT INTO savings_members (name) VALUES (?)').run(userFullName);
      }
    } catch (savingsErr) {
      console.error('Failed to auto-enroll in savings:', savingsErr);
    }
    
    const adminName = actingAdmin ? (actingAdmin.full_name || actingAdmin.nickname || actingAdmin.email) : `Admin #${req.user.id}`;
    
    logAction(req.user.id, 'ADMIN_CREATED_USER', `👤 ${adminName} enrolled user "${userFullName}" (${email}) with role ${assignedRole}${cleanTg ? ` [TG: ${cleanTg}]` : ''}`);

    res.json({ success: true, id: resInsert.lastInsertRowid });
  } catch (err) {
    console.error('Failed to enroll user:', err);
    res.status(400).json({ error: 'User already exists or invalid data' });
  }
});

app.delete('/api/admin/users/:id', checkAuth, checkPermission('canManageAdmins'), async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.id) return res.status(400).json({ error: 'Cannot delete self' });

  const result = await deleteUserCompletely(id, req.user);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json({ success: true });
});

// --- SAVINGS TRACKER API ---
app.get('/api/savings/members', checkAuth, async (req, res) => {
  // Auto-sync admins to savings_members
  try {
    const admins = await db.prepare("SELECT nickname, full_name, email FROM users WHERE role IN ('super_admin', 'admin') AND status != 'deleted'").all();
    for (const admin of admins) {
      const adminName = admin.full_name || admin.nickname || admin.email;
      if (!adminName) continue;
      
      const existing = await db.prepare("SELECT id FROM savings_members WHERE LOWER(name) = LOWER(?)").get(adminName);
      if (!existing) {
        await db.prepare("INSERT INTO savings_members (name) VALUES (?)").run(adminName);
      }
    }
  } catch (syncErr) {
    console.error("Failed to sync admins to savings_members", syncErr);
  }

  const members = await db.prepare('SELECT * FROM savings_members ORDER BY name ASC').all();
  const users = await db.prepare('SELECT nickname, full_name, email, role FROM users').all();
  const filteredMembers = [];
  
  for (const m of members) {
    // Try to match savings member to a user to find their role
    const matchedUser = users.find(u => 
      (u.full_name && m.name.toLowerCase().replace(/\s+/g, '') === u.full_name.toLowerCase().replace(/\s+/g, '')) ||
      (u.nickname && m.name.toLowerCase().replace(/\s+/g, '') === u.nickname.toLowerCase().replace(/\s+/g, '')) ||
      (u.full_name && m.name.toLowerCase().includes(u.full_name.toLowerCase())) ||
      (u.nickname && m.name.toLowerCase().includes(u.nickname.toLowerCase())) ||
      (u.email && u.email.toLowerCase().startsWith(m.name.split(' ')[0].toLowerCase()))
    );
    if (matchedUser && ['admin', 'super_admin'].includes(matchedUser.role)) {
      m.role = matchedUser.role;
    } else {
      // Skip calculating totals and omit from response if not admin/superadmin
      continue;
    }

    const totals = await db.prepare(`
      SELECT 
        SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN type IN ('missed', 'expected') THEN amount ELSE 0 END) as total_expected
      FROM savings_transactions 
      WHERE member_id = ?
    `).get(m.id);
    m.total_paid = totals?.total_paid ? parseFloat(totals.total_paid) : 0;
    m.total_expected = totals?.total_expected ? parseFloat(totals.total_expected) : 0;
    m.balance = m.total_paid - m.total_expected;
    m.custom_advance_balance = m.custom_advance_balance !== null && m.custom_advance_balance !== undefined ? parseFloat(m.custom_advance_balance) : null;
    
    // Add to filtered response
    filteredMembers.push(m);
  }
  res.json(filteredMembers);
});

app.put('/api/savings/members/:id/advance', checkAuth, checkSavingsManager, async (req, res) => {
  const { custom_advance_balance } = req.body;
  const val = (custom_advance_balance === null || custom_advance_balance === '' || isNaN(custom_advance_balance)) ? null : parseFloat(custom_advance_balance);
  await db.prepare('UPDATE savings_members SET custom_advance_balance = ? WHERE id = ?').run(val, req.params.id);
  const member = await db.prepare('SELECT name FROM savings_members WHERE id = ?').get(req.params.id);
  
  const userNickname = req.user.nickname || 'Super Admin';
  const msg = val === null 
    ? `Super Admin ${userNickname} reset stored advance savings to automatic calculation for ${member ? member.name : 'Member'}`
    : `Super Admin ${userNickname} manually updated stored advance savings to ${val} ETB for ${member ? member.name : 'Member'}`;
  
  logAction(req.user.id, 'SAVINGS_UPDATE', msg);
  res.json({ success: true, custom_advance_balance: val });
});

app.post('/api/savings/members', checkAuth, checkSavingsManager, async (req, res) => {
  const { name } = req.body;
  const matchedUser = await db.prepare(`SELECT role FROM users WHERE LOWER(nickname) = LOWER(?) OR LOWER(full_name) = LOWER(?) OR LOWER(email) = LOWER(?)`).get(name, name, name);
  if (!matchedUser || !['admin', 'super_admin'].includes(matchedUser.role)) {
    return res.status(400).json({ error: 'Only admins and superadmins can be added to savings' });
  }
  const result = await db.prepare('INSERT INTO savings_members (name) VALUES (?)').run(name);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/savings/members/:id', checkAuth, checkSavingsManager, async (req, res) => {
  const memberId = req.params.id;
  const member = await db.prepare('SELECT id, name FROM savings_members WHERE id = ?').get(memberId);
  if (!member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'ermiasgesgis@gmail.com').toLowerCase();

  // Find any corresponding user or admin in the system
  const allUsers = await db.prepare('SELECT id, nickname, full_name, email, role FROM users').all();
  const cleanMemberName = member.name.trim().toLowerCase().replace(/\s+/g, '');

  const matchedUser = allUsers.find(u => {
    const userFullName = (u.full_name || '').trim().toLowerCase().replace(/\s+/g, '');
    const userNickname = (u.nickname || '').trim().toLowerCase().replace(/\s+/g, '');
    const userEmail = (u.email || '').trim().toLowerCase();
    const emailPrefix = userEmail.split('@')[0];

    return (
      (userFullName && userFullName === cleanMemberName) ||
      (userNickname && userNickname === cleanMemberName) ||
      (userEmail && userEmail === member.name.trim().toLowerCase()) ||
      (userFullName && (cleanMemberName.includes(userFullName) || userFullName.includes(cleanMemberName))) ||
      (userNickname && (cleanMemberName.includes(userNickname) || userNickname.includes(cleanMemberName))) ||
      (emailPrefix && emailPrefix === cleanMemberName)
    );
  });

  // Never allow deleting the Super Admin
  if (matchedUser && (matchedUser.role === 'super_admin' || matchedUser.email?.toLowerCase() === superAdminEmail)) {
    return res.status(403).json({ error: 'Cannot delete the Super Admin account' });
  }

  // If this member is an active user or admin on the system, purge them completely
  if (matchedUser) {
    const result = await deleteUserCompletely(matchedUser.id, req.user);
    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
  }

  // Also clean up from savings tables regardless
  await db.prepare('DELETE FROM savings_transactions WHERE member_id = ?').run(memberId);
  await db.prepare('DELETE FROM savings_members WHERE id = ?').run(memberId);

  // Broadcast to all active clients
  io.emit('savings_update');

  res.json({ success: true, message: `Member ${member.name} permanently removed from system` });
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

  const clerk = await db.prepare('SELECT nickname, email FROM users WHERE id = ?').get(req.user.id);
  const clerkName = clerk ? (clerk.nickname || clerk.email.split('@')[0]) : 'Admin';
  const member = await db.prepare('SELECT name FROM savings_members WHERE id = ?').get(member_id);
  
  const totalSaved = (await db.prepare("SELECT SUM(amount) as total FROM savings_transactions WHERE type = 'payment'").get()).total || 0;
  const completedCapital = (await db.prepare("SELECT SUM(allocated_amount) as total FROM savings_investments WHERE status = 'completed'").get()).total || 0;
  const completedProfits = (await db.prepare("SELECT SUM(projected_profit) as total FROM savings_investments WHERE status = 'completed'").get()).total || 0;
  const currentTotalMoney = parseFloat(totalSaved || 0) + parseFloat(completedCapital || 0) + parseFloat(completedProfits || 0);
  const formattedTotal = new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(currentTotalMoney);

  // Calculate individual total missed amount for this member
  const memberPaid = (await db.prepare("SELECT SUM(amount) as total FROM savings_transactions WHERE member_id = ? AND type = 'payment'").get(member_id)).total || 0;
  const memberExpected = (await db.prepare("SELECT SUM(amount) as total FROM savings_transactions WHERE member_id = ? AND type IN ('missed', 'expected')").get(member_id)).total || 0;
  const memberMissedDebt = Math.max(0, parseFloat(memberExpected || 0) - parseFloat(memberPaid || 0));
  const formattedMemberMissed = new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(memberMissedDebt);

  const memberNameStr = member ? member.name : 'Member';
  const humanMessage = type === 'payment'
    ? `🔔 New payment of ${amount} ETB signed by ${clerkName} for ${memberNameStr} (total missed: ${formattedMemberMissed}), now you all have ${formattedTotal}${notes ? ` (Notes: "${notes}")` : ''}`
    : `🔔 Missed record of ${amount} ETB signed by ${clerkName} for ${memberNameStr} (total missed: ${formattedMemberMissed}), now you all have ${formattedTotal}${notes ? ` (Notes: "${notes}")` : ''}`;

  logAction(req.user.id, 'SAVINGS_UPDATE', humanMessage);
  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/savings/transactions/:id', checkAuth, checkPaymentClerk, async (req, res) => {
  try {
    const tx = await db.prepare('SELECT * FROM savings_transactions WHERE id = ?').get(req.params.id);
    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const member = await db.prepare('SELECT name FROM savings_members WHERE id = ?').get(tx.member_id);
    const memberName = member ? member.name : `Member #${tx.member_id}`;
    const clerk = await db.prepare('SELECT nickname, email FROM users WHERE id = ?').get(req.user.id);
    const clerkName = clerk ? (clerk.nickname || clerk.email.split('@')[0]) : 'Clerk/Admin';

    await db.prepare('DELETE FROM savings_transactions WHERE id = ?').run(req.params.id);

    const txType = tx.type === 'payment' ? 'Cash In (Payment)' : 'Cash Out (Missed)';
    const formattedAmount = new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(tx.amount || 0);

    logAction(req.user.id, 'SAVINGS_TRANSACTION_DELETED', `🗑️ ${clerkName} deleted ${txType} of ${formattedAmount} for ${memberName}`);

    res.json({ 
      success: true, 
      message: `${txType} of ${formattedAmount} for ${memberName} was successfully deleted.` 
    });
  } catch (err) {
    console.error('Error deleting savings transaction:', err);
    res.status(500).json({ error: 'Failed to delete savings transaction' });
  }
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
  history.forEach(h => { if (h.amount) h.amount = parseFloat(h.amount); });
  res.json(history);
});

app.get('/api/savings/config', checkAuth, async (req, res) => {
  const config = await db.prepare('SELECT * FROM savings_config ORDER BY effective_date DESC LIMIT 1').get() || { weekly_amount: 300 };
  const clerkSetting = await db.prepare("SELECT value FROM system_settings WHERE key = 'clerk_id'").get();
  config.clerk_id = clerkSetting && clerkSetting.value ? parseInt(clerkSetting.value) : null;
  res.json(config);
});

app.get('/api/savings/config/all', checkAuth, async (req, res) => {
  const history = await db.prepare('SELECT * FROM savings_config ORDER BY effective_date DESC, id DESC').all();
  res.json(history);
});

app.post('/api/savings/config', checkAuth, checkSavingsManager, async (req, res) => {
  const { amount } = req.body;
  const maxRow = await db.prepare('SELECT MAX(week_number) as max_num FROM savings_config').get();
  const nextNum = (maxRow && maxRow.max_num) ? (parseInt(maxRow.max_num) + 1) : 1;
  await db.prepare('INSERT INTO savings_config (weekly_amount, week_number) VALUES (?, ?)').run(amount, nextNum);
  res.json({ success: true, week_number: nextNum });
});

app.delete('/api/savings/config/:id', checkAuth, checkSavingsManager, async (req, res) => {
  const latestConfig = await db.prepare('SELECT id FROM savings_config ORDER BY effective_date DESC, id DESC LIMIT 1').get();
  if (latestConfig && String(latestConfig.id) === String(req.params.id)) {
    return res.status(400).json({ error: 'The current active week configuration cannot be deleted as the system requires at least 1 active weekly setting.' });
  }
  await db.prepare('DELETE FROM savings_config WHERE id = ?').run(req.params.id);
  const userNickname = req.user.nickname || 'Super Admin';
  logAction(req.user.id, 'SETTING_CHANGE', `Super Admin ${userNickname} deleted week configuration ID ${req.params.id}`);
  res.json({ success: true });
});

app.post('/api/savings/config/bulk-delete', checkAuth, checkSavingsManager, async (req, res) => {
  const { ids } = req.body;
  const userNickname = req.user.nickname || 'Super Admin';
  const latestConfig = await db.prepare('SELECT id FROM savings_config ORDER BY effective_date DESC, id DESC LIMIT 1').get();

  if (ids === 'all') {
    if (latestConfig) {
      await db.prepare('DELETE FROM savings_config WHERE id != ?').run(latestConfig.id);
    } else {
      await db.prepare('DELETE FROM savings_config').run();
    }
    logAction(req.user.id, 'SETTING_CHANGE', `Super Admin ${userNickname} cleared all previous week configurations`);
  } else if (Array.isArray(ids) && ids.length > 0) {
    const filteredIds = latestConfig ? ids.filter(id => String(id) !== String(latestConfig.id)) : ids;
    if (filteredIds.length > 0) {
      const placeholders = filteredIds.map(() => '?').join(',');
      await db.prepare(`DELETE FROM savings_config WHERE id IN (${placeholders})`).run(...filteredIds);
      logAction(req.user.id, 'SETTING_CHANGE', `Super Admin ${userNickname} deleted ${filteredIds.length} week configuration(s)`);
    }
  }
  
  res.json({ success: true });
});

// Super Admin Reset Cycle & Archive Endpoint
app.post('/api/savings/reset-cycle', checkAuth, async (req, res) => {
  const user = await db.prepare('SELECT role, nickname, email FROM users WHERE id = ?').get(req.user.id);
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'ermiasgesgis@gmail.com').toLowerCase();
  if (!user || user.role !== 'super_admin' || !user.email || user.email.toLowerCase() !== superAdminEmail) {
    return res.status(403).json({ error: 'Super Admin (ermiasgesgis@gmail.com) privileges required to archive and reset savings pool.' });
  }

  const { cycle_name, cash_in_hand, money_at_work, total_wealth } = req.body;

  try {
    const members = await db.prepare('SELECT * FROM savings_members').all();
    const history = await db.prepare('SELECT * FROM savings_transactions').all();
    const investments = await db.prepare('SELECT * FROM savings_investments').all();
    const archivedBy = user.nickname || user.email;

    // Calculate individual total savings for each member at archiving time
    for (const m of members) {
      const totals = await db.prepare(`
        SELECT 
          SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) as total_paid,
          SUM(CASE WHEN type IN ('missed', 'expected') THEN amount ELSE 0 END) as total_expected
        FROM savings_transactions 
        WHERE member_id = ?
      `).get(m.id);
      m.total_paid = totals?.total_paid ? parseFloat(totals.total_paid) : 0;
      m.total_expected = totals?.total_expected ? parseFloat(totals.total_expected) : 0;
      m.balance = m.total_paid - m.total_expected;
    }

    const snapshot = {
      archived_at: new Date().toISOString(),
      archived_by: archivedBy,
      members,
      history,
      investments,
      totals: {
        cash_in_hand: parseFloat(cash_in_hand || 0),
        money_at_work: parseFloat(money_at_work || 0),
        total_wealth: parseFloat(total_wealth || 0)
      }
    };

    const cycleTitle = cycle_name || `Cycle ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const result = await db.prepare(`
      INSERT INTO savings_cycles (cycle_name, cash_in_hand, money_at_work, total_wealth, archived_by, snapshot_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      cycleTitle,
      parseFloat(cash_in_hand || 0),
      parseFloat(money_at_work || 0),
      parseFloat(total_wealth || 0),
      archivedBy,
      JSON.stringify(snapshot)
    );

    // Reset active transactions and archive all investments (active and completed) for brand new account zero state
    await db.prepare('DELETE FROM savings_transactions').run();
    await db.prepare("UPDATE savings_investments SET status = 'archived' WHERE status IN ('active', 'completed')").run();

    logAction(req.user.id, 'SAVINGS_CYCLE_RESET', `Super Admin archived cycle "${cycleTitle}" (Total Wealth: ETB ${total_wealth}) and reset savings for a fresh cycle.`);

    res.json({ success: true, cycle_id: result.lastInsertRowid, message: 'Savings cycle archived and reset successfully!' });
  } catch (err) {
    console.error('Error resetting savings cycle:', err);
    res.status(500).json({ error: 'Failed to archive and reset savings cycle.' });
  }
});

// Fetch All Archived Cycles Endpoint
app.get('/api/savings/cycles', checkAuth, async (req, res) => {
  try {
    const cycles = await db.prepare('SELECT * FROM savings_cycles ORDER BY created_at DESC').all();
    cycles.forEach(c => {
      if (c.snapshot_data) {
        try { 
          c.snapshot = JSON.parse(c.snapshot_data);
          // Fallback calculation for older archived snapshots missing calculated member totals
          if (c.snapshot && c.snapshot.members && c.snapshot.history) {
            c.snapshot.members.forEach(m => {
              if (m.total_paid === undefined) {
                const memberTx = c.snapshot.history.filter(t => String(t.member_id) === String(m.id));
                m.total_paid = memberTx.filter(t => t.type === 'payment').reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);
                m.total_expected = memberTx.filter(t => t.type === 'missed' || t.type === 'expected').reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);
                m.balance = m.total_paid - m.total_expected;
              }
            });
          }
        } catch(e) {}
      }
    });
    res.json(cycles);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch archived cycles.' });
  }
});

// Delete single cycle archive endpoint (Super Admin)
app.delete('/api/savings/cycles/:id', checkAuth, async (req, res) => {
  const user = await db.prepare('SELECT role, email FROM users WHERE id = ?').get(req.user.id);
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'ermiasgesgis@gmail.com').toLowerCase();
  if (!user || user.role !== 'super_admin' || !user.email || user.email.toLowerCase() !== superAdminEmail) {
    return res.status(403).json({ error: 'Super Admin (ermiasgesgis@gmail.com) privileges required to delete archived cycles.' });
  }
  try {
    const cycle = await db.prepare('SELECT cycle_name FROM savings_cycles WHERE id = ?').get(req.params.id);
    await db.prepare('DELETE FROM savings_cycles WHERE id = ?').run(req.params.id);
    logAction(req.user.id, 'SAVINGS_CYCLE_DELETE', `Super Admin deleted archived cycle "${cycle?.cycle_name || req.params.id}"`);
    res.json({ success: true, message: 'Archived cycle deleted successfully!' });
  } catch (err) {
    console.error('Error deleting cycle:', err);
    res.status(500).json({ error: 'Failed to delete archived cycle.' });
  }
});

// Clear all cycle archives endpoint (Super Admin)
app.delete('/api/savings/cycles', checkAuth, async (req, res) => {
  const user = await db.prepare('SELECT role, email FROM users WHERE id = ?').get(req.user.id);
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'ermiasgesgis@gmail.com').toLowerCase();
  if (!user || user.role !== 'super_admin' || !user.email || user.email.toLowerCase() !== superAdminEmail) {
    return res.status(403).json({ error: 'Super Admin (ermiasgesgis@gmail.com) privileges required to delete archived cycles.' });
  }
  try {
    await db.prepare('DELETE FROM savings_cycles').run();
    logAction(req.user.id, 'SAVINGS_CYCLE_CLEAR_ALL', 'Super Admin cleared all archived savings cycles.');
    res.json({ success: true, message: 'All archived cycles cleared successfully!' });
  } catch (err) {
    console.error('Error clearing cycles:', err);
    res.status(500).json({ error: 'Failed to clear archived cycles.' });
  }
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
  const investments = await db.prepare("SELECT * FROM savings_investments WHERE status != 'archived' ORDER BY created_at DESC").all();
  investments.forEach(i => {
    if (i.allocated_amount) i.allocated_amount = parseFloat(i.allocated_amount);
    if (i.projected_profit !== undefined && i.projected_profit !== null) i.projected_profit = parseFloat(i.projected_profit);
    if (i.profit !== undefined && i.profit !== null) i.profit = parseFloat(i.profit);
  });
  res.json(investments);
});

app.post('/api/savings/investments', checkAuth, checkPaymentClerk, async (req, res) => {
  const { project_name, allocated_amount, projected_profit, challenges, expected_days } = req.body;
  const result = await db.prepare('INSERT INTO savings_investments (project_name, allocated_amount, projected_profit, challenges, expected_days) VALUES (?, ?, ?, ?, ?)')
    .run(project_name, allocated_amount, projected_profit || 0, challenges || '', expected_days || null);
  
  const actor = await db.prepare('SELECT nickname, email FROM users WHERE id = ?').get(req.user.id);
  const actorName = actor ? (actor.nickname || actor.email.split('@')[0]) : 'Clerk';
  logAction(req.user.id, 'NEW_INVESTMENT', `💼 ${actorName} deployed ETB ${allocated_amount} into investment "${project_name}"`);

  res.json({ success: true, id: result.lastInsertRowid });
});

app.delete('/api/savings/investments/:id', checkAuth, checkPaymentClerk, async (req, res) => {
  await db.prepare('DELETE FROM savings_investments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/savings/investments/:id/status', checkAuth, checkPaymentClerk, async (req, res) => {
  const { status, profit, challenges } = req.body;
  const netProfit = (profit !== undefined && profit !== null && !isNaN(profit)) ? parseFloat(profit) : 0;
  if (status === 'completed') {
    await db.prepare('UPDATE savings_investments SET status = ?, completed_at = CURRENT_TIMESTAMP, profit = ?, projected_profit = ?, challenges = ? WHERE id = ?')
      .run(status, netProfit, netProfit, challenges || '', req.params.id);
  } else {
    await db.prepare('UPDATE savings_investments SET status = ?, completed_at = NULL, profit = 0 WHERE id = ?').run(status, req.params.id);
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

// Image Proxy Endpoint (Ensures images are always visible on mobile and desktop without CORS/hotlink/mixed-content blocks)
app.get('/api/proxy-image', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('Image URL required');
  try {
    let target = imageUrl.trim();
    if (target.startsWith('/uploads/')) {
      const fileName = target.replace('/uploads/', '');
      const localFile = path.join(UPLOADS_DIR, fileName);
      if (fs.existsSync(localFile)) return res.sendFile(localFile);
      const record = await db.prepare('SELECT data, mime_type FROM file_storage WHERE path = ? OR path = ?').get(
        fileName,
        target
      );
      if (record && record.data) {
        const buffer = Buffer.from(record.data, 'base64');
        if (record.mime_type) res.setHeader('Content-Type', record.mime_type);
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        return res.send(buffer);
      }
      return res.status(404).send('Not found');
    }

    if (target.startsWith('http://localhost:5000/uploads/')) {
      target = target.replace('http://localhost:5000', '');
      const fileName = target.replace('/uploads/', '');
      const localFile = path.join(UPLOADS_DIR, fileName);
      if (fs.existsSync(localFile)) return res.sendFile(localFile);
    }

    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });
    if (!response.ok) return res.status(response.status).send('Failed to fetch image');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Image proxy error:', err.message);
    res.status(500).send('Proxy error');
  }
});

// Real-time Notifications Engine (All 7 required notification types)
app.get('/api/notifications', checkAuth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const notifications = [];

    // 1. New unread messages & by whom
    try {
      const recentMessages = await db.prepare(`
        SELECT m.id, m.content, m.media_type, m.created_at, m.sender_id,
               u.nickname, u.full_name, u.email
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.sender_id != ?
        ORDER BY m.created_at DESC LIMIT 8
      `).all(currentUserId);

      for (const msg of recentMessages) {
        const sender = msg.nickname || msg.full_name || msg.email.split('@')[0];
        const preview = msg.media_type === 'image' ? '📷 Shared an image in chat' : (msg.content?.substring(0, 50) || 'Sent a message');
        notifications.push({
          id: `msg_${msg.id}`,
          type: 'unread_message',
          category: 'message',
          title: `💬 New Message from ${sender}`,
          description: `"${preview}"`,
          sender,
          target_tab: 'messages',
          created_at: msg.created_at
        });
      }
    } catch (e) {}

    // 2. Someone shares an image (Gallery or Chat photo)
    try {
      const recentGallery = await db.prepare(`
        SELECT id, title, caption, created_at, url
        FROM gallery
        ORDER BY created_at DESC LIMIT 5
      `).all();

      for (const g of recentGallery) {
        notifications.push({
          id: `gal_${g.id}`,
          type: 'shared_image',
          category: 'image',
          title: `🖼️ Image Shared: ${g.title || 'Community Memory'}`,
          description: g.caption ? `"${g.caption}"` : 'A new memory was published to Gallery Curator.',
          target_tab: 'gallery',
          image_url: g.url,
          created_at: g.created_at
        });
      }
    } catch (e) {}

    // 3. New member registered
    try {
      const recentMembers = await db.prepare(`
        SELECT id, full_name, nickname, email, role, created_at
        FROM users
        WHERE (status != 'deleted' OR status IS NULL)
        ORDER BY created_at DESC LIMIT 5
      `).all();

      for (const mem of recentMembers) {
        const name = mem.full_name || mem.nickname || mem.email.split('@')[0];
        notifications.push({
          id: `mem_${mem.id}`,
          type: 'new_member',
          category: 'member',
          title: `👤 New Member: ${name}`,
          description: `Registered with ${mem.role === 'super_admin' ? 'Super Admin' : (mem.role === 'admin' ? 'Admin' : 'Member')} access.`,
          target_tab: (req.user.role === 'super_admin' ? 'users' : 'messages'),
          created_at: mem.created_at
        });
      }
    } catch (e) {}

    // 4. Someone has changed his profile
    try {
      const recentProfileUpdates = await db.prepare(`
        SELECT l.id, l.details, l.timestamp, l.user_id,
               u.nickname, u.full_name, u.email
        FROM logs l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE l.action = 'PROFILE_UPDATE'
        ORDER BY l.timestamp DESC LIMIT 5
      `).all();

      for (const p of recentProfileUpdates) {
        const name = p.nickname || p.full_name || (p.email ? p.email.split('@')[0] : 'Member');
        notifications.push({
          id: `prof_${p.id}`,
          type: 'profile_updated',
          category: 'profile',
          title: `✏️ Profile Updated: ${name}`,
          description: p.details || `${name} updated personal profile information.`,
          target_tab: 'messages',
          created_at: p.timestamp
        });
      }
    } catch (e) {}

    // 5. Someone has missed to pay the saving
    try {
      const members = await db.prepare('SELECT id, name FROM savings_members').all();
      for (const m of members) {
        const paid = (await db.prepare("SELECT SUM(amount) as t FROM savings_transactions WHERE member_id = ? AND type = 'payment'").get(m.id))?.t || 0;
        const expected = (await db.prepare("SELECT SUM(amount) as t FROM savings_transactions WHERE member_id = ? AND type IN ('missed', 'expected')").get(m.id))?.t || 0;
        const debt = Math.max(0, parseFloat(expected || 0) - parseFloat(paid || 0));
        if (debt > 0) {
          notifications.push({
            id: `missed_${m.id}`,
            type: 'missed_saving',
            category: 'saving_missed',
            title: `⚠️ Missed Saving: ${m.name}`,
            description: `${m.name} has missed saving payments (Outstanding: ETB ${debt.toLocaleString()}).`,
            target_tab: 'logs',
            created_at: new Date().toISOString()
          });
        }
      }
    } catch (e) {}

    // 6. The clerk signed someone that pays his saving
    try {
      const recentPayments = await db.prepare(`
        SELECT t.id, t.amount, t.confirmed_by, t.created_at, m.name as member_name
        FROM savings_transactions t
        LEFT JOIN savings_members m ON t.member_id = m.id
        WHERE t.type = 'payment'
        ORDER BY t.created_at DESC LIMIT 5
      `).all();

      for (const pay of recentPayments) {
        const clerk = pay.confirmed_by || 'Clerk';
        notifications.push({
          id: `pay_${pay.id}`,
          type: 'payment_verified',
          category: 'saving_payment',
          title: `💰 Payment Verified: ${pay.member_name || 'Member'}`,
          description: `The clerk (${clerk}) signed ETB ${Number(pay.amount).toLocaleString()} saving payment for ${pay.member_name || 'Member'}.`,
          target_tab: 'logs',
          created_at: pay.created_at
        });
      }
    } catch (e) {}

    // 7. New business investments
    try {
      const recentInvestments = await db.prepare(`
        SELECT id, project_name, allocated_amount, projected_profit, status, created_at
        FROM savings_investments
        ORDER BY created_at DESC LIMIT 5
      `).all();

      for (const inv of recentInvestments) {
        notifications.push({
          id: `inv_${inv.id}`,
          type: 'new_investment',
          category: 'investment',
          title: `📈 New Business Investment: ${inv.project_name}`,
          description: `ETB ${Number(inv.allocated_amount).toLocaleString()} deployed into "${inv.project_name}" (${inv.status.toUpperCase()}).`,
          target_tab: 'logs',
          created_at: inv.created_at
        });
      }
    } catch (e) {}

    // Sort by created_at DESC
    notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      count: notifications.length,
      notifications
    });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications: ' + err.message });
  }
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
  
  if (key === 'clerk_id') {
    const actingAdmin = await db.prepare('SELECT role, email FROM users WHERE id = ?').get(req.user.id);
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'ermiasgesgis@gmail.com').toLowerCase();
    if (!actingAdmin || actingAdmin.role !== 'super_admin' || !actingAdmin.email || actingAdmin.email.toLowerCase() !== superAdminEmail) {
      return res.status(403).json({ error: 'Setting clerk is the role of the Super Admin (ermiasgesgis@gmail.com)' });
    }
    
    await db.prepare('UPDATE system_settings SET value = ? WHERE key = ?').run(value.toString(), key);
    const roleText = 'superadmin';
    const clerkId = parseInt(value);
    
    if (clerkId) {
      const clerkUser = await db.prepare('SELECT nickname, email FROM users WHERE id = ?').get(clerkId);
      const clerkName = clerkUser ? (clerkUser.nickname || clerkUser.email.split('@')[0]) : 'Nobody';
      logAction(req.user.id, 'SETTING_CHANGE', `${clerkName} is successfully assigned as clerk by ${roleText}`);
    } else {
      logAction(req.user.id, 'SETTING_CHANGE', `Clerk has been unassigned by ${roleText}`);
    }
  } else {
    await db.prepare('UPDATE system_settings SET value = ? WHERE key = ?').run(value.toString(), key);
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


// Telegram Bot Integration (Role-based & Access-Approved)
const setupTelegramBot = require('./telegramBot');
setupTelegramBot({ bot, db, io, logAction, UPLOADS_DIR });

// Gallery Endpoints (Admin and Super Admin only)
app.get('/api/gallery', checkAuth, async (req, res) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied: Only admins and superadmins can view images' });
  }
  try {
    const items = await db.prepare('SELECT * FROM gallery ORDER BY created_at DESC').all();
    if (!items || items.length === 0) return res.json([]);

    const reactions = await db.prepare("SELECT * FROM reactions WHERE target_type = 'gallery'").all();
    const comments = await db.prepare(`
      SELECT c.*, u.nickname, u.profile_picture
      FROM comments c
      JOIN users u ON c.user_id = u.id
      ORDER BY c.created_at ASC
    `).all();

    const reactionsMap = {};
    for (const r of (reactions || [])) {
      if (!reactionsMap[r.target_id]) reactionsMap[r.target_id] = [];
      reactionsMap[r.target_id].push(r);
    }

    const commentsMap = {};
    for (const c of (comments || [])) {
      if (!commentsMap[c.gallery_id]) commentsMap[c.gallery_id] = [];
      commentsMap[c.gallery_id].push(c);
    }

    for (const item of items) {
      item.reactions = reactionsMap[item.id] || [];
      item.comments = commentsMap[item.id] || [];
    }
    res.json(items);
  } catch (err) {
    console.error('Error fetching gallery:', err);
    res.status(500).json({ error: 'Failed to fetch gallery' });
  }
});

app.post('/api/admin/gallery', checkAuth, upload.single('image'), async (req, res) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  let url = req.body?.url;
  const title = req.body?.title || '';
  const caption = req.body?.caption || '';

  if (req.file) {
    try {
      url = await uploadToSupabase(req.file);
    } catch (uploadErr) {
      console.error('Gallery file upload error:', uploadErr);
      return res.status(500).json({ error: 'Failed to upload image' });
    }
  }

  if (!url) return res.status(400).json({ error: 'Image file or URL is required' });

  const insert = db.prepare('INSERT INTO gallery (url, title, caption) VALUES (?, ?, ?)');
  const result = await insert.run(url, title, caption);
  const newId = result.lastInsertRowid || result.id || Date.now();

  res.json({ 
    success: true, 
    url,
    item: {
      id: newId,
      url,
      title,
      caption,
      created_at: new Date().toISOString(),
      reactions: [],
      comments: []
    }
  });
});

// Single image upload endpoint
app.post('/api/admin/gallery/upload', checkAuth, upload.single('image'), async (req, res) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const fileUrl = await uploadToSupabase(req.file);
    res.json({ url: fileUrl });
  } catch (error) {
    console.error('Supabase upload error:', error);
    res.status(500).json({ error: 'Failed to upload image to cloud storage' });
  }
});

app.put('/api/admin/gallery/:id', checkAuth, async (req, res) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  const { title, caption, url } = req.body;
  await db.prepare('UPDATE gallery SET title = ?, caption = ?, url = ? WHERE id = ?').run(title, caption, url, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/gallery/:id', checkAuth, async (req, res) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  const item = await db.prepare('SELECT url FROM gallery WHERE id = ?').get(req.params.id);

  // Also delete local file, DB file_storage backup, or cloud file if it exists
  if (item && item.url.includes('/uploads/')) {
    const filename = path.basename(item.url);
    const filePath = path.join(__dirname, 'uploads', filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) {}
    }
    try {
      await db.prepare('DELETE FROM file_storage WHERE path = ? OR path = ?').run(filename, `/uploads/${filename}`);
    } catch (e) {}
  } else if (item && item.url.includes('supabase.co')) {
    try {
      const urlParts = item.url.split('/');
      const filename = urlParts[urlParts.length - 1];
      await supabase.storage.from('friends-info-uploads').remove([filename]);
    } catch (e) {
      console.error('Failed to delete from Supabase', e);
    }
  }

  await db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Personal Vault Endpoints (Photos & Videos - Admin and Super Admin only)
app.get('/api/personal-assets', checkAuth, async (req, res) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
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
  if (!['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { title, type } = req.body; // type: 'photo' or 'video'
  try {
    const url = await uploadToSupabase(req.file);

    const insert = db.prepare('INSERT INTO personal_assets (user_id, url, type, title) VALUES (?, ?, ?, ?)');
    await insert.run(req.user.id, url, type, title || 'Untitled');

    logAction(req.user.id, 'PERSONAL_ASSET_UPLOAD', `Uploaded personal ${type}: ${title || 'Untitled'}`);
    res.json({ success: true, url });
  } catch (error) {
    console.error('Supabase upload error:', error);
    res.status(500).json({ error: 'Failed to upload media to cloud storage' });
  }
});

app.put('/api/personal-assets/:id', checkAuth, async (req, res) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });
  const { title } = req.body;
  const result = await db.prepare('UPDATE personal_assets SET title = ? WHERE id = ? AND user_id = ?').run(title || 'Untitled', req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Asset not found or access denied' });
  res.json({ success: true });
});

app.delete('/api/personal-assets/:id', checkAuth, async (req, res) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied' });

  const asset = await db.prepare('SELECT url FROM personal_assets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found or access denied' });

  if (asset.url.includes('/uploads/')) {
    const filename = asset.url.split('/uploads/')[1];
    const filePath = path.join(__dirname, 'uploads', filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } else if (asset.url.includes('supabase.co')) {
    try {
      const urlParts = asset.url.split('/');
      const filename = urlParts[urlParts.length - 1];
      await supabase.storage.from('friends-info-uploads').remove([filename]);
    } catch (e) {
      console.error('Failed to delete from Supabase', e);
    }
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

// Global unhandled error logging middleware
app.use((err, req, res, next) => {
  console.error('💥 Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
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
