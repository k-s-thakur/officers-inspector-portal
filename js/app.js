// Collector Portal - Core Frontend Application Logic

let API_URL = "";

async function loadEnv() {
  try {
    const res = await fetch(".env", { cache: "no-store" });
    if (!res.ok) return;

    const envText = await res.text();
    envText.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) return;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "API_URL") {
        API_URL = value;
      }
    });
  } catch (err) {
    console.warn("Unable to load .env. Using local static database.js.", err);
  }
}

// Application State
let state = {
  activeTab: 'dashboard',
  activeMasterTab: 'school',
  currentOfficerId: 'O1',
  officers: [],
  schools: [],
  anganwadis: [],
  health_centers: [],
  vet_centers: [],
  inspections: [],
  physical_projects: [],
  hierarchy: {},
  drafts: {}
};

// Leaflet map instances
let mainMap = null;
let dashboardMap = null;
let mainMapMarkers = [];

// Chart.js instances
let deptChart = null;
let statusChart = null;
let officerChart = null;

// Form Auto-Save Timer
let autoSaveInterval = null;

// Helper: Normalize block name to standard key (fuzzy & multilingual)
function getNormalizedBlockKey(blockStr) {
  if (!blockStr) return "";
  const b = blockStr.toString().toUpperCase().replace(/\s+/g, '');
  if (b.includes("DANT") || b.includes("दंतेवा")) return "DANTEWADA";
  if (b.includes("GEED") || b.includes("गीद") || b.includes("गीड")) return "GEEDAM";
  if (b.includes("KATE") || b.includes("कटेक")) return "KATEKALYAN";
  if (b.includes("KUA") || b.includes("KUWA") || b.includes("कुआ") || b.includes("कुंआ") || b.includes("कुवा")) return "KUAKONDA";
  return "";
}

// Resilient hierarchy source getter
function getHierarchySource() {
  if (state.hierarchy && Object.keys(state.hierarchy).length > 0) {
    return state.hierarchy;
  }
  if (typeof REAL_DATABASE !== 'undefined' && REAL_DATABASE && REAL_DATABASE.hierarchy) {
    return REAL_DATABASE.hierarchy;
  }
  if (typeof window !== 'undefined' && window.REAL_DATABASE && window.REAL_DATABASE.hierarchy) {
    return window.REAL_DATABASE.hierarchy;
  }
  return {};
}

// Helper: Populate Location Dropdowns (Gram Panchayat & Village)
function populateLocationSelects(blockVal, gpSelectId, villageSelectId, selectedGp = "", selectedVillage = "") {
  const gpSelect = document.getElementById(gpSelectId);
  const villageSelect = document.getElementById(villageSelectId);
  if (!gpSelect || !villageSelect) return;
  
  const normBlock = getNormalizedBlockKey(blockVal);
  const hierarchySource = getHierarchySource();
  const blockData = normBlock ? hierarchySource[normBlock] : null;
  
  gpSelect.innerHTML = '<option value="">सभी ग्राम पंचायत (All GPs)</option>';
  villageSelect.innerHTML = '<option value="">सभी ग्राम (All Villages)</option>';
  
  if (blockData && blockData.panchayats) {
    const gpList = Object.keys(blockData.panchayats).sort((a, b) => a.localeCompare(b));
    gpList.forEach(gp => {
      const opt = document.createElement('option');
      opt.value = gp;
      opt.innerText = gp;
      if (selectedGp && (selectedGp.toLowerCase() === gp.toLowerCase() || selectedGp === gp)) {
        opt.selected = true;
      }
      gpSelect.appendChild(opt);
    });
    
    let villageList = [];
    if (selectedGp) {
      const matchedKey = Object.keys(blockData.panchayats).find(k => k.toLowerCase() === selectedGp.toLowerCase());
      if (matchedKey && blockData.panchayats[matchedKey] && blockData.panchayats[matchedKey].length > 0) {
        villageList = blockData.panchayats[matchedKey];
      }
    }
    if (!villageList || villageList.length === 0) {
      villageList = blockData.villages || [];
    }
    
    const uniqueVillages = Array.from(new Set(villageList)).sort((a, b) => a.localeCompare(b));
    uniqueVillages.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.innerText = v;
      if (selectedVillage && (selectedVillage.toLowerCase() === v.toLowerCase() || selectedVillage === v)) {
        opt.selected = true;
      }
      villageSelect.appendChild(opt);
    });
  }
}

// Helper: Normalize location string for fuzzy & multilingual matching
function normalizeLocationString(str) {
  if (!str) return "";
  let s = str.toString().trim().toLowerCase();
  s = s.replace(/दंतेवाड़ा|दंतेवाड़ा/g, "dantewada")
       .replace(/गीदम/g, "geedam")
       .replace(/कटेकल्याण/g, "katekalyan")
       .replace(/कुआकोंडा|कुवाकोंडा|कुआकोन्डा/g, "kuakonda")
       .replace(/बालूद/g, "balud")
       .replace(/कारली/g, "karli")
       .replace(/मुंडेर/g, "munder")
       .replace(/[\s\-_().]/g, '');
  return s;
}

// Helper: Query all facilities across departments with location filtering
function getFacilitiesByLocation(options = {}) {
  const { block = "", panchayat = "", village = "", deptId = "" } = options;
  const normBlock = getNormalizedBlockKey(block);
  const cleanV = (village || "").trim();
  const cleanGp = (panchayat || "").trim();
  const normV = normalizeLocationString(cleanV);
  const normGp = normalizeLocationString(cleanGp);
  const dId = String(deptId || "");

  let list = [];

  // Schools (Dept 1)
  if (!dId || dId === "1") {
    (state.schools || []).forEach(s => {
      list.push({
        id: s.id,
        name: s.name,
        deptId: 1,
        category: "School & Hostel",
        badge: getDeptBadge(1),
        block: s.block,
        panchayat: s.panchayat || "",
        village: s.village || "",
        latitude: s.latitude || "",
        longitude: s.longitude || "",
        source: 'school'
      });
    });
  }

  // Health Centers (Dept 2)
  if (!dId || dId === "2") {
    (state.health_centers || []).forEach(h => {
      list.push({
        id: h.id,
        name: h.name,
        deptId: 2,
        category: "Health Center",
        badge: getDeptBadge(2),
        block: h.block,
        panchayat: h.village || "",
        village: h.village || "",
        latitude: h.latitude || "",
        longitude: h.longitude || "",
        source: 'health'
      });
    });
  }

  // Anganwadis (Dept 3)
  if (!dId || dId === "3") {
    (state.anganwadis || []).forEach(a => {
      list.push({
        id: a.id,
        name: a.name,
        deptId: 3,
        category: "Anganwadi Center",
        badge: getDeptBadge(3),
        block: a.block,
        panchayat: a.sector || "",
        village: a.village || "",
        latitude: a.latitude || "",
        longitude: a.longitude || "",
        code: a.code || "",
        source: 'anganwadi'
      });
    });
  }

  // Veterinary Centers (Dept 4)
  if (!dId || dId === "4") {
    (state.vet_centers || []).forEach(v => {
      list.push({
        id: v.id,
        name: v.name,
        deptId: 4,
        category: "Veterinary Clinic",
        badge: getDeptBadge(4),
        block: v.block,
        panchayat: v.village || "",
        village: v.village || "",
        latitude: v.latitude || "",
        longitude: v.longitude || "",
        source: 'vet'
      });
    });
  }

  // Filter by block if provided
  if (normBlock) {
    list = list.filter(item => {
      const bKey = getNormalizedBlockKey(item.block);
      return bKey === normBlock;
    });
  }

  // Filter by village / panchayat if provided
  if (normV) {
    list = list.filter(item => {
      const itemV = normalizeLocationString(item.village);
      const itemP = normalizeLocationString(item.panchayat);
      const itemN = normalizeLocationString(item.name);
      const matchV = itemV && (itemV === normV || itemV.includes(normV) || normV.includes(itemV));
      const matchP = itemP && (itemP === normV || itemP.includes(normV) || normV.includes(itemP));
      const matchN = itemN && itemN.includes(normV);
      return Boolean(matchV || matchP || matchN);
    });
  } else if (normGp) {
    list = list.filter(item => {
      const itemP = normalizeLocationString(item.panchayat);
      const itemV = normalizeLocationString(item.village);
      const matchP = itemP && (itemP === normGp || itemP.includes(normGp) || normGp.includes(itemP));
      const matchV = itemV && (itemV === normGp || itemV.includes(normGp) || normGp.includes(itemV));
      return Boolean(matchP || matchV);
    });
  }

  return list;
}

// Immediate initial state seed from REAL_DATABASE
if (typeof REAL_DATABASE !== 'undefined' && REAL_DATABASE && REAL_DATABASE.hierarchy) {
  state.hierarchy = REAL_DATABASE.hierarchy;
}

// Full Application Initialization
async function initApp() {
  await loadEnv();
  initializeDatabase();
  setupNavigation();
  populateHeaderOfficerSelect();
  switchTab('dashboard');
  
  // Set current date on New Inspection Form in DD/MM/YYYY
  const dateInput = document.getElementById('form-input-date');
  if (dateInput) {
    dateInput.value = getTodayDateDDMMYYYY();
    dateInput.addEventListener('blur', () => {
      const val = dateInput.value.trim();
      if (val) {
        dateInput.value = formatDateString(val);
      }
    });
  }
  
  // Load cached officer profile if available
  loadCachedOfficerInfo();
  
  // Setup auto-save drafts checking
  setupDraftAutoSave();
  
  // Wire change listeners directly on location selects
  const formBlock = document.getElementById('form-select-block');
  if (formBlock) {
    formBlock.removeEventListener('change', onFormBlockChanged);
    formBlock.addEventListener('change', onFormBlockChanged);
  }
  const formGp = document.getElementById('form-select-panchayat');
  if (formGp) {
    formGp.removeEventListener('change', onFormPanchayatChanged);
    formGp.addEventListener('change', onFormPanchayatChanged);
  }
  const formVillage = document.getElementById('form-select-village');
  if (formVillage) {
    formVillage.removeEventListener('change', onFormVillageChanged);
    formVillage.addEventListener('change', onFormVillageChanged);
  }
  
  // Handle Escape key to close feedback modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeInspectionFeedbackModal();
    }
  });

  // Fetch dynamic database from Google Sheets API
  fetchDatabase();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// 1. Initialize State from Compiled database.js & LocalStorage
function initializeDatabase() {
  if (typeof REAL_DATABASE !== 'undefined') {
    state.officers = [...REAL_DATABASE.officers];
    state.schools = [...REAL_DATABASE.schools];
    state.anganwadis = [...REAL_DATABASE.anganwadis];
    state.health_centers = [...REAL_DATABASE.health_centers];
    state.vet_centers = [...REAL_DATABASE.vet_centers];
    state.hierarchy = REAL_DATABASE.hierarchy ? JSON.parse(JSON.stringify(REAL_DATABASE.hierarchy)) : {};
    
    // Load custom inspections from localStorage & merge
    let customInsps = [];
    const savedInsps = localStorage.getItem('officers_inspector_portal_inspections');
    if (savedInsps) {
      try {
        customInsps = JSON.parse(savedInsps);
      } catch (e) {
        console.error("Error reading custom inspections", e);
      }
    }
    state.inspections = [...customInsps, ...REAL_DATABASE.inspections];

    // Load physical projects from localStorage & merge
    let customProjs = [];
    const savedProjs = localStorage.getItem('officers_inspector_portal_projects');
    if (savedProjs) {
      try {
        customProjs = JSON.parse(savedProjs);
      } catch (e) {
        console.error("Error reading custom projects", e);
      }
    }
    
    // Merge real database projects with custom ones, prioritizing custom/updated ones
    let baseProjects = [...REAL_DATABASE.physical_projects];
    let mergedProjects = [];
    
    baseProjects.forEach(bp => {
      const updated = customProjs.find(cp => cp.id === bp.id);
      if (updated) {
        mergedProjects.push(updated);
      } else {
        mergedProjects.push(bp);
      }
    });
    
    // Append any entirely new projects added by user
    customProjs.forEach(cp => {
      if (!baseProjects.some(bp => bp.id === cp.id)) {
        mergedProjects.push(cp);
      }
    });
    
    state.physical_projects = mergedProjects;
  }
  
  // Load drafts
  for (let key in localStorage) {
    if (key.startsWith('officers_inspector_portal_draft_')) {
      const deptId = key.replace('officers_inspector_portal_draft_', '');
      try {
        state.drafts[deptId] = JSON.parse(localStorage.getItem(key));
      } catch (e) {}
    }
  }
}

// Fetch database from Google Sheets API
async function fetchDatabase() {
  const finalApiUrl = API_URL;
  if (!finalApiUrl) {
    console.log("No API_URL configured. Using local static database.js.");
    return;
  }
  
  console.log("Fetching dynamic database from Google Sheets...");
  try {
    const res = await fetch(`${finalApiUrl}?action=getData`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    
    if (data.error) {
      console.error("API error:", data.error);
      return;
    }
    
    if (data.officers && data.officers.length > 0) {
      state.officers = [...data.officers];
    }
    if (data.schools && data.schools.length > 0) {
      state.schools = [...data.schools];
    }
    if (data.anganwadis && data.anganwadis.length > 0) {
      state.anganwadis = [...data.anganwadis];
    }
    if (data.health_centers && data.health_centers.length > 0) {
      state.health_centers = [...data.health_centers];
    }
    if (data.vet_centers && data.vet_centers.length > 0) {
      state.vet_centers = [...data.vet_centers];
    }
    
    // Merge inspections
    if (data.inspections) {
      const apiInspections = data.inspections.map(i => {
        let responses = i.responses || {};
        if (typeof responses === 'string') {
          try { responses = JSON.parse(responses); } catch(e) { responses = {}; }
        }
        return {
          id: i.id,
          departmentId: Number(i.departmentId || i.deptId || 1),
          block: i.block || "",
          panchayat: i.panchayat || "",
          village: i.village || "",
          facilityName: i.facilityName || "",
          date: i.date || "",
          officerName: i.officerName || "",
          status: i.status || "Submitted",
          remarks: i.remarks || "",
          photo: i.photo || "",
          actionTaken: i.actionTaken || "",
          actionPhoto: i.actionPhoto || "",
          responses: responses,
          synced: true
        };
      });
      
      const localOnly = state.inspections.filter(li => !apiInspections.some(ai => ai.id === li.id));
      state.inspections = [...localOnly, ...apiInspections];
      state.inspections.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    
    // Merge physical projects
    if (data.physical_projects) {
      const apiProjects = data.physical_projects.map(p => {
        let visits = p.visits || [];
        if (typeof visits === 'string') {
          try { visits = JSON.parse(visits); } catch(e) { visits = []; }
        }
        return {
          id: p.id,
          name: p.name,
          type: p.type,
          department: p.department,
          block: p.block,
          village: p.village,
          latitude: Number(p.latitude || 18.88),
          longitude: Number(p.longitude || 81.30),
          targetDate: p.targetDate,
          status: p.status,
          currentStage: p.currentStage,
          progressPercent: Number(p.progressPercent || 0),
          visits: visits,
          synced: true
        };
      });
      
      const localOnly = state.physical_projects.filter(lp => !apiProjects.some(ap => ap.id === lp.id));
      state.physical_projects = [...localOnly, ...apiProjects];
    }
    
    // Redraw lists, dashboards, and maps if they are active
    populateHeaderOfficerSelect();
    if (typeof updateDashboardMetrics === 'function') updateDashboardMetrics();
    if (typeof renderReportsTable === 'function') renderReportsTable();
    if (typeof renderPhysicalProjectsGrid === 'function') renderPhysicalProjectsGrid();
    
    // If maps libraries are loaded and elements exist, rebuild map
    if (typeof L !== 'undefined') {
      try {
        if (typeof renderMapMarkers === 'function') renderMapMarkers();
        if (typeof initDashboardMap === 'function' && document.getElementById('dashboard-mini-map')) initDashboardMap();
      } catch (me) {
        console.warn("Leaflet rebuild map error:", me);
      }
    }
    
    console.log("Successfully loaded dynamic data from Google Sheets.");
  } catch (err) {
    console.error("Failed to load database from Apps Script URL:", err);
  }
}

// Sync new inspection to Google Sheets API
async function syncInspectionToAPI(inspection) {
  const finalApiUrl = API_URL;
  if (!finalApiUrl) return true;
  
  const payload = {
    action: "addInspection",
    inspection: {
      id: inspection.id,
      departmentId: inspection.departmentId,
      block: inspection.block,
      panchayat: inspection.panchayat,
      village: inspection.village,
      facilityName: inspection.facilityName,
      date: inspection.date,
      officerName: inspection.officerName,
      status: inspection.status,
      remarks: inspection.remarks,
      photo: inspection.photo,
      actionTaken: inspection.actionTaken || "",
      actionPhoto: inspection.actionPhoto || "",
      responses: inspection.responses
    }
  };

  try {
    const res = await fetch(finalApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return (res.ok || res.type === 'opaque');
  } catch (err) {
    console.error("Failed to sync inspection to API:", err);
    return false;
  }
}

// Sync a project visit to Google Sheets API
async function syncProjectVisitToAPI(projectId, visit, progressPercent, currentStage, status) {
  const finalApiUrl = API_URL;
  if (!finalApiUrl) return true;
  
  const payload = {
    action: "addProjectVisit",
    projectId: projectId,
    visit: visit,
    progressPercent: progressPercent,
    currentStage: currentStage,
    status: status
  };

  try {
    const res = await fetch(finalApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return (res.ok || res.type === 'opaque');
  } catch (err) {
    console.error("Failed to sync project visit to API:", err);
    return false;
  }
}

// Sync new project to Google Sheets API
async function syncNewProjectToAPI(project) {
  const finalApiUrl = API_URL;
  if (!finalApiUrl) return true;
  
  const payload = {
    action: "addProject",
    project: project
  };

  try {
    const res = await fetch(finalApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    return (res.ok || res.type === 'opaque');
  } catch (err) {
    console.error("Failed to sync new project to API:", err);
    return false;
  }
}

// 2. Navigation System (SPA Tabs)
function toggleMobileSidebar(forceState) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  
  const isClosed = sidebar.classList.contains('-translate-x-full');
  const shouldOpen = forceState !== undefined ? forceState : isClosed;
  
  if (shouldOpen) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
    if (backdrop) backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0');
    if (backdrop) backdrop.classList.add('hidden');
  }
}

function switchTab(tabId) {
  state.activeTab = tabId;
  
  // Auto-close mobile sidebar drawer on tab switch
  if (window.innerWidth < 1024) {
    toggleMobileSidebar(false);
  }
  
  // Hide all sections
  const sections = ['dashboard', 'map', 'new-inspection', 'physical', 'reports', 'master'];
  sections.forEach(s => {
    const el = document.getElementById(`view-${s}`);
    if (el) {
      el.classList.add('hidden');
      el.classList.remove('block', 'flex');
    }
    
    // Update sidebar desktop buttons styling
    const btn = document.getElementById(`nav-btn-${s}`);
    if (btn) {
      if (s === tabId) {
        btn.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 text-white shadow-lg shadow-blue-600/10 transition-colors";
      } else {
        btn.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-slate-800 hover:text-white text-slate-400 transition-colors";
      }
    }

    // Update mobile bottom bar active state
    const mobBtn = document.getElementById(`mobile-nav-btn-${s}`);
    if (mobBtn) {
      if (s === tabId) {
        mobBtn.classList.add('active');
      } else {
        mobBtn.classList.remove('active');
      }
    }
  });
  
  // Show active section
  const activeSection = document.getElementById(`view-${tabId}`);
  if (activeSection) {
    if (tabId === 'map') {
      activeSection.classList.add('flex');
      activeSection.classList.remove('hidden');
    } else {
      activeSection.classList.add('block');
      activeSection.classList.remove('hidden');
    }
  }
  
  // Update header title
  const titles = {
    'dashboard': 'अधिकारी डैशबोर्ड (Dashboard)',
    'map': 'जीआईएस भौगोलिक निरीक्षण मानचित्र (GIS Map)',
    'new-inspection': 'आकस्मिक निरीक्षण फॉर्म (New Inspection)',
    'physical': 'निरीक्षण रिपोर्ट (Inspection Report)',
    'reports': 'निरीक्षण इतिहास लॉग एवं प्रतिवेदन (Reports)',
    'master': 'जिला मास्टर डेटाबेस एक्सप्लोरर (Master Data)'
  };
  document.getElementById('current-view-title').innerText = titles[tabId] || 'शासकीय निरीक्षण';
  
  // Trigger specific tab initializations
  if (tabId === 'dashboard') {
    updateDashboardMetrics();
    initDashboardCharts();
    initDashboardMap();
    if (dashboardMap) {
      setTimeout(() => dashboardMap.invalidateSize(), 150);
    }
  } else if (tabId === 'map') {
    initGISMap();
    if (mainMap) {
      setTimeout(() => mainMap.invalidateSize(), 150);
    }
  } else if (tabId === 'new-inspection') {
    loadCachedOfficerInfo();
    const dateInput = document.getElementById('form-input-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = getTodayDateDDMMYYYY();
    }
  } else if (tabId === 'physical') {
    populateTimelineFilters();
    renderInspectionTimelineTable();
  } else if (tabId === 'reports') {
    populateReportsFilters();
    renderReportsTable();
  } else if (tabId === 'master') {
    switchMasterSubTab(state.activeMasterTab);
  }
  
  // Update print date/time stamp
  const printEl = document.getElementById('print-timestamp');
  if (printEl) {
    printEl.innerText = `प्रिंट रिपोर्ट तिथि: ${formatDateString(new Date())} | समय: ${new Date().toLocaleTimeString('hi-IN')}`;
  }
}

function setupNavigation() {
  // Mobile sidebar toggle button
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMobileSidebar();
    });
  }
  
  // Close sidebar on outer click / escape on mobile
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleMobileSidebar(false);
      closeDetailModal();
      closeTimelineModal();
      closeNewProjectModal();
      closePhotoLightBox();
    }
  });

  // Window resize debounced listener to adjust maps and sidebar
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth >= 1024) {
        toggleMobileSidebar(false);
      }
      if (mainMap) mainMap.invalidateSize();
      if (dashboardMap) dashboardMap.invalidateSize();
    }, 200);
  });
}

function toggleMapFiltersMobile() {
  const body = document.getElementById('map-filters-body');
  const icon = document.getElementById('map-filter-toggle-icon');
  const text = document.getElementById('map-filter-toggle-text');
  if (!body) return;
  
  const isHidden = body.classList.contains('hidden');
  if (isHidden) {
    body.classList.remove('hidden');
    body.classList.add('block');
    if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
    if (text) text.innerText = 'छिपाएं';
  } else {
    body.classList.add('hidden');
    body.classList.remove('block');
    if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
    if (text) text.innerText = 'फ़िल्टर्स';
  }
  if (mainMap) {
    setTimeout(() => mainMap.invalidateSize(), 200);
  }
}

function populateHeaderOfficerSelect() {
  const select = document.getElementById('header-officer-select');
  if (!select) return;
  select.innerHTML = "";
  
  state.officers.forEach(off => {
    const opt = document.createElement('option');
    opt.value = off.id;
    opt.innerText = `${off.name} (${off.designation})`;
    select.appendChild(opt);
  });
  
  select.value = state.currentOfficerId;
}

function onGlobalOfficerChanged(val) {
  state.currentOfficerId = val;
  const off = state.officers.find(o => o.id === val);
  showToast("success", "अधिकारी बदला गया", `सक्रिय अधिकारी: ${off ? off.name : val}`);
}

// 3. Toast Notifications
function showToast(type, title, message) {
  const toast = document.getElementById('toast');
  const toastIconBg = document.getElementById('toast-icon-bg');
  const toastTitle = document.getElementById('toast-title');
  const toastMessage = document.getElementById('toast-message');
  
  if (!toast) return;
  
  toastTitle.innerText = title;
  toastMessage.innerText = message;
  
  // Set icons & colors based on type
  if (type === 'success') {
    toastIconBg.className = "w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm shrink-0";
    toastIconBg.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
  } else if (type === 'warning') {
    toastIconBg.className = "w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-sm shrink-0";
    toastIconBg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
  } else if (type === 'error') {
    toastIconBg.className = "w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center text-sm shrink-0";
    toastIconBg.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
  }
  
  // Show toast
  toast.classList.remove('translate-y-[-150%]');
  
  // Auto hide
  setTimeout(() => {
    toast.classList.add('translate-y-[-150%]');
  }, 4000);
}

// 4. Dashboard Logic
function updateDashboardMetrics() {
  document.getElementById('stat-total-submissions').innerText = state.inspections.length;
  document.getElementById('stat-active-officers').innerText = state.officers.length;
  document.getElementById('stat-physical-projects').innerText = state.physical_projects.length;
  
  // Compute visited villages count
  const villages = new Set();
  state.inspections.forEach(i => {
    if (i.village) villages.add(i.village.toLowerCase().strip ? i.village.toLowerCase().trim() : i.village.toLowerCase());
  });
  document.getElementById('stat-covered-villages').innerText = villages.size;
  
  // Compute today's inspections count
  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = state.inspections.filter(i => i.date === todayStr).length;
  document.getElementById('stat-today-submissions').innerText = todayCount;
}

function initDashboardCharts() {
  if (typeof Chart === 'undefined') return;
  // Chart 1: Department-wise Inspections Count
  const deptCounts = {1: 0, 2: 0, 3: 0, 4: 0, 6: 0};
  state.inspections.forEach(i => {
    const deptId = parseInt(i.departmentId);
    if (deptCounts[deptId] !== undefined) {
      deptCounts[deptId]++;
    }
  });

  const deptNames = ["School & Hostel", "Health", "Anganwadi", "Veterinary", "Food / PDS"];
  const deptValues = [deptCounts[1], deptCounts[2], deptCounts[3], deptCounts[4], deptCounts[6]];

  if (deptChart) deptChart.destroy();
  const ctx1 = document.getElementById('chart-dept-counts').getContext('2d');
  deptChart = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: deptNames,
      datasets: [{
        label: 'निरीक्षण संख्या (Inspections Count)',
        data: deptValues,
        backgroundColor: [
          'rgba(59, 130, 246, 0.75)', // blue
          'rgba(16, 185, 129, 0.75)', // emerald
          'rgba(245, 158, 11, 0.75)', // amber
          'rgba(244, 63, 94, 0.75)',  // rose
          'rgba(139, 92, 246, 0.75)'  // purple
        ],
        borderColor: [
          '#2563eb', '#059669', '#d97706', '#e11d48', '#7c3aed'
        ],
        borderWidth: 1.5,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#64748b', font: { size: 10 } },
          grid: { color: '#f1f5f9' }
        },
        x: {
          ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } },
          grid: { display: false }
        }
      }
    }
  });

  // Chart 2: Status breakdown (Draft vs Submitted)
  const draftCount = Object.keys(state.drafts).length;
  const submittedCount = state.inspections.length;
  
  if (statusChart) statusChart.destroy();
  const ctx2 = document.getElementById('chart-status-counts').getContext('2d');
  statusChart = new Chart(ctx2, {
    type: 'doughnut',
    data: {
      labels: ['सहेजे गए (Submitted)', 'अपूर्ण ड्राफ्ट (Drafts)'],
      datasets: [{
        data: [submittedCount, draftCount],
        backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(245, 158, 11, 0.8)'],
        borderColor: ['#10b981', '#f59e0b'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#64748b', font: { size: 10 } }
        }
      },
      cutout: '65%'
    }
  });

  // Chart 3: Inspections count by Officer (horizontal bar chart)
  const officerCounts = {};
  state.inspections.forEach(i => {
    const oName = i.officerName || "Unknown Officer";
    officerCounts[oName] = (officerCounts[oName] || 0) + 1;
  });

  // Sort officers by count
  const sortedOfficers = Object.entries(officerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const officerNames = sortedOfficers.map(o => o[0].replace('Sh ', '').replace('Dr ', ''));
  const officerValues = sortedOfficers.map(o => o[1]);

  if (officerChart) officerChart.destroy();
  const ctx3 = document.getElementById('chart-officer-counts').getContext('2d');
  officerChart = new Chart(ctx3, {
    type: 'bar',
    data: {
      labels: officerNames,
      datasets: [{
        data: officerValues,
        backgroundColor: 'rgba(99, 102, 241, 0.75)', // indigo
        borderColor: '#4f46e5',
        borderWidth: 1.5,
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { stepSize: 1, color: '#64748b', font: { size: 10 } },
          grid: { color: '#f1f5f9' }
        },
        y: {
          ticks: { color: '#64748b', font: { size: 10, weight: 'bold' } },
          grid: { display: false }
        }
      }
    }
  });

  // Render recent inspection list
  const recentList = document.getElementById('dashboard-recent-list');
  if (recentList) {
    recentList.innerHTML = "";
    
    // Sort inspections by date desc
    const sortedInsps = [...state.inspections].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    
    if (sortedInsps.length === 0) {
      recentList.innerHTML = `<p class="text-xs text-slate-400 py-4 text-center font-medium">कोई डेटा उपलब्ध नहीं है</p>`;
    } else {
      sortedInsps.forEach(i => {
        const div = document.createElement('div');
        div.className = "p-3.5 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100/70 transition-all cursor-pointer flex items-start space-x-3";
        div.onclick = () => showInspectionDetail(i.id);
        
        const badge = getDeptBadge(i.departmentId);
        
        div.innerHTML = `
          <div class="w-9 h-9 rounded-lg ${badge.bg} ${badge.color} flex items-center justify-center text-sm shrink-0 shadow-sm">
            <i class="fa-solid ${badge.icon}"></i>
          </div>
          <div class="flex-1 min-w-0">
            <h5 class="text-xs font-bold text-slate-800 truncate">${i.facilityName || i.village || 'निरीक्षण'}</h5>
            <p class="text-[10px] text-slate-450 mt-0.5 truncate font-medium">${i.village} (${i.block.replace(' (221622)', '').replace(' (221608)', '').replace(' (221615)', '').replace(' (221631)', '')})</p>
            <div class="flex items-center space-x-2 mt-1.5 text-[9px] text-slate-400 font-semibold">
              <span>${i.officerName.replace('Sh ', '')}</span>
              <span>•</span>
              <span>${formatDateString(i.date)}</span>
            </div>
          </div>
        `;
        recentList.appendChild(div);
      });
    }
  }
}

function initDashboardMap() {
  if (typeof L === 'undefined') return;
  if (dashboardMap) return; // already initialized
  
  dashboardMap = L.map('dashboard-mini-map', {
    zoomControl: false,
    attributionControl: false
  }).setView([18.88, 81.30], 9);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(dashboardMap);
  
  // Add some markers for the last 8 inspections
  const latestWithCoords = state.inspections
    .filter(i => {
      // Find facility to retrieve coordinates
      const fac = findFacilityByName(i.facilityName);
      return fac && fac.latitude && fac.longitude;
    })
    .slice(0, 8);
    
  if (latestWithCoords.length > 0) {
    const latlngs = [];
    latestWithCoords.forEach(i => {
      const fac = findFacilityByName(i.facilityName);
      const marker = L.marker([fac.latitude, fac.longitude]).addTo(dashboardMap);
      marker.bindPopup(`<strong class="text-xs">${i.facilityName}</strong><p class="text-[10px] text-slate-500 mt-1">${formatDateString(i.date)}</p>`);
      latlngs.push([fac.latitude, fac.longitude]);
    });
    
    // Fit map bounds
    if (latlngs.length > 1) {
      dashboardMap.fitBounds(latlngs);
    } else {
      dashboardMap.setView(latlngs[0], 12);
    }
  }
}

// 5. GIS Map view
function initGISMap() {
  if (typeof L === 'undefined') return;
  if (mainMap) {
    // invalidate size to prevent rendering bugs on hidden tabs
    setTimeout(() => mainMap.invalidateSize(), 100);
    return;
  }
  
  mainMap = L.map('map').setView([18.88, 81.30], 10);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(mainMap);
  
  // Render markers
  renderMapMarkers();
}

function renderMapMarkers() {
  // Clear previous markers
  mainMapMarkers.forEach(m => mainMap.removeLayer(m));
  mainMapMarkers = [];
  
  // Read category toggle statuses
  const categories = [];
  document.querySelectorAll('#map-category-toggles input[type="checkbox"]').forEach(c => {
    if (c.checked) categories.push(c.value);
  });
  
  const blockFilter = document.getElementById('map-block-filter').value;
  const gpFilter = document.getElementById('map-panchayat-filter') ? document.getElementById('map-panchayat-filter').value : "";
  const villageFilter = document.getElementById('map-village-filter') ? document.getElementById('map-village-filter').value : "";
  const searchVal = document.getElementById('map-search').value.toLowerCase().trim();
  const inspectionFilter = document.getElementById('map-inspection-filter').value;
  
  const normSelectedBlock = getNormalizedBlockKey(blockFilter);
  
  let listToRender = [];
  
  // 1. Gather schools
  if (categories.includes('school')) {
    state.schools.forEach(s => {
      if (s.latitude && s.longitude) {
        listToRender.push({...s, mapCategory: 'school', displayName: s.name, typeName: 'School / Hostel'});
      }
    });
  }
  // 2. Gather anganwadis
  if (categories.includes('anganwadi')) {
    state.anganwadis.forEach(a => {
      if (a.latitude && a.longitude) {
        listToRender.push({...a, mapCategory: 'anganwadi', displayName: a.name, typeName: 'Anganwadi Center'});
      }
    });
  }
  // 3. Gather health centers
  if (categories.includes('health')) {
    state.health_centers.forEach(h => {
      if (h.latitude && h.longitude) {
        listToRender.push({...h, mapCategory: 'health', displayName: h.name, typeName: 'CHC / PHC'});
      }
    });
  }
  // 4. Gather veterinary clinics
  if (categories.includes('veterinary')) {
    state.vet_centers.forEach(v => {
      if (v.latitude && v.longitude) {
        listToRender.push({...v, mapCategory: 'veterinary', displayName: v.name, typeName: 'Veterinary Clinic'});
      }
    });
  }
  
  // Apply block, GP, village, & search filters
  let filtered = listToRender.filter(item => {
    // block filter
    if (normSelectedBlock) {
      const itemBlock = getNormalizedBlockKey(item.block);
      if (itemBlock !== normSelectedBlock) return false;
    }
    
    // Gram Panchayat filter
    if (gpFilter) {
      const itemGP = (item.panchayat || '').toUpperCase();
      let matchGP = itemGP === gpFilter || itemGP.includes(gpFilter);
      if (!matchGP && normSelectedBlock && state.hierarchy[normSelectedBlock]?.panchayats[gpFilter]) {
        const gpVillages = state.hierarchy[normSelectedBlock].panchayats[gpFilter].map(v => v.toLowerCase());
        if (item.village && gpVillages.includes(item.village.toLowerCase())) {
          matchGP = true;
        }
      }
      if (!matchGP) return false;
    }
    
    // Village filter
    if (villageFilter) {
      const itemVillage = (item.village || '').toLowerCase();
      if (!itemVillage.includes(villageFilter.toLowerCase()) && !item.displayName.toLowerCase().includes(villageFilter.toLowerCase())) {
        return false;
      }
    }
    
    // search filter
    if (searchVal) {
      const matchName = item.displayName.toLowerCase().includes(searchVal);
      const matchVillage = item.village && item.village.toLowerCase().includes(searchVal);
      const matchGP = item.panchayat && item.panchayat.toLowerCase().includes(searchVal);
      if (!matchName && !matchVillage && !matchGP) return false;
    }
    
    // inspection history filter
    const inspects = state.inspections.filter(i => i.facilityName.toLowerCase() === item.displayName.toLowerCase());
    const hasBeenVisited = inspects.length > 0;
    if (inspectionFilter === 'visited' && !hasBeenVisited) return false;
    if (inspectionFilter === 'unvisited' && hasBeenVisited) return false;
    
    return true;
  });
  
  // Add pins to map
  filtered.forEach(item => {
    // Custom pins markers
    let color = '#3b82f6'; // blue
    if (item.mapCategory === 'anganwadi') color = '#f59e0b';
    if (item.mapCategory === 'health') color = '#10b981';
    if (item.mapCategory === 'veterinary') color = '#f43f5e';
    
    const svgIcon = L.divIcon({
      html: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" class="w-7 h-7 filter drop-shadow">
          <path fill-rule="evenodd" d="M11.54 22.351l.07.04.02.008a.75.75 0 00.72 0l.02-.007.07-.04.085-.05c.22-.124.512-.305.84-.542.656-.476 1.465-1.176 2.18-1.993C18.3 17.5 20 14.824 20 12A8 8 0 104 12c0 2.824 1.7 5.5 4.545 7.72.715.817 1.524 1.517 2.18 1.993.328.237.62.418.84.542l.085.05zM12 15a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
        </svg>`,
      className: "",
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });
    
    const marker = L.marker([item.latitude, item.longitude], {icon: svgIcon}).addTo(mainMap);
    
    // Find inspection logs
    const logs = state.inspections.filter(i => i.facilityName.toLowerCase() === item.displayName.toLowerCase());
    let logsHtml = `<p class="text-[10px] text-slate-400 font-bold mt-1 uppercase">कोई पिछला निरीक्षण नहीं है</p>`;
    if (logs.length > 0) {
      logsHtml = `<p class="text-[10px] text-slate-400 font-bold mt-2 uppercase border-b border-slate-100 pb-1 mb-1">पिछला निरीक्षण इतिहास (${logs.length}):</p>`;
      logs.slice(0, 3).forEach(log => {
        logsHtml += `
          <div class="text-[10px] py-1 border-b border-slate-50 flex items-center justify-between cursor-pointer hover:text-blue-500" onclick="showInspectionDetail('${log.id}')">
            <span>📅 ${formatDateString(log.date)}</span>
            <span class="font-bold text-slate-655">${log.officerName.replace('Sh ', '')}</span>
          </div>
        `;
      });
    }
    
    const cleanBlock = item.block.replace(' (221608)', '').replace(' (221622)', '').replace(' (221615)', '').replace(' (221631)', '');
    const popContent = `
      <div class="w-60">
        <span class="px-1.5 py-0.5 rounded text-[8px] uppercase font-bold tracking-wider text-white" style="background-color: ${color}">${item.typeName}</span>
        <h4 class="text-xs font-extrabold text-slate-800 mt-2">${item.displayName}</h4>
        <p class="text-[10px] text-slate-500 font-semibold mt-0.5">${item.village} (${cleanBlock})</p>
        
        <div class="mt-3">
          ${logsHtml}
        </div>
        
        <button onclick="triggerNewInspectionFromMap('${item.mapCategory}', '${item.displayName}', '${item.block}', '${item.village}', ${item.latitude}, ${item.longitude})" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-1 rounded text-[10px] font-bold shadow mt-3 transition-colors uppercase">
          नया निरीक्षण दर्ज करें &rarr;
        </button>
      </div>
    `;
    
    marker.bindPopup(popContent);
    mainMapMarkers.push(marker);
  });
  
  // Update stats text
  document.getElementById('map-marker-stats').innerText = `दिखाए जा रहे हैं: ${filtered.length} / ${listToRender.length} संस्थाएं`;
}

function filterMapMarkers() {
  renderMapMarkers();
}

function onMapBlockChanged() {
  const blockVal = document.getElementById('map-block-filter').value;
  populateLocationSelects(blockVal, 'map-panchayat-filter', 'map-village-filter');
  filterMapMarkers();
}

function onMapPanchayatChanged() {
  const blockVal = document.getElementById('map-block-filter').value;
  const gpVal = document.getElementById('map-panchayat-filter').value;
  const villageSelect = document.getElementById('map-village-filter');
  
  const normBlock = getNormalizedBlockKey(blockVal);
  const hierarchySource = getHierarchySource();
  const blockData = normBlock ? hierarchySource[normBlock] : null;
  if (blockData && villageSelect) {
    villageSelect.innerHTML = '<option value="">सभी ग्राम (All Villages)</option>';
    let vList = [];
    if (gpVal && blockData.panchayats) {
      const matchedKey = Object.keys(blockData.panchayats).find(k => k.toLowerCase() === gpVal.toLowerCase());
      if (matchedKey && blockData.panchayats[matchedKey] && blockData.panchayats[matchedKey].length > 0) {
        vList = blockData.panchayats[matchedKey];
      }
    }
    if (!vList || vList.length === 0) {
      vList = blockData.villages || [];
    }
    const uniqueVillages = Array.from(new Set(vList)).sort((a, b) => a.localeCompare(b));
    uniqueVillages.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.innerText = v;
      villageSelect.appendChild(opt);
    });
  }
  filterMapMarkers();
}

function triggerNewInspectionFromMap(category, name, block, village, lat, lng) {
  // Map category to department ID
  const depts = {'school': 1, 'health': 2, 'anganwadi': 3, 'veterinary': 4};
  const deptId = depts[category] || 1;
  
  // Go to New Inspection Form Tab
  switchTab('new-inspection');
  
  // Populate form fields
  document.getElementById('form-select-dept').value = deptId;
  onFormDeptChanged(deptId);
  
  const blockSelect = document.getElementById('form-select-block');
  for (let i = 0; i < blockSelect.options.length; i++) {
    if (block.toUpperCase().includes(blockSelect.options[i].value)) {
      blockSelect.value = blockSelect.options[i].value;
      onFormBlockChanged();
      break;
    }
  }
  
  const villageSelect = document.getElementById('form-select-village');
  if (villageSelect) {
    villageSelect.value = village;
  }
  document.getElementById('form-input-village').value = village;
  const facInput = document.getElementById('form-input-facility');
  if (facInput) facInput.value = name;
  document.getElementById('form-gps-lat').value = lat;
  document.getElementById('form-gps-lng').value = lng;
}

// 6. New Inspection Form Logic
function onFormDeptChanged(val) {
  const deptId = parseInt(val);
  const parametersCard = document.getElementById('form-parameters-card');
  const mediaCard = document.getElementById('form-media-card');
  
  if (!deptId) {
    parametersCard.classList.add('hidden');
    mediaCard.classList.add('hidden');
    return;
  }
  
  parametersCard.classList.remove('hidden');
  mediaCard.classList.remove('hidden');
  
  // Load parameter checklist elements dynamically
  renderFormParameters(deptId);
  
  // Check if draft exists and fill it
  loadDraftForDepartment(deptId);

  // Refresh facilities for chosen department
  populateFormFacilities();
}

// Officer Profile Persistence & Auto-fill Logic
function loadCachedOfficerInfo() {
  const saved = localStorage.getItem('officers_inspector_portal_officer_info');
  const nameInput = document.getElementById('form-officer-name');
  const desigInput = document.getElementById('form-officer-designation');
  const phoneInput = document.getElementById('form-officer-phone');
  const previewCard = document.getElementById('officer-preview-card');
  const cachedBadge = document.getElementById('officer-cached-badge');
  const inputFields = document.getElementById('officer-input-fields');
  
  if (!nameInput || !desigInput || !phoneInput) return;
  
  if (saved) {
    try {
      const data = JSON.parse(saved);
      if (data && data.name && data.name.trim()) {
        nameInput.value = data.name.trim();
        desigInput.value = (data.designation || "").trim();
        const cleanPhone = (data.phone || "").replace(/\D/g, '').slice(0, 10);
        phoneInput.value = cleanPhone;
        
        const previewName = document.getElementById('officer-preview-name');
        const previewDesig = document.getElementById('officer-preview-designation');
        const previewPhone = document.getElementById('officer-preview-phone');
        
        if (previewName) previewName.innerText = data.name.trim();
        if (previewDesig) previewDesig.innerText = (data.designation && data.designation.trim()) ? data.designation.trim() : "निरीक्षक";
        if (previewPhone) previewPhone.innerText = cleanPhone ? cleanPhone : "उपलब्ध नहीं";
        
        if (previewCard) previewCard.classList.remove('hidden');
        if (cachedBadge) {
          cachedBadge.classList.remove('hidden');
          cachedBadge.classList.add('flex');
        }
        if (inputFields) inputFields.classList.add('hidden');
        return;
      }
    } catch (e) {
      console.error("Error loading cached officer profile", e);
    }
  }
  
  // If no cache or empty
  if (previewCard) previewCard.classList.add('hidden');
  if (cachedBadge) {
    cachedBadge.classList.add('hidden');
    cachedBadge.classList.remove('flex');
  }
  if (inputFields) inputFields.classList.remove('hidden');
}

function saveOfficerProfile(name, designation, phone) {
  if (!name || !name.trim()) return;
  const profile = {
    name: name.trim(),
    designation: designation ? designation.trim() : "",
    phone: phone ? phone.trim().replace(/\D/g, '').slice(0, 10) : ""
  };
  localStorage.setItem('officers_inspector_portal_officer_info', JSON.stringify(profile));
}

function toggleOfficerEditMode(showEdit) {
  const previewCard = document.getElementById('officer-preview-card');
  const inputFields = document.getElementById('officer-input-fields');
  const nameInput = document.getElementById('form-officer-name');
  
  if (showEdit) {
    if (previewCard) previewCard.classList.add('hidden');
    if (inputFields) inputFields.classList.remove('hidden');
    if (nameInput) nameInput.focus();
  } else {
    loadCachedOfficerInfo();
  }
}

function onFormBlockChanged() {
  const blockEl = document.getElementById('form-select-block');
  const blockVal = blockEl ? blockEl.value : "";
  const gpSelect = document.getElementById('form-select-panchayat');
  const villageSelect = document.getElementById('form-select-village');
  
  const villageInput = document.getElementById('form-input-village');
  if (villageInput) villageInput.value = "";
  const facEl = document.getElementById('form-input-facility');
  if (facEl) facEl.value = "";
  const latInput = document.getElementById('form-gps-lat');
  if (latInput) latInput.value = "";
  const lngInput = document.getElementById('form-gps-lng');
  if (lngInput) lngInput.value = "";
  
  if (!blockVal) {
    if (gpSelect) {
      gpSelect.innerHTML = '<option value="">-- पहले विकासखंड चुनें (Select Block first) --</option>';
    }
    if (villageSelect) {
      villageSelect.innerHTML = '<option value="">-- पहले ग्राम पंचायत चुनें (Select GP first) --</option>';
    }
    try { saveCurrentFormDraft(); } catch(e){}
    return;
  }
  
  const normBlock = getNormalizedBlockKey(blockVal);
  const hierarchySource = getHierarchySource();
  const blockData = normBlock ? hierarchySource[normBlock] : null;
  
  if (gpSelect) {
    gpSelect.innerHTML = '<option value="">-- ग्राम पंचायत का चयन करें (Select GP) --</option>';
    if (blockData && blockData.panchayats) {
      const gpList = Object.keys(blockData.panchayats).sort((a, b) => a.localeCompare(b));
      gpList.forEach(gp => {
        const opt = document.createElement('option');
        opt.value = gp;
        opt.innerText = gp;
        gpSelect.appendChild(opt);
      });
    }
  }
  
  if (villageSelect) {
    villageSelect.innerHTML = '<option value="">-- पहले ग्राम पंचायत चुनें (Select GP first) --</option>';
  }
  
  try { saveCurrentFormDraft(); } catch(e){}
}

function onFormPanchayatChanged() {
  const blockEl = document.getElementById('form-select-block');
  const blockVal = blockEl ? blockEl.value : "";
  const gpSelect = document.getElementById('form-select-panchayat');
  const gpVal = gpSelect ? gpSelect.value : "";
  const villageSelect = document.getElementById('form-select-village');
  
  const villageInput = document.getElementById('form-input-village');
  if (villageInput) villageInput.value = "";
  const facEl = document.getElementById('form-input-facility');
  if (facEl) facEl.value = "";
  
  if (!gpVal) {
    if (villageSelect) {
      villageSelect.innerHTML = '<option value="">-- पहले ग्राम पंचायत चुनें (Select GP first) --</option>';
    }
    try { saveCurrentFormDraft(); } catch(e){}
    return;
  }
  
  const normBlock = getNormalizedBlockKey(blockVal);
  const hierarchySource = getHierarchySource();
  const blockData = normBlock ? hierarchySource[normBlock] : null;
  
  if (villageSelect) {
    villageSelect.innerHTML = '<option value="">-- ग्राम / गाँव का चयन करें (Select Village) --</option>';
    
    let vList = [];
    if (blockData && blockData.panchayats) {
      const matchedKey = Object.keys(blockData.panchayats).find(k => k.toLowerCase() === gpVal.toLowerCase());
      if (matchedKey && blockData.panchayats[matchedKey] && blockData.panchayats[matchedKey].length > 0) {
        vList = blockData.panchayats[matchedKey];
      }
    }
    
    if (!vList || vList.length === 0) {
      vList = [gpVal];
    }
    
    const uniqueVillages = Array.from(new Set(vList)).sort((a, b) => a.localeCompare(b));
    uniqueVillages.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.innerText = v;
      villageSelect.appendChild(opt);
    });
    
    if (uniqueVillages.length === 1) {
      villageSelect.value = uniqueVillages[0];
      if (villageInput) villageInput.value = uniqueVillages[0];
      populateFormFacilities();
    } else {
      populateFormFacilities();
    }
  }
  
  try { saveCurrentFormDraft(); } catch(e){}
}

function onFormVillageChanged() {
  const villageSelect = document.getElementById('form-select-village');
  const villageVal = villageSelect ? villageSelect.value : "";
  const villageInput = document.getElementById('form-input-village');
  if (villageInput) villageInput.value = villageVal;
  populateFormFacilities();
  try { saveCurrentFormDraft(); } catch(e){}
}

function populateFormFacilities(preselectedFacility = "") {
  const facSelect = document.getElementById('form-select-facility');
  const facInput = document.getElementById('form-input-facility');
  if (!facSelect) return;

  const deptVal = document.getElementById('form-select-dept')?.value || "";
  const blockVal = document.getElementById('form-select-block')?.value || "";
  const gpVal = document.getElementById('form-select-panchayat')?.value || "";
  const villageVal = document.getElementById('form-select-village')?.value || document.getElementById('form-input-village')?.value || "";

  facSelect.innerHTML = "";

  if (!villageVal && !gpVal) {
    facSelect.innerHTML = '<option value="">-- पहले ग्राम / गाँव चुनें (Select Village first) --</option>';
    return;
  }

  const facilities = getFacilitiesByLocation({
    block: blockVal,
    panchayat: gpVal,
    village: villageVal,
    deptId: deptVal
  });

  if (facilities.length > 0) {
    facSelect.innerHTML = `<option value="">-- संस्था चुनें (${facilities.length} उपलब्ध) --</option>`;
    facilities.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.name;
      opt.innerText = `${f.name} (${f.category})`;
      if (f.latitude) opt.setAttribute('data-lat', f.latitude);
      if (f.longitude) opt.setAttribute('data-lng', f.longitude);
      facSelect.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.innerText = '✍️ अन्य / नया नाम यहाँ लिखें (Custom / Other)';
    facSelect.appendChild(customOpt);
  } else {
    facSelect.innerHTML = `
      <option value="">-- इस गाँव में कोई संस्था दर्ज नहीं है --</option>
      <option value="__custom__">✍️ नया नाम यहाँ लिखें (Custom)</option>
    `;
  }

  if (preselectedFacility) {
    let matched = false;
    for (let i = 0; i < facSelect.options.length; i++) {
      if (facSelect.options[i].value.toLowerCase() === preselectedFacility.toLowerCase()) {
        facSelect.value = facSelect.options[i].value;
        matched = true;
        break;
      }
    }
    if (!matched) {
      facSelect.value = '__custom__';
    }
    if (facInput) facInput.value = preselectedFacility;
  }
}

function onFormFacilityChanged(val) {
  const facInput = document.getElementById('form-input-facility');
  const facSelect = document.getElementById('form-select-facility');
  if (!facSelect) return;

  if (val === '__custom__') {
    if (facInput) {
      facInput.value = "";
      facInput.focus();
    }
  } else if (val) {
    if (facInput) facInput.value = val;
    const selectedOption = facSelect.options[facSelect.selectedIndex];
    if (selectedOption) {
      const lat = selectedOption.getAttribute('data-lat');
      const lng = selectedOption.getAttribute('data-lng');
      if (lat && document.getElementById('form-gps-lat')) document.getElementById('form-gps-lat').value = lat;
      if (lng && document.getElementById('form-gps-lng')) document.getElementById('form-gps-lng').value = lng;
    }
  }

  try { saveCurrentFormDraft(); } catch(e){}
}

function captureGPS() {
  if (navigator.geolocation) {
    showToast("warning", "स्थान अनुमति (GPS Permission)", "डिवाइस जीपीएस से भौगोलिक स्थान कैप्चर किया जा रहा है...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById('form-gps-lat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('form-gps-lng').value = pos.coords.longitude.toFixed(6);
        showToast("success", "जीपीएस सफलता", "भौगोलिक निर्देशांक सफलतापूर्वक कैप्चर कर लिए गए हैं।");
        saveCurrentFormDraft();
      },
      (err) => {
        console.error("GPS Error", err);
        showToast("error", "जीपीएस त्रुटि", "जीपीएस सिग्नल प्राप्त नहीं हुआ। कृपया निर्देशांक मैन्युअल दर्ज करें।");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  } else {
    showToast("error", "त्रुटि", "ब्राउज़र जीपीएस समर्थित नहीं है।");
  }
}

// Dynamically Render Form Checklist parameters based on Department schemas
function renderFormParameters(deptId) {
  const container = document.getElementById('form-parameters-fields');
  container.innerHTML = "";
  
  const parameters = getParametersByDepartmentId(deptId);
  parameters.forEach(p => {
    const div = document.createElement('div');
    div.className = "flex flex-col space-y-1.5";
    
    // Label
    const label = document.createElement('label');
    label.className = "text-xs sm:text-sm font-bold text-slate-700 block mb-1.5";
    label.innerText = p.label;
    if (p.required) {
      label.innerHTML += ' <span class="text-red-500">*</span>';
    }
    div.appendChild(label);
    
    // Input element creation
    let inputEl = null;
    
    if (p.type === 'boolean') {
      inputEl = document.createElement('select');
      inputEl.className = "w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-slate-700 font-bold focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer";
      
      const optYes = document.createElement('option');
      optYes.value = "1";
      optYes.innerText = "हाँ (Yes)";
      
      const optNo = document.createElement('option');
      optNo.value = "0";
      optNo.innerText = "नहीं (No)";
      
      inputEl.appendChild(optYes);
      inputEl.appendChild(optNo);
      
    } else if (p.type === 'select') {
      inputEl = document.createElement('select');
      inputEl.className = "w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-slate-700 font-bold focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer";
      
      p.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.innerText = opt;
        inputEl.appendChild(o);
      });
      
    } else if (p.type === 'number') {
      inputEl = document.createElement('input');
      inputEl.type = "number";
      inputEl.className = "w-full text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-bold text-slate-700";
      inputEl.placeholder = "संख्या दर्ज करें...";
      
    } else if (p.type === 'textarea') {
      inputEl = document.createElement('textarea');
      inputEl.rows = 2;
      inputEl.className = "w-full text-sm px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-bold text-slate-700";
      inputEl.placeholder = p.placeholder || "विवरण दर्ज करें...";
    }
    
    if (inputEl) {
      inputEl.id = `param_field_${p.id}`;
      inputEl.name = p.id;
      inputEl.required = p.required;
      // Add trigger to auto save draft on change/input
      inputEl.addEventListener('input', () => saveCurrentFormDraft());
      div.appendChild(inputEl);
    }
    
    container.appendChild(div);
  });
}

// Preview uploaded image
function previewImage(input, previewBoxId) {
  const box = document.getElementById(previewBoxId);
  if (!box) return;
  
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      box.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover">`;
      saveCurrentFormDraft();
    };
    reader.readAsDataURL(input.files[0]);
  }
}

// 7. Dynamic Form Drafts LocalStorage Autosave
function setupDraftAutoSave() {
  // Setup phone number input restrictions (max 10 digits, numbers only)
  const phoneEl = document.getElementById('form-officer-phone');
  if (phoneEl) {
    phoneEl.setAttribute('maxlength', '10');
    phoneEl.setAttribute('inputmode', 'numeric');
    phoneEl.setAttribute('pattern', '[0-9]{10}');
    
    // Disallow non-numeric characters and enforce max 10 digits in real-time
    phoneEl.addEventListener('input', () => {
      const sanitized = phoneEl.value.replace(/\D/g, '').slice(0, 10);
      if (phoneEl.value !== sanitized) {
        phoneEl.value = sanitized;
      }
    });

    phoneEl.addEventListener('keydown', (e) => {
      if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'].includes(e.key) ||
          e.ctrlKey || e.metaKey) {
        return;
      }
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
        return;
      }
      const hasSelection = phoneEl.selectionStart !== phoneEl.selectionEnd;
      if (phoneEl.value.replace(/\D/g, '').length >= 10 && !hasSelection) {
        e.preventDefault();
      }
    });

    phoneEl.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      const digitsOnly = pasteData.replace(/\D/g, '');
      const start = phoneEl.selectionStart || 0;
      const end = phoneEl.selectionEnd || 0;
      const curVal = phoneEl.value || '';
      const newVal = (curVal.slice(0, start) + digitsOnly + curVal.slice(end)).replace(/\D/g, '').slice(0, 10);
      phoneEl.value = newVal;
      phoneEl.dispatchEvent(new Event('input'));
    });
  }

  // Listen to input changes in core form fields
  const coreFields = ['form-officer-name', 'form-officer-designation', 'form-officer-phone', 'form-select-dept', 'form-select-block', 'form-input-village', 'form-gps-lat', 'form-gps-lng', 'form-input-date', 'form-input-remarks'];
  coreFields.forEach(fid => {
    const el = document.getElementById(fid);
    if (el) {
      el.addEventListener('input', () => {
        saveCurrentFormDraft();
        // Also update cached officer in real-time when typing officer info
        if (fid.startsWith('form-officer-')) {
          const oName = document.getElementById('form-officer-name')?.value.trim() || "";
          const oDesig = document.getElementById('form-officer-designation')?.value.trim() || "";
          const oPhone = document.getElementById('form-officer-phone')?.value.trim().replace(/\D/g, '').slice(0, 10) || "";
          if (oName) {
            saveOfficerProfile(oName, oDesig, oPhone);
          }
        }
      });
    }
  });
}

function saveCurrentFormDraft() {
  try {
    const deptEl = document.getElementById('form-select-dept');
    const deptId = deptEl ? deptEl.value : "";
    if (!deptId) return;
    
    const villageVal = document.getElementById('form-select-village')?.value || document.getElementById('form-input-village')?.value || "";
    
    // Collect values
    const payload = {
      deptId: deptId,
      officerName: document.getElementById('form-officer-name')?.value || "",
      officerDesignation: document.getElementById('form-officer-designation')?.value || "",
      officerPhone: (document.getElementById('form-officer-phone')?.value || "").replace(/\D/g, '').slice(0, 10),
      block: document.getElementById('form-select-block')?.value || "",
      panchayat: document.getElementById('form-select-panchayat')?.value || "",
      village: villageVal,
      facilityName: document.getElementById('form-input-facility')?.value || "",
      lat: document.getElementById('form-gps-lat')?.value || "",
      lng: document.getElementById('form-gps-lng')?.value || "",
      date: document.getElementById('form-input-date')?.value || "",
      remarks: document.getElementById('form-input-remarks')?.value || "",
      responses: {}
    };
    
    // Read dynamic responses
    const parameters = getParametersByDepartmentId(parseInt(deptId));
    parameters.forEach(p => {
      const field = document.getElementById(`param_field_${p.id}`);
      if (field) {
        payload.responses[p.id] = field.value;
      }
    });
    
    // Write to localStorage
    localStorage.setItem(`officers_inspector_portal_draft_${deptId}`, JSON.stringify(payload));
    state.drafts[deptId] = payload;
    
    // Update status message
    const statusEl = document.getElementById('form-draft-status');
    if (statusEl) {
      const time = new Date().toLocaleTimeString('hi-IN');
      statusEl.innerText = `प्रारूप सहेजा गया (${time})`;
    }
  } catch (err) {
    console.warn("Draft save notice:", err);
  }
}

function loadDraftForDepartment(deptId) {
  const draft = state.drafts[deptId];
  if (!draft) {
    return;
  }
  
  // Fill officer fields if present in draft and not already populated
  if (draft.officerName && !document.getElementById('form-officer-name').value) {
    document.getElementById('form-officer-name').value = draft.officerName;
    document.getElementById('form-officer-designation').value = draft.officerDesignation || "";
    document.getElementById('form-officer-phone').value = (draft.officerPhone || "").replace(/\D/g, '').slice(0, 10);
  }
  
  // Fill core fields
  if (draft.block) {
    document.getElementById('form-select-block').value = draft.block;
    onFormBlockChanged();
    if (draft.panchayat) {
      const gpSelect = document.getElementById('form-select-panchayat');
      if (gpSelect) {
        for (let i = 0; i < gpSelect.options.length; i++) {
          if (gpSelect.options[i].value.toLowerCase() === draft.panchayat.toLowerCase()) {
            gpSelect.value = gpSelect.options[i].value;
            break;
          }
        }
        onFormPanchayatChanged();
        if (draft.village) {
          const vSelect = document.getElementById('form-select-village');
          if (vSelect) {
            for (let i = 0; i < vSelect.options.length; i++) {
              if (vSelect.options[i].value.toLowerCase() === draft.village.toLowerCase()) {
                vSelect.value = vSelect.options[i].value;
                break;
              }
            }
          }
          document.getElementById('form-input-village').value = draft.village;
          populateFormFacilities(draft.facilityName || "");
        }
      }
    }
  }
  
  const facEl = document.getElementById('form-input-facility');
  if (facEl) facEl.value = draft.facilityName || "";
  document.getElementById('form-gps-lat').value = draft.lat || "";
  document.getElementById('form-gps-lng').value = draft.lng || "";
  document.getElementById('form-input-date').value = draft.date ? formatDateString(draft.date) : getTodayDateDDMMYYYY();
  document.getElementById('form-input-remarks').value = draft.remarks || "";
  
  // Fill dynamic parameters
  const parameters = getParametersByDepartmentId(parseInt(deptId));
  parameters.forEach(p => {
    const val = draft.responses[p.id];
    if (val !== undefined) {
      const field = document.getElementById(`param_field_${p.id}`);
      if (field) {
        field.value = val;
      }
    }
  });
}

function clearCurrentForm() {
  const deptId = document.getElementById('form-select-dept').value;
  
  // Reset fields
  document.getElementById('form-select-block').value = "";
  const gpSelect = document.getElementById('form-select-panchayat');
  if (gpSelect) gpSelect.innerHTML = '<option value="">-- पहले विकासखंड चुनें (Select Block first) --</option>';
  const vSelect = document.getElementById('form-select-village');
  if (vSelect) vSelect.innerHTML = '<option value="">-- पहले ग्राम पंचायत चुनें (Select GP first) --</option>';
  document.getElementById('form-input-village').value = "";
  const facSelect = document.getElementById('form-select-facility');
  if (facSelect) facSelect.innerHTML = '<option value="">-- पहले ग्राम / गाँव चुनें (Select Village first) --</option>';
  const facEl = document.getElementById('form-input-facility');
  if (facEl) facEl.value = "";
  document.getElementById('form-gps-lat').value = "";
  document.getElementById('form-gps-lng').value = "";
  document.getElementById('form-input-date').value = getTodayDateDDMMYYYY();
  document.getElementById('form-input-remarks').value = "";
  document.getElementById('form-file-photo').value = "";
  document.getElementById('photo-preview-box').innerHTML = '<i class="fa-solid fa-image text-xl"></i>';
  document.getElementById('form-file-action-photo').value = "";
  document.getElementById('action-photo-preview-box').innerHTML = '<i class="fa-solid fa-image text-xl"></i>';
  
  // Ensure cached officer details remain populated and visible
  loadCachedOfficerInfo();
  
  if (deptId) {
    const parameters = getParametersByDepartmentId(parseInt(deptId));
    parameters.forEach(p => {
      const field = document.getElementById(`param_field_${p.id}`);
      if (field) {
        field.value = "";
      }
    });
    
    // Clear draft storage
    localStorage.removeItem(`officers_inspector_portal_draft_${deptId}`);
    delete state.drafts[deptId];
  }
  
  const statusEl = document.getElementById('form-draft-status');
  if (statusEl) {
    statusEl.innerText = "प्रारूप साफ़ कर दिया गया है";
  }
}

// 8. Submit New Inspection Log with Interactive Feedback Dialog Box
function closeInspectionFeedbackModal() {
  const modal = document.getElementById('inspection-feedback-modal');
  if (modal) modal.classList.add('hidden');
}

function onFeedbackModalBackdropClick(e) {
  if (e.target.id === 'inspection-feedback-modal') {
    closeInspectionFeedbackModal();
  }
}

function focusMissingField(fieldId) {
  closeInspectionFeedbackModal();
  setTimeout(() => {
    // If officer profile fields are missing, open edit mode
    if (fieldId && fieldId.startsWith('form-officer-')) {
      toggleOfficerEditMode(true);
    }
    
    // Ensure cards are visible if department selected
    const deptId = document.getElementById('form-select-dept')?.value;
    if (deptId) {
      document.getElementById('form-parameters-card')?.classList.remove('hidden');
      document.getElementById('form-media-card')?.classList.remove('hidden');
    }
    
    const target = document.getElementById(fieldId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus();
      target.classList.add('ring-2', 'ring-red-500', 'border-red-400');
      setTimeout(() => {
        target.classList.remove('ring-2', 'ring-red-500', 'border-red-400');
      }, 3500);
    }
  }, 150);
}

function showInspectionValidationModal(missingFields) {
  const modal = document.getElementById('inspection-feedback-modal');
  const body = document.getElementById('inspection-feedback-body');
  if (!modal || !body) return;

  const firstFieldId = missingFields[0]?.id || "";

  const listHtml = missingFields.map((m, idx) => `
    <li class="flex items-start justify-between gap-3 p-2.5 rounded-xl hover:bg-amber-100/70 transition-colors cursor-pointer border border-transparent hover:border-amber-200" onclick="focusMissingField('${m.id}')" title="इस फ़ील्ड पर जाएं और भरें">
      <div class="flex items-start space-x-2.5 text-left">
        <span class="w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">${idx + 1}</span>
        <span class="text-xs sm:text-sm font-bold text-slate-800">${escapeHtml(m.name)}</span>
      </div>
      <span class="text-xs font-extrabold text-blue-600 hover:text-blue-800 shrink-0 self-center whitespace-nowrap flex items-center space-x-1">
        <span>भरें</span>
        <i class="fa-solid fa-arrow-right text-[10px]"></i>
      </span>
    </li>
  `).join('');

  body.innerHTML = `
    <div class="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-amber-500/20">
      <i class="fa-solid fa-triangle-exclamation"></i>
    </div>
    
    <h3 class="text-lg sm:text-xl font-extrabold text-slate-850">फॉर्म सबमिट नहीं हो पाया (Incomplete Form)</h3>
    <p class="text-xs sm:text-sm text-slate-600 mt-1">
      फॉर्म को सफलतापूर्वक सहेजने हेतु नीचे दिए गए <strong class="text-amber-800 font-bold">${missingFields.length} अनिवार्य फ़ील्ड / पैरामीटर</strong> दर्ज करना बाकी है:
    </p>

    <div class="mt-4 p-3 bg-amber-50/80 border border-amber-200/90 rounded-2xl text-left max-h-64 overflow-y-auto">
      <ul class="space-y-1.5">
        ${listHtml}
      </ul>
    </div>

    <div class="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
      <button type="button" onclick="focusMissingField('${firstFieldId}')" class="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-750 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 flex items-center justify-center space-x-2 transition-all active:scale-95">
        <i class="fa-solid fa-pen-to-square"></i>
        <span>खाली फ़ील्ड भरें (Complete Form)</span>
      </button>
      <button type="button" onclick="closeInspectionFeedbackModal()" class="w-full sm:w-auto px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-colors">
        <span>बंद करें (Dismiss)</span>
      </button>
    </div>
  `;

  modal.classList.remove('hidden');
}

function showInspectionSuccessModal(item) {
  const modal = document.getElementById('inspection-feedback-modal');
  const body = document.getElementById('inspection-feedback-body');
  if (!modal || !body) return;

  const deptObj = (typeof REAL_DATABASE !== 'undefined' && REAL_DATABASE.departments) 
    ? REAL_DATABASE.departments.find(d => d.id === parseInt(item.departmentId)) 
    : null;
  const deptName = deptObj ? deptObj.name : "विभाग";

  body.innerHTML = `
    <div class="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-emerald-500/25">
      <i class="fa-solid fa-circle-check"></i>
    </div>
    
    <h3 class="text-lg sm:text-xl font-extrabold text-slate-850">निरीक्षण सफलतापूर्वक दर्ज हो गया!</h3>
    <p class="text-xs sm:text-sm text-emerald-700 font-semibold mt-1">
      निरीक्षण रिपोर्ट पोर्टल में सुरक्षित सहेज ली गई है।
    </p>

    <div class="mt-5 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-left space-y-2.5 text-xs sm:text-sm">
      <div class="flex justify-between items-center py-1 border-b border-slate-200/70">
        <span class="text-slate-500 font-bold uppercase text-[10px] sm:text-xs tracking-wider">शासकीय संस्था (Site)</span>
        <span class="font-extrabold text-slate-900 text-right">${escapeHtml(item.facilityName || '-')}</span>
      </div>
      <div class="flex justify-between items-center py-1 border-b border-slate-200/70">
        <span class="text-slate-500 font-bold uppercase text-[10px] sm:text-xs tracking-wider">विभाग (Dept)</span>
        <span class="font-bold text-blue-700 text-right">${escapeHtml(deptName)}</span>
      </div>
      <div class="flex justify-between items-center py-1 border-b border-slate-200/70">
        <span class="text-slate-500 font-bold uppercase text-[10px] sm:text-xs tracking-wider">स्थल (Location)</span>
        <span class="font-semibold text-slate-800 text-right">${escapeHtml(item.village)}, ${escapeHtml(item.block)}</span>
      </div>
      <div class="flex justify-between items-center py-1 border-b border-slate-200/70">
        <span class="text-slate-500 font-bold uppercase text-[10px] sm:text-xs tracking-wider">निरीक्षण अधिकारी</span>
        <span class="font-semibold text-slate-800 text-right">${escapeHtml(item.officerName)} (${escapeHtml(item.officerDesignation)})</span>
      </div>
      <div class="flex justify-between items-center py-1 border-b border-slate-200/70">
        <span class="text-slate-500 font-bold uppercase text-[10px] sm:text-xs tracking-wider">दिनांक (Date)</span>
        <span class="font-bold text-slate-800 text-right">${escapeHtml(item.date)}</span>
      </div>
      <div class="flex justify-between items-center pt-1">
        <span class="text-slate-500 font-bold uppercase text-[10px] sm:text-xs tracking-wider">स्थिति (Status)</span>
        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800">
          <i class="fa-solid fa-circle-check mr-1.5 text-[11px] text-emerald-600"></i>सहेजा गया (Saved)
        </span>
      </div>
    </div>

    <div class="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
      <button type="button" onclick="closeInspectionFeedbackModal(); switchTab('dashboard');" class="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-750 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 flex items-center justify-center space-x-1.5 transition-all active:scale-95">
        <i class="fa-solid fa-chart-pie"></i>
        <span>डैशबोर्ड देखें (Dashboard)</span>
      </button>
      <button type="button" onclick="closeInspectionFeedbackModal(); showInspectionDetail('${escapeJs(item.id)}');" class="w-full sm:w-auto px-4 py-2.5 bg-slate-850 hover:bg-slate-750 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition-colors flex items-center justify-center space-x-1.5">
        <i class="fa-solid fa-file-lines"></i>
        <span>रिपोर्ट प्रपत्र देखें</span>
      </button>
      <button type="button" onclick="closeInspectionFeedbackModal();" class="w-full sm:w-auto px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-colors">
        <span>+ नया निरीक्षण</span>
      </button>
    </div>
  `;

  modal.classList.remove('hidden');
}

function handleFormSubmit(e) {
  e.preventDefault();
  
  const missing = [];

  const officerName = document.getElementById('form-officer-name')?.value.trim() || "";
  const officerDesignation = document.getElementById('form-officer-designation')?.value.trim() || "";
  const rawOfficerPhone = document.getElementById('form-officer-phone')?.value.trim() || "";
  const officerPhone = rawOfficerPhone.replace(/\D/g, '').slice(0, 10);
  const phoneInput = document.getElementById('form-officer-phone');
  if (phoneInput) phoneInput.value = officerPhone;

  if (!officerName) {
    missing.push({ name: "निरीक्षण अधिकारी का नाम (Officer Name)", id: "form-officer-name" });
  }
  if (!officerDesignation) {
    missing.push({ name: "अधिकारी का पद / पदनाम (Designation)", id: "form-officer-designation" });
  }
  if (!officerPhone) {
    missing.push({ name: "मोबाइल / फोन नंबर (Phone Number)", id: "form-officer-phone" });
  } else if (officerPhone.length !== 10) {
    missing.push({ name: "मोबाइल नंबर पूरा 10 अंकों का होना अनिवार्य है (10-Digit Mobile)", id: "form-officer-phone" });
  }

  const deptSelect = document.getElementById('form-select-dept');
  const deptId = deptSelect ? deptSelect.value : "";
  if (!deptId) {
    missing.push({ name: "निरीक्षण विभाग का चयन (Department)", id: "form-select-dept" });
  }

  const blockSelect = document.getElementById('form-select-block');
  const block = blockSelect ? blockSelect.value : "";
  if (!block) {
    missing.push({ name: "जनपद / विकासखंड (Block)", id: "form-select-block" });
  }

  const gp = document.getElementById('form-select-panchayat')?.value || "";
  const village = document.getElementById('form-select-village')?.value || document.getElementById('form-input-village')?.value || "";
  if (!village) {
    missing.push({ name: "ग्राम पंचायत एवं गाँव (Village)", id: "form-select-village" });
  }

  const facilityName = (document.getElementById('form-input-facility')?.value || document.getElementById('form-select-facility')?.value || "").replace('__custom__', '').trim();
  if (!facilityName) {
    missing.push({ name: "शासकीय संस्था / साइट का नाम (Facility / Site Name)", id: "form-input-facility" });
  }

  const dateInput = document.getElementById('form-input-date');
  const date = dateInput ? dateInput.value.trim() : "";
  if (!date) {
    missing.push({ name: "निरीक्षण दिनांक (Inspection Date)", id: "form-input-date" });
  }

  // Dynamic Department Parameters Validation
  if (deptId) {
    const parameters = getParametersByDepartmentId(parseInt(deptId));
    parameters.forEach(p => {
      if (p.required) {
        const field = document.getElementById(`param_field_${p.id}`);
        const val = field ? field.value : "";
        if (!field || val === "" || val === null || val === undefined) {
          missing.push({ name: `निरीक्षण मापदंड: "${p.label}"`, id: `param_field_${p.id}` });
        }
      }
    });
  }

  const remarksInput = document.getElementById('form-input-remarks');
  const remarks = remarksInput ? remarksInput.value.trim() : "";
  if (!remarks) {
    missing.push({ name: "निरीक्षण टिप्पणी / टीप (Overall Remarks)", id: "form-input-remarks" });
  }

  // If any required field or checklist parameter is missing, display popup dialog box!
  if (missing.length > 0) {
    showInspectionValidationModal(missing);
    return;
  }
  
  // Save officer profile to cache for automatic future prefill
  saveOfficerProfile(officerName, officerDesignation, officerPhone);
  
  // Dynamically register officer into state if not already present
  let officerObj = state.officers.find(o => o.name.toLowerCase() === officerName.toLowerCase());
  if (!officerObj) {
    officerObj = {
      id: "O_CUSTOM_" + Date.now(),
      name: officerName,
      designation: officerDesignation,
      phone: officerPhone
    };
    state.officers.unshift(officerObj);
    populateHeaderOfficerSelect();
  }
  state.currentOfficerId = officerObj.id;
  const headerSelect = document.getElementById('header-officer-select');
  if (headerSelect) headerSelect.value = officerObj.id;
  
  // Capture photo values
  const photoBox = document.getElementById('photo-preview-box');
  const actionPhotoBox = document.getElementById('action-photo-preview-box');
  const photoImg = photoBox.querySelector('img');
  const actionPhotoImg = actionPhotoBox.querySelector('img');
  
  // Gather dynamic checklist values
  const responses = {};
  const parameters = getParametersByDepartmentId(parseInt(deptId));
  parameters.forEach(p => {
    const field = document.getElementById(`param_field_${p.id}`);
    if (field) {
      responses[p.id] = field.value;
    }
  });
  
  // Generate random id
  const iid = "insp_" + Math.random().toString(36).substring(2, 10);
  
  const newInspection = {
    id: iid,
    departmentId: parseInt(deptId),
    block: block + " (" + getBlockCode(block) + ")",
    panchayat: gp || village.toUpperCase(),
    village: village,
    facilityName: facilityName,
    latitude: document.getElementById('form-gps-lat')?.value || "",
    longitude: document.getElementById('form-gps-lng')?.value || "",
    date: date,
    officerName: officerName,
    officerDesignation: officerDesignation,
    officerPhone: officerPhone,
    status: "Submitted",
    remarks: remarks,
    photo: photoImg ? photoImg.src : "",
    actionTaken: "",
    actionPhoto: actionPhotoImg ? actionPhotoImg.src : "",
    responses: responses
  };
  
  // Write to custom submissions state
  let customInsps = [];
  const savedInsps = localStorage.getItem('officers_inspector_portal_inspections');
  if (savedInsps) {
    try {
      customInsps = JSON.parse(savedInsps);
    } catch (e) {}
  }
  newInspection.synced = false;
  customInsps.unshift(newInspection);
  localStorage.setItem('officers_inspector_portal_inspections', JSON.stringify(customInsps));
  
  // Merge into state list
  state.inspections.unshift(newInspection);
  
  // Sync to remote API
  syncInspectionToAPI(newInspection).then(success => {
    if (success) {
      newInspection.synced = true;
      const idx = customInsps.findIndex(ci => ci.id === newInspection.id);
      if (idx !== -1) {
        customInsps[idx].synced = true;
        localStorage.setItem('officers_inspector_portal_inspections', JSON.stringify(customInsps));
      }
    }
  });
  
  // Remove draft
  localStorage.removeItem(`officers_inspector_portal_draft_${deptId}`);
  delete state.drafts[deptId];
  
  // Success Toast & Interactive Dialog Modal
  const deptObj = (typeof REAL_DATABASE !== 'undefined' && REAL_DATABASE.departments) 
    ? REAL_DATABASE.departments.find(d => d.id === parseInt(deptId)) 
    : null;
  const deptName = deptObj ? deptObj.name : "विभाग";
  showToast("success", "सफलतापूर्वक सहेजा गया", `${village} (${deptName}) का निरीक्षण सफलतापूर्वक सहेज लिया गया है।`);
  
  // Clear form inputs and reload cached officer profile
  clearCurrentForm();
  loadCachedOfficerInfo();
  
  // Show dedicated Success Popup Modal with full details and action buttons!
  showInspectionSuccessModal(newInspection);
}

function onTimelineDeptChanged() {
  const blockVal = document.getElementById('timeline-block-filter')?.value || '';
  const gpVal = document.getElementById('timeline-panchayat-filter')?.value || '';
  const villageVal = document.getElementById('timeline-village-filter')?.value || '';
  const deptVal = document.getElementById('timeline-dept-filter')?.value || '';
  populateTimelineFacilities(blockVal, gpVal, villageVal, deptVal);
  renderInspectionTimelineTable();
}

function onTimelineBlockChanged() {
  const blockVal = document.getElementById('timeline-block-filter')?.value || '';
  const gpSelect = document.getElementById('timeline-panchayat-filter');
  const vSelect = document.getElementById('timeline-village-filter');
  const facSelect = document.getElementById('timeline-facility-filter');
  
  if (gpSelect) gpSelect.innerHTML = '<option value="">सभी पंचायतें (All GPs)</option>';
  if (vSelect) vSelect.innerHTML = '<option value="">सभी गाँव (All Villages)</option>';
  if (facSelect) facSelect.innerHTML = '<option value="">सभी संस्थाएं (All Sites)</option>';
  
  const normBlock = getNormalizedBlockKey(blockVal);
  const hierarchySource = getHierarchySource();
  if (normBlock && hierarchySource && hierarchySource[normBlock]) {
    const gps = Object.keys(hierarchySource[normBlock].panchayats || {}).sort();
    gps.forEach(gp => {
      const opt = document.createElement('option');
      opt.value = gp;
      opt.innerText = gp;
      gpSelect.appendChild(opt);
    });
  }

  const deptVal = document.getElementById('timeline-dept-filter')?.value || '';
  populateTimelineFacilities(blockVal, '', '', deptVal);
  renderInspectionTimelineTable();
}

function onTimelinePanchayatChanged() {
  const blockVal = document.getElementById('timeline-block-filter')?.value || '';
  const gpVal = document.getElementById('timeline-panchayat-filter')?.value || '';
  populateTimelineVillages(blockVal, gpVal);

  const deptVal = document.getElementById('timeline-dept-filter')?.value || '';
  populateTimelineFacilities(blockVal, gpVal, '', deptVal);
  renderInspectionTimelineTable();
}

function onTimelineVillageChanged() {
  const blockVal = document.getElementById('timeline-block-filter')?.value || '';
  const gpVal = document.getElementById('timeline-panchayat-filter')?.value || '';
  const villageVal = document.getElementById('timeline-village-filter')?.value || '';
  const deptVal = document.getElementById('timeline-dept-filter')?.value || '';

  populateTimelineFacilities(blockVal, gpVal, villageVal, deptVal);
  renderInspectionTimelineTable();
}

function onTimelineFacilityChanged() {
  renderInspectionTimelineTable();
}

function populateTimelineVillages(blockVal, gpVal) {
  const vSelect = document.getElementById('timeline-village-filter');
  if (!vSelect) return;
  vSelect.innerHTML = '<option value="">सभी गाँव (All Villages)</option>';
  if (!blockVal) return;

  const normBlock = getNormalizedBlockKey(blockVal);
  const hierarchySource = getHierarchySource();
  const blockData = normBlock ? hierarchySource[normBlock] : null;
  if (!blockData) return;

  let vList = [];
  if (gpVal && blockData.panchayats && blockData.panchayats[gpVal]) {
    vList = blockData.panchayats[gpVal];
  } else if (blockData.villages) {
    vList = Array.from(blockData.villages);
  }

  const uniqueVillages = Array.from(new Set(vList)).sort((a, b) => a.localeCompare(b));
  uniqueVillages.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.innerText = v;
    vSelect.appendChild(opt);
  });
}

function populateTimelineFacilities(blockVal, gpVal, villageVal, deptVal) {
  const facSelect = document.getElementById('timeline-facility-filter');
  if (!facSelect) return;
  facSelect.innerHTML = '<option value="">सभी संस्थाएं (All Sites)</option>';

  const facilities = getFacilitiesByLocation({
    block: blockVal,
    panchayat: gpVal,
    village: villageVal,
    deptId: deptVal
  });

  const uniqueFacilities = Array.from(new Set(facilities.map(f => f.name))).sort((a, b) => a.localeCompare(b));
  uniqueFacilities.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.innerText = name;
    facSelect.appendChild(opt);
  });
}

function clearTimelineFilters() {
  const s = document.getElementById('timeline-search');
  if (s) s.value = "";
  const d = document.getElementById('timeline-dept-filter');
  if (d) d.value = "";
  const b = document.getElementById('timeline-block-filter');
  if (b) b.value = "";
  const gp = document.getElementById('timeline-panchayat-filter');
  if (gp) gp.innerHTML = '<option value="">सभी पंचायतें (All GPs)</option>';
  const v = document.getElementById('timeline-village-filter');
  if (v) v.innerHTML = '<option value="">सभी गाँव (All Villages)</option>';
  const f = document.getElementById('timeline-facility-filter');
  if (f) f.innerHTML = '<option value="">सभी संस्थाएं (All Sites)</option>';
  
  const sitesBar = document.getElementById('timeline-village-sites-bar');
  if (sitesBar) sitesBar.classList.add('hidden');

  renderInspectionTimelineTable();
}

// Village Sites Modal Handler & State
let currentVillageSitesModalState = {
  village: "",
  block: "",
  panchayat: "",
  deptId: "all",
  search: ""
};

function triggerOpenVillageSitesModal() {
  const village = document.getElementById('timeline-village-filter')?.value || "";
  const block = document.getElementById('timeline-block-filter')?.value || "";
  const gp = document.getElementById('timeline-panchayat-filter')?.value || "";
  const deptId = document.getElementById('timeline-dept-filter')?.value || "";
  openVillageSitesModal(village, block, gp, deptId);
}

function openVillageSitesModal(village, block = "", panchayat = "", deptId = "") {
  const modal = document.getElementById('village-sites-modal');
  if (!modal) return;

  currentVillageSitesModalState.village = village;
  currentVillageSitesModalState.block = block;
  currentVillageSitesModalState.panchayat = panchayat;
  currentVillageSitesModalState.deptId = deptId || "all";
  currentVillageSitesModalState.search = "";

  const title = document.getElementById('village-sites-modal-title');
  if (title) {
    title.innerText = village ? `${village} - शासकीय संस्थाएं` : `शासकीय संस्थाएं (Village Sites)`;
  }

  const searchInput = document.getElementById('village-sites-modal-search');
  if (searchInput) searchInput.value = "";

  setVillageSitesModalCategoryFilter(deptId ? String(deptId) : 'all', false);

  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  renderVillageSitesModalGrid();
}

function closeVillageSitesModal() {
  const modal = document.getElementById('village-sites-modal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

function setVillageSitesModalCategoryFilter(cat, shouldRender = true) {
  currentVillageSitesModalState.deptId = cat;
  const tabBtns = document.querySelectorAll('.village-sites-tab-btn');
  tabBtns.forEach(btn => {
    if (btn.getAttribute('data-cat') === String(cat)) {
      btn.className = "village-sites-tab-btn px-3 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-sm transition-all";
    } else {
      btn.className = "village-sites-tab-btn px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all";
    }
  });
  if (shouldRender) {
    renderVillageSitesModalGrid();
  }
}

function filterVillageSitesModalCards() {
  const q = (document.getElementById('village-sites-modal-search')?.value || '').toLowerCase().trim();
  currentVillageSitesModalState.search = q;
  renderVillageSitesModalGrid();
}

function renderVillageSitesModalGrid() {
  const grid = document.getElementById('village-sites-modal-grid');
  const emptyState = document.getElementById('village-sites-modal-empty');
  const countBadge = document.getElementById('village-sites-modal-count-badge');
  if (!grid) return;

  const { village, block, panchayat, deptId, search } = currentVillageSitesModalState;

  let facs = getFacilitiesByLocation({
    block: block,
    panchayat: panchayat,
    village: village,
    deptId: deptId === 'all' ? '' : deptId
  });

  if (search) {
    facs = facs.filter(f => 
      f.name.toLowerCase().includes(search) || 
      (f.village || '').toLowerCase().includes(search) ||
      (f.panchayat || '').toLowerCase().includes(search) ||
      f.category.toLowerCase().includes(search)
    );
  }

  if (countBadge) {
    countBadge.innerText = `कुल संस्थाएं: ${facs.length}`;
  }

  if (facs.length === 0) {
    grid.innerHTML = "";
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  grid.innerHTML = "";
  facs.forEach(f => {
    const visits = (state.inspections || []).filter(i => 
      (i.facilityName && i.facilityName.toLowerCase() === f.name.toLowerCase()) ||
      (!i.facilityName && i.village && i.village.toLowerCase() === (f.village || '').toLowerCase() && parseInt(i.departmentId) === f.deptId)
    );

    visits.sort((a, b) => new Date(b.date) - new Date(a.date));
    const lastVisit = visits[0];
    const deptBadge = getDeptBadge(f.deptId);

    const card = document.createElement('div');
    card.className = "bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex flex-col justify-between space-y-3";

    let visitStatusHtml = "";
    if (visits.length > 0) {
      visitStatusHtml = `
        <div class="flex items-center space-x-2 text-xs">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 flex items-center space-x-1">
            <i class="fa-solid fa-circle-check text-emerald-600 text-[10px]"></i>
            <span>${visits.length} विज़िट्स पूर्ण</span>
          </span>
          <span class="text-[11px] text-slate-500 font-medium">अंतिम: <strong>${formatDateString(lastVisit.date)}</strong></span>
        </div>
      `;
    } else {
      visitStatusHtml = `
        <div class="flex items-center space-x-2 text-xs">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 flex items-center space-x-1">
            <i class="fa-solid fa-clock-rotate-left text-amber-500 text-[10px]"></i>
            <span>निरीक्षण लंबित (0 Visits)</span>
          </span>
        </div>
      `;
    }

    const gpsDisplay = (f.latitude && f.longitude) ? 
      `<span class="text-[10px] text-slate-400 font-medium flex items-center space-x-1" title="Lat: ${f.latitude}, Lng: ${f.longitude}">
         <i class="fa-solid fa-location-crosshairs text-blue-500"></i>
         <span>जियो-टैग्ड</span>
       </span>` : '';

    card.innerHTML = `
      <div>
        <div class="flex items-start justify-between gap-2 mb-1.5">
          <span class="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${deptBadge.bg} ${deptBadge.color}">
            <i class="fa-solid ${deptBadge.icon} mr-1"></i>${deptBadge.label}
          </span>
          ${gpsDisplay}
        </div>
        <h4 class="text-sm font-extrabold text-slate-850 hover:text-blue-600 transition-colors">${escapeHtml(f.name)}</h4>
        <div class="text-xs text-slate-500 font-semibold mt-1 flex items-center space-x-2">
          <span><i class="fa-solid fa-map-pin text-slate-400 mr-1 text-[10px]"></i>गाँव: <strong>${escapeHtml(f.village || village || '-')}</strong></span>
          ${f.panchayat ? `<span>• पं: ${escapeHtml(f.panchayat)}</span>` : ''}
          <span>• ब्लॉक: ${escapeHtml(f.block || block || '-')}</span>
        </div>
      </div>

      <div class="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        ${visitStatusHtml}
        <button type="button" onclick="startNewInspectionForFacility('${escapeJs(String(f.deptId))}', '${escapeJs(f.block || block)}', '${escapeJs(f.panchayat || panchayat)}', '${escapeJs(f.village || village)}', '${escapeJs(f.name)}', '${escapeJs(String(f.latitude || ''))}', '${escapeJs(String(f.longitude || ''))}')" 
                class="px-3 py-1.5 bg-blue-600 hover:bg-blue-750 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center space-x-1.5 active:scale-95 shrink-0">
          <i class="fa-solid fa-plus text-[10px]"></i>
          <span>+ नया निरीक्षण करें</span>
        </button>
      </div>
    `;

    grid.appendChild(card);
  });
}

function startNewInspectionForFacility(deptId, block, panchayat, village, facilityName, lat = "", lng = "") {
  closeVillageSitesModal();
  triggerNewVisitForLocation(deptId, block, panchayat, village, facilityName, lat, lng);
}

function renderInspectionTimelineTable() {
  const thead = document.getElementById('timeline-table-head');
  const tbody = document.getElementById('timeline-table-body');
  const emptyState = document.getElementById('timeline-empty-state');
  const countBadge = document.getElementById('timeline-count-badge');
  if (!tbody || !thead) return;

  const searchVal = (document.getElementById('timeline-search')?.value || '').toLowerCase().trim();
  const deptFilter = document.getElementById('timeline-dept-filter')?.value || '';
  const blockFilter = document.getElementById('timeline-block-filter')?.value || '';
  const panchayatFilter = document.getElementById('timeline-panchayat-filter')?.value || '';
  const villageFilter = document.getElementById('timeline-village-filter')?.value || '';
  const facilityFilter = document.getElementById('timeline-facility-filter')?.value || '';

  const normSelectedBlock = getNormalizedBlockKey(blockFilter);

  // Group inspections by departmentId + block + panchayat + village + facilityName
  const groupsMap = new Map();

  (state.inspections || []).forEach(insp => {
    const deptId = String(insp.departmentId || '0');
    const blockKey = getNormalizedBlockKey(insp.block || '') || (insp.block || '').trim().toUpperCase();
    const gp = (insp.panchayat || '').trim();
    const village = (insp.village || '').trim();
    const facName = (insp.facilityName || '').trim();
    
    // Composite key for grouping
    const key = `${deptId}__${blockKey}__${gp.toLowerCase()}__${village.toLowerCase()}__${facName.toLowerCase()}`;
    
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        key: key,
        departmentId: insp.departmentId,
        block: insp.block,
        panchayat: gp,
        village: village,
        facilityName: facName,
        latitude: insp.latitude || "",
        longitude: insp.longitude || "",
        visits: []
      });
    }
    groupsMap.get(key).visits.push(insp);
  });

  // When a village is selected or searched, incorporate all database facilities for that village
  if (villageFilter || panchayatFilter) {
    const knownFacilities = getFacilitiesByLocation({
      block: blockFilter,
      panchayat: panchayatFilter,
      village: villageFilter,
      deptId: deptFilter
    });

    knownFacilities.forEach(f => {
      const deptId = String(f.deptId);
      const blockKey = getNormalizedBlockKey(f.block) || (f.block || '').trim().toUpperCase();
      const gp = (f.panchayat || '').trim();
      const village = (f.village || villageFilter || '').trim();
      const facName = (f.name || '').trim();

      const key = `${deptId}__${blockKey}__${gp.toLowerCase()}__${village.toLowerCase()}__${facName.toLowerCase()}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key: key,
          departmentId: f.deptId,
          block: f.block,
          panchayat: gp,
          village: village,
          facilityName: facName,
          latitude: f.latitude || "",
          longitude: f.longitude || "",
          visits: []
        });
      } else {
        const existing = groupsMap.get(key);
        if (!existing.latitude && f.latitude) existing.latitude = f.latitude;
        if (!existing.longitude && f.longitude) existing.longitude = f.longitude;
      }
    });
  }

  // Update Village Sites quick banner
  const villageSitesBar = document.getElementById('timeline-village-sites-bar');
  const villageSitesInfo = document.getElementById('timeline-village-sites-info');
  if (villageFilter) {
    const allVillageFacs = getFacilitiesByLocation({
      block: blockFilter,
      panchayat: panchayatFilter,
      village: villageFilter
    });
    if (villageSitesBar && villageSitesInfo) {
      villageSitesBar.classList.remove('hidden');
      villageSitesInfo.innerHTML = `<strong>${escapeHtml(villageFilter)}</strong> गाँव में कुल <strong>${allVillageFacs.length}</strong> शासकीय संस्थाएं (Sites) उपलब्ध हैं`;
    }
  } else {
    if (villageSitesBar) villageSitesBar.classList.add('hidden');
  }

  // Sort visits within each group chronologically (oldest to newest: Visit 1, Visit 2, ...)
  const allGroups = Array.from(groupsMap.values()).map(g => {
    g.visits.sort((a, b) => {
      const da = new Date(a.date);
      const db = new Date(b.date);
      if (isNaN(da.getTime()) || isNaN(db.getTime())) return 0;
      return da - db;
    });
    return g;
  });

  // Filter groups
  const filteredGroups = allGroups.filter(g => {
    if (deptFilter && String(g.departmentId) !== String(deptFilter)) return false;

    if (normSelectedBlock) {
      const gBlockNorm = getNormalizedBlockKey(g.block);
      if (gBlockNorm !== normSelectedBlock) return false;
    }

    if (panchayatFilter) {
      const gpUpper = (g.panchayat || '').toUpperCase();
      let matchGP = gpUpper === panchayatFilter || gpUpper.includes(panchayatFilter);
      if (!matchGP && normSelectedBlock && state.hierarchy && state.hierarchy[normSelectedBlock]?.panchayats[panchayatFilter]) {
        const gpVillages = state.hierarchy[normSelectedBlock].panchayats[panchayatFilter].map(v => v.toLowerCase());
        if (g.village && gpVillages.includes(g.village.toLowerCase())) {
          matchGP = true;
        }
      }
      if (!matchGP) return false;
    }

    if (villageFilter) {
      const gVillage = (g.village || '').toLowerCase();
      const vFilter = villageFilter.toLowerCase();
      if (!gVillage.includes(vFilter) && !vFilter.includes(gVillage)) return false;
    }

    if (facilityFilter) {
      const gFac = (g.facilityName || '').toLowerCase();
      const fFilter = facilityFilter.toLowerCase();
      if (!gFac.includes(fFilter)) return false;
    }

    if (searchVal) {
      const matchFacility = (g.facilityName || '').toLowerCase().includes(searchVal);
      const matchVillage = (g.village || '').toLowerCase().includes(searchVal);
      const matchPanchayat = (g.panchayat || '').toLowerCase().includes(searchVal);
      const matchBlock = (g.block || '').toLowerCase().includes(searchVal);
      const matchDept = (getDeptBadge(g.departmentId)?.label || '').toLowerCase().includes(searchVal);
      const matchInVisits = g.visits.some(v => 
        (v.officerName || '').toLowerCase().includes(searchVal) ||
        (v.remarks || '').toLowerCase().includes(searchVal) ||
        (v.id || '').toLowerCase().includes(searchVal)
      );
      if (!matchFacility && !matchVillage && !matchPanchayat && !matchBlock && !matchDept && !matchInVisits) {
        return false;
      }
    }

    return true;
  });

  // Update badge count
  if (countBadge) {
    countBadge.innerText = `${filteredGroups.length} निरीक्षण स्थल`;
  }

  // Handle empty state
  if (filteredGroups.length === 0) {
    thead.innerHTML = "";
    tbody.innerHTML = "";
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  // Determine max visits across filtered groups (minimum 1)
  const maxVisits = Math.max(1, ...filteredGroups.map(g => g.visits.length));

  // Build thead
  let theadHtml = `
    <tr>
      <th class="px-3.5 py-3 timeline-sticky-1 bg-slate-100/95 w-12 text-center border-r border-slate-200">क्र.</th>
      <th class="px-4 py-3 timeline-sticky-2 bg-slate-100/95 min-w-[130px] border-r border-slate-200">विभाग</th>
      <th class="px-4 py-3 timeline-sticky-3 bg-slate-100/95 min-w-[220px] border-r border-slate-200">शासकीय संस्था एवं स्थल (Site & Village)</th>
      <th class="px-3 py-3 text-center min-w-[100px] border-r border-slate-200">कुल विज़िट</th>
      <th class="px-4 py-3 text-center min-w-[160px] bg-blue-50/70 border-r border-slate-200">कार्यवाही (Action)</th>
  `;

  for (let v = 1; v <= maxVisits; v++) {
    theadHtml += `<th class="px-4 py-3 text-center min-w-[230px] border-r border-slate-200 bg-slate-50 text-slate-600 font-extrabold uppercase tracking-wider">Visit ${v}</th>`;
  }
  theadHtml += `</tr>`;
  thead.innerHTML = theadHtml;

  // Build tbody
  tbody.innerHTML = "";
  filteredGroups.forEach((g, idx) => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50/70 transition-colors border-b border-slate-150";

    const deptBadge = getDeptBadge(g.departmentId);
    const cleanBlock = (g.block || '').replace(' (221622)', '').replace(' (221608)', '').replace(' (221615)', '').replace(' (221631)', '');
    const gpDisplay = g.panchayat ? `<span class="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold mr-1">${escapeHtml(g.panchayat)}</span>` : '';

    const siteDisplayName = g.facilityName || g.village || 'शासकीय संस्था';

    let rowHtml = `
      <td class="px-3.5 py-3 text-center font-bold text-slate-400 timeline-cell-sticky-1 bg-white group-hover:bg-slate-50 border-r border-slate-200">${idx + 1}</td>
      <td class="px-4 py-3 timeline-cell-sticky-2 bg-white group-hover:bg-slate-50 border-r border-slate-200">
        <span class="px-2 py-0.5 rounded text-[8px] font-extrabold uppercase shrink-0 ${deptBadge.bg} ${deptBadge.color}">
          <i class="fa-solid ${deptBadge.icon} mr-1"></i>${deptBadge.label}
        </span>
      </td>
      <td class="px-4 py-3 timeline-cell-sticky-3 bg-white group-hover:bg-slate-50 border-r border-slate-200">
        <div class="font-extrabold text-slate-850 text-xs flex items-center space-x-1.5">
          <i class="fa-solid fa-building-columns text-blue-600 text-[10px] shrink-0"></i>
          <span class="truncate">${escapeHtml(siteDisplayName)}</span>
        </div>
        <div class="text-[10px] text-slate-500 font-semibold mt-0.5">
          ${gpDisplay}गाँव: <strong>${escapeHtml(g.village || '-')}</strong> • ${escapeHtml(cleanBlock)}
        </div>
      </td>
      <td class="px-3 py-3 text-center border-r border-slate-200">
        ${g.visits.length > 0 ? 
          `<span class="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-[10px] font-extrabold whitespace-nowrap">${g.visits.length} विज़िट${g.visits.length > 1 ? '्स' : ''}</span>` :
          `<span class="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold whitespace-nowrap">0 विज़िट</span>`
        }
      </td>
      <td class="px-4 py-3 text-center border-r border-slate-200 bg-blue-50/20">
        <button type="button" onclick="triggerNewVisitForLocation('${escapeJs(String(g.departmentId))}', '${escapeJs(g.block)}', '${escapeJs(g.panchayat)}', '${escapeJs(g.village)}', '${escapeJs(g.facilityName || '')}', '${escapeJs(String(g.latitude || ''))}', '${escapeJs(String(g.longitude || ''))}')" 
                class="px-3 py-1.5 bg-blue-600 hover:bg-blue-750 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center space-x-1.5 mx-auto active:scale-95 whitespace-nowrap"
                title="इस संस्था हेतु नया निरीक्षण दर्ज करें">
          <i class="fa-solid fa-plus text-[10px]"></i>
          <span>New Inspection</span>
        </button>
      </td>
    `;

    for (let v = 0; v < maxVisits; v++) {
      const item = g.visits[v];
      if (item) {
        let photoMarkup = "";
        if (item.photo) {
          const capText = `Visit ${v+1}: ${siteDisplayName} (${formatDateString(item.date)})`;
          photoMarkup = `
            <div class="mt-2 pt-2 border-t border-slate-200/60 flex flex-col items-center">
              <span class="text-[9px] font-extrabold text-slate-450 uppercase tracking-wider block mb-1">Visit Photo</span>
              <div class="relative group cursor-pointer overflow-hidden rounded-lg border border-slate-200 shadow-sm w-20 h-16 bg-slate-100 shrink-0" 
                   onclick="event.stopPropagation(); openPhotoLightBox('${escapeJs(item.photo)}', '${escapeJs(capText)}')">
                <img src="${item.photo}" alt="Visit Photo" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200">
                <span class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-opacity">
                  <i class="fa-solid fa-magnifying-glass-plus"></i>
                </span>
              </div>
            </div>
          `;
        } else {
          photoMarkup = `
            <div class="mt-2 pt-2 border-t border-slate-200/60 text-center">
              <span class="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Visit Photo</span>
              <span class="text-[9px] text-slate-400 italic">फ़ोटो उपलब्ध नहीं</span>
            </div>
          `;
        }

        rowHtml += `
          <td class="px-3.5 py-3 border-r border-slate-200 align-top bg-white">
            <div class="space-y-1.5 cursor-pointer p-2 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors" 
                 onclick="showInspectionDetail('${escapeJs(item.id)}')" title="पूर्ण निरीक्षण विवरण देखें">
              <div class="flex items-center justify-between gap-1 border-b border-slate-200/50 pb-1.5">
                <span class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] font-extrabold">Visit ${v+1}</span>
                <span class="text-[10px] font-bold text-slate-600">${formatDateString(item.date)}</span>
              </div>
              <div class="text-[11px] font-bold text-slate-800 flex items-center space-x-1 truncate">
                <i class="fa-solid fa-user-tie text-[10px] text-slate-400 shrink-0"></i>
                <span class="truncate">${escapeHtml((item.officerName || 'अधिकारी').replace('Sh ', ''))}</span>
              </div>
              <p class="text-[10px] text-slate-500 font-medium line-clamp-2 italic">${escapeHtml(item.remarks || 'कोई विशेष टीप नहीं')}</p>
              ${photoMarkup}
            </div>
          </td>
        `;
      } else if (g.visits.length === 0 && v === 0) {
        rowHtml += `
          <td class="px-3.5 py-4 border-r border-slate-200 align-middle text-center bg-slate-50/40 text-slate-400">
            <span class="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200/80 rounded-lg text-[11px] font-bold">
              <i class="fa-solid fa-clock-rotate-left text-amber-500 text-[10px]"></i>
              <span>निरीक्षण लंबित</span>
            </span>
          </td>
        `;
      } else {
        rowHtml += `
          <td class="px-3.5 py-3 border-r border-slate-200 align-middle text-center bg-slate-50/20 text-slate-300 font-bold text-xs">
            <span class="text-slate-300 font-bold select-none">—</span>
          </td>
        `;
      }
    }

    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  });
}

function triggerNewVisitForLocation(deptId, block, panchayat, village, facilityName = "", lat = "", lng = "") {
  switchTab('new-inspection');

  // Set department
  const deptSelect = document.getElementById('form-select-dept');
  if (deptSelect && deptId) {
    deptSelect.value = deptId;
    onFormDeptChanged(deptId);
  }

  // Set block
  const blockSelect = document.getElementById('form-select-block');
  if (blockSelect && block) {
    const normKey = getNormalizedBlockKey(block) || block;
    blockSelect.value = normKey;
    onFormBlockChanged();
  }

  // Set panchayat
  if (panchayat) {
    const gpSelect = document.getElementById('form-select-panchayat');
    if (gpSelect) {
      for (let i = 0; i < gpSelect.options.length; i++) {
        if (gpSelect.options[i].value.toLowerCase() === panchayat.toLowerCase()) {
          gpSelect.value = gpSelect.options[i].value;
          break;
        }
      }
      onFormPanchayatChanged();
    }
  }

  // Set village
  if (village) {
    const vSelect = document.getElementById('form-select-village');
    if (vSelect) {
      for (let i = 0; i < vSelect.options.length; i++) {
        if (vSelect.options[i].value.toLowerCase() === village.toLowerCase()) {
          vSelect.value = vSelect.options[i].value;
          break;
        }
      }
      onFormVillageChanged();
    }
    const vInput = document.getElementById('form-input-village');
    if (vInput) vInput.value = village;
  }

  // Set facility name if provided
  if (facilityName) {
    populateFormFacilities(facilityName);
    const facSelect = document.getElementById('form-select-facility');
    const facInput = document.getElementById('form-input-facility');
    if (facSelect) {
      let matched = false;
      for (let i = 0; i < facSelect.options.length; i++) {
        if (facSelect.options[i].value.toLowerCase() === facilityName.toLowerCase()) {
          facSelect.value = facSelect.options[i].value;
          matched = true;
          break;
        }
      }
      if (!matched) {
        facSelect.value = '__custom__';
      }
    }
    if (facInput) facInput.value = facilityName;
  }

  // Set Lat / Lng if provided
  if (lat) {
    const latInput = document.getElementById('form-gps-lat');
    if (latInput) latInput.value = lat;
  }
  if (lng) {
    const lngInput = document.getElementById('form-gps-lng');
    if (lngInput) lngInput.value = lng;
  }

  // Ensure date is today's date in DD/MM/YYYY
  const dateInput = document.getElementById('form-input-date');
  if (dateInput) {
    dateInput.value = getTodayDateDDMMYYYY();
  }

  // Ensure cached officer details are active
  loadCachedOfficerInfo();

  // Scroll to parameters checklist
  setTimeout(() => {
    const paramCard = document.getElementById('form-parameters-card');
    if (paramCard && !paramCard.classList.contains('hidden')) {
      paramCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);

  const displayTarget = facilityName || village || 'चयनित स्थल';
  showToast("info", "निरीक्षण फॉर्म तैयार", `${displayTarget} हेतु निरीक्षण फॉर्म लोड किया गया।`);
}

function openPhotoLightBox(src, caption) {
  const modal = document.getElementById('photo-lightbox-modal');
  const img = document.getElementById('lightbox-image');
  const cap = document.getElementById('lightbox-caption');
  if (!modal || !img) return;

  img.src = src;
  if (cap) cap.innerText = caption || 'Visit Photo';
  modal.classList.remove('hidden');
}

function closePhotoLightBox() {
  const modal = document.getElementById('photo-lightbox-modal');
  if (modal) modal.classList.add('hidden');
}

// Escaping helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJs(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}

// Fallback stubs for legacy references
function renderPhysicalProjectsGrid() {
  renderInspectionTimelineTable();
}
function openNewProjectModal() {}
function closeNewProjectModal() {}
function closeTimelineModal() {
  const m = document.getElementById('project-timeline-modal');
  if (m) m.classList.add('hidden');
}
function handleProjectVisitSubmit(e) { if (e) e.preventDefault(); }
function handleNewProjectSubmit(e) { if (e) e.preventDefault(); }

// 10. Reports View & Export CSV Logic
function populateReportsFilters() {
  const select = document.getElementById('report-officer-filter');
  if (select && select.options.length <= 1) {
    state.officers.forEach(off => {
      const opt = document.createElement('option');
      opt.value = off.name;
      opt.innerText = off.name;
      select.appendChild(opt);
    });
  }
}

function onReportBlockChanged() {
  const blockVal = document.getElementById('report-block-filter').value;
  populateLocationSelects(blockVal, 'report-panchayat-filter', 'report-village-filter');
  filterReportsTable();
}

function onReportPanchayatChanged() {
  const blockVal = document.getElementById('report-block-filter').value;
  const gpVal = document.getElementById('report-panchayat-filter').value;
  const villageSelect = document.getElementById('report-village-filter');
  
  const normBlock = getNormalizedBlockKey(blockVal);
  const hierarchySource = getHierarchySource();
  const blockData = normBlock ? hierarchySource[normBlock] : null;
  if (blockData && villageSelect) {
    villageSelect.innerHTML = '<option value="">सभी ग्राम (All Villages)</option>';
    let vList = [];
    if (gpVal && blockData.panchayats) {
      const matchedKey = Object.keys(blockData.panchayats).find(k => k.toLowerCase() === gpVal.toLowerCase());
      if (matchedKey && blockData.panchayats[matchedKey] && blockData.panchayats[matchedKey].length > 0) {
        vList = blockData.panchayats[matchedKey];
      }
    }
    if (!vList || vList.length === 0) {
      vList = blockData.villages || [];
    }
    const uniqueVillages = Array.from(new Set(vList)).sort((a, b) => a.localeCompare(b));
    uniqueVillages.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.innerText = v;
      villageSelect.appendChild(opt);
    });
  }
  filterReportsTable();
}

function renderReportsTable() {
  const tbody = document.getElementById('reports-table-body');
  const empty = document.getElementById('reports-empty-state');
  if (!tbody) return;
  tbody.innerHTML = "";
  
  const searchVal = document.getElementById('report-search').value.toLowerCase().trim();
  const deptFilter = document.getElementById('report-dept-filter').value;
  const officerFilter = document.getElementById('report-officer-filter').value;
  const blockFilter = document.getElementById('report-block-filter').value;
  const panchayatFilter = document.getElementById('report-panchayat-filter') ? document.getElementById('report-panchayat-filter').value : "";
  const villageFilter = document.getElementById('report-village-filter') ? document.getElementById('report-village-filter').value : "";
  
  const normSelectedBlock = getNormalizedBlockKey(blockFilter);
  
  let filtered = state.inspections.filter(i => {
    if (deptFilter && parseInt(i.departmentId) !== parseInt(deptFilter)) return false;
    if (officerFilter && i.officerName !== officerFilter) return false;
    
    // Block filter
    if (normSelectedBlock) {
      const inspBlock = getNormalizedBlockKey(i.block);
      if (inspBlock !== normSelectedBlock) return false;
    }
    
    // Gram Panchayat filter
    if (panchayatFilter) {
      const inspGP = (i.panchayat || '').toUpperCase();
      let matchGP = inspGP === panchayatFilter || inspGP.includes(panchayatFilter);
      if (!matchGP && normSelectedBlock && state.hierarchy[normSelectedBlock]?.panchayats[panchayatFilter]) {
        const gpVillages = state.hierarchy[normSelectedBlock].panchayats[panchayatFilter].map(v => v.toLowerCase());
        if (i.village && gpVillages.includes(i.village.toLowerCase())) {
          matchGP = true;
        }
      }
      if (!matchGP) return false;
    }
    
    // Village filter
    if (villageFilter) {
      const inspVillage = (i.village || '').toLowerCase();
      if (!inspVillage.includes(villageFilter.toLowerCase()) && !i.facilityName.toLowerCase().includes(villageFilter.toLowerCase())) {
        return false;
      }
    }
    
    // Keyword search filter
    if (searchVal) {
      const matchName = i.facilityName.toLowerCase().includes(searchVal);
      const matchRemarks = (i.remarks || '').toLowerCase().includes(searchVal);
      const matchVillage = (i.village || '').toLowerCase().includes(searchVal);
      const matchPanchayat = (i.panchayat || '').toLowerCase().includes(searchVal);
      const matchOfficer = (i.officerName || '').toLowerCase().includes(searchVal);
      if (!matchName && !matchRemarks && !matchVillage && !matchPanchayat && !matchOfficer) return false;
    }
    return true;
  });
  
  if (filtered.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  
  filtered.forEach(i => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100";
    tr.onclick = () => showInspectionDetail(i.id);
    
    const badge = getDeptBadge(i.departmentId);
    const cleanBlock = i.block.replace(' (221622)', '').replace(' (221608)', '').replace(' (221615)', '').replace(' (221631)', '');
    const gpInfo = i.panchayat ? `<span class="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold mr-1">${i.panchayat}</span>` : '';
    
    tr.innerHTML = `
      <td class="px-3.5 sm:px-6 py-3 sm:py-4 font-bold text-slate-500 whitespace-nowrap">${formatDateString(i.date)}</td>
      <td class="px-3.5 sm:px-6 py-3 sm:py-4">
        <span class="px-2 py-0.5 rounded text-[8px] font-extrabold uppercase shrink-0 ${badge.bg} ${badge.color}">${badge.label}</span>
      </td>
      <td class="px-3.5 sm:px-6 py-3 sm:py-4">
        <div class="font-bold text-slate-800">${gpInfo}${i.village}</div>
        <div class="text-[10px] text-slate-400 font-semibold mt-0.5">${cleanBlock}</div>
      </td>
      <td class="px-3.5 sm:px-6 py-3 sm:py-4 font-extrabold text-slate-800">${i.facilityName || i.village || '-'}</td>
      <td class="px-3.5 sm:px-6 py-3 sm:py-4 font-semibold text-slate-500">${i.officerName.replace('Sh ', '')}</td>
      <td class="px-3.5 sm:px-6 py-3 sm:py-4 text-center">
        <span class="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[9px] font-bold">SUBMITTED</span>
      </td>
      <td class="px-3.5 sm:px-6 py-3 sm:py-4 text-right" onclick="event.stopPropagation()">
        <button onclick="showInspectionDetail('${i.id}')" class="text-blue-600 hover:text-blue-800 text-xs font-bold uppercase tracking-wider">देखें &rarr;</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterReportsTable() {
  renderReportsTable();
}

function clearReportsFilters() {
  document.getElementById('report-search').value = "";
  document.getElementById('report-dept-filter').value = "";
  document.getElementById('report-officer-filter').value = "";
  document.getElementById('report-block-filter').value = "";
  const gpSelect = document.getElementById('report-panchayat-filter');
  if (gpSelect) gpSelect.innerHTML = '<option value="">सभी ग्राम पंचायत (All GPs)</option>';
  const vSelect = document.getElementById('report-village-filter');
  if (vSelect) vSelect.innerHTML = '<option value="">सभी ग्राम (All Villages)</option>';
  renderReportsTable();
}

function exportReportsCSV() {
  let csv = 'Inspection ID,Date,Department,Block,Panchayat,Village,Facility Name,Officer Name,Remarks\n';
  
  const searchVal = document.getElementById('report-search').value.toLowerCase().trim();
  const deptFilter = document.getElementById('report-dept-filter').value;
  const officerFilter = document.getElementById('report-officer-filter').value;
  const blockFilter = document.getElementById('report-block-filter').value;
  const panchayatFilter = document.getElementById('report-panchayat-filter') ? document.getElementById('report-panchayat-filter').value : "";
  const villageFilter = document.getElementById('report-village-filter') ? document.getElementById('report-village-filter').value : "";
  
  const normSelectedBlock = getNormalizedBlockKey(blockFilter);
  
  let filtered = state.inspections.filter(i => {
    if (deptFilter && parseInt(i.departmentId) !== parseInt(deptFilter)) return false;
    if (officerFilter && i.officerName !== officerFilter) return false;
    
    if (normSelectedBlock) {
      const inspBlock = getNormalizedBlockKey(i.block);
      if (inspBlock !== normSelectedBlock) return false;
    }
    
    if (panchayatFilter) {
      const inspGP = (i.panchayat || '').toUpperCase();
      let matchGP = inspGP === panchayatFilter || inspGP.includes(panchayatFilter);
      if (!matchGP && normSelectedBlock && state.hierarchy[normSelectedBlock]?.panchayats[panchayatFilter]) {
        const gpVillages = state.hierarchy[normSelectedBlock].panchayats[panchayatFilter].map(v => v.toLowerCase());
        if (i.village && gpVillages.includes(i.village.toLowerCase())) {
          matchGP = true;
        }
      }
      if (!matchGP) return false;
    }
    
    if (villageFilter) {
      const inspVillage = (i.village || '').toLowerCase();
      if (!inspVillage.includes(villageFilter.toLowerCase()) && !i.facilityName.toLowerCase().includes(villageFilter.toLowerCase())) {
        return false;
      }
    }
    
    if (searchVal) {
      const matchName = i.facilityName.toLowerCase().includes(searchVal);
      const matchRemarks = (i.remarks || '').toLowerCase().includes(searchVal);
      const matchVillage = (i.village || '').toLowerCase().includes(searchVal);
      const matchPanchayat = (i.panchayat || '').toLowerCase().includes(searchVal);
      const matchOfficer = (i.officerName || '').toLowerCase().includes(searchVal);
      if (!matchName && !matchRemarks && !matchVillage && !matchPanchayat && !matchOfficer) return false;
    }
    return true;
  });
  
  filtered.forEach(i => {
    const deptBadge = getDeptBadge(i.departmentId);
    const cleanRemarks = (i.remarks || '').replace(/"/g, '""');
    const cleanPanchayat = (i.panchayat || '').replace(/"/g, '""');
    csv += `"${i.id}","${formatDateString(i.date)}","${deptBadge.label}","${i.block}","${cleanPanchayat}","${i.village}","${i.facilityName}","${i.officerName}","${cleanRemarks}"\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `District_Inspection_Report_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("success", "सफलता", "निरीक्षण लॉग का सीएसवी सफलतापूर्वक निर्यात कर लिया गया है।");
}

// 11. Master Data Explorer
function switchMasterSubTab(tab) {
  state.activeMasterTab = tab;
  
  // Highlight subtab buttons
  const tabs = ['school', 'anganwadi', 'health_center', 'vet_center', 'officer'];
  tabs.forEach(t => {
    const btn = document.getElementById(`master-subtab-btn-${t}`);
    if (btn) {
      if (t === tab) {
        btn.className = "px-4 py-2.5 text-xs font-bold border-b-2 border-blue-600 text-blue-600 bg-transparent transition-all";
      } else {
        btn.className = "px-4 py-2.5 text-xs font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition-all";
      }
    }
  });
  
  // Render table content
  renderMasterTable();
}

function renderMasterTable() {
  const head = document.getElementById('master-table-head');
  const body = document.getElementById('master-table-body');
  const searchVal = document.getElementById('master-search').value.toLowerCase();
  
  if (!head || !body) return;
  head.innerHTML = "";
  body.innerHTML = "";
  
  let list = [];
  let cols = [];
  
  if (state.activeMasterTab === 'school') {
    list = state.schools;
    cols = ['ID', 'School Name', 'Block', 'Panchayat', 'Village', 'Coordinates'];
    head.innerHTML = `<tr><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">ID</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">संस्था का नाम (School Name)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">विकासखंड (Block)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">ग्राम पंचायत (Panchayat)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">गाँव (Village)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">नक़्शा (Location)</th></tr>`;
  } else if (state.activeMasterTab === 'anganwadi') {
    list = state.anganwadis;
    cols = ['ID', 'Anganwadi Name', 'Block', 'Sector', 'Village', 'Code'];
    head.innerHTML = `<tr><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">ID</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">आंगनवाड़ी केंद्र (AWC Name)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">विकासखंड (Block)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">सेक्टर (Sector)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">गाँव (Village)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">कोड (AWC Code)</th></tr>`;
  } else if (state.activeMasterTab === 'health_center') {
    list = state.health_centers;
    cols = ['ID', 'Health Center', 'Block', 'Village', 'Location'];
    head.innerHTML = `<tr><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">ID</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">स्वास्थ्य केंद्र का नाम</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">विकासखंड (Block)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">गाँव (Village)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">भौगोलिक स्थिति</th></tr>`;
  } else if (state.activeMasterTab === 'vet_center') {
    list = state.vet_centers;
    cols = ['ID', 'Vet Center', 'Block', 'Village', 'Location'];
    head.innerHTML = `<tr><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">ID</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">पशु चिकित्सा केंद्र</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">विकासखंड (Block)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">गाँव (Village)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">नक़्शा स्थिति</th></tr>`;
  } else if (state.activeMasterTab === 'officer') {
    list = state.officers;
    cols = ['ID', 'Officer Name', 'Designation'];
    head.innerHTML = `<tr><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">ID</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">अधिकारी का नाम (Officer Name)</th><th class="px-3.5 sm:px-6 py-2.5 sm:py-3 whitespace-nowrap">पदनाम (Designation)</th></tr>`;
  }
  
  // Filter list
  let filtered = list.filter(item => {
    if (!searchVal) return true;
    const nameMatch = item.name.toLowerCase().includes(searchVal);
    const blockMatch = item.block && item.block.toLowerCase().includes(searchVal);
    const villageMatch = item.village && item.village.toLowerCase().includes(searchVal);
    return nameMatch || blockMatch || villageMatch;
  });
  
  document.getElementById('master-count-badge').innerText = `दिखाए जा रहे हैं: ${filtered.length} रिकॉर्ड्स`;
  
  if (filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="px-4 py-12 text-center text-slate-400 font-bold">कोई रिकॉर्ड नहीं मिला।</td></tr>`;
    return;
  }
  
  filtered.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50 transition-colors border-b border-slate-100";
    
    if (state.activeMasterTab === 'school') {
      const coordsStr = item.latitude ? `${item.latitude}, ${item.longitude}` : "N/A";
      tr.innerHTML = `<td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold text-slate-500">${item.id}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-bold text-slate-800">${item.name}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold">${item.block}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold">${item.panchayat}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold">${item.village}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 text-blue-600 font-semibold">${coordsStr}</td>`;
    } else if (state.activeMasterTab === 'anganwadi') {
      tr.innerHTML = `<td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold text-slate-500">${item.id}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-bold text-slate-800">${item.name}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold">${item.block}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold">${item.sector}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold">${item.village}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 text-slate-500 font-semibold">${item.code || 'N/A'}</td>`;
    } else if (state.activeMasterTab === 'health_center') {
      const coordsStr = item.latitude ? `${item.latitude}, ${item.longitude}` : "N/A";
      tr.innerHTML = `<td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold text-slate-500">${item.id}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-bold text-slate-800">${item.name}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold">${item.block}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold">${item.village}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 text-blue-600 font-semibold">${coordsStr}</td>`;
    } else if (state.activeMasterTab === 'vet_center') {
      const coordsStr = item.latitude ? `${item.latitude}, ${item.longitude}` : "N/A";
      tr.innerHTML = `<td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold text-slate-500">${item.id}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-bold text-slate-800">${item.name}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold">${item.block}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold">${item.village}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 text-blue-600 font-semibold">${coordsStr}</td>`;
    } else if (state.activeMasterTab === 'officer') {
      tr.innerHTML = `<td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-semibold text-slate-500">${item.id}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3 font-extrabold text-slate-800">${item.name}</td><td class="px-3.5 sm:px-6 py-2.5 sm:py-3"><span class="px-2 py-0.5 bg-blue-50 text-blue-650 border border-blue-100 rounded-lg text-[9px] font-bold">${item.designation}</span></td>`;
    }
    
    body.appendChild(tr);
  });
}

function filterMasterTable() {
  renderMasterTable();
}

// 12. Show Detailed Inspection Sheet Modal
function showInspectionDetail(id) {
  const i = state.inspections.find(ins => ins.id === id);
  if (!i) return;
  
  const badge = getDeptBadge(i.departmentId);
  const parameters = getParametersByDepartmentId(i.departmentId);
  
  let tableRowsHtml = "";
  parameters.forEach(p => {
    let val = i.responses[p.id] !== undefined ? i.responses[p.id] : "N/A";
    
    // translate booleans nicely
    if (p.type === 'boolean') {
      val = parseInt(val) === 1 ? '<span class="text-emerald-600 font-bold">हाँ (Yes)</span>' : '<span class="text-rose-600 font-bold">नहीं (No)</span>';
    }
    
    tableRowsHtml += `
      <tr class="border-b border-slate-100">
        <td class="py-2 sm:py-2.5 pr-2 sm:pr-4 text-xs text-slate-500 font-bold w-1/2">${p.label}</td>
        <td class="py-2 sm:py-2.5 text-xs text-slate-800 font-semibold w-1/2">${val}</td>
      </tr>
    `;
  });
  
  // Set images
  let photoSection = "";
  if (i.photo) {
    photoSection += `
      <div class="space-y-1.5 flex-1">
        <span class="text-[9px] text-slate-400 font-bold uppercase block">निरीक्षण छायाचित्र (Inspection Photo):</span>
        <div class="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1">
          <img src="${i.photo}" alt="Inspection view" class="w-full h-40 sm:h-44 object-cover rounded-lg cursor-pointer hover:opacity-95 transition-opacity" onclick="openPhotoLightBox('${escapeJs(i.photo)}', 'निरीक्षण छायाचित्र: ${escapeJs(i.facilityName || i.village)}')">
        </div>
      </div>
    `;
  }
  if (i.actionPhoto) {
    photoSection += `
      <div class="space-y-1.5 flex-1">
        <span class="text-[9px] text-slate-400 font-bold uppercase block">विभाग कार्रवाई छायाचित्र (Action Taken Photo):</span>
        <div class="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1">
          <img src="${i.actionPhoto}" alt="Action Taken view" class="w-full h-40 sm:h-44 object-cover rounded-lg cursor-pointer hover:opacity-95 transition-opacity" onclick="openPhotoLightBox('${escapeJs(i.actionPhoto)}', 'विभाग कार्रवाई छायाचित्र: ${escapeJs(i.facilityName || i.village)}')">
        </div>
      </div>
    `;
  }
  
  let mediaContainer = "";
  if (photoSection) {
    mediaContainer = `
      <div class="flex flex-col sm:flex-row gap-4 sm:gap-5 pt-4 border-t border-slate-100">
        ${photoSection}
      </div>
    `;
  }
  
  const cleanBlock = i.block.replace(' (221622)', '').replace(' (221608)', '').replace(' (221615)', '').replace(' (221631)', '');
  
  const contentArea = document.getElementById('modal-content-area');
  contentArea.innerHTML = `
    <!-- Detail card layout print styled -->
    <div class="print-card space-y-4 sm:space-y-5">
      <!-- Info Header Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 bg-slate-50 p-3.5 sm:p-4 border border-slate-150 rounded-2xl">
        <div>
          <span class="text-[9px] text-slate-400 font-bold uppercase block">${i.facilityName ? 'शासकीय संस्था (Facility)' : 'निरीक्षण स्थल (Location)'}</span>
          <h4 class="text-xs sm:text-sm font-extrabold text-slate-800">${i.facilityName || i.village}</h4>
          <p class="text-[10px] text-slate-500 font-bold mt-0.5">${i.village} (${cleanBlock})</p>
        </div>
        <div>
          <span class="text-[9px] text-slate-400 font-bold uppercase block">निरीक्षक अधिकारी (Officer)</span>
          <h4 class="text-xs sm:text-sm font-extrabold text-slate-800">${i.officerName}</h4>
          <p class="text-[10px] text-slate-500 font-bold mt-0.5">${[i.officerDesignation, i.officerPhone].filter(Boolean).join(' • ') || 'दिनांक: ' + formatDateString(i.date)}</p>
        </div>
        <div class="sm:col-span-2 border-t border-slate-200/50 pt-2 flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="text-[9px] text-slate-400 font-bold uppercase">विभाग (Department):</span>
            <span class="px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${badge.bg} ${badge.color}">${badge.label}</span>
          </div>
          <span class="text-[8px] font-bold text-slate-400 uppercase">ID: ${i.id}</span>
        </div>
      </div>
      
      <!-- Remarks Callout -->
      <div class="border-l-4 border-blue-500 bg-blue-50/50 p-3.5 sm:p-4 rounded-r-xl">
        <span class="text-[9px] text-blue-500 font-extrabold uppercase tracking-wide block mb-1">निरीक्षण टिप्पणी / टीप (remarks)</span>
        <p class="text-xs text-slate-700 leading-relaxed font-semibold">${i.remarks}</p>
      </div>

      <!-- Checklist Parameters Table -->
      <div>
        <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-2">निरीक्षण मापदंड विवरण (Verification Checklist):</span>
        <table class="w-full text-left">
          <tbody class="divide-y divide-slate-100">
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>

      <!-- Photos container -->
      ${mediaContainer}
    </div>
  `;
  
  // Open modal
  document.getElementById('detail-modal').classList.remove('hidden');
}

function closeDetailModal() {
  document.getElementById('detail-modal').classList.add('hidden');
}

function printCurrentModalReport() {
  window.print();
}

// 13. Dynamic Data Lookup Helpers
function getParametersByDepartmentId(deptId) {
  const schemas = {
    1: [ // School
      { id: 'opens_on_time', label: 'क्या शाला नियत समय पर खुलता है? (Opens on time?)', type: 'boolean', required: true },
      { id: 'teachers_regular', label: 'क्या स्कूल में पदस्थ शिक्षकों की उपस्थिति नियमित है?', type: 'boolean', required: true },
      { id: 'irregular_teachers', label: 'यदि नहीं, तो नियमित नहीं आने वाले शिक्षकों के नाम', type: 'textarea', placeholder: 'शिक्षकों के नाम...' },
      { id: 'mdm_quality', label: 'मध्याह्न भोजन की उपलब्धता एवं गुणवत्ता (MDM Quality)', type: 'select', options: ['नियमित एवं अच्छी गुणवत्ता', 'नियमित परन्तु औसत गुणवत्ता', 'अनियमित वितरण', 'मध्याह्न भोजन बंद/अनुपलब्ध'] },
      { id: 'superintendent_regular', label: 'क्या आश्रम/छात्रावास अधीक्षक एवं स्टाफ की उपस्थिति नियमित है?', type: 'boolean' },
      { id: 'toilet_condition', label: 'शाला/आश्रम/छात्रावास में शौचालय की स्थिति (Toilet Condition)', type: 'select', options: ['उत्कृष्ट एवं क्रियाशील', 'अच्छा (साफ-सफाई आवश्यक)', 'औसत/मरम्मत योग्य', 'अक्रियाशील/खराब स्थिति', 'शौचालय की सुविधा उपलब्ध नहीं है'] },
      { id: 'security_available', label: 'आश्रम/छात्रावास में सुरक्षा की उपलब्धता (Security)', type: 'select', options: ['पूर्ण सुरक्षा व्यवस्था (चौकीदार उपलब्ध)', 'आंशिक सुरक्षा व्यवस्था', 'सुरक्षा व्यवस्था उपलब्ध नहीं है', 'लागू नहीं (सामान्य शाला)'] },
      { id: 'female_guard', label: 'यदि कन्या छात्रावास है तो महिला गार्ड है या नहीं?', type: 'select', options: ['हाँ (महिला गार्ड तैनात है)', 'नहीं (महिला गार्ड तैनात नहीं है)', 'लागू नहीं'] },
      { id: 'cctv_status', label: 'कन्या आश्रम/छात्रावास में CCTV लगा एवं चालू स्थिति में है?', type: 'select', options: ['हाँ (लगा है एवं चालू है)', 'हाँ (लगा है परन्तु बंद है)', 'नहीं लगा है', 'लागू नहीं'] },
      { id: 'building_condition', label: 'आश्रम शाला भवन की स्थिति (Building Condition)', type: 'select', options: ['नया/उत्कृष्ट भवन', 'अच्छा (सामान्य रखरखाव योग्य)', 'जर्जर (मरम्मत की आवश्यकता)', 'अत्यंत जर्जर (असुरक्षित भवन)'] },
      { id: 'boundary_wall', label: 'आश्रम छात्रावास में आहता निर्मित है? (Boundary Wall Built?)', type: 'boolean' },
      { id: 'pdld_status', label: 'PDLD एवं PDLD+ अनुसार बेसलाइन एवं प्रगति की एंट्री', type: 'boolean' },
      { id: 'education_quality', label: 'शिक्षा की गुणवत्ता (Quality of Education)', type: 'select', options: ['उत्कृष्ट (Grade A+)', 'अच्छा (Grade A)', 'औसत (Grade B)', 'कमजोर/सुधार की आवश्यकता (Grade C)'] }
    ],
    2: [ // Health
      { id: 'opens_daily', label: 'क्या स्वास्थ्य केंद्र नियत समय पर एवं प्रतिदिन खुलते हैं?', type: 'boolean', required: true },
      { id: 'staff_regular', label: 'क्या सभी पदस्थ कर्मचारी नियमित रूप से उपस्थित होते हैं?', type: 'boolean', required: true },
      { id: 'irregular_staff', label: 'यदि नहीं, तो नियमित नहीं आने वाले कर्मचारियों के नाम', type: 'textarea', placeholder: 'कर्मचारियों के नाम एवं पदनाम...' },
      { id: 'labor_room', label: 'क्या स्वास्थ्य केंद्र का लेबर रूम क्रियाशील है?', type: 'boolean' },
      { id: 'rch_entry', label: 'क्या RCH Register में नियमित Entry की जा रही है?', type: 'boolean' },
      { id: 'lab_test', label: 'क्या Prescribed Lab Test किया जा रहा है?', type: 'boolean' },
      { id: 'vaccination_due', label: 'क्या टीकाकरण Due List अनुसार किया जा रहा है?', type: 'boolean' },
      { id: 'epidemic_outbreak', label: 'क्या ग्राम में किसी प्रकार की महामारी फैली है?', type: 'boolean' }
    ],
    3: [ // Anganwadi
      { id: 'opens_time', label: 'क्या आंगनवाड़ी केंद्र नियत समय पर खुलता है?', type: 'boolean', required: true },
      { id: 'workers_regular', label: 'क्या आंगनवाड़ी केंद्र में कार्यकर्ताओं की उपस्थिति नियमित है?', type: 'boolean', required: true },
      { id: 'irregular_workers', label: 'यदि नहीं, तो नियमित उपस्थित नहीं होने वाले कार्यकर्ताओं के नाम', type: 'textarea', placeholder: 'अनुपस्थित कार्यकर्ता का नाम...' },
      { id: 'attendance_status', label: 'बच्चों की उपस्थिति एवं टीकाकरण की स्थिति (Child Attendance)', type: 'select', options: ['अच्छी (नियमित उपस्थिति एवं शत्-प्रतिशत टीकाकरण)', 'संतोषजनक', 'कम उपस्थिति / टीकाकरण पेंडिंग', 'अति निराशाजनक स्थिति'] },
      { id: 'present_count', label: 'प्रतिवेदित दिन उपस्थित बच्चों की संख्या', type: 'number' },
      { id: 'thr_status', label: 'पूरक पोषण आहार / रेडी टू ईट की स्थिति (THR Status)', type: 'select', options: ['नियमित वितरण (गुणवत्तापूर्ण)', 'अनियमित वितरण / कम मात्रा', 'सामग्री अनुपलब्ध / स्टॉक समाप्त'] },
      { id: 'malnourished_count', label: 'वजन त्योहार के अनुसार अति गंभीर कुपोषित बच्चों की संख्या', type: 'number' },
      { id: 'thr_malnourished', label: 'क्या अति गंभीर कुपोषित बच्चों को मानक अनुसार THR दिया जाता है?', type: 'select', options: ['हाँ (नियमित प्रदाय)', 'नहीं (अनुपलब्ध/अनियमित)', 'लागू नहीं'] },
      { id: 'health_benefits', label: 'क्या बच्चों को स्वास्थ्य सेवाओं का आवश्यक लाभ प्राप्त हुआ है?', type: 'boolean' },
      { id: 'home_visits', label: 'क्या कार्यकर्ता/मितानिन द्वारा कुपोषित बच्चे के घर गृह भेंट दी जाती है?', type: 'boolean' }
    ],
    4: [ // Veterinary
      { id: 'opens_time_vet', label: 'क्या पशु चिकित्सालय नियत समय पर एवं प्रतिदिन खुलते हैं?', type: 'boolean', required: true },
      { id: 'staff_regular_vet', label: 'क्या सभी पदस्थ कर्मचारी नियमित रूप से उपस्थित होते हैं?', type: 'boolean', required: true },
      { id: 'irregular_staff_vet', label: 'यदि नहीं, तो नियमित नहीं आने वाले कर्मचारियों के नाम', type: 'textarea', placeholder: 'अनुपस्थित स्टाफ के नाम...' },
      { id: 'vaccination_vet', label: 'क्या पशु टीकाकरण नियमित रूप से होता है?', type: 'boolean' },
      { id: 'medicines_supplied', label: 'क्या औषधि और अन्य सुविधाएं नियमित रूप से दी जा रही हैं?', type: 'boolean' },
      { id: 'surgery_available', label: 'क्या पशु चिकित्सालय में शल्य चिकित्सा सुविधा उपलब्ध है?', type: 'boolean' },
      { id: 'outbreak_vet', label: 'क्या ग्राम में किसी प्रकार की पशु संबंधित बीमारी/महामारी फैली है?', type: 'boolean' }
    ],
    6: [ // Food
      { id: 'opens_time_pds', label: 'क्या उचित मूल्य दुकान नियत समय पर खुलती है?', type: 'boolean', required: true },
      { id: 'stock_board', label: 'क्या दुकान में स्टॉक बोर्ड और मूल्य सूची प्रदर्शित है?', type: 'boolean' },
      { id: 'pos_machine', label: 'क्या वितरण पीओएस (POS) मशीन द्वारा बायोमेट्रिक सत्यापन से हो रहा है?', type: 'boolean', required: true },
      { id: 'distribution_regular', label: 'क्या राशन का वितरण नियमित रूप से किया जा रहा है?', type: 'boolean' },
      { id: 'consumer_satisfaction', label: 'उपभोक्ताओं की संतुष्टि स्तर (Consumer Satisfaction Level)', type: 'select', options: ['उत्कृष्ट / कोई शिकायत नहीं', 'संतोषजनक', 'औसत / कुछ शिकायतें', 'असंतोषजनक / अनियमित वितरण'] }
    ]
  };
  return schemas[deptId] || [];
}

function getDeptBadge(deptId) {
  const badges = {
    1: { label: "Schools & Hostels", bg: "bg-blue-50/70", color: "text-blue-600 border-blue-100", icon: "fa-graduation-cap" },
    2: { label: "Health / CHC", bg: "bg-emerald-50/70", color: "text-emerald-600 border-emerald-100", icon: "fa-house-medical" },
    3: { label: "Anganwadi", bg: "bg-amber-50/70", color: "text-amber-600 border-amber-100", icon: "fa-baby" },
    4: { label: "Veterinary Clinic", bg: "bg-rose-50/70", color: "text-rose-600 border-rose-100", icon: "fa-cow" },
    6: { label: "Food / PDS Shop", bg: "bg-purple-50/70", color: "text-purple-600 border-purple-100", icon: "fa-shop" }
  };
  return badges[deptId] || { label: "Inspection", bg: "bg-slate-50", color: "text-slate-600 border-slate-100", icon: "fa-clipboard" };
}

function findFacilityByName(name) {
  const query = name.toLowerCase();
  
  let f = state.schools.find(s => s.name.toLowerCase() === query);
  if (f) return f;
  
  f = state.anganwadis.find(a => a.name.toLowerCase() === query);
  if (f) return f;
  
  f = state.health_centers.find(h => h.name.toLowerCase() === query);
  if (f) return f;
  
  f = state.vet_centers.find(v => v.name.toLowerCase() === query);
  if (f) return f;
  
  return null;
}

// 14. Formatting Helpers
function getTodayDateISO() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDateDDMMYYYY() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function triggerDatePicker() {
  const picker = document.getElementById('native-date-picker');
  if (!picker) return;
  
  const currentVal = document.getElementById('form-input-date')?.value.trim();
  if (currentVal && /^\d{2}\/\d{2}\/\d{4}$/.test(currentVal)) {
    const parts = currentVal.split('/');
    picker.value = `${parts[2]}-${parts[1]}-${parts[0]}`;
  } else {
    picker.value = getTodayDateISO();
  }
  
  if (picker.showPicker) {
    try {
      picker.showPicker();
    } catch (e) {
      picker.click();
    }
  } else {
    picker.click();
  }
}

function onNativeDatePicked(val) {
  if (!val) return;
  const parts = val.split('-');
  if (parts.length === 3) {
    const dateInput = document.getElementById('form-input-date');
    if (dateInput) {
      dateInput.value = `${parts[2]}/${parts[1]}/${parts[0]}`;
      saveCurrentFormDraft();
    }
  }
}

function formatDateString(str) {
  if (!str) return "N/A";
  try {
    if (typeof str === 'string') {
      const clean = str.trim();
      // Already DD/MM/YYYY
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
        return clean;
      }
      // YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
      const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
      }
      // DD-MM-YYYY
      const dashMatch = clean.match(/^(\d{2})-(\d{2})-(\d{4})/);
      if (dashMatch) {
        return `${dashMatch[1]}/${dashMatch[2]}/${dashMatch[3]}`;
      }
    }
    const d = (str instanceof Date) ? str : new Date(str);
    if (isNaN(d.getTime())) return String(str);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) {
    return String(str);
  }
}

function getBlockCode(block) {
  const codes = {
    'DANTEWADA': '221622',
    'GEEDAM': '221608',
    'KATEKALYAN': '221615',
    'KUAKONDA': '221631'
  };
  return codes[block.toUpperCase()] || '221600';
}
