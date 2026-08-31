import zipfile
import xml.etree.ElementTree as ET
import os
import json
from datetime import datetime, timedelta

def get_rows(file_path, has_header=True):
    try:
        with zipfile.ZipFile(file_path) as z:
            shared_strings = []
            if 'xl/sharedStrings.xml' in z.namelist():
                ss_tree = ET.parse(z.open('xl/sharedStrings.xml'))
                root = ss_tree.getroot()
                ns = {'ns': root.tag.split('}')[0].strip('{')} if '}' in root.tag else {}
                ns_prefix = f"{{{ns['ns']}}}" if ns else ""
                
                for si in root.findall(f"{ns_prefix}si"):
                    t_text = []
                    for t in si.findall(f"{ns_prefix}t"):
                        if t.text:
                            t_text.append(t.text)
                    for r in si.findall(f"{ns_prefix}r"):
                        for t in r.findall(f"{ns_prefix}t"):
                            if t.text:
                                t_text.append(t.text)
                    shared_strings.append("".join(t_text))
            
            sheet_path = 'xl/worksheets/sheet1.xml'
            if sheet_path in z.namelist():
                sheet_tree = ET.parse(z.open(sheet_path))
                root = sheet_tree.getroot()
                ns = {'ns': root.tag.split('}')[0].strip('{')} if '}' in root.tag else {}
                ns_prefix = f"{{{ns['ns']}}}" if ns else ""
                
                rows_data = []
                for row in root.findall(f".//{ns_prefix}row"):
                    row_idx = int(row.get('r', 0))
                    row_cells = {}
                    for cell in row.findall(f"{ns_prefix}c"):
                        cell_ref = cell.get('r')
                        col_letter = ''.join([c for c in cell_ref if c.isalpha()])
                        val_node = cell.find(f"{ns_prefix}v")
                        val = ""
                        if val_node is not None:
                            val = val_node.text or ""
                            cell_type = cell.get('t')
                            if cell_type == 's' and val != "":
                                idx = int(val)
                                if idx < len(shared_strings):
                                    val = shared_strings[idx]
                        row_cells[col_letter] = val
                    
                    is_empty = all(v.strip() == "" for v in row_cells.values())
                    if not is_empty:
                        rows_data.append((row_idx, row_cells))
                
                grid = []
                for r_idx, r_cells in rows_data:
                    def col_to_num(col):
                        num = 0
                        for c in col:
                            num = num * 26 + (ord(c.upper()) - ord('A') + 1)
                        return num
                    
                    sorted_cols = sorted(r_cells.keys(), key=col_to_num)
                    max_col_num = col_to_num(sorted_cols[-1]) if sorted_cols else 0
                    row_list = []
                    for i in range(1, max_col_num + 1):
                        col_let = ""
                        temp = i
                        while temp > 0:
                            modulo = (temp - 1) % 26
                            col_let = chr(65 + modulo) + col_let
                            temp = (temp - modulo) // 26
                        row_list.append(r_cells.get(col_let, "").strip())
                    grid.append(row_list)
                
                if has_header and grid:
                    headers = grid[0]
                    data_rows = []
                    for r in grid[1:]:
                        row_dict = {}
                        for i, h in enumerate(headers):
                            if i < len(r):
                                row_dict[h] = r[i]
                            else:
                                row_dict[h] = ""
                        data_rows.append(row_dict)
                    return data_rows
                else:
                    return grid
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return []

def excel_date_to_str(excel_date):
    try:
        val = float(excel_date)
        dt = datetime(1899, 12, 30) + timedelta(days=val)
        return dt.strftime('%Y-%m-%d')
    except Exception:
        return str(excel_date)

db_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "OfficersInspection-931750319-26-08-22-20260824T043528Z-1-001", "OfficersInspection-931750319-26-08-22")

def get_image_files(sub_folder):
    full_path = os.path.join(db_dir, sub_folder)
    if os.path.exists(full_path):
        prefix = f"OfficersInspection-931750319-26-08-22-20260824T043528Z-1-001/OfficersInspection-931750319-26-08-22/{sub_folder}"
        return [f"{prefix}/{f}" for f in os.listdir(full_path) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    return []

# Load image lists
school_images = get_image_files("SchoolAshram 2_Images")
anganwadi_images = get_image_files("Anganwadi_Images")
health_images = get_image_files("Health_Images")
vet_images = get_image_files("VetServices_Images")
suposhan_images = get_image_files("SuposhanCentres_Images")

print(f"Images found - School: {len(school_images)}, Anganwadi: {len(anganwadi_images)}, Health: {len(health_images)}, Vet: {len(vet_images)}")

# 1. Parse formap.xlsx for GIS mapping
formap_rows = get_rows(os.path.join(db_dir, "formap.xlsx"), has_header=True)
coords_map = {}
for r in formap_rows:
    name = r.get("Name", "").strip()
    loc = r.get("Location", "").strip()
    if name and loc and "," in loc:
        try:
            lat, lng = loc.split(",")
            coords_map[name.lower()] = {"lat": float(lat), "lng": float(lng)}
        except Exception:
            pass

# 2. Parse officers
officer_rows = get_rows(os.path.join(db_dir, "officer.xlsx"), has_header=True)
officers = []
for r in officer_rows:
    oid = r.get("ID", "").strip()
    name = r.get("Name", "").strip()
    if name:
        designation = "Officer"
        if "Collector" in name:
            designation = "Collector"
        elif "CEO" in name:
            designation = "CEO ZP"
        elif "SDM" in name:
            designation = "SDM"
        elif "Tahsildar" in name:
            designation = "Tahsildar"
        elif "BMO" in name:
            designation = "BMO"
        elif "EE" in name:
            designation = "Executive Engineer"
        elif "DPO" in name:
            designation = "DPO"
        
        officers.append({
            "id": "O" + str(int(float(oid))) if oid else name,
            "name": name,
            "designation": designation
        })

# 3. Parse Schools
school_rows = get_rows(os.path.join(db_dir, "SCHOOLS.xlsx"), has_header=True)
schools = []
for r in school_rows:
    sid = r.get("ID", "").strip()
    block = r.get("Block", "").strip()
    panchayat = r.get("VillagePanchayat", "").strip()
    village = r.get("Village", "").strip()
    school_name = r.get("School", "").strip()
    if school_name:
        coords = coords_map.get(school_name.lower())
        lat, lng = "", ""
        if coords:
            lat, lng = coords["lat"], coords["lng"]
        
        schools.append({
            "id": "S" + str(int(float(sid))) if sid else school_name,
            "name": school_name,
            "block": block,
            "panchayat": panchayat,
            "village": village,
            "latitude": lat,
            "longitude": lng
        })

# 4. Parse Anganwadis
awc_rows = get_rows(os.path.join(db_dir, "AWC.xlsx"), has_header=True)
awc_gps_rows = get_rows(os.path.join(db_dir, "AWCs.xlsx"), has_header=True)

# create gps map for anganwadis
awc_gps_map = {}
for r in awc_gps_rows:
    name = r.get("AWC Name", "").strip()
    lat = r.get("Latitude", "").strip()
    lng = r.get("Longitude", "").strip()
    code = r.get("Awc Code", "").strip()
    if name and lat and lng:
        awc_gps_map[name.lower()] = {"lat": float(lat), "lng": float(lng), "code": code}

anganwadis = []
for r in awc_rows:
    aid = r.get("ID", "").strip()
    block = r.get("Block", "").strip()
    sector = r.get("Sector", "").strip()
    village = r.get("Village", "").strip()
    name = r.get("Anganwadi", "").strip()
    if name:
        coords = awc_gps_map.get(name.lower())
        lat, lng, code = "", "", ""
        if coords:
            lat, lng, code = coords["lat"], coords["lng"], coords["code"]
        
        anganwadis.append({
            "id": "A" + str(int(float(aid))) if aid else name,
            "name": name,
            "block": block,
            "sector": sector,
            "village": village,
            "latitude": lat,
            "longitude": lng,
            "code": code
        })

# 5. Parse Health Centers
health_rows_raw = get_rows(os.path.join(db_dir, "centers.xlsx"), has_header=False)
health_centers = []
for r in health_rows_raw:
    if len(r) >= 4:
        hid = r[0].strip()
        block = r[1].strip()
        village = r[2].strip()
        name = r[3].strip()
        if name:
            coords = coords_map.get(name.lower())
            lat, lng = "", ""
            if coords:
                lat, lng = coords["lat"], coords["lng"]
            
            health_centers.append({
                "id": "H" + str(int(float(hid))) if hid else name,
                "name": name,
                "block": block,
                "village": village,
                "latitude": lat,
                "longitude": lng
            })

# 6. Parse Veterinary Clinics
vet_rows = get_rows(os.path.join(db_dir, "VET.xlsx"), has_header=True)
vet_centers = []
for r in vet_rows:
    vid = r.get("ID", "").strip()
    block = r.get("BLOCK", "").strip()
    village = r.get("VILLAGE", "").strip()
    name = r.get("VETCENTER", "").strip()
    lat = r.get("Latitude", "").strip()
    lng = r.get("Longitude", "").strip()
    if name:
        vet_centers.append({
            "id": "V" + str(int(float(vid))) if vid else name,
            "name": name,
            "block": block,
            "village": village,
            "latitude": float(lat) if lat else "",
            "longitude": float(lng) if lng else ""
        })

# 7. Parse historical inspections from Anganwadi.xlsx
inspections_raw = get_rows(os.path.join(db_dir, "Anganwadi.xlsx"), has_header=True)
inspections = []
for idx, r in enumerate(inspections_raw):
    iid = r.get("ID", "").strip()
    if not iid or iid == "#REF!":
        iid = f"insp_{idx}"
    
    date_val = r.get("भ्रमण दिनांक ", "").strip()
    date_str = excel_date_to_str(date_val)
    
    photo_rel = r.get("Image", "").strip()
    photo_path = f"OfficersInspection-931750319-26-08-22-20260824T043528Z-1-001/OfficersInspection-931750319-26-08-22/{photo_rel}" if photo_rel else ""
    
    inspections.append({
        "id": iid,
        "departmentId": 1, # School
        "block": r.get("जनपद पंचायत\t\t", "").strip(),
        "panchayat": r.get("ग्राम पंचायत ", "").strip(),
        "village": r.get("आश्रित ग्राम ", "").strip(),
        "facilityName": r.get("शाला का नाम ", "").strip(),
        "date": date_str,
        "officerName": r.get("अधिकारी का नाम एवं पदनाम ", "").strip(),
        "status": "Submitted",
        "remarks": r.get("अधिकारी का टीप ", "").strip(),
        "photo": photo_path,
        "actionTaken": r.get("विभाग द्वारा किया गया कार्यवाही", "").strip(),
        "actionPhoto": r.get("विभाग द्वारा अपलोड किया गया फोटो", "").strip(),
        "responses": {
            "opens_on_time": r.get("1. क्या शाला नियत समय पर खुलता है ?         ", "").strip(),
            "teachers_regular": r.get("2. क्या स्कूल में पदस्थ शिक्षकों की उपस्थिती नियमित है? ", "").strip(),
            "irregular_teachers": r.get("2a. यदि नही तो नियमित नही आने वालें शिक्षकों की नाम", "").strip(),
            "mdm_quality": r.get("3. शाला मे मध्याह्न भोजन की उपलब्धता एवं गुणवत्तता ", "").strip(),
            "superintendent_regular": r.get("4. क्या आश्रम / छात्रावास मे पदस्थ अधीक्षक एवं स्टाफ की उपस्थिति नियमित है? ", "").strip(),
            "toilet_condition": r.get("5. शाला / आश्रम/ छात्रावास मे शौचालय की स्थिति  ", "").strip(),
            "security_available": r.get("6, आश्रम / छात्रावास मे सुरक्षा की उपलब्धता ", "").strip(),
            "female_guard": r.get("7. यदि कन्या छात्रावास है तो महिला गार्ड है या नही? ", "").strip(),
            "cctv_status": r.get("8. कन्या आश्रम/छात्रावास मे सीसीटीवी लगा एवं चालू स्थिति मे है ? ", "").strip(),
            "building_condition": r.get("9. आश्रम शाला भवन की स्थिति ?", "").strip(),
            "boundary_wall": r.get("10. आश्रम छात्रावास मे आहता निर्मित है? ", "").strip(),
            "pdld_status": r.get("11. PDLD एवं पीडीएलडी+ अनुसार बेसलाईन एवं प्रगति की सभी एंट्री किया जा रहा है ? ", "").strip(),
            "education_quality": r.get("12.  शिक्षा की गुणवत्ता कैसी है", "").strip()
        }
    })

# 8. Seed Physical Construction Projects
physical_projects = [
    {
        "id": "PPROJ_1",
        "name": "New Secondary School Building Construction",
        "type": "School Building",
        "department": "School & Hostel",
        "block": "DANTEWADA (221622)",
        "village": "Teknar",
        "latitude": 18.8893,
        "longitude": 81.3129,
        "targetDate": "2026-12-31",
        "status": "In Progress",
        "currentStage": "Structure",
        "progressPercent": 70,
        "visits": [
            {
                "id": "PV_1_1",
                "date": "2026-05-10",
                "stage": "Foundation",
                "progressPercent": 20,
                "officerName": "Sh Rajesh Kumar Patre Addl Collector",
                "remarks": "Foundation excavation and footing concreting checked. Material quality is up to mark.",
                "photo": school_images[0] if len(school_images) > 0 else ""
            },
            {
                "id": "PV_1_2",
                "date": "2026-06-25",
                "stage": "Plinth",
                "progressPercent": 40,
                "officerName": "Sh Kumar Biswaranjan CEO ZP",
                "remarks": "Plinth masonry filling and DPC completed. Columns structure reinforcement being prepared.",
                "photo": school_images[1] if len(school_images) > 1 else ""
            },
            {
                "id": "PV_1_3",
                "date": "2026-08-15",
                "stage": "Structure",
                "progressPercent": 70,
                "officerName": "Sh Mayank Chaturvedi Collector",
                "remarks": "Brick masonry work is in progress. Lintels and columns look clean. Shuttering for the roof slab is ongoing.",
                "photo": school_images[2] if len(school_images) > 2 else ""
            }
        ]
    },
    {
        "id": "PPROJ_2",
        "name": "Model Anganwadi Center Construction",
        "type": "Anganwadi Building",
        "department": "Anganwadi",
        "block": "GEEDAM (221608)",
        "village": "Bangapal",
        "latitude": 18.5289,
        "longitude": 81.2156,
        "targetDate": "2026-10-15",
        "status": "In Progress",
        "currentStage": "Finishing",
        "progressPercent": 90,
        "visits": [
            {
                "id": "PV_2_1",
                "date": "2026-04-12",
                "stage": "Foundation",
                "progressPercent": 20,
                "officerName": "Sh Jayant Nahata SDM Dantewada",
                "remarks": "Layout checked and excavation for the foundation columns started.",
                "photo": anganwadi_images[0] if len(anganwadi_images) > 0 else ""
            },
            {
                "id": "PV_2_2",
                "date": "2026-06-05",
                "stage": "Plinth",
                "progressPercent": 45,
                "officerName": "Sh Rajesh Kumar Patre Addl Collector",
                "remarks": "Plinth height checked. Good compaction of soil done. Wall construction initiated.",
                "photo": anganwadi_images[1] if len(anganwadi_images) > 1 else ""
            },
            {
                "id": "PV_2_3",
                "date": "2026-07-20",
                "stage": "Roofing",
                "progressPercent": 80,
                "officerName": "Sh Kumar Biswaranjan CEO ZP",
                "remarks": "Roof slab concrete poured and curing is under progress. Brickwork completed.",
                "photo": anganwadi_images[2] if len(anganwadi_images) > 2 else ""
            },
            {
                "id": "PV_2_4",
                "date": "2026-08-22",
                "stage": "Finishing",
                "progressPercent": 90,
                "officerName": "Sh Mayank Chaturvedi Collector",
                "remarks": "Plastering done, window grills installed. Painting starting. Handover expected in 2 weeks.",
                "photo": anganwadi_images[3] if len(anganwadi_images) > 3 else ""
            }
        ]
    },
    {
        "id": "PPROJ_3",
        "name": "Additional Clinic and Ward Extension Block",
        "type": "CHC Extension",
        "department": "Health",
        "block": "KUAKONDA (221631)",
        "village": "Kuakonda",
        "latitude": 18.7335,
        "longitude": 81.3328,
        "targetDate": "2027-01-30",
        "status": "In Progress",
        "currentStage": "Plinth",
        "progressPercent": 40,
        "visits": [
            {
                "id": "PV_3_1",
                "date": "2026-07-02",
                "stage": "Foundation",
                "progressPercent": 20,
                "officerName": "Sh Rajesh Kumar Patre Addl Collector",
                "remarks": "Excavation and brick layout for column footings. Instructed constructor to cover the curing process thoroughly.",
                "photo": health_images[0] if len(health_images) > 0 else ""
            },
            {
                "id": "PV_3_2",
                "date": "2026-08-12",
                "stage": "Plinth",
                "progressPercent": 40,
                "officerName": "Sh Jayant Nahata SDM Dantewada",
                "remarks": "Plinth walls constructed. Recommended speed up as rain might affect backfilling.",
                "photo": health_images[1] if len(health_images) > 1 else ""
            }
        ]
    },
    {
        "id": "PPROJ_4",
        "name": "Community Health Subcenter Reconstruction",
        "type": "PHC Building",
        "department": "Health",
        "block": "KATEKALYAN (221615)",
        "village": "Katekalyan",
        "latitude": 18.8058,
        "longitude": 81.3454,
        "targetDate": "2026-11-20",
        "status": "In Progress",
        "currentStage": "Foundation",
        "progressPercent": 20,
        "visits": [
            {
                "id": "PV_4_1",
                "date": "2026-08-18",
                "stage": "Foundation",
                "progressPercent": 20,
                "officerName": "Sh Kumar Biswaranjan CEO ZP",
                "remarks": "Excavation started. Brick lining in progress. Contractor was advised to install safety signs.",
                "photo": health_images[2] if len(health_images) > 2 else ""
            }
        ]
    },
    {
        "id": "PPROJ_5",
        "name": "Veterinary Clinic Shed and Storage Room",
        "type": "Vet Clinic",
        "department": "Veterinary",
        "block": "DANTEWADA (221622)",
        "village": "Bhansi",
        "latitude": 18.8338,
        "longitude": 81.2606,
        "targetDate": "2026-09-30",
        "status": "Completed",
        "currentStage": "Completed",
        "progressPercent": 100,
        "visits": [
            {
                "id": "PV_5_1",
                "date": "2026-06-01",
                "stage": "Foundation",
                "progressPercent": 25,
                "officerName": "Sh Jayant Nahata SDM Dantewada",
                "remarks": "Layout checked and foundation columns concreting finished.",
                "photo": vet_images[0] if len(vet_images) > 0 else ""
            },
            {
                "id": "PV_5_2",
                "date": "2026-07-10",
                "stage": "Structure",
                "progressPercent": 65,
                "officerName": "Sh Rajesh Kumar Patre Addl Collector",
                "remarks": "Brick masonry work finished. Metal roof trusses are being mounted.",
                "photo": vet_images[1] if len(vet_images) > 1 else ""
            },
            {
                "id": "PV_5_3",
                "date": "2026-08-20",
                "stage": "Completed",
                "progressPercent": 100,
                "officerName": "Sh Mayank Chaturvedi Collector",
                "remarks": "Tin sheets installed, plastering and floor screed completed. Clean and ready to use.",
                "photo": vet_images[2] if len(vet_images) > 2 else ""
            }
        ]
    }
]

# Create output object
db_js_content = f"""// Auto-generated Database from Excel files
// Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

const REAL_DATABASE = {{
  officers: {json.dumps(officers, indent=2, ensure_ascii=False)},
  schools: {json.dumps(schools, indent=2, ensure_ascii=False)},
  anganwadis: {json.dumps(anganwadis, indent=2, ensure_ascii=False)},
  health_centers: {json.dumps(health_centers, indent=2, ensure_ascii=False)},
  vet_centers: {json.dumps(vet_centers, indent=2, ensure_ascii=False)},
  inspections: {json.dumps(inspections, indent=2, ensure_ascii=False)},
  physical_projects: {json.dumps(physical_projects, indent=2, ensure_ascii=False)}
}};

if (typeof module !== 'undefined' && module.exports) {{
  module.exports = REAL_DATABASE;
}}
"""

out_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "js", "database.js")
with open(out_file_path, "w", encoding="utf-8") as f:
    f.write(db_js_content)

print(f"SUCCESS: Compiled database successfully to {out_file_path}!")
