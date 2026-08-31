// Collector Portal - Core Frontend Application Logic

// Google Apps Script Web App API URL.
// Put your deployed Google Apps Script URL here to enable Sheets integration.
const API_URL = "https://script.google.com/macros/s/AKfycbyLzcOSx4m60yK6dT2-hAiOuHonRPvJQP-PGnz1V1XUg4I-CNTlnpwNK28TQN7d6Xy94w/exec";

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

// DOM Initialization
document.addEventListener('DOMContentLoaded', () => {
  initializeDatabase();
  setupNavigation();
  populateHeaderOfficerSelect();
  switchTab('dashboard');
  
  // Set current date on New Inspection Form
  const dateInput = document.getElementById('form-input-date');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  
  // Setup auto-save drafts checking
  setupDraftAutoSave();
  
  // Fetch dynamic database from Google Sheets API
  fetchDatabase();
});

// 1. Initialize State from Compiled database.js & LocalStorage
function initializeDatabase() {
  if (typeof REAL_DATABASE !== 'undefined') {
    state.officers = [...REAL_DATABASE.officers];
    state.schools = [...REAL_DATABASE.schools];
    state.anganwadis = [...REAL_DATABASE.anganwadis];
    state.health_centers = [...REAL_DATABASE.health_centers];
    state.vet_centers = [...REAL_DATABASE.vet_centers];
    
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
  const finalApiUrl = localStorage.getItem('inspection_api_url') || API_URL;
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
    updateDashboardStats();
    renderInspectionsList();
    renderPhysicalProjectsGrid();
    
    // If maps libraries are loaded and elements exist, rebuild map
    if (typeof L !== 'undefined') {
      try {
        initLeafletMaps();
      } catch (me) {
        console.error("Leaflet rebuild map error:", me);
      }
    }
    
    console.log("Successfully loaded dynamic data from Google Sheets.");
  } catch (err) {
    console.error("Failed to load database from Apps Script URL:", err);
  }
}

// Sync new inspection to Google Sheets API
async function syncInspectionToAPI(inspection) {
  const finalApiUrl = localStorage.getItem('inspection_api_url') || API_URL;
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
  const finalApiUrl = localStorage.getItem('inspection_api_url') || API_URL;
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
  const finalApiUrl = localStorage.getItem('inspection_api_url') || API_URL;
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
    'physical': 'भौतिक प्रगति एवं निर्माण कार्यों का अनुश्रवण (Construction Progress)',
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
  } else if (tabId === 'physical') {
    renderPhysicalProjectsGrid();
  } else if (tabId === 'reports') {
    populateReportsFilters();
    renderReportsTable();
  } else if (tabId === 'master') {
    switchMasterSubTab(state.activeMasterTab);
  }
  
  // Update print date/time stamp
  document.getElementById('print-timestamp').innerText = `प्रिंट रिपोर्ट तिथि: ${new Date().toLocaleDateString('hi-IN')} | समय: ${new Date().toLocaleTimeString('hi-IN')}`;
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
            <h5 class="text-xs font-bold text-slate-800 truncate">${i.facilityName}</h5>
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
  const searchVal = document.getElementById('map-search').value.toLowerCase();
  const inspectionFilter = document.getElementById('map-inspection-filter').value;
  
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
  
  // Apply block & search filters
  let filtered = listToRender.filter(item => {
    // block filter
    if (blockFilter && !item.block.toUpperCase().includes(blockFilter)) return false;
    
    // search filter
    if (searchVal) {
      const matchName = item.displayName.toLowerCase().includes(searchVal);
      const matchVillage = item.village && item.village.toLowerCase().includes(searchVal);
      if (!matchName && !matchVillage) return false;
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

function triggerNewInspectionFromMap(category, name, block, village, lat, lng) {
  // Map category to department ID
  const depts = {'school': 1, 'health': 2, 'anganwadi': 3, 'veterinary': 4};
  const deptId = depts[category] || 1;
  
  // Go to New Inspection Form Tab
  switchTab('new-inspection');
  
  // Populate form fields
  document.getElementById('form-select-dept').value = deptId;
  onFormDeptChanged(deptId);
  
  // We need to set block properly
  // Let's strip brackets if any or match option
  const blockSelect = document.getElementById('form-select-block');
  for (let i = 0; i < blockSelect.options.length; i++) {
    if (block.toUpperCase().includes(blockSelect.options[i].value)) {
      blockSelect.value = blockSelect.options[i].value;
      break;
    }
  }
  
  document.getElementById('form-input-village').value = village;
  document.getElementById('form-input-facility').value = name;
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

function showFacilitySuggestions(query) {
  const deptId = parseInt(document.getElementById('form-select-dept').value);
  const block = document.getElementById('form-select-block').value;
  const listEl = document.getElementById('facility-autocomplete-list');
  
  if (!deptId || query.length < 2) {
    listEl.classList.add('hidden');
    return;
  }
  
  // Get corresponding facility lists
  let list = [];
  if (deptId === 1) list = state.schools;
  else if (deptId === 2) list = state.health_centers;
  else if (deptId === 3) list = state.anganwadis;
  else if (deptId === 4) list = state.vet_centers;
  
  // Filter list by block (if selected) and query
  const filtered = list.filter(item => {
    if (block && !item.block.toUpperCase().includes(block)) return false;
    return item.name.toLowerCase().includes(query.toLowerCase());
  }).slice(0, 10);
  
  if (filtered.length === 0) {
    listEl.classList.add('hidden');
    return;
  }
  
  listEl.innerHTML = "";
  filtered.forEach(item => {
    const div = document.createElement('div');
    div.className = "autocomplete-suggestion font-semibold text-slate-700 hover:bg-slate-50";
    div.innerText = `${item.name} (${item.village})`;
    div.onclick = () => {
      document.getElementById('form-input-facility').value = item.name;
      document.getElementById('form-input-village').value = item.village;
      
      // Auto set block dropdown
      const blockSelect = document.getElementById('form-select-block');
      for (let i = 0; i < blockSelect.options.length; i++) {
        if (item.block.toUpperCase().includes(blockSelect.options[i].value)) {
          blockSelect.value = blockSelect.options[i].value;
          break;
        }
      }
      
      // Set GPS
      if (item.latitude) {
        document.getElementById('form-gps-lat').value = item.latitude;
        document.getElementById('form-gps-lng').value = item.longitude;
      } else {
        document.getElementById('form-gps-lat').value = "";
        document.getElementById('form-gps-lng').value = "";
      }
      
      listEl.classList.add('hidden');
      
      // trigger auto save draft
      saveCurrentFormDraft();
    };
    listEl.appendChild(div);
  });
  
  listEl.classList.remove('hidden');
}

// Close autocomplete suggestions click outside
document.addEventListener('click', (e) => {
  const listEl = document.getElementById('facility-autocomplete-list');
  const inputEl = document.getElementById('form-input-facility');
  if (listEl && inputEl && !listEl.contains(e.target) && e.target !== inputEl) {
    listEl.classList.add('hidden');
  }
});

function onFormBlockChanged() {
  // Clear facility name and village when block changes to prevent mismatch
  document.getElementById('form-input-facility').value = "";
  document.getElementById('form-input-village').value = "";
  document.getElementById('form-gps-lat').value = "";
  document.getElementById('form-gps-lng').value = "";
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
  const coreFields = ['form-select-dept', 'form-select-block', 'form-input-village', 'form-input-facility', 'form-gps-lat', 'form-gps-lng', 'form-input-date', 'form-input-remarks'];
  coreFields.forEach(fid => {
    const el = document.getElementById(fid);
    if (el) {
      el.addEventListener('input', () => saveCurrentFormDraft());
    }
  });
}

function saveCurrentFormDraft() {
  const deptId = document.getElementById('form-select-dept').value;
  if (!deptId) return;
  
  // Collect values
  const payload = {
    deptId: deptId,
    block: document.getElementById('form-select-block').value,
    village: document.getElementById('form-input-village').value,
    facilityName: document.getElementById('form-input-facility').value,
    lat: document.getElementById('form-gps-lat').value,
    lng: document.getElementById('form-gps-lng').value,
    date: document.getElementById('form-input-date').value,
    remarks: document.getElementById('form-input-remarks').value,
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
}

function loadDraftForDepartment(deptId) {
  const draft = state.drafts[deptId];
  if (!draft) {
    // Clear dynamic fields
    return;
  }
  
  // Fill core fields
  document.getElementById('form-select-block').value = draft.block || "";
  document.getElementById('form-input-village').value = draft.village || "";
  document.getElementById('form-input-facility').value = draft.facilityName || "";
  document.getElementById('form-gps-lat').value = draft.lat || "";
  document.getElementById('form-gps-lng').value = draft.lng || "";
  document.getElementById('form-input-date').value = draft.date || new Date().toISOString().split('T')[0];
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
  document.getElementById('form-input-village').value = "";
  document.getElementById('form-input-facility').value = "";
  document.getElementById('form-gps-lat').value = "";
  document.getElementById('form-gps-lng').value = "";
  document.getElementById('form-input-remarks').value = "";
  document.getElementById('form-file-photo').value = "";
  document.getElementById('photo-preview-box').innerHTML = '<i class="fa-solid fa-image text-xl"></i>';
  document.getElementById('form-file-action-photo').value = "";
  document.getElementById('action-photo-preview-box').innerHTML = '<i class="fa-solid fa-image text-xl"></i>';
  
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
  
  const deptId = document.getElementById('form-select-dept').value;
  const block = document.getElementById('form-select-block').value;
  const village = document.getElementById('form-input-village').value;
  const facilityName = document.getElementById('form-input-facility').value;
  const remarks = document.getElementById('form-input-remarks').value;
  const date = document.getElementById('form-input-date').value;
  
  if (!deptId || !block || !village || !facilityName || !remarks || !date) {
    showToast("error", "त्रुटि", "कृपया सभी अनिवार्य (*) फ़ील्ड भरें!");
    return;
  }
  
  // Capture photo values
  const photoBox = document.getElementById('photo-preview-box');
  const actionPhotoBox = document.getElementById('action-photo-preview-box');
  const photoImg = photoBox.querySelector('img');
  const actionPhotoImg = actionPhotoBox.querySelector('img');
  
  // Retrieve officer name
  const officerObj = state.officers.find(o => o.id === state.currentOfficerId);
  const officerName = officerObj ? officerObj.name : "Unknown Officer";
  
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
    panchayat: village.toUpperCase(),
    village: village,
    facilityName: facilityName,
    date: date,
    officerName: officerName,
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
  
  // Success Toast & Redirect to Dashboard
  showToast("success", "सफलतापूर्वक सहेजा गया", `${facilityName} का निरीक्षण सफलतापूर्वक सहेज लिया गया है।`);
  
  // Clear forms inputs
  clearCurrentForm();
  
  // Switch to Dashboard
  switchTab('dashboard');
}

// 9. Physical Progress Tracker
function renderPhysicalProjectsGrid() {
  const grid = document.getElementById('physical-projects-grid');
  if (!grid) return;
  grid.innerHTML = "";
  
  if (state.physical_projects.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-16 text-center text-slate-400 font-bold">कोई निर्माणाधीन कार्य उपलब्ध नहीं है।</div>`;
    return;
  }
  
  state.physical_projects.forEach(p => {
    const card = document.createElement('div');
    card.className = "bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover-card flex flex-col justify-between";
    
    // Status Badge classes
    let statusClass = "bg-amber-50 text-amber-600 border-amber-100";
    if (p.status === 'Completed') {
      statusClass = "bg-emerald-50 text-emerald-600 border-emerald-100";
    }
    
    const progressInt = parseInt(p.progressPercent);
    const cleanBlock = p.block.replace(' (221622)', '').replace(' (221608)', '').replace(' (221615)', '').replace(' (221631)', '');
    
    card.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-3.5">
          <span class="px-2 py-0.5 border text-[9px] uppercase font-bold rounded-lg ${statusClass}">${p.status}</span>
          <span class="text-[9px] font-bold text-slate-400 uppercase">${p.type}</span>
        </div>
        <h4 class="text-xs font-extrabold text-slate-800 line-clamp-2">${p.name}</h4>
        <p class="text-[10px] text-slate-450 font-bold mt-1.5"><i class="fa-solid fa-location-dot text-slate-400 mr-1"></i>${p.village} (${cleanBlock})</p>
        
        <!-- Progress Bar -->
        <div class="mt-4">
          <div class="flex items-center justify-between text-[10px] font-extrabold text-slate-500 mb-1.5">
            <span>भौतिक प्रगति (Progress)</span>
            <span class="text-blue-600">${progressInt}%</span>
          </div>
          <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200/50">
            <div class="h-full bg-blue-500 rounded-full" style="width: ${progressInt}%"></div>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-50 text-[10px] text-slate-450 font-bold">
          <div>
            <span class="text-slate-400 block text-[9px]">अंतिम निरीक्षण</span>
            <span>${p.visits.length > 0 ? formatDateString(p.visits[p.visits.length-1].date) : "N/A"}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[9px]">लक्षित पूर्णता तिथि</span>
            <span>${formatDateString(p.targetDate)}</span>
          </div>
        </div>
      </div>
      
      <button onclick="openProjectTimelineModal('${p.id}')" class="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 py-2 border border-slate-250/70 rounded-xl text-xs font-bold shadow-sm transition-all mt-5 uppercase">
        प्रगति समय-रेखा और निरीक्षण लॉग &rarr;
      </button>
    `;
    grid.appendChild(card);
  });
}

function openProjectTimelineModal(projId) {
  const p = state.physical_projects.find(proj => proj.id === projId);
  if (!p) return;
  
  document.getElementById('timeline-project-id').value = p.id;
  document.getElementById('timeline-modal-title').innerText = p.name;
  
  const cleanBlock = p.block.replace(' (221622)', '').replace(' (221608)', '').replace(' (221615)', '').replace(' (221631)', '');
  document.getElementById('timeline-modal-subtitle').innerText = `प्रकार: ${p.type} | कार्यान्वयन विभाग: ${p.department} | स्थान: ${p.village} (${cleanBlock})`;
  
  // Render chronological timeline
  const container = document.getElementById('timeline-progression-container');
  container.innerHTML = "";
  
  if (p.visits.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 py-6 text-center">इस परियोजना का कोई पिछला निरीक्षण इतिहास उपलब्ध नहीं है।</p>`;
  } else {
    // Add timeline line
    const line = document.createElement('div');
    line.className = "timeline-line";
    container.appendChild(line);
    
    // Sort visits chronologically (newest at bottom/top? let's show oldest to newest to trace building progression)
    const sortedVisits = [...p.visits].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    sortedVisits.forEach((v, idx) => {
      const item = document.createElement('div');
      item.className = "timeline-item";
      
      // Determine if completed
      let dotClass = "";
      if (v.stage === 'Completed') {
        dotClass = "completed";
      } else if (idx === sortedVisits.length - 1) {
        dotClass = "in-progress";
      }
      
      // Check if image exists
      let photoHtml = "";
      if (v.photo) {
        photoHtml = `
          <div class="mt-3 max-w-sm rounded-lg overflow-hidden border border-slate-200 shadow-sm relative cursor-pointer" onclick="openPhotoLightBox('${v.photo}')">
            <img src="${v.photo}" alt="Progress photo" class="w-full h-40 object-cover hover:scale-105 transition-transform duration-300">
            <span class="absolute bottom-2 right-2 bg-slate-900/60 text-white text-[9px] px-2 py-0.5 rounded uppercase font-bold tracking-wider">विस्तृत देखें</span>
          </div>
        `;
      }
      
      item.innerHTML = `
        <div class="timeline-dot ${dotClass}"></div>
        <div class="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-sm">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-150 pb-2 mb-2">
            <div class="flex items-center space-x-2">
              <span class="text-xs font-extrabold text-blue-900">${v.stage}</span>
              <span class="bg-blue-600/10 text-blue-600 text-[9px] px-1.5 py-0.5 rounded font-bold">${v.progressPercent}% प्रगति</span>
            </div>
            <span class="text-[10px] text-slate-400 font-bold">${formatDateString(v.date)}</span>
          </div>
          <p class="text-xs text-slate-700 leading-relaxed font-semibold">${v.remarks}</p>
          <p class="text-[9px] text-slate-400 mt-2 font-bold uppercase"><i class="fa-solid fa-user text-slate-350 mr-1"></i>निरीक्षक: ${v.officerName}</p>
          ${photoHtml}
        </div>
      `;
      container.appendChild(item);
    });
  }
  
  // Show modal
  document.getElementById('project-timeline-modal').classList.remove('hidden');
}

function closeTimelineModal() {
  document.getElementById('project-timeline-modal').classList.add('hidden');
  
  // Clear log form fields
  document.getElementById('visit-select-stage').value = "";
  document.getElementById('visit-input-progress').value = "";
  document.getElementById('visit-input-remarks').value = "";
  document.getElementById('visit-file-photo').value = "";
  document.getElementById('visit-photo-preview-box').innerHTML = '<i class="fa-solid fa-image text-lg"></i>';
}

function handleProjectVisitSubmit(e) {
  e.preventDefault();
  
  const projId = document.getElementById('timeline-project-id').value;
  const stage = document.getElementById('visit-select-stage').value;
  const progressPercent = document.getElementById('visit-input-progress').value;
  const remarks = document.getElementById('visit-input-remarks').value;
  
  if (!projId || !stage || !progressPercent || !remarks) {
    showToast("error", "त्रुटि", "कृपया सभी अनिवार्य क्षेत्र भरें!");
    return;
  }
  
  const p = state.physical_projects.find(proj => proj.id === projId);
  if (!p) return;
  
  // Get active officer
  const officerObj = state.officers.find(o => o.id === state.currentOfficerId);
  const officerName = officerObj ? officerObj.name : "Unknown Officer";
  
  // Capture photo
  const photoBox = document.getElementById('visit-photo-preview-box');
  const img = photoBox.querySelector('img');
  
  const newVisit = {
    id: "PV_" + projId + "_" + (p.visits.length + 1),
    date: new Date().toISOString().split('T')[0],
    stage: stage,
    progressPercent: parseInt(progressPercent),
    officerName: officerName,
    remarks: remarks,
    photo: img ? img.src : ""
  };
  
  // Append visit and update project core values
  p.visits.push(newVisit);
  p.progressPercent = parseInt(progressPercent);
  p.currentStage = stage;
  if (parseInt(progressPercent) === 100) {
    p.status = 'Completed';
  } else {
    p.status = 'In Progress';
  }
  
  // Write updated projects array to localstorage
  let customProjs = [];
  const savedProjs = localStorage.getItem('officers_inspector_portal_projects');
  if (savedProjs) {
    try {
      customProjs = JSON.parse(savedProjs);
    } catch (e) {}
  }
  
  // Update customProjs array (replace or push)
  const idx = customProjs.findIndex(cp => cp.id === projId);
  if (idx !== -1) {
    customProjs[idx] = p;
  } else {
    customProjs.push(p);
  }
  localStorage.setItem('officers_inspector_portal_projects', JSON.stringify(customProjs));
  
  // Sync to remote API
  syncProjectVisitToAPI(projId, newVisit, p.progressPercent, p.currentStage, p.status);
  
  // Show Toast, Redraw timeline and update grids
  showToast("success", "निरीक्षण सहेजा गया", "भौतिक प्रगति निरीक्षण विजिट सफलतापूर्वक सहेजी गई।");
  closeTimelineModal();
  renderPhysicalProjectsGrid();
}

function openNewProjectModal() {
  document.getElementById('add-project-modal').classList.remove('hidden');
  
  // set default date
  document.getElementById('new-proj-date').value = new Date(Date.now() + 60*24*60*60*1000).toISOString().split('T')[0];
}

function closeNewProjectModal() {
  document.getElementById('add-project-modal').classList.add('hidden');
  document.getElementById('new-project-form').reset();
}

function handleNewProjectSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('new-proj-name').value;
  const type = document.getElementById('new-proj-type').value;
  const dept = document.getElementById('new-proj-dept').value;
  const block = document.getElementById('new-proj-block').value;
  const village = document.getElementById('new-proj-village').value;
  const targetDate = document.getElementById('new-proj-date').value;
  const initProgress = document.getElementById('new-proj-progress').value;
  
  const pid = "PPROJ_NEW_" + Math.random().toString(36).substring(2, 10);
  
  // Default coordinates fallback to center of district
  const newProj = {
    id: pid,
    name: name,
    type: type,
    department: dept,
    block: block,
    village: village,
    latitude: 18.88,
    longitude: 81.30,
    targetDate: targetDate,
    status: parseInt(initProgress) === 100 ? "Completed" : "In Progress",
    currentStage: "Foundation",
    progressPercent: parseInt(initProgress),
    visits: []
  };
  
  // Push initial visit if progress is > 0
  if (parseInt(initProgress) > 0) {
    const officerObj = state.officers.find(o => o.id === state.currentOfficerId);
    newProj.visits.push({
      id: "PV_" + pid + "_1",
      date: new Date().toISOString().split('T')[0],
      stage: "Foundation",
      progressPercent: parseInt(initProgress),
      officerName: officerObj ? officerObj.name : "System",
      remarks: "परियोजना का उद्घाटन एवं निर्माण कार्य का आरंभ किया गया।",
      photo: ""
    });
  }
  
  // Save to state & localstorage
  state.physical_projects.push(newProj);
  
  let customProjs = [];
  const savedProjs = localStorage.getItem('officers_inspector_portal_projects');
  if (savedProjs) {
    try {
      customProjs = JSON.parse(savedProjs);
    } catch (e) {}
  }
  customProjs.push(newProj);
  localStorage.setItem('officers_inspector_portal_projects', JSON.stringify(customProjs));
  
  // Sync to remote API
  syncNewProjectToAPI(newProj);
  
  showToast("success", "सफलता", "नया भौतिक प्रगति निर्माण कार्य सफलतापूर्वक जोड़ा गया है।");
  closeNewProjectModal();
  renderPhysicalProjectsGrid();
}

// 10. Reports View & Export CSV Logic
function populateReportsFilters() {
  const select = document.getElementById('report-officer-filter');
  if (!select || select.options.length > 1) return; // already populated
  
  state.officers.forEach(off => {
    const opt = document.createElement('option');
    opt.value = off.name;
    opt.innerText = off.name;
    select.appendChild(opt);
  });
}

function renderReportsTable() {
  const tbody = document.getElementById('reports-table-body');
  const empty = document.getElementById('reports-empty-state');
  if (!tbody) return;
  tbody.innerHTML = "";
  
  const searchVal = document.getElementById('report-search').value.toLowerCase();
  const deptFilter = document.getElementById('report-dept-filter').value;
  const officerFilter = document.getElementById('report-officer-filter').value;
  const blockFilter = document.getElementById('report-block-filter').value;
  
  let filtered = state.inspections.filter(i => {
    if (deptFilter && parseInt(i.departmentId) !== parseInt(deptFilter)) return false;
    if (officerFilter && i.officerName !== officerFilter) return false;
    if (blockFilter && !i.block.toUpperCase().includes(blockFilter)) return false;
    
    if (searchVal) {
      const matchName = i.facilityName.toLowerCase().includes(searchVal);
      const matchRemarks = i.remarks.toLowerCase().includes(searchVal);
      const matchVillage = i.village.toLowerCase().includes(searchVal);
      if (!matchName && !matchRemarks && !matchVillage) return false;
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
    
    tr.innerHTML = `
      <td class="px-6 py-4 font-bold text-slate-500 whitespace-nowrap">${formatDateString(i.date)}</td>
      <td class="px-6 py-4">
        <span class="px-2 py-0.5 rounded text-[8px] font-extrabold uppercase shrink-0 ${badge.bg} ${badge.color}">${badge.label}</span>
      </td>
      <td class="px-6 py-4">
        <div class="font-bold text-slate-800">${i.village}</div>
        <div class="text-[10px] text-slate-400 font-semibold mt-0.5">${cleanBlock}</div>
      </td>
      <td class="px-6 py-4 font-extrabold text-slate-800">${i.facilityName}</td>
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
  renderReportsTable();
}

function exportReportsCSV() {
  // Build CSV payload
  let csv = 'Inspection ID,Date,Department,Block,Village,Facility Name,Officer Name,Remarks\n';
  
  const searchVal = document.getElementById('report-search').value.toLowerCase();
  const deptFilter = document.getElementById('report-dept-filter').value;
  const officerFilter = document.getElementById('report-officer-filter').value;
  const blockFilter = document.getElementById('report-block-filter').value;
  
  let filtered = state.inspections.filter(i => {
    if (deptFilter && parseInt(i.departmentId) !== parseInt(deptFilter)) return false;
    if (officerFilter && i.officerName !== officerFilter) return false;
    if (blockFilter && !i.block.toUpperCase().includes(blockFilter)) return false;
    
    if (searchVal) {
      const matchName = i.facilityName.toLowerCase().includes(searchVal);
      const matchRemarks = i.remarks.toLowerCase().includes(searchVal);
      const matchVillage = i.village.toLowerCase().includes(searchVal);
      if (!matchName && !matchRemarks && !matchVillage) return false;
    }
    return true;
  });
  
  filtered.forEach(i => {
    const deptBadge = getDeptBadge(i.departmentId);
    // Escape remarks for CSV quotes
    const cleanRemarks = i.remarks.replace(/"/g, '""');
    csv += `"${i.id}","${i.date}","${deptBadge.label}","${i.block}","${i.village}","${i.facilityName}","${i.officerName}","${cleanRemarks}"\n`;
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
          <span class="text-[9px] text-slate-400 font-bold uppercase block">शासकीय संस्था (Facility)</span>
          <h4 class="text-xs font-extrabold text-slate-800">${i.facilityName}</h4>
          <p class="text-[10px] text-slate-500 font-bold mt-0.5">${i.village} (${cleanBlock})</p>
        </div>
        <div>
          <span class="text-[9px] text-slate-400 font-bold uppercase block">निरीक्षक अधिकारी (Officer)</span>
          <h4 class="text-xs font-extrabold text-slate-800">${i.officerName}</h4>
          <p class="text-[10px] text-slate-500 font-bold mt-0.5">दिनांक: ${formatDateString(i.date)}</p>
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
function formatDateString(str) {
  if (!str) return "N/A";
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleDateString('hi-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return str;
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

// Global API configuration helper
function configureApiUrl() {
  const currentUrl = localStorage.getItem('inspection_api_url') || API_URL;
  const url = prompt("Google Apps Script Web App URL दर्ज करें (Enter Apps Script URL):", currentUrl);
  if (url !== null) {
    localStorage.setItem('inspection_api_url', url.trim());
    alert("API URL सहेज ली गई है! एप्लिकेशन अब रीलोड होगी।");
    window.location.reload();
  }
}
