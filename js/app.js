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
function switchTab(tabId) {
  state.activeTab = tabId;
  
  // Hide all sections
  const sections = ['dashboard', 'map', 'new-inspection', 'physical', 'reports', 'master'];
  sections.forEach(s => {
    const el = document.getElementById(`view-${s}`);
    if (el) {
      el.classList.add('hidden');
      el.classList.remove('block', 'flex');
    }
    
    // Update sidebar buttons styling
    const btn = document.getElementById(`nav-btn-${s}`);
    if (btn) {
      if (s === tabId) {
        btn.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 text-white shadow-lg shadow-blue-600/10 transition-colors";
      } else {
        btn.className = "w-full flex items-center space-x-3 px-4 py-2.5 rounded-xl text-xs font-semibold hover:bg-slate-800 hover:text-white text-slate-400 transition-colors";
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
    'dashboard': 'शासकीय निरीक्षण एवं अनुश्रवण प्रणाली - अधिकारी डैशबोर्ड',
    'map': 'जीआईएस भौगोलिक निरीक्षण मानचित्र (GIS Map View)',
    'new-inspection': 'आकस्मिक निरीक्षण फॉर्म (New Inspection Entry)',
    'physical': 'निरीक्षण विज़िट समय-रेखा मैट्रिक्स (Inspection Visits & Timeline Matrix)',
    'reports': 'निरीक्षण इतिहास लॉग एवं प्रतिवेदन (Inspection Reports & Export)',
    'master': 'जिला मास्टर डेटाबेस एक्सप्लोरर (Master Data Explorer)'
  };
  document.getElementById('current-view-title').innerText = titles[tabId] || 'शासकीय निरीक्षण';
  
  // Trigger specific tab initializations
  if (tabId === 'dashboard') {
    updateDashboardMetrics();
    initDashboardCharts();
    initDashboardMap();
  } else if (tabId === 'map') {
    initGISMap();
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
  document.getElementById('print-timestamp').innerText = `प्रिंट रिपोर्ट तिथि: ${formatDateString(new Date())} | समय: ${new Date().toLocaleTimeString('hi-IN')}`;
}

function setupNavigation() {
  // Mobile sidebar toggle
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.getElementById('sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('-translate-x-full');
      sidebar.classList.toggle('translate-x-0');
    });
  }
  
  // Close sidebar on outer click for mobile view
  document.addEventListener('click', (e) => {
    if (window.innerWidth < 1024) {
      const sidebar = document.getElementById('sidebar');
      const toggleBtn = document.getElementById('btn-toggle-sidebar');
      if (sidebar && toggleBtn && !sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
        sidebar.classList.add('-translate-x-full');
      }
    }
  });
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
        phoneInput.value = (data.phone || "").trim();
        
        const previewName = document.getElementById('officer-preview-name');
        const previewDesig = document.getElementById('officer-preview-designation');
        const previewPhone = document.getElementById('officer-preview-phone');
        
        if (previewName) previewName.innerText = data.name.trim();
        if (previewDesig) previewDesig.innerText = (data.designation && data.designation.trim()) ? data.designation.trim() : "निरीक्षक";
        if (previewPhone) previewPhone.innerText = (data.phone && data.phone.trim()) ? data.phone.trim() : "उपलब्ध नहीं";
        
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
    phone: phone ? phone.trim() : ""
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
    }
  }
  
  try { saveCurrentFormDraft(); } catch(e){}
}

function onFormVillageChanged() {
  const villageSelect = document.getElementById('form-select-village');
  const villageVal = villageSelect ? villageSelect.value : "";
  const villageInput = document.getElementById('form-input-village');
  if (villageInput) villageInput.value = villageVal;
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
    label.className = "text-[10px] font-bold text-slate-450 uppercase tracking-wider";
    label.innerText = p.label;
    if (p.required) {
      label.innerHTML += ' <span class="text-red-500">*</span>';
    }
    div.appendChild(label);
    
    // Input element creation
    let inputEl = null;
    
    if (p.type === 'boolean') {
      inputEl = document.createElement('select');
      inputEl.className = "w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-bold focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer";
      
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
      inputEl.className = "w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-bold focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer";
      
      p.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.innerText = opt;
        inputEl.appendChild(o);
      });
      
    } else if (p.type === 'number') {
      inputEl = document.createElement('input');
      inputEl.type = "number";
      inputEl.className = "w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-bold text-slate-700";
      inputEl.placeholder = "संख्या दर्ज करें...";
      
    } else if (p.type === 'textarea') {
      inputEl = document.createElement('textarea');
      inputEl.rows = 2;
      inputEl.className = "w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-bold text-slate-700";
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
          const oPhone = document.getElementById('form-officer-phone')?.value.trim() || "";
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
      officerPhone: document.getElementById('form-officer-phone')?.value || "",
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
    document.getElementById('form-officer-phone').value = draft.officerPhone || "";
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

// 8. Submit New Inspection Log
function handleFormSubmit(e) {
  e.preventDefault();
  
  const officerName = document.getElementById('form-officer-name')?.value.trim() || "";
  const officerDesignation = document.getElementById('form-officer-designation')?.value.trim() || "";
  const rawOfficerPhone = document.getElementById('form-officer-phone')?.value.trim() || "";
  const officerPhone = rawOfficerPhone.replace(/\D/g, '').slice(0, 10);
  const phoneInput = document.getElementById('form-officer-phone');
  if (phoneInput) phoneInput.value = officerPhone;
  
  const deptId = document.getElementById('form-select-dept').value;
  const block = document.getElementById('form-select-block').value;
  const gp = document.getElementById('form-select-panchayat') ? document.getElementById('form-select-panchayat').value : "";
  const village = document.getElementById('form-select-village')?.value || document.getElementById('form-input-village')?.value || "";
  const remarks = document.getElementById('form-input-remarks').value;
  const date = document.getElementById('form-input-date').value;
  
  if (!officerName || !officerDesignation || !officerPhone) {
    showToast("error", "त्रुटि", "कृपया अधिकारी का नाम, पदनाम एवं फोन नंबर दर्ज करें!");
    toggleOfficerEditMode(true);
    return;
  }

  if (!/^\d{10}$/.test(officerPhone)) {
    showToast("error", "त्रुटि", "कृपया 10 अंकों का सही मोबाइल नंबर दर्ज करें!");
    if (phoneInput) phoneInput.focus();
    return;
  }
  
  if (!deptId || !block || !village || !remarks || !date) {
    showToast("error", "त्रुटि", "कृपया सभी अनिवार्य (*) फ़ील्ड भरें!");
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
    facilityName: "",
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
  
  // Success Toast
  const deptObj = REAL_DATABASE.departments.find(d => d.id === parseInt(deptId));
  const deptName = deptObj ? deptObj.name : "विभाग";
  showToast("success", "सफलतापूर्वक सहेजा गया", `${village} (${deptName}) का निरीक्षण सफलतापूर्वक सहेज लिया गया है।`);
  
  // Clear form inputs and reload cached officer profile
  clearCurrentForm();
  loadCachedOfficerInfo();
  
  // Switch to Dashboard
  switchTab('dashboard');
}

// 9. Inspection Visits & Timeline Matrix Logic
function populateTimelineFilters() {
  const blockSelect = document.getElementById('timeline-block-filter');
  if (blockSelect && blockSelect.options.length <= 1) {
    blockSelect.innerHTML = '<option value="">सभी विकासखंड (All Blocks)</option>';
    ['DANTEWADA', 'GEEDAM', 'KATEKALYAN', 'KUAKONDA'].forEach(b => {
      const opt = document.createElement('option');
      opt.value = b;
      opt.innerText = (state.hierarchy && state.hierarchy[b]?.name) ? state.hierarchy[b].name : b;
      blockSelect.appendChild(opt);
    });
  }
}

function onTimelineBlockChanged() {
  const blockVal = document.getElementById('timeline-block-filter')?.value || '';
  const gpSelect = document.getElementById('timeline-panchayat-filter');
  if (!gpSelect) return;
  
  gpSelect.innerHTML = '<option value="">सभी पंचायतें (All GPs)</option>';
  
  const normBlock = getNormalizedBlockKey(blockVal);
  if (normBlock && state.hierarchy && state.hierarchy[normBlock]) {
    const gps = Object.keys(state.hierarchy[normBlock].panchayats || {}).sort();
    gps.forEach(gp => {
      const opt = document.createElement('option');
      opt.value = gp;
      opt.innerText = gp;
      gpSelect.appendChild(opt);
    });
  }
  
  renderInspectionTimelineTable();
}

function onTimelinePanchayatChanged() {
  renderInspectionTimelineTable();
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
  
  renderInspectionTimelineTable();
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

  const normSelectedBlock = getNormalizedBlockKey(blockFilter);

  // Group inspections by departmentId + block + panchayat + village
  const groupsMap = new Map();

  (state.inspections || []).forEach(insp => {
    const deptId = String(insp.departmentId || '0');
    const blockKey = getNormalizedBlockKey(insp.block || '') || (insp.block || '').trim().toUpperCase();
    const gp = (insp.panchayat || '').trim();
    const village = (insp.village || '').trim();
    
    // Composite key for grouping
    const key = `${deptId}__${blockKey}__${gp.toLowerCase()}__${village.toLowerCase()}`;
    
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        key: key,
        departmentId: insp.departmentId,
        block: insp.block,
        panchayat: gp,
        village: village,
        visits: []
      });
    }
    groupsMap.get(key).visits.push(insp);
  });

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

    if (searchVal) {
      const matchVillage = (g.village || '').toLowerCase().includes(searchVal);
      const matchPanchayat = (g.panchayat || '').toLowerCase().includes(searchVal);
      const matchBlock = (g.block || '').toLowerCase().includes(searchVal);
      const matchDept = (getDeptBadge(g.departmentId)?.label || '').toLowerCase().includes(searchVal);
      const matchInVisits = g.visits.some(v => 
        (v.officerName || '').toLowerCase().includes(searchVal) ||
        (v.remarks || '').toLowerCase().includes(searchVal) ||
        (v.id || '').toLowerCase().includes(searchVal)
      );
      if (!matchVillage && !matchPanchayat && !matchBlock && !matchDept && !matchInVisits) {
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

  // Determine max visits across filtered groups
  const maxVisits = Math.max(1, ...filteredGroups.map(g => g.visits.length));

  // Build thead
  let theadHtml = `
    <tr>
      <th class="px-3.5 py-3 sticky left-0 bg-slate-100/95 z-20 w-12 text-center border-r border-slate-200">क्र.</th>
      <th class="px-4 py-3 sticky left-12 bg-slate-100/95 z-20 min-w-[130px] border-r border-slate-200">विभाग</th>
      <th class="px-4 py-3 sticky left-[172px] bg-slate-100/95 z-20 min-w-[200px] border-r border-slate-200 shadow-md">निरीक्षण स्थल (Location)</th>
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

    let rowHtml = `
      <td class="px-3.5 py-3 text-center font-bold text-slate-400 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200">${idx + 1}</td>
      <td class="px-4 py-3 sticky left-12 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200">
        <span class="px-2 py-0.5 rounded text-[8px] font-extrabold uppercase shrink-0 ${deptBadge.bg} ${deptBadge.color}">${deptBadge.label}</span>
      </td>
      <td class="px-4 py-3 sticky left-[172px] bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200 shadow-md">
        <div class="font-extrabold text-slate-800 text-xs">${gpDisplay}${escapeHtml(g.village || 'दंतेवाड़ा')}</div>
        <div class="text-[10px] text-slate-400 font-semibold mt-0.5">${escapeHtml(cleanBlock)}</div>
      </td>
      <td class="px-3 py-3 text-center border-r border-slate-200">
        <span class="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-[10px] font-extrabold whitespace-nowrap">
          ${g.visits.length} विज़िट${g.visits.length > 1 ? '्स' : ''}
        </span>
      </td>
      <td class="px-4 py-3 text-center border-r border-slate-200 bg-blue-50/20">
        <button type="button" onclick="triggerNewVisitForLocation('${escapeJs(String(g.departmentId))}', '${escapeJs(g.block)}', '${escapeJs(g.panchayat)}', '${escapeJs(g.village)}')" 
                class="px-3 py-1.5 bg-blue-600 hover:bg-blue-750 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center space-x-1.5 mx-auto active:scale-95 whitespace-nowrap"
                title="इस स्थल के लिए आगामी निरीक्षण दर्ज करें">
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
          const capText = `Visit ${v+1}: ${g.village || ''} (${formatDateString(item.date)})`;
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
            <div class="p-3 bg-slate-50 hover:bg-blue-50/40 rounded-xl border border-slate-200/80 transition-all cursor-pointer hover:border-blue-300 shadow-xs space-y-1.5" 
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

function triggerNewVisitForLocation(deptId, block, panchayat, village) {
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

  showToast("info", "निरीक्षण फॉर्म तैयार", `${village || ''} (${panchayat || block}) हेतु आगामी निरीक्षण फॉर्म लोड किया गया।`);
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
      <td class="px-6 py-4 font-bold text-slate-500 whitespace-nowrap">${formatDateString(i.date)}</td>
      <td class="px-6 py-4">
        <span class="px-2 py-0.5 rounded text-[8px] font-extrabold uppercase shrink-0 ${badge.bg} ${badge.color}">${badge.label}</span>
      </td>
      <td class="px-6 py-4">
        <div class="font-bold text-slate-800">${gpInfo}${i.village}</div>
        <div class="text-[10px] text-slate-400 font-semibold mt-0.5">${cleanBlock}</div>
      </td>
      <td class="px-6 py-4 font-extrabold text-slate-800">${i.facilityName || i.village || '-'}</td>
      <td class="px-6 py-4 font-semibold text-slate-500">${i.officerName.replace('Sh ', '')}</td>
      <td class="px-6 py-4 text-center">
        <span class="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[9px] font-bold">SUBMITTED</span>
      </td>
      <td class="px-6 py-4 text-right" onclick="event.stopPropagation()">
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
    head.innerHTML = `<tr><th class="px-6 py-3">ID</th><th class="px-6 py-3">संस्था का नाम (School Name)</th><th class="px-6 py-3">विकासखंड (Block)</th><th class="px-6 py-3">ग्राम पंचायत (Panchayat)</th><th class="px-6 py-3">गाँव (Village)</th><th class="px-6 py-3">नक़्शा (Location)</th></tr>`;
  } else if (state.activeMasterTab === 'anganwadi') {
    list = state.anganwadis;
    cols = ['ID', 'Anganwadi Name', 'Block', 'Sector', 'Village', 'Code'];
    head.innerHTML = `<tr><th class="px-6 py-3">ID</th><th class="px-6 py-3">आंगनवाड़ी केंद्र (AWC Name)</th><th class="px-6 py-3">विकासखंड (Block)</th><th class="px-6 py-3">सेक्टर (Sector)</th><th class="px-6 py-3">गाँव (Village)</th><th class="px-6 py-3">कोड (AWC Code)</th></tr>`;
  } else if (state.activeMasterTab === 'health_center') {
    list = state.health_centers;
    cols = ['ID', 'Health Center', 'Block', 'Village', 'Location'];
    head.innerHTML = `<tr><th class="px-6 py-3">ID</th><th class="px-6 py-3">स्वास्थ्य केंद्र का नाम</th><th class="px-6 py-3">विकासखंड (Block)</th><th class="px-6 py-3">गाँव (Village)</th><th class="px-6 py-3">भौगोलिक स्थिति</th></tr>`;
  } else if (state.activeMasterTab === 'vet_center') {
    list = state.vet_centers;
    cols = ['ID', 'Vet Center', 'Block', 'Village', 'Location'];
    head.innerHTML = `<tr><th class="px-6 py-3">ID</th><th class="px-6 py-3">पशु चिकित्सा केंद्र</th><th class="px-6 py-3">विकासखंड (Block)</th><th class="px-6 py-3">गाँव (Village)</th><th class="px-6 py-3">नक़्शा स्थिति</th></tr>`;
  } else if (state.activeMasterTab === 'officer') {
    list = state.officers;
    cols = ['ID', 'Officer Name', 'Designation'];
    head.innerHTML = `<tr><th class="px-6 py-3">ID</th><th class="px-6 py-3">अधिकारी का नाम (Officer Name)</th><th class="px-6 py-3">पदनाम (Designation)</th></tr>`;
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
    body.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-slate-400 font-bold">कोई रिकॉर्ड नहीं मिला।</td></tr>`;
    return;
  }
  
  filtered.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50 transition-colors border-b border-slate-100";
    
    if (state.activeMasterTab === 'school') {
      const coordsStr = item.latitude ? `${item.latitude}, ${item.longitude}` : "N/A";
      tr.innerHTML = `<td class="px-6 py-3 font-semibold text-slate-500">${item.id}</td><td class="px-6 py-3 font-bold text-slate-800">${item.name}</td><td class="px-6 py-3 font-semibold">${item.block}</td><td class="px-6 py-3 font-semibold">${item.panchayat}</td><td class="px-6 py-3 font-semibold">${item.village}</td><td class="px-6 py-3 text-blue-600 font-semibold">${coordsStr}</td>`;
    } else if (state.activeMasterTab === 'anganwadi') {
      tr.innerHTML = `<td class="px-6 py-3 font-semibold text-slate-500">${item.id}</td><td class="px-6 py-3 font-bold text-slate-800">${item.name}</td><td class="px-6 py-3 font-semibold">${item.block}</td><td class="px-6 py-3 font-semibold">${item.sector}</td><td class="px-6 py-3 font-semibold">${item.village}</td><td class="px-6 py-3 text-slate-500 font-semibold">${item.code || 'N/A'}</td>`;
    } else if (state.activeMasterTab === 'health_center') {
      const coordsStr = item.latitude ? `${item.latitude}, ${item.longitude}` : "N/A";
      tr.innerHTML = `<td class="px-6 py-3 font-semibold text-slate-500">${item.id}</td><td class="px-6 py-3 font-bold text-slate-800">${item.name}</td><td class="px-6 py-3 font-semibold">${item.block}</td><td class="px-6 py-3 font-semibold">${item.village}</td><td class="px-6 py-3 text-blue-600 font-semibold">${coordsStr}</td>`;
    } else if (state.activeMasterTab === 'vet_center') {
      const coordsStr = item.latitude ? `${item.latitude}, ${item.longitude}` : "N/A";
      tr.innerHTML = `<td class="px-6 py-3 font-semibold text-slate-500">${item.id}</td><td class="px-6 py-3 font-bold text-slate-800">${item.name}</td><td class="px-6 py-3 font-semibold">${item.block}</td><td class="px-6 py-3 font-semibold">${item.village}</td><td class="px-6 py-3 text-blue-600 font-semibold">${coordsStr}</td>`;
    } else if (state.activeMasterTab === 'officer') {
      tr.innerHTML = `<td class="px-6 py-3 font-semibold text-slate-500">${item.id}</td><td class="px-6 py-3 font-extrabold text-slate-800">${item.name}</td><td class="px-6 py-3"><span class="px-2 py-0.5 bg-blue-50 text-blue-650 border border-blue-100 rounded-lg text-[9px] font-bold">${item.designation}</span></td>`;
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
        <td class="py-2.5 pr-4 text-xs text-slate-450 font-bold w-1/2">${p.label}</td>
        <td class="py-2.5 text-xs text-slate-800 font-semibold w-1/2">${val}</td>
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
          <img src="${i.photo}" alt="Inspection view" class="w-full h-44 object-cover rounded-lg">
        </div>
      </div>
    `;
  }
  if (i.actionPhoto) {
    photoSection += `
      <div class="space-y-1.5 flex-1">
        <span class="text-[9px] text-slate-400 font-bold uppercase block">विभाग कार्रवाई छायाचित्र (Action Taken Photo):</span>
        <div class="rounded-xl overflow-hidden border border-slate-200 bg-slate-50 p-1">
          <img src="${i.actionPhoto}" alt="Action Taken view" class="w-full h-44 object-cover rounded-lg">
        </div>
      </div>
    `;
  }
  
  let mediaContainer = "";
  if (photoSection) {
    mediaContainer = `
      <div class="flex flex-col sm:flex-row gap-5 pt-4 border-t border-slate-100">
        ${photoSection}
      </div>
    `;
  }
  
  const cleanBlock = i.block.replace(' (221622)', '').replace(' (221608)', '').replace(' (221615)', '').replace(' (221631)', '');
  
  const contentArea = document.getElementById('modal-content-area');
  contentArea.innerHTML = `
    <!-- Detail card layout print styled -->
    <div class="print-card space-y-5">
      <!-- Info Header Grid -->
      <div class="grid grid-cols-2 gap-4 bg-slate-50 p-4 border border-slate-150 rounded-2xl">
        <div>
          <span class="text-[9px] text-slate-400 font-bold uppercase block">${i.facilityName ? 'शासकीय संस्था (Facility)' : 'निरीक्षण स्थल (Location)'}</span>
          <h4 class="text-xs font-extrabold text-slate-800">${i.facilityName || i.village}</h4>
          <p class="text-[10px] text-slate-500 font-bold mt-0.5">${i.village} (${cleanBlock})</p>
        </div>
        <div>
          <span class="text-[9px] text-slate-400 font-bold uppercase block">निरीक्षक अधिकारी (Officer)</span>
          <h4 class="text-xs font-extrabold text-slate-800">${i.officerName}</h4>
          <p class="text-[10px] text-slate-500 font-bold mt-0.5">${[i.officerDesignation, i.officerPhone].filter(Boolean).join(' • ') || 'दिनांक: ' + formatDateString(i.date)}</p>
        </div>
        <div class="col-span-2 border-t border-slate-200/50 pt-2 flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="text-[9px] text-slate-400 font-bold uppercase">विभाग (Department):</span>
            <span class="px-2 py-0.5 rounded text-[8px] font-extrabold uppercase ${badge.bg} ${badge.color}">${badge.label}</span>
          </div>
          <span class="text-[8px] font-bold text-slate-400 uppercase">ID: ${i.id}</span>
        </div>
      </div>
      
      <!-- Remarks Callout -->
      <div class="border-l-4 border-blue-500 bg-blue-50/50 p-4 rounded-r-xl">
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
