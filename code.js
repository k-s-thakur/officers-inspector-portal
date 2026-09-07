// Google Apps Script for Officers Inspection & Monitoring Portal
// This script serves as a REST API for the frontend web application.
// Copy Code.gs and PhotoUpload.gs into your Google Apps Script project (extensions > Apps Script).

const CONFIG = {
  DRIVE_FOLDER_ID: PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID") || "1zNYATkOkdmReiaodO6PG2oUqyksuXcIa",
  SPREADSHEET_ID: PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || "",
  INSPECTIONS_SHEET_NAME: PropertiesService.getScriptProperties().getProperty("INSPECTIONS_SHEET_NAME") || "inspections"
};

let REQUEST_CONFIG = {};

function getRuntimeConfig() {
  return {
    DRIVE_FOLDER_ID: REQUEST_CONFIG.driveFolderId || CONFIG.DRIVE_FOLDER_ID,
    SPREADSHEET_ID: REQUEST_CONFIG.spreadsheetId || CONFIG.SPREADSHEET_ID,
    INSPECTIONS_SHEET_NAME: REQUEST_CONFIG.inspectionsSheetName || CONFIG.INSPECTIONS_SHEET_NAME
  };
}

function getSpreadsheet() {
  const config = getRuntimeConfig();
  if (config.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(config.SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  const ss = getSpreadsheet();
  const config = getRuntimeConfig();
  const resolvedName = name === "inspections" ? config.INSPECTIONS_SHEET_NAME : name;
  let sheet = ss.getSheetByName(resolvedName);
  if (!sheet) {
    sheet = ss.insertSheet(resolvedName);
  }
  return sheet;
}

// 1. GET Request Handler - Fetches database from Google Sheets
function doGet(e) {
  const action = e ? (e.parameter.action || "getData") : "getData";
  if (e && e.parameter) {
    REQUEST_CONFIG = {
      driveFolderId: e.parameter.driveFolderId || "",
      spreadsheetId: e.parameter.spreadsheetId || "",
      inspectionsSheetName: e.parameter.inspectionsSheetName || ""
    };
  }
  
  if (action === "getData") {
    try {
      const data = {
        officers: readSheetData("officers"),
        schools: readSheetData("schools"),
        anganwadis: readSheetData("anganwadis"),
        health_centers: readSheetData("health_centers"),
        vet_centers: readSheetData("vet_centers"),
        inspections: readSheetData("inspections", true), // parses 'responses' JSON
        physical_projects: readSheetData("physical_projects", false, true) // parses 'visits' JSON
      };
      
      return JSONResponse(data);
    } catch (err) {
      return JSONResponse({ error: err.toString() }, 500);
    }
  }
  
  return JSONResponse({ error: "Invalid action" }, 400);
}

// Helper to read data from a sheet and convert to array of objects
function readSheetData(sheetName, parseResponses = false, parseVisits = false) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Only header or empty
  
  const headers = data[0];
  const rows = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const item = {};
    let isEmpty = true;
    for (let j = 0; j < headers.length; j++) {
      let val = row[j];
      const header = headers[j];
      if (val !== "") isEmpty = false;
      
      // Parse JSON string fields back to objects
      if (header === "responses" && parseResponses && typeof val === "string" && val !== "") {
        try {
          val = JSON.parse(val);
        } catch (e) {
          val = {};
        }
      }
      if (header === "visits" && parseVisits && typeof val === "string" && val !== "") {
        try {
          val = JSON.parse(val);
        } catch (e) {
          val = [];
        }
      }
      item[header] = val;
    }
    if (!isEmpty) {
      rows.push(item);
    }
  }
  return rows;
}

// 2. POST Request Handler - Accepts new data or seeds database
function doPost(e) {
  try {
    let postData;
    if (e && e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else {
      return JSONResponse({ error: "No post data received" }, 400);
    }
    
    const action = postData.action;
    REQUEST_CONFIG = postData.config || {};
    
    if (action === "seed") {
      // Seed databases from migration script
      const db = postData.database;
      if (!db) return JSONResponse({ error: "Missing database object for seeding" }, 400);
      
      seedSheet("officers", db.officers);
      seedSheet("schools", db.schools);
      seedSheet("anganwadis", db.anganwadis);
      seedSheet("health_centers", db.health_centers);
      seedSheet("vet_centers", db.vet_centers);
      seedSheet("inspections", db.inspections, true);
      seedSheet("physical_projects", db.physical_projects, false, true);
      
      return JSONResponse({ success: true, message: "Database seeded successfully!" });
    }
    
    if (action === "addInspection") {
      const inspection = postData.inspection;
      if (!inspection) return JSONResponse({ error: "Missing inspection object" }, 400);

      const uploads = postData.uploads || {};
      const photoPayload = uploads.photo || (typeof inspection.photo === "object" ? inspection.photo : (inspection.photo && inspection.photo.startsWith("data:") ? inspection.photo : null));
      const actionPhotoPayload = uploads.actionPhoto || (typeof inspection.actionPhoto === "object" ? inspection.actionPhoto : (inspection.actionPhoto && inspection.actionPhoto.startsWith("data:") ? inspection.actionPhoto : null));

      let photoUrl = "";
      let actionPhotoUrl = "";

      if (photoPayload) {
        photoUrl = uploadPhotoToDrive(photoPayload, inspection.id, "inspection");
      } else if (inspection.photo && (inspection.photo.startsWith("http://") || inspection.photo.startsWith("https://"))) {
        photoUrl = inspection.photo;
      }

      if (actionPhotoPayload) {
        actionPhotoUrl = uploadPhotoToDrive(actionPhotoPayload, inspection.id, "action");
      } else if (inspection.actionPhoto && (inspection.actionPhoto.startsWith("http://") || inspection.actionPhoto.startsWith("https://"))) {
        actionPhotoUrl = inspection.actionPhoto;
      }

      inspection.photo = photoUrl;
      inspection.photoUrl = photoUrl;
      inspection["Photo URL"] = photoUrl;

      inspection.actionPhoto = actionPhotoUrl;
      inspection.actionPhotoUrl = actionPhotoUrl;
      inspection["Action Photo URL"] = actionPhotoUrl;
      
      // Append inspection to inspections sheet
      appendRow("inspections", inspection, true);
      return JSONResponse({
        success: true,
        id: inspection.id,
        photoUrl: photoUrl,
        actionPhotoUrl: actionPhotoUrl,
        inspection: inspection
      });
    }
    
    if (action === "addProjectVisit") {
      const projectId = postData.projectId;
      const visit = postData.visit;
      const progressPercent = postData.progressPercent;
      const currentStage = postData.currentStage;
      const status = postData.status;
      const uploads = postData.uploads || {};

      if (!projectId || !visit) return JSONResponse({ error: "Missing parameters" }, 400);

      const visitPhotoPayload = uploads.photo || (typeof visit.photo === "object" ? visit.photo : (visit.photo && (visit.photo.startsWith("data:") || visit.photo.length > 100) ? visit.photo : null));
      let photoUrl = "";

      if (visitPhotoPayload) {
        photoUrl = uploadPhotoToDrive(visitPhotoPayload, projectId, "visit");
      } else if (visit.photo && (visit.photo.startsWith("http://") || visit.photo.startsWith("https://"))) {
        photoUrl = visit.photo;
      }

      visit.photo = photoUrl;
      visit.photoUrl = photoUrl;

      // Update projects sheet
      updateProjectVisit(projectId, visit, progressPercent, currentStage, status);
      return JSONResponse({
        success: true,
        photoUrl: photoUrl,
        visit: visit
      });
    }
    
    if (action === "addProject") {
      const project = postData.project;
      if (!project) return JSONResponse({ error: "Missing project object" }, 400);
      
      appendRow("physical_projects", project, false, true);
      return JSONResponse({ success: true, id: project.id });
    }
    
    return JSONResponse({ error: "Invalid action" }, 400);
  } catch (err) {
    return JSONResponse({ error: err.toString() }, 500);
  }
}

// Seed a sheet with array of objects
function seedSheet(sheetName, list, stringifyResponses = false, stringifyVisits = false) {
  if (!list || list.length === 0) return;
  const sheet = getSheet(sheetName);
  sheet.clear();
  
  // Collect all keys as headers
  const headers = [];
  list.forEach(item => {
    Object.keys(item).forEach(k => {
      if (headers.indexOf(k) === -1) headers.push(k);
    });
  });
  
  sheet.appendRow(headers);
  
  const rows = [];
  list.forEach(item => {
    const row = [];
    headers.forEach(h => {
      let val = item[h];
      if (val === undefined || val === null) {
        val = "";
      }
      if (h === "responses" && stringifyResponses && typeof val === "object") {
        val = JSON.stringify(val);
      }
      if (h === "visits" && stringifyVisits && Array.isArray(val)) {
        val = JSON.stringify(val);
      }
      row.push(val);
    });
    rows.push(row);
  });
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

// Append a single row object to sheet
function appendRow(sheetName, item, stringifyResponses = false, stringifyVisits = false) {
  const sheet = getSheet(sheetName);
  let headers = [];
  const range = sheet.getDataRange();
  if (range.getLastRow() >= 1) {
    headers = range.getValues()[0];
  }
  
  // If sheet is empty, create headers
  if (headers.length === 0) {
    headers = Object.keys(item);
    sheet.appendRow(headers);
  } else {
    // If there are new headers in the item, append them
    const newKeys = Object.keys(item).filter(k => headers.indexOf(k) === -1);
    if (newKeys.length > 0) {
      newKeys.forEach(nk => {
        sheet.getRange(1, headers.length + 1).setValue(nk);
        headers.push(nk);
      });
    }
  }
  
  const row = [];
  headers.forEach(h => {
    let val = item[h];
    if (val === undefined || val === null) {
      val = "";
    }
    if (h === "responses" && stringifyResponses && typeof val === "object") {
      val = JSON.stringify(val);
    }
    if (h === "visits" && stringifyVisits && Array.isArray(val)) {
      val = JSON.stringify(val);
    }
    row.push(val);
  });
  
  sheet.appendRow(row);
}

// Update a project by adding a new visit and updating progress/stage
function updateProjectVisit(projectId, visit, progressPercent, currentStage, status) {
  const sheet = getSheet("physical_projects");
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  
  const headers = data[0];
  const idCol = headers.indexOf("id");
  const visitsCol = headers.indexOf("visits");
  const progCol = headers.indexOf("progressPercent");
  const stageCol = headers.indexOf("currentStage");
  const statusCol = headers.indexOf("status");
  
  if (idCol === -1 || visitsCol === -1) return;
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(projectId)) {
      let visits = [];
      try {
        visits = JSON.parse(data[i][visitsCol] || "[]");
      } catch (e) {
        visits = [];
      }
      
      visits.push(visit);
      
      // Update cell values
      sheet.getRange(i + 1, visitsCol + 1).setValue(JSON.stringify(visits));
      if (progCol !== -1 && progressPercent !== undefined) {
        sheet.getRange(i + 1, progCol + 1).setValue(progressPercent);
      }
      if (stageCol !== -1 && currentStage !== undefined) {
        sheet.getRange(i + 1, stageCol + 1).setValue(currentStage);
      }
      if (statusCol !== -1 && status !== undefined) {
        sheet.getRange(i + 1, statusCol + 1).setValue(status);
      }
      break;
    }
  }
}

// Helper to generate properly formatted JSON Response
function JSONResponse(obj, statusCode = 200) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
