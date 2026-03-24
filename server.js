const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/sync", require("./routes/sync"));
app.use("/api/pipeline", require("./routes/pipeline"));
app.use("/api/not-qualified", require("./routes/notQualified"));
app.use("/api/cold-leads", require("./routes/coldLeads"));
app.use("/api/fms", require("./routes/fms"));
app.use("/api/done", require("./routes/done"));


// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 JV CRM Backend running on http://localhost:${PORT}`);
});