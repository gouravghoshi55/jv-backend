const { google } = require("googleapis");
const path = require("path");
require("dotenv").config();

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

// Sheet names exactly as in Google Sheets
const SHEETS = {
  ENQUIRY: "Enquiry Responses",
  PIPELINE: "PIPELINE",
  NOT_QUALIFIED: "NOT QUALIFIED LEADS",
  COLD_LEADS: "COLD LEADS",
  FMS: "FMS",
  REMARKS: "Remarks",
  NEXT_ACTION: "NEXT Action Plan",
  SITE_VISIT_FMS: "SITE VIST FMS",
  DONE: "DONE",
  PROPOSAL_DONE: "Proposal Done Leads",
  SITE_VISIT_ECS: "SITE VIST ECS",
};

// Dedup check sheets - if lead's EnQ No is found in any of these, skip it
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

  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(__dirname, "../credentials.json"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  sheetsApi = google.sheets({ version: "v4", auth: client });
  return sheetsApi;
}

// Fetch all rows from a sheet (returns array of arrays)
async function getSheetData(sheetName, range) {
  const sheets = await getSheets();
  const fullRange = range ? `'${sheetName}'!${range}` : `'${sheetName}'`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: fullRange,
  });
  return res.data.values || [];
}

// Append a row to a sheet
async function appendRow(sheetName, values) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    resource: { values: [values] },
  });
}

// Update a specific cell or range
async function updateCell(sheetName, range, values) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!${range}`,
    valueInputOption: "USER_ENTERED",
    resource: { values: Array.isArray(values[0]) ? values : [values] },
  });
}

// Delete a row by row number (1-indexed)
async function deleteRow(sheetName, rowIndex) {
  const sheets = await getSheets();

  // First get the sheetId (gid) for the sheet name
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
  });

  const sheet = spreadsheet.data.sheets.find(
    (s) => s.properties.title === sheetName
  );

  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    resource: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: "ROWS",
              startIndex: rowIndex - 1, // 0-indexed
              endIndex: rowIndex,
            },
          },
        },
      ],
    },
  });
}

// Get all EnQ Nos from a sheet (column B)
async function getEnqNosFromSheet(sheetName) {
  try {
     const data = await getSheetData(sheetName, "B:B");
    // FMS and DONE have data starting from row 7, others from row 2
    const skipRows = (sheetName === "FMS" || sheetName === "DONE") ? 6 : 1;
    return data.slice(skipRows).map((row) => (row[0] || "").trim());
  } catch (err) {
    console.error(`Error reading ${sheetName}:`, err.message);
    return [];
  }
}

// Find row index by EnQ No in a sheet (returns 1-indexed row number, or -1)
async function findRowByEnqNo(sheetName, enqNo) {
  const data = await getSheetData(sheetName);
  const startRow = (sheetName === "FMS" || sheetName === "DONE") ? 6 : 1;
  for (let i = startRow; i < data.length; i++) {
    if ((data[i][1] || "").trim() === enqNo.trim()) {
      return i + 1; // 1-indexed (row 1 = header, row 2 = first data)
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