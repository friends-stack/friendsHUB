import re

with open('server/index.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("=== DB Calls lacking 'await' ===")
for i, line in enumerate(lines, 1):
    stripped = line.strip()
    if 'db.prepare(' in stripped:
        # Check if line does not start with '//' and doesn't contain 'await'
        if not stripped.startswith('//') and 'await' not in line:
            # Maybe the await is on the next line? Or maybe it's saved to a variable and awaited later?
            # Usually, they are chained like `db.prepare(...).all(...)` or `.get(...)` or `.run(...)`
            print(f"Line {i}: {stripped[:120]}")
