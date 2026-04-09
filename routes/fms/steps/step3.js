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

// Column mapping (0-indexed) - FMS sheet
const COL = {
  // Basic lead info (A-I)
  TIMESTAMP: 0,
  ENQ_NO: 1,
  LEAD_FROM: 2,
  CLIENT_NAME: 3,
  PARTNER_TYPE: 4,
  PURPOSE: 5,
  LOCATION: 6,
  CONTACT_INFO: 7,
  CONCERN_PERSON: 8,
  
  // Step 3 columns
  STEP3_PLANNED: 18,   // S
  STEP3_ACTUAL: 19,    // T
  STEP3_STATUS: 20,    // U
  STEP3_REMARK: 21,    // V
};

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

// Helper: get current timestamp in IST
function getCurrentTimestamp() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

// GET /api/fms/step3 - Get Step 3 leads
// Filter: Planned (S) filled + Actual (T) empty
router.get("/", async (req, res) => {
  try {
    const data = await getSheetData(SHEET_NAME);
    
    // FMS data starts from row 7 (index 6)
    if (data.length <= 6) {
      return res.json({ leads: [] });
    }

    const leads = [];
    for (let i = 6; i < data.length; i++) {
      let row = data[i];
      if (!row || !row[COL.ENQ_NO]) continue;

      // Pad row to ensure all columns are accessible
      while (row.length <= COL.STEP3_REMARK) row.push("");

      const planned = (row[COL.STEP3_PLANNED] || "").toString().trim();
      const actual = (row[COL.STEP3_ACTUAL] || "").toString().trim();

      // Filter: Planned filled + Actual empty
      if (planned && !actual) {
        leads.push({
          rowIndex: i + 1, // 1-indexed for sheet operations
          timestamp: row[COL.TIMESTAMP] || "",
          enqNo: row[COL.ENQ_NO] || "",
          leadGeneratedFrom: row[COL.LEAD_FROM] || "",
          clientName: row[COL.CLIENT_NAME] || "",
          partnerType: row[COL.PARTNER_TYPE] || "",
          purpose: row[COL.PURPOSE] || "",
          location: row[COL.LOCATION] || "",
          contactInfo: row[COL.CONTACT_INFO] || "",
          concernPerson: row[COL.CONCERN_PERSON] || "",
          step3Planned: planned,
          step3Actual: actual,
          step3Status: row[COL.STEP3_STATUS] || "",
          step3Remark: row[COL.STEP3_REMARK] || "",
        });
      }
    }

    res.json({ leads });
  } catch (err) {
    console.error("FMS Step 3 list error:", err);
    res.status(500).json({ error: "Failed to fetch Step 3 leads", details: err.message });
  }
});

// POST /api/fms/step3/update - Update Step 3
router.post("/update", async (req, res) => {
  try {
    const { rowIndex, enqNo, status, plannedOverride, remark } = req.body;

    if (!rowIndex || !enqNo) {
      return res.status(400).json({ error: "rowIndex and enqNo are required" });
    }

    // =============================
    // CASE 1: ONLY PLANNED DATE UPDATE (no status)
    // =============================
    if (!status && plannedOverride && plannedOverride.trim()) {
      await updateCell(
        SHEET_NAME,
        `${colLetter(COL.STEP3_PLANNED)}${rowIndex}`,
        [formatDateTime(plannedOverride)]
      );

      // Update Remark if provided
      if (remark && remark.trim()) {
        await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_REMARK)}${rowIndex}`, [remark.trim()]);
      }

      return res.json({
        success: true,
        message: "Planned date updated successfully",
      });
    }

    if (!status) {
      return res.status(400).json({ error: "Please select a status or update planned date" });
    }

    // =============================
    // CASE 2: STATUS = DONE
    // =============================
    if (status === "Done") {
      // Update Status (U)
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_STATUS)}${rowIndex}`, [status]);

      // Update Planned Override (S) if provided
      if (plannedOverride && plannedOverride.trim()) {
        await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_PLANNED)}${rowIndex}`, [formatDateTime(plannedOverride)]);
      }

      // Update Remark (V) if provided
      if (remark && remark.trim()) {
        await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_REMARK)}${rowIndex}`, [remark.trim()]);
      }

      // Actual (T) will be auto-filled by sheet formula

      return res.json({
        success: true,
        message: "Step 3 marked as Done. Lead will move to Step 4.",
      });
    }

    // =============================
    // CASE 3: MOVE TO OTHER SHEETS
    // =============================
    // First, get the lead data
    const data = await getSheetData(SHEET_NAME);
    const row = data[rowIndex - 1]; // Convert to 0-indexed

    if (!row || row[COL.ENQ_NO] !== enqNo) {
      return res.status(400).json({ error: "Lead not found or EnQ No mismatch" });
    }

    // Prepare data for destination (A-I + Status J + Remark K)
    // ✅ USE CURRENT TIMESTAMP
    const leadData = [
      getCurrentTimestamp(),         // A - ✅ CURRENT timestamp
      row[COL.ENQ_NO] || "",         // B
      row[COL.LEAD_FROM] || "",      // C
      row[COL.CLIENT_NAME] || "",    // D
      row[COL.PARTNER_TYPE] || "",   // E
      row[COL.PURPOSE] || "",        // F
      row[COL.LOCATION] || "",       // G
      row[COL.CONTACT_INFO] || "",   // H
      row[COL.CONCERN_PERSON] || "", // I
      "",                            // J - Status (blank)
      remark || "",                  // K - Remark
    ];

    // Determine destination sheet
    let destSheet;
    switch (status) {
      case "Cold Lead":
        destSheet = SHEETS.COLD_LEADS;
        break;
      case "Back to Pipeline":
        destSheet = SHEETS.PIPELINE;
        break;
      case "Not Qualified Lead":
        destSheet = SHEETS.NOT_QUALIFIED;
        break;
      default:
        return res.status(400).json({ error: "Invalid status for move operation" });
    }

    // Append to destination sheet
    await appendRow(destSheet, leadData);

    // Delete from FMS
    await deleteRow(SHEET_NAME, rowIndex);

    res.json({
      success: true,
      message: `Lead moved to ${status === "Back to Pipeline" ? "Pipeline" : status}`,
      movedTo: destSheet,
    });

  } catch (err) {
    console.error("FMS Step 3 update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;