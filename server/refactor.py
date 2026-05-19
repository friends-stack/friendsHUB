import re
import os

with open('index.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Convert route handlers to async
# app.post('/api/login', (req, res) => {
code = re.sub(r'app\.(get|post|put|delete)\((.*?),\s*(checkAuth,\s*)?(upload\.[a-zA-Z]+\([^)]+\),\s*)?\(req, res\)\s*=>\s*\{',
              r'app.\1(\2, \3\4async (req, res) => {', code)

# 2. checkAuth to async
code = code.replace('const checkAuth = (req, res, next) => {', 'const checkAuth = async (req, res, next) => {')

# 3. Replace ? with $1, $2 etc inside db.prepare('...')
def replace_query(match):
    query = match.group(1)
    
    # We replace ? with $1, $2 inside the query string
    parts = query.split('?')
    new_query = parts[0]
    for i in range(1, len(parts)):
        new_query += f'${i}' + parts[i]
        
    # The whole db.prepare('...').run/get/all
    return match.group(0).replace(query, new_query)

code = re.sub(r"db\.prepare\((['`].+?['`])\)", replace_query, code)

# 4. Replace db.prepare(q).get(params) -> (await pool.query(q, [params])).rows[0]
def replace_get(match):
    q = match.group(1)
    params = match.group(2).strip()
    if params:
        return f"(await pool.query({q}, [{params}])).rows[0]"
    return f"(await pool.query({q})).rows[0]"

code = re.sub(r"db\.prepare\((['`].+?['`])\)\.get\((.*?)\)", replace_get, code)

# 5. Replace db.prepare(q).all(params) -> (await pool.query(q, [params])).rows
def replace_all(match):
    q = match.group(1)
    params = match.group(2).strip()
    if params:
        return f"(await pool.query({q}, [{params}])).rows"
    return f"(await pool.query({q})).rows"

code = re.sub(r"db\.prepare\((['`].+?['`])\)\.all\((.*?)\)", replace_all, code)

# 6. Replace db.prepare(q).run(params) -> await pool.query(q, [params])
def replace_run(match):
    q = match.group(1)
    params = match.group(2).strip()
    if params:
        return f"await pool.query({q}, [{params}])"
    return f"await pool.query({q})"

code = re.sub(r"db\.prepare\((['`].+?['`])\)\.run\((.*?)\)", replace_run, code)

# 7. DB init
new_db_init = """const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
"""
code = re.sub(r"const dbPath = process\.env\.DATABASE_PATH.*?const db = new Database\(dbPath\);", new_db_init, code, flags=re.DOTALL)

with open('index_pg.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Refactor complete!")
