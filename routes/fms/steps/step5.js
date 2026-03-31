const express = require("express");
const router = express.Router();
const {
  SHEETS,
  getSheetData,
  updateCell,
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

  // Step 2 reference
  PDF_FOLDER: 26,        // AA

  // Step 5 columns
  STEP5_PLANNED: 31,     // AF
  STEP5_ACTUAL: 32,      // AG
  STEP5_STATUS: 33,      // AH
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

// GET /api/fms/step5 - Get Step 5 leads
// Filter: Planned (AF) filled + Actual (AG) empty
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

      // Pad row to ensure all columns are accessible
      while (row.length <= COL.STEP5_STATUS) row.push("");

      const planned = (row[COL.STEP5_PLANNED] || "").toString().trim();
      const actual = (row[COL.STEP5_ACTUAL] || "").toString().trim();

      // Filter: Planned filled + Actual empty
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

// POST /api/fms/step5/update - Update Step 5 status (Done only)
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

      return res.json({
        success: true,
        message: "Planned date updated successfully",
      });
    }

    if (status !== "Done") {
      return res.status(400).json({ error: "Only 'Done' status is allowed for Step 5" });
    }

    // Update Status (AH)
    await updateCell(
      SHEET_NAME,
      `${colLetter(COL.STEP5_STATUS)}${rowIndex}`,
      [status]
    );

    // Update Planned Override (AF) if provided
    if (plannedOverride && plannedOverride.trim()) {
      await updateCell(
        SHEET_NAME,
        `${colLetter(COL.STEP5_PLANNED)}${rowIndex}`,
        [formatDateTime(plannedOverride)]
      );
    }

    // Actual (AG) will be auto-filled by sheet formula

    res.json({
      success: true,
      message: "Step 5 marked as Done. Lead completed!",
    });

  } catch (err) {
    console.error("FMS Step 5 update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;