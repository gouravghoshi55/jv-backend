const express = require("express");
const router = express.Router();
const {
  SHEETS,
  getSheetData,
  updateCell,
  findRowByEnqNo,
} = require("../utils/sheets");

// GET /api/fms/list - Fetch all FMS leads
router.get("/list", async (req, res) => {
  try {
    const data = await getSheetData(SHEETS.FMS);
    if (data.length <= 1) {
      return res.json({ leads: [], headers: [] });
    }

    const headers = data[0];
    const leads = data.slice(6).map((row, index) => {
      const lead = {
        rowIndex: index + 7,
        timestamp: row[0] || "",
        enqNo: row[1] || "",
        leadGeneratedFrom: row[2] || "",
        clientName: row[3] || "",
        partnerType: row[4] || "",
        purpose: row[5] || "",
        location: row[6] || "",
        contactInfo: row[7] || "",
        concernPerson: row[8] || "",
      };

      // Include all additional columns dynamically
      for (let i = 9; i < row.length; i++) {
        lead[`col_${i}`] = row[i] || "";
      }

      return lead;
    });

    res.json({ leads, headers });
  } catch (err) {
    console.error("FMS list error:", err);
    res.status(500).json({ error: "Failed to fetch FMS", details: err.message });
  }
});

// POST /api/fms/update - Update specific columns for a lead in FMS
// This will be expanded when FMS column structure is provided
router.post("/update", async (req, res) => {
  try {
    const { enqNo, columnIndex, value } = req.body;

    if (!enqNo || columnIndex === undefined || value === undefined) {
      return res.status(400).json({ error: "enqNo, columnIndex, and value are required" });
    }

    const rowIndex = await findRowByEnqNo(SHEETS.FMS, enqNo);
    if (rowIndex === -1) {
      return res.status(404).json({ error: "Lead not found in FMS" });
    }

    // Convert column index to letter (0=A, 1=B, etc.)
    const colLetter = String.fromCharCode(65 + columnIndex);
    await updateCell(SHEETS.FMS, `${colLetter}${rowIndex}`, [value]);

    res.json({
      message: `Updated column ${colLetter} for lead ${enqNo}`,
    });
  } catch (err) {
    console.error("FMS update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;