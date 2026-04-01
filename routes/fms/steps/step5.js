const express = require("express");
const router = express.Router();
const {
  SHEETS,
  getSheetData,
  updateCell,
  appendRow,
  deleteRow,
} = require("../../../utils/sheets");

const SHEET_NAME = SHEETS.FMS;
const PROPOSAL_DONE_SHEET = "Proposal Done Leads";

// Column mapping (0-indexed) - FMS sheet
const COL = {
  TIMESTAMP: 0,
  ENQ_NO: 1,
  LEAD_FROM: 2,
  CLIENT_NAME: 3,
  PARTNER_TYPE: 4,
  PURPOSE: 5,
  LOCATION: 6,
  CONTACT_INFO: 7,
  CONCERN_PERSON: 8,

  // Step 2 file columns
  AKS: 14,
  KHASRA: 15,
  OLD_DOCUMENT: 16,
  LAND_SURVEY: 17,
  PDF_FOLDER: 26,

  // Step 4 file columns
  STEP4_TYPE_OF_PROJECT: 27,
  STEP4_CAD_FILE: 28,
  STEP4_CALC_LINK: 29,

  // Step 5 columns
  STEP5_PLANNED: 31,  // AF
  STEP5_ACTUAL: 32,   // AG
  STEP5_STATUS: 33,   // AH
  // AI = index 34 (Time Delay - last column to copy)
};

const MAX_FMS_COL = 34; // AI = index 34, copy B(1) to AI(34)

// Helper: column index to letter
function colLetter(index) {
  if (index < 26) return String.fromCharCode(65 + index);
  return String.fromCharCode(64 + Math.floor(index / 26)) + String.fromCharCode(65 + (index % 26));
}

// Helper: format datetime for sheet
function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const dateVal = new Date(dateStr);
  if (isNaN(dateVal.getTime())) return dateStr;
  return dateVal.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

// GET /api/fms/step5
router.get("/", async (req, res) => {
  try {
    const data = await getSheetData(SHEET_NAME);

    if (data.length <= 6) {
      return res.json({ leads: [] });
    }

    const leads = [];
    for (let i = 6; i < data.length; i++) {
      let row = data[i];
      if (!row || !row[COL.ENQ_NO]) continue;

      while (row.length <= MAX_FMS_COL) row.push("");

      const planned = (row[COL.STEP5_PLANNED] || "").toString().trim();
      const actual = (row[COL.STEP5_ACTUAL] || "").toString().trim();

      if (planned && !actual) {
        leads.push({
          rowIndex: i + 1,
          timestamp: row[COL.TIMESTAMP] || "",
          enqNo: row[COL.ENQ_NO] || "",
          leadGeneratedFrom: row[COL.LEAD_FROM] || "",
          clientName: row[COL.CLIENT_NAME] || "",
          partnerType: row[COL.PARTNER_TYPE] || "",
          purpose: row[COL.PURPOSE] || "",
          location: row[COL.LOCATION] || "",
          contactInfo: row[COL.CONTACT_INFO] || "",
          concernPerson: row[COL.CONCERN_PERSON] || "",
          pdfFolder: row[COL.PDF_FOLDER] || "",
          aks: row[COL.AKS] || "",
          khasra: row[COL.KHASRA] || "",
          oldDocument: row[COL.OLD_DOCUMENT] || "",
          landSurvey: row[COL.LAND_SURVEY] || "",
          step4TypeOfProject: row[COL.STEP4_TYPE_OF_PROJECT] || "",
          step4CadFile: row[COL.STEP4_CAD_FILE] || "",
          step4CalcLink: row[COL.STEP4_CALC_LINK] || "",
          step5Planned: planned,
          step5Actual: actual,
          step5Status: row[COL.STEP5_STATUS] || "",
        });
      }
    }

    res.json({ leads });
  } catch (err) {
    console.error("FMS Step 5 list error:", err);
    res.status(500).json({ error: "Failed to fetch Step 5 leads", details: err.message });
  }
});

// POST /api/fms/step5/update
router.post("/update", async (req, res) => {
  try {
    const { rowIndex, enqNo, status, plannedOverride } = req.body;

    if (!rowIndex || !enqNo) {
      return res.status(400).json({ error: "rowIndex and enqNo are required" });
    }

    // Only Planned date update (no status)
    if (!status && plannedOverride) {
      await updateCell(
        SHEET_NAME,
        `${colLetter(COL.STEP5_PLANNED)}${rowIndex}`,
        [formatDateTime(plannedOverride)]
      );
      return res.json({ success: true, message: "Planned date updated successfully" });
    }

    if (status !== "Done") {
      return res.status(400).json({ error: "Only 'Done' status is allowed for Step 5" });
    }

    // ===== DONE: Update status, then move to Proposal Done Leads =====

    // First update status so formula can fill Actual
    await updateCell(
      SHEET_NAME,
      `${colLetter(COL.STEP5_STATUS)}${rowIndex}`,
      [status]
    );

    if (plannedOverride && plannedOverride.trim()) {
      await updateCell(
        SHEET_NAME,
        `${colLetter(COL.STEP5_PLANNED)}${rowIndex}`,
        [formatDateTime(plannedOverride)]
      );
    }

    // Re-read the row to get formula-updated values
    const data = await getSheetData(SHEET_NAME);
    const row = data[rowIndex - 1];

    if (!row || row[COL.ENQ_NO] !== enqNo) {
      return res.status(400).json({ error: "Lead not found or EnQ No mismatch" });
    }

    // Pad row
    while (row.length <= MAX_FMS_COL) row.push("");

    // Build destination row: A = current timestamp, B-AI = copy from FMS
    const currentTimestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const destRow = [currentTimestamp]; // A = new timestamp

    // Copy columns B(1) to AI(34) from FMS
    for (let c = 1; c <= MAX_FMS_COL; c++) {
      destRow.push(row[c] || "");
    }

    // Append to Proposal Done Leads (data starts row 7, appendRow handles it)
    await appendRow(PROPOSAL_DONE_SHEET, destRow);

    // Delete from FMS
    await deleteRow(SHEET_NAME, rowIndex);

    res.json({
      success: true,
      message: "Step 5 Done! Lead moved to Proposal Done Leads.",
    });

  } catch (err) {
    console.error("FMS Step 5 update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;