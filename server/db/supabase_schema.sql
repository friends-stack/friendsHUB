-- Friends Info PostgreSQL Schema for Supabase
-- Project: https://supabase.com/dashboard/project/edewgfzcthbjpgwzoqwh

-- 1. Roles table
CREATE TABLE IF NOT EXISTS roles (
  name TEXT PRIMARY KEY,
  permissions JSONB NOT NULL
);

-- 2. Users table
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
  telegram_id TEXT,
  fav_food_drink TEXT,
  cover_photo TEXT,
  created_by_admin INTEGER DEFAULT 0,
  totp_secret TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now()
);

-- 3. Posts table
CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  media_url TEXT,
  last_day_meet TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 4. Comments table
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
);

-- 5. Reactions table
CREATE TABLE IF NOT EXISTS reactions (
  id BIGSERIAL PRIMARY KEY,
  target_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  reaction_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- 6. Memories table
CREATE TABLE IF NOT EXISTS memories (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT,
  content TEXT,
  media_url TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 7. Savings Members table
CREATE TABLE IF NOT EXISTS savings_members (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  custom_advance_balance NUMERIC DEFAULT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- 8. Savings Transactions table
CREATE TABLE IF NOT EXISTS savings_transactions (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL,
  notes TEXT,
  confirmed_by TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 9. Savings Configuration table
CREATE TABLE IF NOT EXISTS savings_config (
  id BIGSERIAL PRIMARY KEY,
  weekly_amount NUMERIC NOT NULL DEFAULT 300,
  week_number INTEGER DEFAULT 1,
  effective_date TIMESTAMP DEFAULT now()
);

-- 10. Savings Investments table
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
);

-- 11. Savings Cycles table
CREATE TABLE IF NOT EXISTS savings_cycles (
  id BIGSERIAL PRIMARY KEY,
  cycle_name TEXT NOT NULL,
  cash_in_hand NUMERIC NOT NULL,
  money_at_work NUMERIC NOT NULL,
  total_wealth NUMERIC NOT NULL,
  archived_by TEXT NOT NULL,
  snapshot_data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- 12. Audit Logs table
CREATE TABLE IF NOT EXISTS logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMP DEFAULT now()
);

-- 13. Chat Messages table
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
);

-- 14. System Settings table
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 15. Personal Assets table
CREATE TABLE IF NOT EXISTS personal_assets (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 16. Gallery table
CREATE TABLE IF NOT EXISTS gallery (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  caption TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- 17. Telegram Bot Access table
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
);

-- Seed Default Roles
INSERT INTO roles (name, permissions) VALUES 
  ('super_admin', '{"canViewLogs": true, "canManageAdmins": true, "canManageSavings": true, "canToggleFeatures": true}'::jsonb),
  ('admin', '{"canViewLogs": true, "canManageAdmins": true, "canManageSavings": false, "canToggleFeatures": false}'::jsonb),
  ('authorized', '{"canViewLogs": false, "canManageAdmins": false, "canManageSavings": false, "canToggleFeatures": false}'::jsonb),
  ('user', '{"canViewLogs": false, "canManageAdmins": false, "canManageSavings": false, "canToggleFeatures": false}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Seed Default System Settings
INSERT INTO system_settings (key, value) VALUES
  ('clerk_id', ''),
  ('messaging_enabled', 'true'),
  ('signup_enabled', 'true'),
  ('private_dashboard_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- Seed Default Savings Config
INSERT INTO savings_config (weekly_amount, week_number)
SELECT 300, 1
WHERE NOT EXISTS (SELECT 1 FROM savings_config);

-- Seed Super Admin (ermiasgesgis@gmail.com)
-- Password hash for 'Erma@1361f'
INSERT INTO users (email, password, role, nickname, full_name, created_by_admin, status)
VALUES (
  'ermiasgesgis@gmail.com',
  '$2a$10$9s637O3iTqZ8Z5Yc8R0m3e8zV2Q1/YdY6bN1t9wRk9i7Q4y3sL8o6',
  'super_admin',
  'Ermias Gesgis',
  'Ermias Gesgis',
  1,
  'active'
)
ON CONFLICT (email) DO UPDATE SET
  role = 'super_admin',
  nickname = 'Ermias Gesgis',
  full_name = 'Ermias Gesgis',
  status = 'active';

-- Storage Bucket for uploads (optional in SQL, runs in Supabase Storage)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'friends-info-uploads',
  'friends-info-uploads',
  true,
  104857600,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'application/pdf', 'application/zip', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;
