const express = require("express");
const router = express.Router();
const { SHEETS, getSheetData, appendRow } = require("../utils/sheets");

const SHEET_NAME = SHEETS.REMARKS; // "Remarks"

// Helper: get current timestamp in IST
function getCurrentTimestamp() {
  return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

// GET /api/remarks?enqNo=ENQ001
// Fetch all remarks for a given EnQ No
router.get("/", async (req, res) => {
  try {
    const { enqNo } = req.query;

    if (!enqNo) {
      return res.status(400).json({ error: "enqNo is required" });
    }

    const data = await getSheetData(SHEET_NAME);

    // Row 1 = headers, Row 2+ = data
    const remarks = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;

      const rowEnqNo = (row[1] || "").trim(); // B = EnQ No
      if (rowEnqNo === enqNo.trim()) {
        remarks.push({
          timestamp: row[0] || "",  // A = Timestamp
          enqNo: row[1] || "",      // B = EnQ No
          stepName: row[2] || "",   // C = Step Name
          remark: row[3] || "",     // D = Remarks
        });
      }
    }

    // Sort by timestamp descending (newest first)
    remarks.sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      return dateB - dateA;
    });

    res.json({ remarks });
  } catch (err) {
    console.error("Remarks fetch error:", err);
    res.status(500).json({ error: "Failed to fetch remarks", details: err.message });
  }
});

// POST /api/remarks
// Save a new remark
// Body: { enqNo, stepName, remark }
router.post("/", async (req, res) => {
  try {
    const { enqNo, stepName, remark } = req.body;

    if (!enqNo || !remark || !remark.trim()) {
      return res.status(400).json({ error: "enqNo and remark are required" });
    }

    const timestamp = getCurrentTimestamp();

    // Append row: Timestamp | EnQ No | Step Name | Remarks
    await appendRow(SHEET_NAME, [
      timestamp,
      enqNo,
      stepName || "",
      remark.trim(),
    ]);

    res.json({
      success: true,
      message: "Remark saved successfully",
      remark: {
        timestamp,
        enqNo,
        stepName: stepName || "",
        remark: remark.trim(),
      },
    });
  } catch (err) {
    console.error("Remarks save error:", err);
    res.status(500).json({ error: "Failed to save remark", details: err.message });
  }
});

module.exports = router;