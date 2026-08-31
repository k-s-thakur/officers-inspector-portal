import sys
import os
import re
import json
import urllib.request
import urllib.error

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 seed_database.py <GOOGLE_APPS_SCRIPT_WEB_APP_URL>")
        sys.exit(1)
        
    url = sys.argv[1]
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "js", "database.js")
    
    print("Reading local database compiled JS...")
    try:
        with open(db_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading {db_path}: {e}")
        sys.exit(1)
        
    start_tag = "const REAL_DATABASE = "
    start_idx = content.find(start_tag)
    if start_idx == -1:
        print("Error: Could not find REAL_DATABASE in database.js")
        sys.exit(1)
        
    json_start = start_idx + len(start_tag)
    end_idx = content.rfind("};")
    if end_idx == -1:
        print("Error: Could not find ending of REAL_DATABASE object")
        sys.exit(1)
        
    raw_json = content[json_start:end_idx+1].strip()
    
    # Standardize JavaScript object keys to valid JSON keys
    keys = ["officers", "schools", "anganwadis", "health_centers", "vet_centers", "inspections", "physical_projects"]
    for k in keys:
        raw_json = re.sub(rf"\b{k}\s*:", f'"{k}":', raw_json)
        
    try:
        db_obj = json.loads(raw_json)
    except Exception as e:
        print(f"Error parsing database JSON: {e}")
        print("Raw JSON snippet:")
        print(raw_json[:200])
        sys.exit(1)
        
    payload = {
        "action": "seed",
        "database": db_obj
    }
    
    req_data = json.dumps(payload).encode("utf-8")
    
    print("Uploading data to Google Sheets via Google Apps Script Web App...")
    
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={"Content-Type": "application/json"}
    )
    
    try:
        # urllib follows 302 redirects automatically, transforming POST to GET.
        with urllib.request.urlopen(req) as response:
            res_content = response.read().decode("utf-8")
            print("\nResponse from Apps Script:")
            print(res_content)
    except urllib.error.HTTPError as e:
        print(f"\nHTTP Error: {e.code} - {e.reason}")
        try:
            print(e.read().decode("utf-8"))
        except Exception:
            pass
    except Exception as e:
        print(f"\nNetwork error: {e}")

if __name__ == "__main__":
    main()
