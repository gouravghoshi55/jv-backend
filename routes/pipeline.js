const express = require("express");
const router = express.Router();
const {
  SHEETS,
  getSheetData,
  updateCell,
  appendRow,
  deleteRow,
  findRowByEnqNo,
} = require("../utils/sheets");

// GET /api/pipeline/list - Fetch all pipeline leads
router.get("/list", async (req, res) => {
  try {
    const data = await getSheetData(SHEETS.PIPELINE);
    if (data.length <= 1) {
      return res.json({ leads: [] });
    }

    const headers = data[0];
    const leads = data.slice(1).map((row, index) => ({
      rowIndex: index + 2, // 1-indexed, skip header
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
    console.error("Pipeline list error:", err);
    res.status(500).json({ error: "Failed to fetch pipeline", details: err.message });
  }
});

// POST /api/pipeline/update - Update status & remarks, move lead if needed
router.post("/update", async (req, res) => {
  try {
    const { enqNo, status, remarks } = req.body;

    if (!enqNo || !status) {
      return res.status(400).json({ error: "enqNo and status are required" });
    }

    // Find the row in Pipeline
    const rowIndex = await findRowByEnqNo(SHEETS.PIPELINE, enqNo);
    if (rowIndex === -1) {
      return res.status(404).json({ error: "Lead not found in Pipeline" });
    }

    // Get the full row data before any changes
    const data = await getSheetData(SHEETS.PIPELINE);
    const row = data[rowIndex - 1]; // 0-indexed array

    // Determine destination sheet based on status
    let destinationSheet = null;

    switch (status) {
      case "ACTIVE":
        destinationSheet = SHEETS.FMS;
        break;
      case "COLD LEADS":
        destinationSheet = SHEETS.COLD_LEADS;
        break;
      case "DONE":
        destinationSheet = SHEETS.DONE;
        break;
      case "NOT QUALIFIED LEADS":
        destinationSheet = SHEETS.NOT_QUALIFIED;
        break;
      default:
        return res.status(400).json({ error: "Invalid status" });
    }

    // Current timestamp for destination sheet
    const currentTimestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // Build the row for destination sheet (A-I columns + Status + Remarks)
    const moveRow = [
      currentTimestamp,  // A - Timestamp (current, not old)
      row[1] || "", // B - EnQ No
      row[2] || "", // C - Lead Generated From
      row[3] || "", // D - Client Name
      row[4] || "", // E - Partner Type of Lead
      row[5] || "", // F - Purpose
      row[6] || "", // G - Location
      row[7] || "", // H - Contact Info
      row[8] || "", // I - Concern Person
    ];

    // For FMS, we just copy A-I (FMS has its own column structure for steps)
    // For others, add Status and Remarks columns
    if (destinationSheet !== SHEETS.FMS) {
      moveRow.push(""); // J - Status (empty in destination, they'll set their own)
      moveRow.push(remarks || ""); // K - Remarks
    }

    // Append to destination sheet
    await appendRow(destinationSheet, moveRow);

    // Delete from Pipeline
    await deleteRow(SHEETS.PIPELINE, rowIndex);

    res.json({
      message: `Lead ${enqNo} moved to ${destinationSheet}`,
      status,
    });
  } catch (err) {
    console.error("Pipeline update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;