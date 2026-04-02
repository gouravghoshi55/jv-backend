const express = require("express");
const router = express.Router();
const { SHEETS, getSheetData, updateCell } = require("../utils/sheets");

const SHEET_NAME = SHEETS.SITE_VISIT_ECS || "SITE VISIT ECS";

// Column mapping (0-indexed) - SITE VIST ECS sheet
// Row 1 = Headers, Row 2+ = Data
const COL = {
  DATE: 0,           // A
  ENQ_NO: 1,         // B
  LEAD_FROM: 2,      // C
  CLIENT_NAME: 3,    // D
  PARTNER_TYPE: 4,   // E
  PURPOSE: 5,        // F
  LOCATION: 6,       // G
  CONTACT_INFO: 7,   // H
  CONCERN_PERSON: 8, // I
  STATUS: 9,         // J
};

function colLetter(index) {
  return String.fromCharCode(65 + index);
}

// GET /api/site-visit/ecs - List all ECS leads
router.get("/", async (req, res) => {
  try {
    const data = await getSheetData(SHEET_NAME);

    if (!data || data.length <= 1) {
      return res.json({ leads: [] });
    }

    const leads = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[COL.ENQ_NO]) continue;

      leads.push({
        rowIndex: i + 1,
        date: row[COL.DATE] || "",
        enqNo: row[COL.ENQ_NO] || "",
        leadGeneratedFrom: row[COL.LEAD_FROM] || "",
        clientName: row[COL.CLIENT_NAME] || "",
        partnerType: row[COL.PARTNER_TYPE] || "",
        purpose: row[COL.PURPOSE] || "",
        location: row[COL.LOCATION] || "",
        contactInfo: row[COL.CONTACT_INFO] || "",
        concernPerson: row[COL.CONCERN_PERSON] || "",
        status: row[COL.STATUS] || "",
      });
    }

    res.json({ leads });
  } catch (err) {
    console.error("Site Visit ECS list error:", err);
    res.status(500).json({ error: "Failed to fetch ECS leads", details: err.message });
  }
});

// POST /api/site-visit/ecs/update - Update status (Schedule/Hold)
// Formula in sheet handles moving to SITE VISIT FMS when Schedule
router.post("/update", async (req, res) => {
  try {
    const { rowIndex, enqNo, status } = req.body;

    if (!rowIndex || !enqNo) {
      return res.status(400).json({ error: "rowIndex and enqNo are required" });
    }

    if (!status || !["Schedule", "Hold"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'Schedule' or 'Hold'" });
    }

    // Update Status (J)
    await updateCell(SHEET_NAME, `${colLetter(COL.STATUS)}${rowIndex}`, [status]);

    res.json({
      success: true,
      message: status === "Schedule"
        ? "Lead scheduled! Formula will move it to Site Visit FMS."
        : "Lead put on Hold.",
    });
  } catch (err) {
    console.error("Site Visit ECS update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;