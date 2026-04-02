const express = require("express");
const router = express.Router();
const { getSheetData, updateCell } = require("../../../utils/sheets");

const SHEET_NAME = "SITE VISIT FMS";

// Column mapping (0-indexed) - SITE VISIT FMS sheet
// Row 1-6 = Headers/Info, Row 7+ = Data
const COL = {
  // Base info (A-J)
  TIMESTAMP: 0,
  ENQ_NO: 1,
  LEAD_FROM: 2,
  CLIENT_NAME: 3,
  PARTNER_TYPE: 4,
  TYPE_OF_CLIENT: 5,  // F
  PURPOSE: 6,         // G
  LOCATION: 7,        // H
  CONTACT_INFO: 8,    // I
  CONCERN_PERSON: 9,  // J

  // Step 2: Scheduling (K-P)
  STEP2_PLANNED: 10,      // K
  STEP2_ACTUAL: 11,       // L
  STEP2_STATUS: 12,       // M
  STEP2_DATE_OF_VISIT: 13, // N
  STEP2_TIME_DELAY: 14,   // O (formula)
  STEP2_REMARK: 15,       // P

  // Step 3 Planned (Q) - set from Step 2 when Done
  STEP3_PLANNED: 16,      // Q
};

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

// GET /api/site-visit/fms/step2
// Filter: Planned (K) filled + Actual (L) empty
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

      while (row.length <= COL.STEP3_PLANNED) row.push("");

      const planned = (row[COL.STEP2_PLANNED] || "").toString().trim();
      const actual = (row[COL.STEP2_ACTUAL] || "").toString().trim();

      if (planned && !actual) {
        leads.push({
          rowIndex: i + 1,
          timestamp: row[COL.TIMESTAMP] || "",
          enqNo: row[COL.ENQ_NO] || "",
          leadGeneratedFrom: row[COL.LEAD_FROM] || "",
          clientName: row[COL.CLIENT_NAME] || "",
          partnerType: row[COL.PARTNER_TYPE] || "",
          typeOfClient: row[COL.TYPE_OF_CLIENT] || "",
          purpose: row[COL.PURPOSE] || "",
          location: row[COL.LOCATION] || "",
          contactInfo: row[COL.CONTACT_INFO] || "",
          concernPerson: row[COL.CONCERN_PERSON] || "",
          step2Planned: planned,
          step2Actual: actual,
          step2Status: row[COL.STEP2_STATUS] || "",
          step2DateOfVisit: row[COL.STEP2_DATE_OF_VISIT] || "",
          step2Remark: row[COL.STEP2_REMARK] || "",
        });
      }
    }

    res.json({ leads });
  } catch (err) {
    console.error("Site Visit FMS Step 2 error:", err);
    res.status(500).json({ error: "Failed to fetch Step 2 leads", details: err.message });
  }
});

// POST /api/site-visit/fms/step2/update
router.post("/update", async (req, res) => {
  try {
    const { rowIndex, enqNo, status, plannedOverride, dateOfVisit, remark, nextStepPlanned } = req.body;

    if (!rowIndex || !enqNo) {
      return res.status(400).json({ error: "rowIndex and enqNo are required" });
    }

    // CASE 1: Only planned date update
    if (!status && plannedOverride) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP2_PLANNED)}${rowIndex}`, [formatDateTime(plannedOverride)]);
      return res.json({ success: true, message: "Planned date updated successfully" });
    }

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    // Update Status (M)
    await updateCell(SHEET_NAME, `${colLetter(COL.STEP2_STATUS)}${rowIndex}`, [status]);

    // Update Planned Override (K) if provided
    if (plannedOverride && plannedOverride.trim()) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP2_PLANNED)}${rowIndex}`, [formatDateTime(plannedOverride)]);
    }

    // Update Date of Visit (N) if provided
    if (dateOfVisit && dateOfVisit.trim()) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP2_DATE_OF_VISIT)}${rowIndex}`, [formatDateTime(dateOfVisit)]);
    }

    // Update Remark (P) if provided
    if (remark && remark.trim()) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP2_REMARK)}${rowIndex}`, [remark.trim()]);
    }

    if (status === "Done") {
      // Set Actual timestamp (L)
      const currentTimestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP2_ACTUAL)}${rowIndex}`, [currentTimestamp]);

      // Set Step 3 Planned (Q) if provided
      if (nextStepPlanned && nextStepPlanned.trim()) {
        await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_PLANNED)}${rowIndex}`, [formatDateTime(nextStepPlanned)]);
      }

      return res.json({ success: true, message: "Step 2 Done! Lead will move to Step 3." });
    }

    // Not Done
    return res.json({ success: true, message: "Status updated to Not Done." });

  } catch (err) {
    console.error("Site Visit FMS Step 2 update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;