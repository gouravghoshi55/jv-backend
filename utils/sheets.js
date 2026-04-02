const { google } = require("googleapis");
const path = require("path");
require("dotenv").config();

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const SHEETS = {
  ENQUIRY: "Enquiry Responses",
  PIPELINE: "PIPELINE",
  NOT_QUALIFIED: "NOT QUALIFIED LEADS",
  COLD_LEADS: "COLD LEADS",
  FMS: "FMS",
  REMARKS: "Remarks",
  NEXT_ACTION: "NEXT Action Plan",
  SITE_VISIT_FMS: "SITE VISIT FMS",
  DONE: "DONE",
  PROPOSAL_DONE: "Proposal Done Leads",
  SITE_VISIT_ECS: "SITE VISIT ECS",
};

const ROW7_SHEETS = [SHEETS.FMS, SHEETS.DONE, SHEETS.PROPOSAL_DONE, SHEETS.SITE_VISIT_FMS];

const DEDUP_SHEETS = [
  SHEETS.PIPELINE,
  SHEETS.NOT_QUALIFIED,
  SHEETS.COLD_LEADS,
  SHEETS.FMS,
  SHEETS.SITE_VISIT_FMS,
  SHEETS.DONE,
];

let sheetsApi = null;

async function getSheets() {
  if (sheetsApi) return sheetsApi;

  let auth;
  if (process.env.GOOGLE_CREDENTIALS) {
    // Production (Render): use base64 encoded credentials from env var
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  } else {
    // Local development: use credentials.json file
    auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(__dirname, "../credentials.json"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }

  const client = await auth.getClient();
  sheetsApi = google.sheets({ version: "v4", auth: client });
  return sheetsApi;
}

async function getSheetData(sheetName, range) {
  const sheets = await getSheets();
  const fullRange = range ? `'${sheetName}'!${range}` : `'${sheetName}'`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: fullRange,
  });
  return res.data.values || [];
}

async function appendRow(sheetName, values) {
  const sheets = await getSheets();
  const startCell = ROW7_SHEETS.includes(sheetName) ? "A7" : "A1";
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!${startCell}`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    resource: { values: [values] },
  });
}

async function updateCell(sheetName, range, values) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!${range}`,
    valueInputOption: "USER_ENTERED",
    resource: { values: Array.isArray(values[0]) ? values : [values] },
  });
}

// Clear entire row data (A to AZ) instead of deleting
// Preserves row structure so formulas in other rows don't shift
async function deleteRow(sheetName, rowIndex) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!A${rowIndex}:AZ${rowIndex}`,
  });
}

async function getEnqNosFromSheet(sheetName) {
  try {
    const data = await getSheetData(sheetName, "B:B");
    const skipRows = ROW7_SHEETS.includes(sheetName) ? 6 : 1;
    return data.slice(skipRows).map((row) => (row[0] || "").trim());
  } catch (err) {
    console.error(`Error reading ${sheetName}:`, err.message);
    return [];
  }
}

async function findRowByEnqNo(sheetName, enqNo) {
  const data = await getSheetData(sheetName);
  const startRow = ROW7_SHEETS.includes(sheetName) ? 6 : 1;
  for (let i = startRow; i < data.length; i++) {
    if ((data[i][1] || "").trim() === enqNo.trim()) {
      return i + 1;
    }
  }
  return -1;
}

module.exports = {
  SHEETS,
  DEDUP_SHEETS,
  getSheetData,
  appendRow,
  updateCell,
  deleteRow,
  getEnqNosFromSheet,
  findRowByEnqNo,
};