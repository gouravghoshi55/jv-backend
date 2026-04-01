const express = require("express");
const router = express.Router();
const {
  SHEETS,
  getSheetData,
  updateCell,
} = require("../../../utils/sheets");

const SHEET_NAME = "Proposal Done Leads";

// Column mapping (0-indexed) - Proposal Done Leads sheet
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

  // References from FMS
  PDF_FOLDER: 26,    // AA

  // Step 6: Follow Up
  STEP6_PLANNED: 35,       // AJ
  STEP6_ACTUAL: 36,        // AK
  STEP6_STATUS: 37,        // AL
  // AM = 38 Time Delay (formula)
  STEP6_FOLLOW_COUNTER: 39, // AN

  // Step 7: Agreement (Planned set from Step 6 Done)
  STEP7_PLANNED: 40,       // AO
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

// GET /api/fms/step6 - Get Step 6 leads
// Filter: Planned (AJ) filled + Actual (AK) empty
router.get("/", async (req, res) => {
  try {
    const data = await getSheetData(SHEET_NAME);

    // Data starts from row 7 (index 6)
    if (data.length <= 6) {
      return res.json({ leads: [] });
    }

    const leads = [];
    for (let i = 6; i < data.length; i++) {
      let row = data[i];
      if (!row || !row[COL.ENQ_NO]) continue;

      // Pad row to ensure all columns are accessible
      while (row.length <= COL.STEP7_PLANNED) row.push("");

      const planned = (row[COL.STEP6_PLANNED] || "").toString().trim();
      const actual = (row[COL.STEP6_ACTUAL] || "").toString().trim();

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
          step6Planned: planned,
          step6Actual: actual,
          step6Status: row[COL.STEP6_STATUS] || "",
          step6FollowCounter: row[COL.STEP6_FOLLOW_COUNTER] || "0",
        });
      }
    }

    res.json({ leads });
  } catch (err) {
    console.error("Step 6 list error:", err);
    res.status(500).json({ error: "Failed to fetch Step 6 leads", details: err.message });
  }
});

// POST /api/fms/step6/update
router.post("/update", async (req, res) => {
  try {
    const { rowIndex, enqNo, status, plannedOverride, nextStepPlanned } = req.body;

    if (!rowIndex || !enqNo) {
      return res.status(400).json({ error: "rowIndex and enqNo are required" });
    }

    // =============================
    // CASE 1: ONLY PLANNED DATE UPDATE
    // =============================
    if (!status && plannedOverride) {
      await updateCell(
        SHEET_NAME,
        `${colLetter(COL.STEP6_PLANNED)}${rowIndex}`,
        [formatDateTime(plannedOverride)]
      );
      return res.json({ success: true, message: "Planned date updated successfully" });
    }

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    // =============================
    // CASE 2: STATUS = RESCHEDULE
    // =============================
    if (status === "Reschedule") {
      if (!plannedOverride || !plannedOverride.trim()) {
        return res.status(400).json({ error: "New planned date is required for Reschedule" });
      }

      // Get current follow counter
      const data = await getSheetData(SHEET_NAME);
      const row = data[rowIndex - 1];
      if (!row) return res.status(400).json({ error: "Row not found" });

      while (row.length <= COL.STEP6_FOLLOW_COUNTER) row.push("");

      const currentCounter = parseInt(row[COL.STEP6_FOLLOW_COUNTER] || "0", 10);
      const newCounter = currentCounter + 1;

      // Update Status (AL)
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP6_STATUS)}${rowIndex}`, [status]);

      // Update Planned with new date (AJ)
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP6_PLANNED)}${rowIndex}`, [formatDateTime(plannedOverride)]);

      // Increment Follow counter (AN)
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP6_FOLLOW_COUNTER)}${rowIndex}`, [newCounter.toString()]);

      // Clear status so lead stays visible (Actual still empty)
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP6_STATUS)}${rowIndex}`, [""]);

      return res.json({
        success: true,
        message: `Rescheduled. Follow-up count: ${newCounter}`,
      });
    }

    // =============================
    // CASE 3: STATUS = DONE
    // =============================
    if (status === "Done") {
      if (!nextStepPlanned || !nextStepPlanned.trim()) {
        return res.status(400).json({ error: "Step 7 Planned Date is required when marking as Done" });
      }

      // Update Status (AL)
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP6_STATUS)}${rowIndex}`, [status]);

      // Update Actual (AK) with current timestamp
      const currentTimestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP6_ACTUAL)}${rowIndex}`, [currentTimestamp]);

      // Update Planned Override if provided
      if (plannedOverride && plannedOverride.trim()) {
        await updateCell(SHEET_NAME, `${colLetter(COL.STEP6_PLANNED)}${rowIndex}`, [formatDateTime(plannedOverride)]);
      }

      // Set Step 7 Planned (AO)
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP7_PLANNED)}${rowIndex}`, [formatDateTime(nextStepPlanned)]);

      // Actual (AK) will be auto-filled by sheet formula

      return res.json({
        success: true,
        message: "Step 6 Done! Lead will move to Step 7.",
      });
    }

    return res.status(400).json({ error: "Invalid status. Use 'Done' or 'Reschedule'" });

  } catch (err) {
    console.error("Step 6 update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;