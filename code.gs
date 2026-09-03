const MAX_POST_BODY_LENGTH = 500000;
const VALID_OVERALL_RESULTS = ['VERIFIED', 'ISSUE FOUND'];
const DEFAULT_SHEET_ID = '12Y_mtNqQfmxtS99KX82c75ArE9XWXeWNOusYcoplImw';
const BENEFICIARY_SHEET_NAME = 'Labhanvit Nahi';
const LEGACY_BENEFICIARY_SHEET_NAME = 'Beneficiaries';
const SURVEY_HEADERS = [
  'surveyId',
  'beneficiaryId',
  'submittedBy',
  'overallResult',
  'surveyDate',
  'status',
  'responses',
  'aadhaarInfo',
  'rationInfo',
  'mobileInfo'
];
let spreadsheetCache;

function configureSpreadsheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Open this script from the target Google Sheet before running configureSpreadsheet.');
  }

  PropertiesService.getScriptProperties().setProperty('SHEET_ID', spreadsheet.getId());
  return spreadsheet.getId();
}

function getSpreadsheet() {
  if (spreadsheetCache) return spreadsheetCache;

  const sheetId = clean(PropertiesService.getScriptProperties().getProperty('SHEET_ID')) || DEFAULT_SHEET_ID;
  if (!sheetId) {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (activeSpreadsheet) {
      spreadsheetCache = activeSpreadsheet;
      return spreadsheetCache;
    }
    throw new Error('Missing SHEET_ID in Script Properties.');
  }

  try {
    spreadsheetCache = SpreadsheetApp.openById(sheetId);
    return spreadsheetCache;
  } catch (error) {
    throw new Error('Unable to open configured spreadsheet.');
  }
}

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeHeader(value) {
  return clean(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function getValue(row, aliases) {
  if (!row || !Array.isArray(aliases)) return '';

  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }

  const normalized = {};
  Object.keys(row).forEach((key) => {
    const normalizedKey = normalizeHeader(key);
    if (normalizedKey && normalized[normalizedKey] === undefined) {
      normalized[normalizedKey] = row[key];
    }
  });

  for (const alias of aliases) {
    const aliasKey = normalizeHeader(alias);
    if (aliasKey && normalized[aliasKey] !== undefined) return normalized[aliasKey];
  }

  return '';
}

function getSheetData(sheetName, headerRowNumber) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const values = sheet.getDataRange().getDisplayValues();
  const headerIndex = Math.max(0, (headerRowNumber || 1) - 1);
  if (values.length <= headerIndex || !values[headerIndex].some((header) => clean(header) !== '')) return [];

  const headers = values[headerIndex].map((header) => clean(header));

  return values.slice(headerIndex + 1)
    .filter((row) => row.some((cell) => clean(cell) !== ''))
    .map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] ?? '';
      });
      return obj;
    });
}

function normalizePhone(raw) {
  const digits = clean(raw).replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 12 && digits.substring(0, 2) === '91') return digits.substring(2);
  if (digits.length === 11 && digits.charAt(0) === '0') return digits.substring(1);
  return digits;
}

function isValidIndianMobile(raw) {
  const mobile = normalizePhone(raw);
  return /^[6-9]\d{9}$/.test(mobile) ? mobile : '';
}

function mapGender(raw) {
  const value = clean(raw).toLowerCase();
  if (['male', 'm', 'पुरुष', 'man'].includes(value)) return 'Male';
  if (['female', 'f', 'महिला', 'woman'].includes(value)) return 'Female';
  return 'Other';
}

function mapAge(raw) {
  const value = clean(raw);
  const match = value.match(/^\s*(\d{1,3})(?:\s+years?)?\s*$/i);
  if (!match) return 0;

  const age = Number(match[1]);
  return Number.isInteger(age) && age >= 0 && age <= 120 ? age : 0;
}

function mapAadhaarType(row) {
  const aadhaar = clean(getValue(row, ['आधार नंबर', 'Aadhaar Number', 'aadhaarNumber']));
  const enrollment = clean(getValue(row, ['एनरोलमेंट नंबर', 'Enrollment Number', 'enrollmentNumber']));
  const remark = clean(getValue(row, ['रिमार्क', 'Remark', 'aadhaarRemark']));

  if (aadhaar) return 'aadhaar';
  if (enrollment) return 'enrollment';
  if (remark) return 'remark';
  return 'unknown';
}

function normalizeRationStatus(raw, rationNumber) {
  const value = clean(raw).toLowerCase();
  if (value === 'no' || value === 'नहीं' || value === 'not available') return 'no';
  if (clean(rationNumber)) return 'yes';
  return 'unknown';
}

function mapBeneficiaryRow(rawRow, index) {
  const row = rawRow || {};

  const district = clean(getValue(row, ['जिला', 'District', 'district']));
  const block = clean(getValue(row, ['ब्लॉक', 'Block', 'block']));
  const gp = clean(getValue(row, ['ग्राम पंचायत', 'Gram Panchayat', 'gp']));
  const village = clean(getValue(row, ['ग्राम', 'Village', 'village']));
  const name = clean(getValue(row, ['सदस्य का नाम', 'Member Name', 'name']));
  const fatherName = clean(getValue(row, ['पिता/पति का नाम', 'Father Name', 'fatherName']));
  const headName = clean(getValue(row, ['मुखिया का नाम', 'Head of Family', 'headOfFamilyName']));
  const age = mapAge(getValue(row, ['आयु', 'Age', 'age']));
  const gender = mapGender(getValue(row, ['लिंग', 'Gender', 'gender']));
  const mobile = isValidIndianMobile(getValue(row, ['मोबाइल नंबर', 'Mobile Number', 'mobile']));

  const aadhaarNumber = clean(getValue(row, ['आधार नंबर', 'Aadhaar Number', 'aadhaarNumber']));
  const enrollmentNumber = clean(getValue(row, ['एनरोलमेंट नंबर', 'Enrollment Number', 'enrollmentNumber']));
  const aadhaarRemark = clean(getValue(row, ['रिमार्क', 'Remark', 'aadhaarRemark']));
  const rationNumber = clean(getValue(row, ['राशन कार्ड नंबर', 'Ration Card Number', 'rationNumber']));
  const rationNotAvailable = getValue(row, ['राशन कार्ड नहीं है', 'Ration Card Not Available', 'rationNotAvailable']);
  const hasRationCard = normalizeRationStatus(rationNotAvailable, rationNumber);

  const id = clean(getValue(row, ['id', 'beneficiaryId', 'सदस्य आईडी'])) || `AYU-BEN-${String(index + 1).padStart(6, '0')}`;

  return {
    id,
    name: name || `Beneficiary ${index + 1}`,
    fatherName: fatherName || headName || 'N/A',
    age,
    gender,
    mobile,
    district,
    block,
    gp,
    village,
    status: 'Pending',
    assignedSurveyorId: '',
    assignedSurveyorName: '',
    aadhaarInfo: {
      type: mapAadhaarType(row),
      aadhaarNumber,
      enrollmentNumber,
      remark: aadhaarRemark
    },
    rationInfo: {
      rationNumber,
      hasRationCard
    },
    address: '',
    maritalStatus: clean(getValue(row, ['वैवाहिक स्थिति', 'Marital Status', 'maritalStatus'])),
    raw: {}
  };
}

function mapParametersSheet(rows) {
  return (rows || []).map((row, index) => ({
    id: clean(getValue(row, ['id', 'parameterId'])) || `P${index + 1}`,
    key: clean(getValue(row, ['key', 'parameterKey'])) || `parameter_${index + 1}`,
    label: clean(getValue(row, ['label', 'name', 'Parameter Name'])) || `Parameter ${index + 1}`,
    type: clean(getValue(row, ['type'])) || 'text',
    section: clean(getValue(row, ['section'])) || 'General',
    required: String(getValue(row, ['required'])).toLowerCase() === 'true',
    options: clean(getValue(row, ['options'])) ? String(getValue(row, ['options'])).split('|') : []
  }));
}

function mapIssuesSheet(rows) {
  return (rows || []).map((row, index) => ({
    id: clean(getValue(row, ['id', 'issueId'])) || `ISS-${index + 1}`,
    name: clean(getValue(row, ['name', 'issueName'])) || `Issue ${index + 1}`,
    parameterId: clean(getValue(row, ['parameterId'])) || '',
    description: clean(getValue(row, ['description'])) || '',
    proofRequired: String(getValue(row, ['proofRequired'])).toLowerCase() === 'true',
    active: String(getValue(row, ['active'])).toLowerCase() !== 'false'
  }));
}

function mapUsersSheet(rows) {
  return (rows || []).map((row) => ({
    id: clean(getValue(row, ['id', 'userId'])) || '',
    name: clean(getValue(row, ['name', 'userName'])) || '',
    mobile: isValidIndianMobile(getValue(row, ['mobile', 'Mobile Number'])) || '',
    role: clean(getValue(row, ['role'])) || 'Surveyor',
    district: clean(getValue(row, ['district'])) || '',
    block: clean(getValue(row, ['block'])) || '',
    gp: clean(getValue(row, ['gp'])) || '',
    status: clean(getValue(row, ['status'])) || 'Active'
  }));
}

function parseJsonCell(value) {
  const text = clean(value);
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function getSurveySubmissionMap() {
  const submissions = getSheetData('SurveySubmissions', 1);

  return submissions.reduce((acc, row) => {
    const beneficiaryId = clean(getValue(row, ['beneficiaryId']));
    if (!beneficiaryId) return acc;

    acc[beneficiaryId] = {
      surveyId: clean(getValue(row, ['surveyId'])),
      submittedBy: clean(getValue(row, ['submittedBy'])),
      overallResult: clean(getValue(row, ['overallResult'])).toUpperCase(),
      surveyDate: clean(getValue(row, ['surveyDate'])),
      status: clean(getValue(row, ['status'])) || 'Completed',
      parameterResponses: parseJsonCell(getValue(row, ['responses'])),
      aadhaarInfo: parseJsonCell(getValue(row, ['aadhaarInfo'])),
      rationInfo: parseJsonCell(getValue(row, ['rationInfo'])),
      mobileInfo: parseJsonCell(getValue(row, ['mobileInfo']))
    };

    return acc;
  }, {});
}

function mergeSubmissionIntoBeneficiary(beneficiary, submissionsByBeneficiaryId) {
  const submission = submissionsByBeneficiaryId[beneficiary.id];
  if (!submission) return beneficiary;

  return {
    ...beneficiary,
    status: submission.status,
    surveyId: submission.surveyId,
    submittedBy: submission.submittedBy,
    overallResult: submission.overallResult,
    surveyDate: submission.surveyDate,
    parameterResponses: submission.parameterResponses,
    aadhaarInfo: Object.keys(submission.aadhaarInfo).length ? submission.aadhaarInfo : beneficiary.aadhaarInfo,
    rationInfo: Object.keys(submission.rationInfo).length ? submission.rationInfo : beneficiary.rationInfo,
    mobileInfo: submission.mobileInfo
  };
}

function getBackendDiagnostics() {
  const ss = getSpreadsheet();
  const sheets = ss.getSheets().map((sheet) => ({
    name: sheet.getName(),
    rows: sheet.getLastRow(),
    columns: sheet.getLastColumn()
  }));
  const beneficiarySheet = ss.getSheetByName(BENEFICIARY_SHEET_NAME);
  const headerRow = beneficiarySheet
    ? beneficiarySheet.getRange(2, 1, 1, beneficiarySheet.getLastColumn()).getDisplayValues()[0]
    : [];

  return {
    spreadsheetName: ss.getName(),
    sheets,
    beneficiarySheetFound: Boolean(beneficiarySheet),
    beneficiarySheetName: BENEFICIARY_SHEET_NAME,
    beneficiaryHeaderRow: headerRow
  };
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'bootstrap';

    if (action === 'diagnostics') {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, statusCode: 200, data: getBackendDiagnostics() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'bootstrap') {
      const ss = getSpreadsheet();
      const beneficiarySheet = ss.getSheetByName(BENEFICIARY_SHEET_NAME);
      const beneficiaries = (beneficiarySheet
        ? getSheetData(BENEFICIARY_SHEET_NAME, 2)
        : getSheetData(LEGACY_BENEFICIARY_SHEET_NAME, 1)
      ).map(mapBeneficiaryRow);
      const submissionsByBeneficiaryId = getSurveySubmissionMap();
      const parameters = mapParametersSheet(getSheetData('Parameters'));
      const issues = mapIssuesSheet(getSheetData('Issues'));
      const users = mapUsersSheet(getSheetData('Users'));

      const payload = {
        ok: true,
        statusCode: 200,
        data: {
          beneficiaries: beneficiaries.map((beneficiary) => mergeSubmissionIntoBeneficiary(beneficiary, submissionsByBeneficiaryId)),
          parameters,
          issues,
          users
        }
      };

      return ContentService
        .createTextOutput(JSON.stringify(payload))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, statusCode: 400, error: 'Unknown GET action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        statusCode: 500,
        error: 'Unable to load application data.',
        details: error && error.message ? error.message : String(error)
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  let lock;
  try {
    const body = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
    if (!body || body.length > MAX_POST_BODY_LENGTH) {
      return jsonResponse({ ok: false, statusCode: 400, error: 'Invalid request body.' });
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      return jsonResponse({ ok: false, statusCode: 400, error: 'Invalid JSON request.' });
    }

    if (payload && payload.action === 'submitSurvey') {
      const surveyId = clean(payload.surveyId);
      const beneficiaryId = clean(payload.beneficiaryId);
      const overallResult = clean(payload.overallResult).toUpperCase();
      if (!surveyId) return jsonResponse({ ok: false, statusCode: 400, error: 'surveyId is required.' });
      if (!beneficiaryId) return jsonResponse({ ok: false, statusCode: 400, error: 'beneficiaryId is required.' });
      if (!VALID_OVERALL_RESULTS.includes(overallResult)) {
        return jsonResponse({ ok: false, statusCode: 400, error: 'Invalid overallResult.' });
      }

      lock = LockService.getScriptLock();
      lock.waitLock(30000);
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName('SurveySubmissions') || ss.insertSheet('SurveySubmissions');

      if (sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, SURVEY_HEADERS.length).setValues([SURVEY_HEADERS]);
      }

      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const surveyIds = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
        if (surveyIds.some((row) => clean(row[0]) === surveyId)) {
          return jsonResponse({ ok: false, statusCode: 409, error: 'Survey already submitted' });
        }
      }

      const row = [
        surveyId,
        beneficiaryId,
        clean(payload.submittedBy),
        overallResult,
        clean(payload.surveyDate),
        overallResult === 'VERIFIED' ? 'Completed' : 'Issue Found',
        safeJson(payload.responses),
        safeJson(payload.aadhaarInfo),
        safeJson(payload.rationInfo),
        safeJson(payload.mobileInfo)
      ];

      sheet.appendRow(row);

      return jsonResponse({ ok: true, statusCode: 200, data: { submitted: true, surveyId } });
    }

    return jsonResponse({ ok: false, statusCode: 400, error: 'Unknown POST action.' });
  } catch (error) {
    return jsonResponse({
      ok: false,
      statusCode: 500,
      error: 'Unable to process request.',
      details: error && error.message ? error.message : String(error)
    });
  } finally {
    if (lock) lock.releaseLock();
  }
}

function safeJson(value) {
  if (value == null || typeof value !== 'object') return '{}';
  try {
    return JSON.stringify(value);
  } catch (error) {
    return '{}';
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
