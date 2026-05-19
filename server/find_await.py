import re

with open('server/index.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Track async context by scanning for function declarations
# Find non-async callbacks that contain await
print("=== Non-async callbacks that might contain await ===")
for i, line in enumerate(lines, 1):
    # Detect non-async arrow function or regular function that opens a block
    if re.search(r'socket\.on\(|io\.on\(', line):
        if '=>' in line and 'async' not in line:
            print(f"NON-ASYNC socket handler at line {i}: {line.rstrip()}")
    # Check cron callbacks
    if 'cron.schedule(' in line:
        if '=>' in line and 'async' not in line:
            print(f"NON-ASYNC cron at line {i}: {line.rstrip()}")

print("\n=== Looking for await inside specific known non-async callbacks ===")
# Find socket handler boundaries and check for await inside them  
in_non_async = False
brace_counter = 0
non_async_start = 0
for i, line in enumerate(lines, 1):
    if not in_non_async:
        if (re.search(r'socket\.on\(', line) or re.search(r'bot\.on\(', line)) and '=>' in line and 'async' not in line:
            in_non_async = True
            brace_counter = line.count('{') - line.count('}')
            non_async_start = i
            print(f"\nEntered non-async callback at line {i}: {line.rstrip()}")
    else:
        brace_counter += line.count('{') - line.count('}')
        if 'await' in line and not line.strip().startswith('//'):
            print(f"  AWAIT at line {i}: {line.rstrip()}")
        if brace_counter <= 0:
            in_non_async = False
            print(f"  Exited callback at line {i}")

print("\nDone!")
