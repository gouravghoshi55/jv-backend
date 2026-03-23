const express = require("express");
const router = express.Router();
const {
  SHEETS,
  DEDUP_SHEETS,
  getSheetData,
  appendRow,
  getEnqNosFromSheet,
} = require("../utils/sheets");

// POST /api/sync - Sync new leads from Enquiry Responses to Pipeline
router.post("/", async (req, res) => {
  try {
    // 1. Get all rows from Enquiry Responses
    const enquiryData = await getSheetData(SHEETS.ENQUIRY);
    if (enquiryData.length <= 1) {
      return res.json({ message: "No data in Enquiry Responses", synced: 0 });
    }

    // 2. Get all EnQ Nos from dedup sheets
    const dedupPromises = DEDUP_SHEETS.map((sheet) =>
      getEnqNosFromSheet(sheet)
    );
    const dedupResults = await Promise.all(dedupPromises);
    const existingEnqNos = new Set(dedupResults.flat());

    // 3. Check each enquiry row against existing
    let syncCount = 0;
    const enquiryRows = enquiryData.slice(1); // skip header

    for (const row of enquiryRows) {
      const enqNo = (row[1] || "").trim(); // Column B = EnQ No
      if (!enqNo) continue;

      if (!existingEnqNos.has(enqNo)) {
        // Not found in any dedup sheet → append to Pipeline
        // Pipeline columns: A(Timestamp) B(EnQ No) C(Lead Generated From) D(Client Name)
        // E(Partner type of Lead) F(Purpose) G(Location) H(Contact Info) I(Concern Person) J(Status) K(Remarks)
        const pipelineRow = [
          row[0] || "", // A - Datetime/Timestamp
          row[1] || "", // B - EnQ No
          row[2] || "", // C - Lead Generated From
          row[3] || "", // D - Client Name
          row[4] || "", // E - Partner Type of Lead
          row[5] || "", // F - Purpose
          row[6] || "", // G - Location
          row[7] || "", // H - Contact Info
          row[8] || "", // I - Concern Person
          "",           // J - Status (empty, user will set)
          "",           // K - Remarks (empty)
        ];

        await appendRow(SHEETS.PIPELINE, pipelineRow);
        existingEnqNos.add(enqNo); // prevent duplicates within same sync
        syncCount++;
      }
    }

    res.json({
      message: `Sync complete. ${syncCount} new leads added to Pipeline.`,
      synced: syncCount,
    });
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: "Sync failed", details: err.message });
  }
});

module.exports = router;