# Migration Plan: SQLite → Supabase + Render + Cron

## Architecture Overview

```
Client (React) → Render Static Site (or Vite)
Express Server (Node.js) → Render Web Service
SQLite (local file) → Supabase (PostgreSQL)
node‑cron (in‑process) → Render Cron Jobs (HTTP trigger)
File uploads (local disk) → Supabase Storage (or Cloudinary)
```

---

## Phase 1: Supabase Setup
1. Create a Supabase project.
2. In **Settings → API**, copy:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server‑side only)
   - `SUPABASE_ANON_KEY` (client side if needed)
3. Run the SQL in `supabase_schema.sql` (provided below) inside Supabase's **SQL Editor**.
4. Enable **Storage**, create a public bucket called `uploads`.

---

## Phase 2: Server Refactor (already started)
- Replace `better‑sqlite3` with the **Supabase JS client** (`@supabase/supabase-js`).
- Convert all synchronous queries to async `supabase.from('table').select()/insert()/update()` calls.
- Swap `multer` disk storage for **Supabase Storage** upload (`supabase.storage.from('uploads').upload`).
- Remove `node‑cron`; expose an endpoint `/api/cron/weekly‑record` that performs the weekly record creation.
- Add a **cron secret** (`CRON_SECRET`) and validate it on the endpoint.
- Update environment variables (`.env.example` now includes Supabase keys, JWT secret, TG token, etc.).

---

## Phase 3: Render Deployment
### Web Service (Express API)
- **Build command**: `npm install`
- **Start command**: `node index.js`
- Add all `.env` variables in Render's dashboard.
- Add a **Cron Job** service pointing to `https://<your‑service>.onrender.com/api/cron/weekly‑record` with a header `X‑Cron‑Secret: <CRON_SECRET>` and schedule `0 8 * * 6` (every Saturday 08:00).

### Static Site (React client)
- Add a **Static Site** service.
- **Build command**: `npm run build`
- **Publish directory**: `dist`
- Set `VITE_API_URL=https://<your‑service>.onrender.com` as an env var.

---

## Phase 4: Client Adjustments (already done)
- Replace hard‑coded API URLs with `import.meta.env.VITE_API_URL`.
- Update socket.io connection URL similarly.
- Ensure all file upload requests target the new `/api/upload` endpoint that now stores files in Supabase Storage.

---

## Supabase Schema (`supabase_schema.sql`)
```sql
-- Users & roles
CREATE TABLE roles (
  name TEXT PRIMARY KEY,
  permissions JSONB NOT NULL
);
CREATE TABLE users (
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
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now()
);
-- Savings tables (adapted from SQLite)
CREATE TABLE savings_members (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE savings_transactions (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT REFERENCES savings_members(id),
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL,
  confirmed_by TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE savings_config (
  id BIGSERIAL PRIMARY KEY,
  weekly_amount NUMERIC NOT NULL,
  effective_date TIMESTAMP DEFAULT now()
);
CREATE TABLE savings_investments (
  id BIGSERIAL PRIMARY KEY,
  project_name TEXT NOT NULL,
  allocated_amount NUMERIC NOT NULL,
  projected_profit NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now()
);
-- Logs and system settings
CREATE TABLE logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMP DEFAULT now()
);
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## Environment Variables Reference
### Server (`.env`)
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxxxxxxxxxxxx
JWT_SECRET=super‑strong‑secret
TG_TOKEN=xxxxx:xxxxxxxxx
ADMIN_CHAT_ID=123456789
CRON_SECRET=very‑random‑string
PORT=5000
CLIENT_ORIGIN=https://<your‑client>.onrender.com
```
### Client (`.env` in `client/`)
```
VITE_API_URL=https://<your‑service>.onrender.com
```

---

## Checklist for a Smooth Migration
- [ ] Supabase project created and keys added to `.env`.
- [ ] Run `supabase_schema.sql` in Supabase.
- [ ] Update `server/index.js` to use Supabase client (all DB calls).
- [ ] Replace file upload logic with Supabase Storage.
- [ ] Add `/api/cron/weekly-record` endpoint and protect with `CRON_SECRET`.
- [ ] Deploy server to Render (Web Service).
- [ ] Add Render Cron Job pointing to the endpoint.
- [ ] Update client env (`VITE_API_URL`).
- [ ] Deploy client to Render (Static Site).
- [ ] Test end‑to‑end: sign‑up, login, create savings members, run weekly cron via manual curl, verify data in Supabase UI.

---

**That’s the full migration roadmap.** Let me know if you’d like any code snippets for the Supabase client integration or the new cron endpoint!
