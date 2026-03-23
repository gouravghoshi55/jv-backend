const express = require("express");
const router = express.Router();
const { SHEETS, getSheetData } = require("../utils/sheets");

// GET /api/done/list
router.get("/list", async (req, res) => {
  try {
    const data = await getSheetData(SHEETS.DONE);
    if (data.length <= 1) {
      return res.json({ leads: [] });
    }

    const leads = data.slice(6).map((row, index) => ({
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
      status: row[9] || "",
      remarks: row[10] || "",
    }));

    res.json({ leads });
  } catch (err) {
    console.error("Done list error:", err);
    res.status(500).json({ error: "Failed to fetch", details: err.message });
  }
});

module.exports = router;