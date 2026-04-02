const express = require("express");
const router = express.Router();
const { getSheetData, updateCell } = require("../../../utils/sheets");

const SHEET_NAME = "SITE VISIT FMS";

// Column mapping (0-indexed) - SITE VISIT FMS sheet
const COL = {
  TIMESTAMP: 0,
  ENQ_NO: 1,
  LEAD_FROM: 2,
  CLIENT_NAME: 3,
  PARTNER_TYPE: 4,
  TYPE_OF_CLIENT: 5,
  PURPOSE: 6,
  LOCATION: 7,
  CONTACT_INFO: 8,
  CONCERN_PERSON: 9,

  // Step 3: Land Observations (Q-Y)
  STEP3_PLANNED: 16,       // Q
  STEP3_ACTUAL: 17,        // R
  STEP3_STATUS: 18,        // S
  STEP3_GOOGLE_MAP: 19,    // T
  STEP3_PHOTOS: 20,        // U
  STEP3_TRANSPORT: 21,     // V
  STEP3_DISTANCE: 22,      // W
  STEP3_AMOUNT: 23,        // X
  STEP3_TIME_DELAY: 24,    // Y (formula)
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

// GET /api/site-visit/fms/step3
// Filter: Planned (Q) filled + Actual (R) empty
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

      while (row.length <= COL.STEP3_TIME_DELAY) row.push("");

      const planned = (row[COL.STEP3_PLANNED] || "").toString().trim();
      const actual = (row[COL.STEP3_ACTUAL] || "").toString().trim();

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
          step3Planned: planned,
          step3Actual: actual,
          step3Status: row[COL.STEP3_STATUS] || "",
          step3GoogleMap: row[COL.STEP3_GOOGLE_MAP] || "",
          step3Photos: row[COL.STEP3_PHOTOS] || "",
          step3Transport: row[COL.STEP3_TRANSPORT] || "",
          step3Distance: row[COL.STEP3_DISTANCE] || "",
          step3Amount: row[COL.STEP3_AMOUNT] || "",
        });
      }
    }

    res.json({ leads });
  } catch (err) {
    console.error("Site Visit FMS Step 3 error:", err);
    res.status(500).json({ error: "Failed to fetch Step 3 leads", details: err.message });
  }
});

// POST /api/site-visit/fms/step3/update
router.post("/update", async (req, res) => {
  try {
    const { rowIndex, enqNo, status, plannedOverride, googleMap, photos, transport, distance, amount } = req.body;

    if (!rowIndex || !enqNo) {
      return res.status(400).json({ error: "rowIndex and enqNo are required" });
    }

    // Only planned date update
    if (!status && plannedOverride) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_PLANNED)}${rowIndex}`, [formatDateTime(plannedOverride)]);
      return res.json({ success: true, message: "Planned date updated successfully" });
    }

    if (status !== "Done") {
      return res.status(400).json({ error: "Only 'Done' status is allowed for Step 3" });
    }

    // Update Status (S)
    await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_STATUS)}${rowIndex}`, [status]);

    // Update Actual (R) with current timestamp
    const currentTimestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_ACTUAL)}${rowIndex}`, [currentTimestamp]);

    // Update Planned Override (Q) if provided
    if (plannedOverride && plannedOverride.trim()) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_PLANNED)}${rowIndex}`, [formatDateTime(plannedOverride)]);
    }

    // Update Google Map Location (T)
    if (googleMap && googleMap.trim()) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_GOOGLE_MAP)}${rowIndex}`, [googleMap.trim()]);
    }

    // Update Photos link (U)
    if (photos && photos.trim()) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_PHOTOS)}${rowIndex}`, [photos.trim()]);
    }

    // Update Transport Used (V)
    if (transport && transport.trim()) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_TRANSPORT)}${rowIndex}`, [transport.trim()]);
    }

    // Update Distance in KM (W)
    if (distance && distance.trim()) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_DISTANCE)}${rowIndex}`, [distance.trim()]);
    }

    // Update Amount (X)
    if (amount && amount.trim()) {
      await updateCell(SHEET_NAME, `${colLetter(COL.STEP3_AMOUNT)}${rowIndex}`, [amount.trim()]);
    }

    // Lead stays in SITE VISIT FMS (completed)
    res.json({
      success: true,
      message: "Land Observation completed!",
    });

  } catch (err) {
    console.error("Site Visit FMS Step 3 update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;