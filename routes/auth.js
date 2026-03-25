const express = require("express");
const router = express.Router();
const { getSheetData } = require("../utils/sheets");

const USER_SHEET = "User";

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { userId, password } = req.body;

    if (!userId || !password) {
      return res.status(400).json({ error: "User ID and Password are required" });
    }

    const data = await getSheetData(USER_SHEET);
    if (data.length <= 1) {
      return res.status(401).json({ error: "No users found" });
    }

    const users = data.slice(1);

    const matchedUser = users.find(
      (row) =>
        (row[0] || "").trim() === userId.trim() &&
        (row[1] || "").trim() === password.trim()
    );

    if (!matchedUser) {
      return res.status(401).json({ error: "Invalid User ID or Password" });
    }

    const user = {
      userId: (matchedUser[0] || "").trim(),
      userName: (matchedUser[2] || "").trim(),
      role: (matchedUser[3] || "").trim(),
      workingTabs: (matchedUser[4] || "All").trim(),
    };

    res.json({ message: "Login successful", user });
  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).json({ error: "Login failed", details: err.message });
  }
});

// POST /api/auth/verify
router.post("/verify", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const data = await getSheetData(USER_SHEET);
    const users = data.slice(1);

    const matchedUser = users.find(
      (row) => (row[0] || "").trim() === userId.trim()
    );

    if (!matchedUser) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = {
      userId: (matchedUser[0] || "").trim(),
      userName: (matchedUser[2] || "").trim(),
      role: (matchedUser[3] || "").trim(),
      workingTabs: (matchedUser[4] || "All").trim(),
    };

    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: "Verification failed" });
  }
});

module.exports = router;