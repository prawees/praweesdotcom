import re

def extract_schema(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    match = re.search(r'<script type="application/ld\+json">.*?</script>', content, re.DOTALL)
    return match.group(0) if match else ""

def inject_schema(new_file_path, dest_path, schema_content):
    with open(new_file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # insert before </head>
    head_close_idx = content.find('</head>')
    if head_close_idx != -1:
        new_content = content[:head_close_idx] + schema_content + '\n' + content[head_close_idx:]
        with open(dest_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
    else:
        print(f"Could not find </head> in {new_file_path}")

old_index = "index.html"
old_about = "about/index.html"
new_index = "Prawees.com New Design/index.html"
new_about = "Prawees.com New Design/about/index.html"

schema_index = extract_schema(old_index)
schema_about = extract_schema(old_about)

print("Schema index length:", len(schema_index))
print("Schema about length:", len(schema_about))

inject_schema(new_index, old_index, schema_index)
inject_schema(new_about, old_about, schema_about)

print("Updated files.")
