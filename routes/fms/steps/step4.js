const express = require("express");
const router = express.Router();
const {
  SHEETS,
  getSheetData,
  updateCell,
  appendRow,
  deleteRow,
} = require("../../../utils/sheets");
const { uploadFileToDrive } = require("../../../utils/drive");

const SHEET_NAME = SHEETS.FMS;

// Column mapping (0-indexed) - FMS sheet
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

  // Step 2 file columns
  AKS: 14,               // O
  KHASRA: 15,            // P
  OLD_DOCUMENT: 16,      // Q
  LAND_SURVEY: 17,       // R
  PDF_FOLDER: 26,        // AA - Parent folder link (created in Step 2)

  // Step 4 columns
  STEP4_PLANNED: 23,     // X
  STEP4_ACTUAL: 24,      // Y
  STEP4_STATUS: 25,      // Z
  STEP4_TYPE_OF_PROJECT: 27,  // AB - TEXT field now
  STEP4_CAD_FILE: 28,    // AC - FILE upload
  STEP4_CALC_LINK: 29,   // AD - TEXT field now

  // Step 5 Planned (set from Step 4 on Done)
  STEP5_PLANNED: 31,     // AF
};

// Helper: column index to letter
function colLetter(index) {
  if (index < 26) return String.fromCharCode(65 + index);
  return String.fromCharCode(64 + Math.floor(index / 26)) + String.fromCharCode(65 + (index % 26));
}

// Helper: extract Google Drive folder ID from link
function extractFolderId(folderLink) {
  if (!folderLink) return null;
  const match = folderLink.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Helper: format datetime for sheet
function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const dateVal = new Date(dateStr);
  if (isNaN(dateVal.getTime())) return dateStr;
  return dateVal.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

// GET /api/fms/step4 - Get Step 4 leads
// Filter: Planned (X) filled + Actual (Y) empty
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

      // Pad row to ensure all columns are accessible
      while (row.length <= COL.STEP5_PLANNED) row.push("");

      const planned = (row[COL.STEP4_PLANNED] || "").toString().trim();
      const actual = (row[COL.STEP4_ACTUAL] || "").toString().trim();

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
          // Step 2 files
          aks: row[COL.AKS] || "",
          khasra: row[COL.KHASRA] || "",
          oldDocument: row[COL.OLD_DOCUMENT] || "",
          landSurvey: row[COL.LAND_SURVEY] || "",
          // Step 4 fields
          step4Planned: planned,
          step4Actual: actual,
          step4Status: row[COL.STEP4_STATUS] || "",
          step4TypeOfProject: row[COL.STEP4_TYPE_OF_PROJECT] || "",  // Text value
          step4CadFile: row[COL.STEP4_CAD_FILE] || "",               // File link
          step4CalcLink: row[COL.STEP4_CALC_LINK] || "",             // Text value
        });
      }
    }

    res.json({ leads });
  } catch (err) {
    console.error("FMS Step 4 list error:", err);
    res.status(500).json({ error: "Failed to fetch Step 4 leads", details: err.message });
  }
});

// POST /api/fms/step4/upload - Upload CAD file to parent folder and update column
router.post("/upload", async (req, res) => {
  try {
    const { rowIndex, enqNo, columnIndex, fileName, fileBase64, mimeType, folderLink } = req.body;

    if (!rowIndex || !enqNo || columnIndex === undefined || !fileBase64) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const folderId = extractFolderId(folderLink);
    if (!folderId) {
      return res.status(400).json({ error: "Parent folder not found. Please complete Step 2 first." });
    }

    const file = await uploadFileToDrive(fileName, fileBase64, mimeType || "application/octet-stream", folderId);
    const fileLink = `https://drive.google.com/file/d/${file.id}/view`;

    await updateCell(SHEET_NAME, `${colLetter(columnIndex)}${rowIndex}`, [fileLink]);

    res.json({
      success: true,
      fileId: file.id,
      fileLink: fileLink,
    });
  } catch (err) {
    console.error("FMS Step 4 upload error:", err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// POST /api/fms/step4/save-text - Save text fields (Type of Project & Calculation Link)
router.post("/save-text", async (req, res) => {
  try {
    const { rowIndex, enqNo, typeOfProject, calcLink } = req.body;

    if (!rowIndex || !enqNo) {
      return res.status(400).json({ error: "rowIndex and enqNo are required" });
    }

    // Update Type of Project (AB/27) if provided
    if (typeOfProject !== undefined) {
      await updateCell(
        SHEET_NAME,
        `${colLetter(COL.STEP4_TYPE_OF_PROJECT)}${rowIndex}`,
        [typeOfProject.trim()]
      );
    }

    // Update Calculation Link (AD/29) if provided
    if (calcLink !== undefined) {
      await updateCell(
        SHEET_NAME,
        `${colLetter(COL.STEP4_CALC_LINK)}${rowIndex}`,
        [calcLink.trim()]
      );
    }

    res.json({
      success: true,
      message: "Text fields saved successfully",
    });
  } catch (err) {
    console.error("FMS Step 4 save-text error:", err);
    res.status(500).json({ error: "Save failed", details: err.message });
  }
});

// POST /api/fms/step4/update - Update Step 4 status
router.post("/update", async (req, res) => {
  try {
    const { rowIndex, enqNo, status, plannedOverride, nextStepPlanned } = req.body;

    if (!rowIndex || !enqNo) {
      return res.status(400).json({ error: "rowIndex and enqNo are required" });
    }

    if (!status && !plannedOverride) {
      return res.status(400).json({ error: "Either status or planned date is required" });
    }

    // =============================
    // CASE 1: ONLY PLANNED DATE UPDATE
    // =============================
    if (!status && plannedOverride) {
      await updateCell(
        SHEET_NAME,
        `${colLetter(COL.STEP4_PLANNED)}${rowIndex}`,
        [formatDateTime(plannedOverride)]
      );

      return res.json({
        success: true,
        message: "Planned date updated successfully",
      });
    }

    // =============================
    // CASE 2: STATUS = DONE
    // =============================
    if (status === "Done") {
      // Validate: Next Step Planned Date is required when Done
      if (!nextStepPlanned || !nextStepPlanned.trim()) {
        return res.status(400).json({ error: "Next Step (Step 5) Planned Date is required when marking as Done" });
      }

      // Update Step 4 Status (Z)
      await updateCell(
        SHEET_NAME,
        `${colLetter(COL.STEP4_STATUS)}${rowIndex}`,
        [status]
      );

      // Update Step 4 Planned Override (X) if provided
      if (plannedOverride && plannedOverride.trim()) {
        await updateCell(
          SHEET_NAME,
          `${colLetter(COL.STEP4_PLANNED)}${rowIndex}`,
          [formatDateTime(plannedOverride)]
        );
      }

      // Save Step 5 Planned Date (AF)
      await updateCell(
        SHEET_NAME,
        `${colLetter(COL.STEP5_PLANNED)}${rowIndex}`,
        [formatDateTime(nextStepPlanned)]
      );

      // Actual (Y) will be auto-filled by sheet formula

      return res.json({
        success: true,
        message: "Step 4 marked as Done. Lead will move to Step 5.",
      });
    }

    // =============================
    // CASE 3: MOVE TO OTHER SHEETS
    // =============================
    if (status) {
      const data = await getSheetData(SHEET_NAME);
      const row = data[rowIndex - 1];

      if (!row || row[COL.ENQ_NO] !== enqNo) {
        return res.status(400).json({ error: "Lead not found or EnQ No mismatch" });
      }

      const leadData = [
        row[COL.TIMESTAMP] || "",
        row[COL.ENQ_NO] || "",
        row[COL.LEAD_FROM] || "",
        row[COL.CLIENT_NAME] || "",
        row[COL.PARTNER_TYPE] || "",
        row[COL.PURPOSE] || "",
        row[COL.LOCATION] || "",
        row[COL.CONTACT_INFO] || "",
        row[COL.CONCERN_PERSON] || "",
        "",
        "",
      ];

      let destSheet;
      switch (status) {
        case "Cold Lead":
          destSheet = SHEETS.COLD_LEADS;
          break;
        case "Back to Pipeline":
          destSheet = SHEETS.PIPELINE;
          break;
        case "Not Qualified Lead":
          destSheet = SHEETS.NOT_QUALIFIED;
          break;
        default:
          return res.status(400).json({ error: "Invalid status for move operation" });
      }

      await appendRow(destSheet, leadData);
      await deleteRow(SHEET_NAME, rowIndex);

      return res.json({
        success: true,
        message: `Lead moved to ${status === "Back to Pipeline" ? "Pipeline" : status}`,
        movedTo: destSheet,
      });
    }

  } catch (err) {
    console.error("FMS Step 4 update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

module.exports = router;