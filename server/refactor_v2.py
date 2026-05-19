import re

with open('index.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Convert all (req, res) to async (req, res)
code = re.sub(r'\((req,\s*res)\)\s*=>\s*\{', r'async (\1) => {', code)
code = re.sub(r'\(req,\s*res,\s*next\)\s*=>\s*\{', r'async (req, res, next) => {', code)

# 2. Convert db.prepare(...).get(...) to await db.prepare(...).get(...)
# We match db.prepare(...).METHOD(...) and prepend await.
# We must be careful not to prepend await if it's already there.
code = re.sub(r'(?<!await\s)db\.prepare\((.*?)\)\.(get|all|run)\((.*?)\)', r'await db.prepare(\1).\2(\3)', code)

# 3. Handle chained calls that might be on multiple lines, e.g. const x = db.prepare('...').run()
# The above regex handles single line well. What if it's db.prepare(...).run()?
code = re.sub(r'(?<!await\s)db\.exec\((.*?)\)', r'await db.exec(\1)', code)

# 4. Handle const runTransaction = db.transaction(() => { ... })
code = re.sub(r'db\.transaction\(\(\)\s*=>\s*\{', r'db.transaction(async () => {', code)

# 5. Inject our custom Postgres wrapper at the top, replacing Database initialization
wrapper = """
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

class Statement {
  constructor(sql) {
    let paramCounter = 1;
    this.sql = sql.replace(/\\?/g, () => `$${paramCounter++}`);
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
    try { await pool.query(sql); } catch(e) {}
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
"""

code = re.sub(r"const Database = require\('better-sqlite3'\);.*?(const db = new Database.*?;\n)", wrapper, code, flags=re.DOTALL)

with open('index_pg_v2.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("V2 Refactor Complete!")
