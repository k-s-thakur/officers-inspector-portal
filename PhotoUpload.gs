// Google Apps Script - Photo Upload Module (PhotoUpload.gs)
// Handles uploading inspection and project visit photos to Google Drive using DRIVE_FOLDER_ID.

/**
 * Uploads a base64 encoded photo or photo upload object to Google Drive.
 * 
 * @param {Object|string} upload - Upload payload object ({ base64, fileName, mimeType }) or direct base64/URL string.
 * @param {string} recordId - Associated record/inspection/project ID.
 * @param {string} label - Label identifier ('inspection', 'action', 'visit', etc.).
 * @returns {string} Google Drive file URL, existing HTTP URL, or empty string.
 */
function uploadPhotoToDrive(upload, recordId, label) {
  if (!upload) return "";
  
  // If upload is already an HTTP/HTTPS URL, return as is
  if (typeof upload === "string") {
    if (upload.startsWith("http://") || upload.startsWith("https://")) {
      return upload;
    }
    if (upload.startsWith("data:") || upload.length > 100) {
      upload = { base64: upload };
    } else {
      return "";
    }
  }
  
  if (!upload || !upload.base64) return "";

  // Resolve config for DRIVE_FOLDER_ID
  let driveFolderId = "";
  if (typeof getRuntimeConfig === "function") {
    driveFolderId = getRuntimeConfig().DRIVE_FOLDER_ID;
  }
  if (!driveFolderId) {
    driveFolderId = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID") || "";
  }
  if (!driveFolderId && typeof CONFIG !== "undefined" && CONFIG.DRIVE_FOLDER_ID) {
    driveFolderId = CONFIG.DRIVE_FOLDER_ID;
  }
  if (!driveFolderId) {
    driveFolderId = "1zNYATkOkdmReiaodO6PG2oUqyksuXcIa";
  }

  // Extract pure base64 string and mime type if data URL format is passed
  let base64String = upload.base64;
  let mimeType = upload.mimeType || "image/jpeg";

  if (base64String.indexOf(";base64,") !== -1) {
    const parts = base64String.split(";base64,");
    if (parts[0].startsWith("data:")) {
      mimeType = parts[0].replace("data:", "");
    }
    base64String = parts[1];
  }

  // Determine file extension
  let ext = "jpg";
  if (mimeType.indexOf("png") !== -1) ext = "png";
  else if (mimeType.indexOf("gif") !== -1) ext = "gif";
  else if (mimeType.indexOf("webp") !== -1) ext = "webp";

  const bytes = Utilities.base64Decode(base64String);
  const rawFileName = upload.fileName || `${label || 'photo'}_${recordId || Date.now()}_${Date.now()}.${ext}`;
  const safeName = String(rawFileName).replace(/[^\w.\-]+/g, "_");
  
  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  const folder = DriveApp.getFolderById(driveFolderId);
  const file = folder.createFile(blob);
  
  if (recordId || label) {
    file.setDescription(`Officer Portal ${label || 'photo'} for record ID: ${recordId || ''}`);
  }

  // Set public link view permissions if permitted
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    console.warn("Could not update Drive file sharing permissions:", err);
  }

  return file.getUrl();
}
