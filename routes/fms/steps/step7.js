const express = require("express");
const router = express.Router();
const {
  SHEETS,
  getSheetData,
  updateCell,
  appendRow,
  deleteRow,
} = require("../../../utils/sheets");

const SHEET_NAME = "Proposal Done Leads";

// Column mapping (0-indexed) - Proposal Done Leads sheet
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

  PDF_FOLDER: 26,

  // Step 7: Agreement
  STEP7_PLANNED: 40,    // AO
  STEP7_ACTUAL: 41,     // AP
  STEP7_STATUS: 42,     // AQ
  STEP7_MINUTES: 43,    // AR - Minutes of the meeting
  STEP7_VOICE: 44,      // AS - Voice recording
};

// Helper: column index to letter
function colLetter(index) {
  if (index < 26) return String.fromCharCode(65 + index);
  return String.fromCharCode(64 + Math.floor(index / 26)) + String.fromCharCode(65 + (index % 26));
}

function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const dateVal = new Date(dateStr);
  if (isNaN(dateVal.getTime())) return dateStr;
  return dateVal.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

// GET /api/fms/step7 - Get Step 7 leads
// Filter: Planned (AO) filled + Actual (AP) empty
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

      while (row.length <= COL.STEP7_VOICE) row.push("");

      const planned = (row[COL.STEP7_PLANNED] || "").toString().trim();
      const actual = (row[COL.STEP7_ACTUAL] || "").toString().trim();

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
          step7Planned: planned,
          step7Actual: actual,
          step7Status: row[COL.STEP7_STATUS] || "",
          step7Minutes: row[COL.STEP7_MINUTES] || "",
          step7Voice: row[COL.STEP7_VOICE] || "",
        });
      }
    }

    res.json({ leads });
  } catch (err) {
    console.error("Step 7 list error:", err);
    res.status(500).json({ error: "Failed to fetch Step 7 leads", details: err.message });
  }
});

// POST /api/fms/step7/update - Done = move to DONE sheet
router.post("/update", async (req, res) => {
  try {
    const { rowIndex, enqNo, status, plannedOverride } = req.body;

    if (!rowIndex || !enqNo) {
      return res.status(400).json({ error: "rowIndex and enqNo are required" });
    }

    // Only Planned date update
    if (!status && plannedOverride) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP7_PLANNED)}${rowIndex}`, [formatDateTime(plannedOverride)]);
      return res.json({ success: true, message: "Planned date updated successfully" });
    }

    if (status !== "Done") {
      return res.status(400).json({ error: "Only 'Done' status is allowed for Step 7" });
    }

    // Update Status (AQ)
    await updateCell(SHEET_NAME, `${colLetter(COL.STEP7_STATUS)}${rowIndex}`, [status]);

    if (plannedOverride && plannedOverride.trim()) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP7_PLANNED)}${rowIndex}`, [formatDateTime(plannedOverride)]);
    }

    // Actual (AP) will be auto-filled by sheet formula

    // Read row data to move to DONE sheet
    const data = await getSheetData(SHEET_NAME);
    const row = data[rowIndex - 1];

    if (!row || row[COL.ENQ_NO] !== enqNo) {
      return res.status(400).json({ error: "Lead not found or EnQ No mismatch" });
    }

    // Prepare DONE sheet row (A-I basic info)
    const doneRow = [
      row[COL.TIMESTAMP] || "",
      row[COL.ENQ_NO] || "",
      row[COL.LEAD_FROM] || "",
      row[COL.CLIENT_NAME] || "",
      row[COL.PARTNER_TYPE] || "",
      row[COL.PURPOSE] || "",
      row[COL.LOCATION] || "",
      row[COL.CONTACT_INFO] || "",
      row[COL.CONCERN_PERSON] || "",
      "",  // J - Status blank
      "",  // K - Remark blank
    ];

    // Append to DONE sheet
    await appendRow(SHEETS.DONE, doneRow);

    // Delete from Proposal Done Leads
    await deleteRow(SHEET_NAME, rowIndex);

    res.json({
      success: true,
      message: "Step 7 Done! Lead moved to DONE.",
    });

  } catch (err) {
    console.error("Step 7 update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;