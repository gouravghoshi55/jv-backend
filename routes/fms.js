const express = require("express");
const router = express.Router();
const {
  SHEETS,
  getSheetData,
  updateCell,
} = require("../utils/sheets");
const { uploadFileToDrive, createDriveFolder } = require("../utils/drive");

const SHEET_NAME = SHEETS.FMS;

// Column mapping (0-indexed) - FMS sheet
const COL = {
  TIMESTAMP: 0,      // A
  ENQ_NO: 1,         // B
  LEAD_FROM: 2,      // C
  CLIENT_NAME: 3,    // D
  PARTNER_TYPE: 4,   // E
  PURPOSE: 5,        // F
  LOCATION: 6,       // G
  CONTACT_INFO: 7,   // H
  CONCERN_PERSON: 8, // I
  PLANNED: 9,        // J
  ACTUAL: 10,        // K
  STATUS: 11,        // L
  // M = Time Delay (formula, skip)
  MAP_LOCATION: 13,  // N
  AKS: 14,           // O
  KHASRA: 15,        // P
  OLD_DOCUMENT: 16,  // Q
  LAND_SURVEY: 17,   // R
  // ... other columns ...
  PDF_FOLDER: 26,    // AA (index 26)
};

// Helper: column index to letter
function colLetter(index) {
  if (index < 26) return String.fromCharCode(65 + index);
  return String.fromCharCode(64 + Math.floor(index / 26)) + String.fromCharCode(65 + (index % 26));
}

// GET /api/fms/list - All FMS leads
router.get("/list", async (req, res) => {
  try {
    const data = await getSheetData(SHEET_NAME);
    if (data.length <= 6) {
      return res.json({ leads: [] });
    }

    const leads = [];
    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[COL.ENQ_NO]) continue;

      leads.push({
        rowIndex: i + 1, // 1-indexed sheet row
        timestamp: row[COL.TIMESTAMP] || "",
        enqNo: row[COL.ENQ_NO] || "",
        leadGeneratedFrom: row[COL.LEAD_FROM] || "",
        clientName: row[COL.CLIENT_NAME] || "",
        partnerType: row[COL.PARTNER_TYPE] || "",
        purpose: row[COL.PURPOSE] || "",
        location: row[COL.LOCATION] || "",
        contactInfo: row[COL.CONTACT_INFO] || "",
        concernPerson: row[COL.CONCERN_PERSON] || "",
        planned: row[COL.PLANNED] || "",
        actual: row[COL.ACTUAL] || "",
        status: row[COL.STATUS] || "",
        mapLocation: row[COL.MAP_LOCATION] || "",
        aks: row[COL.AKS] || "",
        khasra: row[COL.KHASRA] || "",
        oldDocument: row[COL.OLD_DOCUMENT] || "",
        landSurvey: row[COL.LAND_SURVEY] || "",
        pdfFolder: row[COL.PDF_FOLDER] || "",
      });
    }

    res.json({ leads });
  } catch (err) {
    console.error("FMS list error:", err);
    res.status(500).json({ error: "Failed to fetch FMS", details: err.message });
  }
});

// GET /api/fms/step2 - Step 2 leads (Planned not empty, Actual empty)
router.get("/step2", async (req, res) => {
  try {
    const data = await getSheetData(SHEET_NAME);
    if (data.length <= 6) {
      return res.json({ leads: [] });
    }

    const leads = [];
    for (let i = 6; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[COL.ENQ_NO]) continue;

      const planned = (row[COL.PLANNED] || "").trim();
      const actual = (row[COL.ACTUAL] || "").trim();

      // Show only if Planned is filled and Actual is empty
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
          planned: planned,
          actual: actual,
          status: row[COL.STATUS] || "",
          mapLocation: row[COL.MAP_LOCATION] || "",
          aks: row[COL.AKS] || "",
          khasra: row[COL.KHASRA] || "",
          oldDocument: row[COL.OLD_DOCUMENT] || "",
          landSurvey: row[COL.LAND_SURVEY] || "",
          pdfFolder: row[COL.PDF_FOLDER] || "",
        });
      }
    }

    res.json({ leads });
  } catch (err) {
    console.error("FMS step2 error:", err);
    res.status(500).json({ error: "Failed to fetch Step 2 leads", details: err.message });
  }
});

// POST /api/fms/step2/update - Update Step 2 with document uploads
router.post("/step2/update", async (req, res) => {
  try {
    const { rowIndex, enqNo, location } = req.body;

    if (!rowIndex || !enqNo) {
      return res.status(400).json({ error: "rowIndex and enqNo are required" });
    }

    // Create folder name: EnqNo_Location
    const folderName = `${enqNo}_${(location || "").replace(/[^a-zA-Z0-9]/g, "_")}`;
    
    // Create folder in Google Drive
    const parentFolderId = "180yh3YoG-wbcgDQCkwvmGKqKfFinRsUK";
    const folder = await createDriveFolder(folderName, parentFolderId);
    const folderLink = `https://drive.google.com/drive/folders/${folder.id}`;

    // File uploads will be handled separately via /api/fms/upload endpoint
    // Here we just update the sheet with folder link and actual date

    const currentDateTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // Update Actual (K), Status (L), PDF Folder (AA)
    await updateCell(SHEET_NAME, `${colLetter(COL.ACTUAL)}${rowIndex}`, [currentDateTime]);
    await updateCell(SHEET_NAME, `${colLetter(COL.STATUS)}${rowIndex}`, ["Done"]);
    await updateCell(SHEET_NAME, `${colLetter(COL.PDF_FOLDER)}${rowIndex}`, [folderLink]);

    res.json({ 
      success: true, 
      message: "Step 2 completed",
      folderId: folder.id,
      folderLink: folderLink
    });
  } catch (err) {
    console.error("FMS step2 update error:", err);
    res.status(500).json({ error: "Update failed", details: err.message });
  }
});

// POST /api/fms/upload - Upload file to Drive and update sheet column
router.post("/upload", async (req, res) => {
  try {
    const { rowIndex, folderId, columnIndex, fileName, fileBase64, mimeType } = req.body;

    if (!rowIndex || !folderId || columnIndex === undefined || !fileBase64) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Upload file to the folder
    const file = await uploadFileToDrive(fileName, fileBase64, mimeType, folderId);
    const fileLink = `https://drive.google.com/file/d/${file.id}/view`;

    // Update the specific column with file link
    await updateCell(SHEET_NAME, `${colLetter(columnIndex)}${rowIndex}`, [fileLink]);

    res.json({ 
      success: true, 
      fileId: file.id,
      fileLink: fileLink
    });
  } catch (err) {
    console.error("FMS upload error:", err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

module.exports = router;