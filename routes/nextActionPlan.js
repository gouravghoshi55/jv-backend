const express = require("express");
const router = express.Router();
const {
  SHEETS,
  getSheetData,
  appendRow,
  updateCell,
  findRowByEnqNo,
} = require("../utils/sheets");

const SHEET_NAME = SHEETS.NEXT_ACTION; // "NEXT Action Plan"
const USER_SHEET = "User";

// Column mapping (A=0, B=1, ...)
const COL = {
  TICKET_ID: 0,       // A
  ENQ_NO: 1,          // B
  CLIENT_NAME: 2,     // C
  LOCATION: 3,        // D
  RAISED_BY: 4,       // E
  RAISED_DATE: 5,     // F
  ASSIGNED_TO: 6,     // G
  ISSUE_DESC: 7,      // H
  DESIRED_DATE: 8,    // I
  STATUS: 9,          // J
  CONFIRMED_DATE: 10, // K
  REVISED_DATE: 11,   // L
  REVISION_COUNT: 12, // M
  REVISION_HISTORY: 13, // N
  COMPLETION_DATE: 14,  // O
  PC_REMARKS: 15,       // P
  DOER_REMARKS: 16,     // Q
  SOURCE_TAB: 17,       // R
  STEP_NAME: 18,        // S
};

// Helper: column index to letter (0=A, 1=B, ... 18=S)
function colLetter(index) {
  return String.fromCharCode(65 + index);
}

// Helper: generate next Ticket ID
async function generateTicketId() {
  try {
    const rows = await getSheetData(SHEET_NAME);
    if (!rows || rows.length <= 1) return "TKT001";

    let maxNum = 0;
    for (let i = 1; i < rows.length; i++) {
      const tid = rows[i][COL.TICKET_ID] || "";
      const match = tid.match(/TKT(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    return "TKT" + String(maxNum + 1).padStart(3, "0");
  } catch (err) {
    console.error("Error generating ticket ID:", err);
    return "TKT001";
  }
}

// Helper: build ticket object from row
function rowToTicket(row, rowIndex) {
  return {
    rowIndex,
    ticketId: row[COL.TICKET_ID] || "",
    enqNo: row[COL.ENQ_NO] || "",
    clientName: row[COL.CLIENT_NAME] || "",
    location: row[COL.LOCATION] || "",
    raisedBy: row[COL.RAISED_BY] || "",
    raisedDate: row[COL.RAISED_DATE] || "",
    assignedTo: row[COL.ASSIGNED_TO] || "",
    issueDescription: row[COL.ISSUE_DESC] || "",
    desiredDate: row[COL.DESIRED_DATE] || "",
    status: row[COL.STATUS] || "Open",
    confirmedDate: row[COL.CONFIRMED_DATE] || "",
    revisedDate: row[COL.REVISED_DATE] || "",
    revisionCount: row[COL.REVISION_COUNT] || "0",
    revisionHistory: row[COL.REVISION_HISTORY] || "",
    completionDate: row[COL.COMPLETION_DATE] || "",
    pcRemarks: row[COL.PC_REMARKS] || "",
    doerRemarks: row[COL.DOER_REMARKS] || "",
    sourceTab: row[COL.SOURCE_TAB] || "",
    stepName: row[COL.STEP_NAME] || "",
  };
}

// ─── GET /api/next-action-plan/list ──────────────────────
// Query params: assignedTo, status, raisedBy
router.get("/list", async (req, res) => {
  try {
    const rows = await getSheetData(SHEET_NAME);

    if (!rows || rows.length <= 1) {
      return res.json({ tickets: [] });
    }

    let tickets = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[COL.TICKET_ID]) continue;
      tickets.push(rowToTicket(row, i + 1)); // i+1 = 1-based sheet row
    }

    // Apply filters
    const { assignedTo, status, raisedBy } = req.query;
    if (assignedTo) {
      tickets = tickets.filter(
        (t) => t.assignedTo.toLowerCase() === assignedTo.toLowerCase()
      );
    }
    if (status) {
      tickets = tickets.filter(
        (t) => t.status.toLowerCase() === status.toLowerCase()
      );
    }
    if (raisedBy) {
      tickets = tickets.filter(
        (t) => t.raisedBy.toLowerCase() === raisedBy.toLowerCase()
      );
    }

    res.json({ tickets });
  } catch (err) {
    console.error("Error fetching tickets:", err);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// ─── GET /api/next-action-plan/my-tickets ────────────────
// Returns non-completed tickets assigned to the logged-in user
router.get("/my-tickets", async (req, res) => {
  try {
    const { userName } = req.query;
    if (!userName) return res.status(400).json({ error: "userName required" });

    const rows = await getSheetData(SHEET_NAME);
    if (!rows || rows.length <= 1) {
      return res.json({ tickets: [] });
    }

    const tickets = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[COL.TICKET_ID]) continue;

      const assignedTo = (row[COL.ASSIGNED_TO] || "").toLowerCase();
      const status = (row[COL.STATUS] || "").toLowerCase();

      if (assignedTo === userName.toLowerCase() && status !== "completed") {
        tickets.push(rowToTicket(row, i + 1));
      }
    }

    res.json({ tickets });
  } catch (err) {
    console.error("Error fetching my tickets:", err);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// ─── POST /api/next-action-plan/create ───────────────────
router.post("/create", async (req, res) => {
  try {
    const {
      enqNo,
      clientName,
      location,
      raisedBy,
      assignedTo,
      issueDescription,
      desiredDate,
      sourceTab,
      stepName,
    } = req.body;

    if (!enqNo || !assignedTo || !issueDescription || !desiredDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const ticketId = await generateTicketId();
    const raisedDate = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
    });

    const newRow = [
      ticketId,              // A - Ticket ID
      enqNo,                 // B - EnQ No
      clientName || "",      // C - Client Name
      location || "",        // D - Location
      raisedBy || "",        // E - Raised By
      raisedDate,            // F - Raised Date
      assignedTo,            // G - Assigned To
      issueDescription,      // H - Issue Description
      desiredDate,           // I - Desired Date
      "Open",                // J - Status
      "",                    // K - Confirmed Date
      "",                    // L - Revised Date
      "0",                   // M - Revision Count
      "",                    // N - Revision History
      "",                    // O - Completion Date
      "",                    // P - PC Remarks
      "",                    // Q - Doer Remarks
      sourceTab || "",       // R - Source Tab
      stepName || "",        // S - Step Name
    ];

    await appendRow(SHEET_NAME, newRow);

    res.json({ success: true, ticketId, message: "Ticket created successfully" });
  } catch (err) {
    console.error("Error creating ticket:", err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// ─── POST /api/next-action-plan/update ───────────────────
router.post("/update", async (req, res) => {
  try {
    const {
      rowIndex,
      status,
      confirmedDate,
      revisedDate,
      pcRemarks,
      doerRemarks,
      completionDate,
    } = req.body;

    if (!rowIndex) {
      return res.status(400).json({ error: "rowIndex is required" });
    }

    // Read current row to get existing data
    const rows = await getSheetData(SHEET_NAME);
    const currentRow = rows[rowIndex - 1]; // rowIndex is 1-based
    if (!currentRow) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Collect all cell updates: { col: columnIndex, val: newValue }
    const updates = [];

    if (status !== undefined) {
      updates.push({ col: COL.STATUS, val: status });

      // If marking completed, auto-fill completion date
      if (status === "Completed") {
        const now = new Date().toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        });
        updates.push({ col: COL.COMPLETION_DATE, val: completionDate || now });
      }

      // If date revision requested, increment count and add to history
      if (status === "Date Revision Requested" && revisedDate) {
        const currentCount = parseInt(currentRow[COL.REVISION_COUNT] || "0", 10);
        const newCount = currentCount + 1;
        const currentHistory = currentRow[COL.REVISION_HISTORY] || "";
        const newHistory = currentHistory
          ? `${currentHistory}, ${revisedDate}`
          : revisedDate;

        updates.push({ col: COL.REVISION_COUNT, val: String(newCount) });
        updates.push({ col: COL.REVISION_HISTORY, val: newHistory });
        updates.push({ col: COL.REVISED_DATE, val: revisedDate });
      }
    }

    if (confirmedDate !== undefined) {
      updates.push({ col: COL.CONFIRMED_DATE, val: confirmedDate });
      // If PC confirms and status is still Open, auto-set to PC Confirmed
      const currentStatus = currentRow[COL.STATUS] || "";
      if (currentStatus === "Open") {
        updates.push({ col: COL.STATUS, val: "PC Confirmed" });
      }
    }

    if (revisedDate !== undefined && status !== "Date Revision Requested") {
      updates.push({ col: COL.REVISED_DATE, val: revisedDate });
    }

    if (pcRemarks !== undefined) {
      updates.push({ col: COL.PC_REMARKS, val: pcRemarks });
    }

    if (doerRemarks !== undefined) {
      updates.push({ col: COL.DOER_REMARKS, val: doerRemarks });
    }

    // Apply all updates one cell at a time
    // updateCell(sheetName, range, values) — values must be array
    for (const update of updates) {
      const cellRange = `${colLetter(update.col)}${rowIndex}`;
      await updateCell(SHEET_NAME, cellRange, [update.val]);
    }

    res.json({ success: true, message: "Ticket updated successfully" });
  } catch (err) {
    console.error("Error updating ticket:", err);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// ─── GET /api/next-action-plan/users ─────────────────────
// Fetch all users from User sheet for dropdown
router.get("/users", async (req, res) => {
  try {
    const rows = await getSheetData(USER_SHEET);
    if (!rows || rows.length <= 1) {
      return res.json({ users: [] });
    }

    const users = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      users.push({
        id: row[0],        // A - ID
        userName: row[2],   // C - User name
        role: row[3],       // D - Role
      });
    }

    res.json({ users });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ─── GET /api/next-action-plan/overdue ───────────────────
// Check for overdue tickets and mark them
router.get("/overdue", async (req, res) => {
  try {
    const rows = await getSheetData(SHEET_NAME);
    if (!rows || rows.length <= 1) {
      return res.json({ tickets: [] });
    }

    const now = new Date();
    const overdueTickets = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[COL.TICKET_ID]) continue;

      const status = (row[COL.STATUS] || "").toLowerCase();
      if (status === "completed") continue;

      // Check the most relevant date
      const checkDate =
        row[COL.REVISED_DATE] || row[COL.CONFIRMED_DATE] || row[COL.DESIRED_DATE];
      if (!checkDate) continue;

      const dueDate = new Date(checkDate);
      if (isNaN(dueDate.getTime())) continue;

      if (now > dueDate) {
        // Mark as overdue in sheet if not already
        if (status !== "overdue") {
          const cellRange = `${colLetter(COL.STATUS)}${i + 1}`;
          await updateCell(SHEET_NAME, cellRange, ["Overdue"]);
        }

        overdueTickets.push({
          rowIndex: i + 1,
          ticketId: row[COL.TICKET_ID] || "",
          enqNo: row[COL.ENQ_NO] || "",
          clientName: row[COL.CLIENT_NAME] || "",
          assignedTo: row[COL.ASSIGNED_TO] || "",
          desiredDate: row[COL.DESIRED_DATE] || "",
          revisedDate: row[COL.REVISED_DATE] || "",
          status: "Overdue",
        });
      }
    }

    res.json({ tickets: overdueTickets });
  } catch (err) {
    console.error("Error checking overdue:", err);
    res.status(500).json({ error: "Failed to check overdue tickets" });
  }
});

module.exports = router;