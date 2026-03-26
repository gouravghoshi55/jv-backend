const express = require("express");
const router = express.Router();
const {
  SHEETS,
  getSheetData,
  appendRow,
  deleteRow,
  findRowByEnqNo,
} = require("../utils/sheets");

// GET /api/cold-leads/list
router.get("/list", async (req, res) => {
  try {
    const data = await getSheetData(SHEETS.COLD_LEADS);
    if (data.length <= 1) {
      return res.json({ leads: [] });
    }

    const leads = data.slice(1).map((row, index) => ({
      rowIndex: index + 2,
      timestamp: row[0] || "",
      enqNo: row[1] || "",
      leadGeneratedFrom: row[2] || "",
      clientName: row[3] || "",
      partnerType: row[4] || "",
      purpose: row[5] || "",
      location: row[6] || "",
      contactInfo: row[7] || "",
      concernPerson: row[8] || "",
      status: row[9] || "",
      remarks: row[10] || "",
    }));

    res.json({ leads });
  } catch (err) {
    console.error("Cold Leads list error:", err);
    res.status(500).json({ error: "Failed to fetch", details: err.message });
  }
});

// POST /api/cold-leads/update
router.post("/update", async (req, res) => {
  try {
    const { enqNo, status, remarks } = req.body;

    if (!enqNo || !status) {
      return res.status(400).json({ error: "enqNo and status are required" });
    }

    const rowIndex = await findRowByEnqNo(SHEETS.COLD_LEADS, enqNo);
    if (rowIndex === -1) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const data = await getSheetData(SHEETS.COLD_LEADS);
    const row = data[rowIndex - 1];

    let destinationSheet = null;

    switch (status) {
      case "ACTIVE":
        destinationSheet = SHEETS.FMS;
        break;
      case "BACK TO PIPELINE":
        destinationSheet = SHEETS.PIPELINE;
        break;
      case "NOT QUALIFIED LEADS":
        destinationSheet = SHEETS.NOT_QUALIFIED;
        break;
      default:
        return res.status(400).json({ error: "Invalid status" });
    }

    // Current timestamp for destination sheet
    const currentTimestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    const moveRow = [
      currentTimestamp,  // A - Timestamp (current, not old)
      row[1] || "",
      row[2] || "",
      row[3] || "",
      row[4] || "",
      row[5] || "",
      row[6] || "",
      row[7] || "",
      row[8] || "",
    ];

    // Add Status & Remarks only for non-FMS destinations
    if (destinationSheet !== SHEETS.FMS) {
      moveRow.push("");            // Status
      moveRow.push(remarks || ""); // Remarks
    }

    await appendRow(destinationSheet, moveRow);
    await deleteRow(SHEETS.COLD_LEADS, rowIndex);

    res.json({
      message: `Lead ${enqNo} moved to ${destinationSheet}`,
      status,
    });
  } catch (err) {
    console.error("Cold Leads update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;