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
  SHEETS.PROPOSAL_DONE,
];

// Sheets where formulas are pre-filled in every row
// For these: find first empty row (EnQ No blank) and UPDATE only data columns
// Do NOT use INSERT_ROWS — it creates new rows without formulas
const FORMULA_SHEETS = [SHEETS.FMS, SHEETS.PROPOSAL_DONE, SHEETS.SITE_VISIT_FMS];

let sheetsApi = null;

async function getSheets() {
  if (sheetsApi) return sheetsApi;

  let auth;
  if (process.env.GOOGLE_CREDENTIALS) {
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  } else {
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

// Find first empty row in a sheet (where column B / EnQ No is blank)
async function findFirstEmptyRow(sheetName) {
  const data = await getSheetData(sheetName, "B:B");
  const startIndex = ROW7_SHEETS.includes(sheetName) ? 7 : 1; // 0-indexed in array

  for (let i = startIndex; i < data.length; i++) {
    const cellValue = (data[i] && data[i][0]) ? data[i][0].toString().trim() : "";
    if (!cellValue) {
      return i + 1; // 1-indexed row number
    }
  }
  // No empty row found — return next row after last data
  return data.length + 1;
}

// Append a row to a sheet
// FORMULA_SHEETS: find empty row + update data columns only (formulas preserved)
// Other sheets: normal INSERT_ROWS append
async function appendRow(sheetName, values) {
  const sheets = await getSheets();

  if (FORMULA_SHEETS.includes(sheetName)) {
    // Find first empty row (EnQ No blank)
    const emptyRow = await findFirstEmptyRow(sheetName);

    // Calculate column letter for the range (A to whatever length values has)
    function numToCol(num) {
      if (num <= 26) return String.fromCharCode(64 + num);
      return String.fromCharCode(64 + Math.floor((num - 1) / 26)) + String.fromCharCode(65 + ((num - 1) % 26));
    }

    const lastCol = numToCol(values.length);
    const range = `'${sheetName}'!A${emptyRow}:${lastCol}${emptyRow}`;

    // Update (not insert) — writes data into existing row, formulas in other columns stay
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: range,
      valueInputOption: "USER_ENTERED",
      resource: { values: [values] },
    });
  } else {
    // Normal append for non-formula sheets
    const startCell = ROW7_SHEETS.includes(sheetName) ? "A7" : "A1";
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `'${sheetName}'!${startCell}`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [values] },
    });
  }
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

/**
 * Get Sheet ID by sheet name (required for batchUpdate operations)
 * @param {string} sheetName - Name of the sheet
 * @returns {number} - Sheet ID
 */
async function getSheetId(sheetName) {
  const sheets = await getSheets();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
  });

  const sheet = spreadsheet.data.sheets.find(
    (s) => s.properties.title === sheetName
  );

  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }

  return sheet.properties.sheetId;
}

/**
 * Actually DELETE a row from sheet (not just clear)
 * This shifts all rows below UP by one
 * Formulas in those rows automatically adjust their references
 * 
 * @param {string} sheetName - Name of the sheet
 * @param {number} rowIndex - 1-indexed row number to delete
 */
async function deleteRow(sheetName, rowIndex) {
  const sheets = await getSheets();
  const sheetId = await getSheetId(sheetName);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: "ROWS",
              startIndex: rowIndex - 1,  // 0-indexed (row 7 = index 6)
              endIndex: rowIndex,         // exclusive (deletes only 1 row)
            },
          },
        },
      ],
    },
  });
}

/**
 * Clear row data without deleting the row
 * Use this when you want to preserve row structure
 * 
 * @param {string} sheetName - Name of the sheet
 * @param {number} rowIndex - 1-indexed row number to clear
 * @param {string} endColumn - Last column to clear (default: "AZ")
 */
async function clearRow(sheetName, rowIndex, endColumn = "AZ") {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `'${sheetName}'!A${rowIndex}:${endColumn}${rowIndex}`,
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
  deleteRow,      // Actually deletes row (shifts rows up)
  clearRow,       // Just clears data (keeps row structure)
  getEnqNosFromSheet,
  findRowByEnqNo,
  getSheetId,     // Utility function (exported for flexibility)
};