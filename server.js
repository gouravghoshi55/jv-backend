const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS — allow local dev + production frontend
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
];

// Add production frontend URL from env var
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    return callback(null, true); // Allow all for now, tighten later if needed
  },
  credentials: true,
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/sync", require("./routes/sync"));
app.use("/api/pipeline", require("./routes/pipeline"));
app.use("/api/not-qualified", require("./routes/notQualified"));
app.use("/api/cold-leads", require("./routes/coldLeads"));
app.use("/api/fms", require("./routes/fms"));
app.use("/api/done", require("./routes/done"));
app.use("/api/next-action-plan", require("./routes/nextActionPlan"));
app.use("/api/site-visit/ecs", require("./routes/siteVisitEcs"));
app.use("/api/site-visit/fms", require("./routes/siteVisitFms"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 JV CRM Backend running on http://localhost:${PORT}`);
});