const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
require("dotenv").config();

const aiRoutes = require("./routes/ai");
const requestsRoutes = require("./routes/requests");
const authRoutes = require("./routes/auth");
const { initDb } = require("./db/database");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage for local file uploads (free alternative to Firebase Storage)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const original = file.originalname || "scrap_photo.jpg";
    const safeName = original.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed."));
    }
  }
});

// API Routes
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "Tech Nova Server"
  });
});

// Local file upload endpoint
app.post("/api/upload", upload.single("photo"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image file uploaded." });
  }
  const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
  res.json({
    success: true,
    url: fileUrl,
    filename: req.file.filename,
    size: req.file.size
  });
});

app.use("/api", aiRoutes);
app.use("/api", requestsRoutes);
app.use("/api/auth", authRoutes);

// Static uploads serving
app.use("/uploads", express.static(uploadsDir));

// Serve client frontend
const clientPath = path.join(__dirname, "..", "client");
app.use(express.static(clientPath));

// Fallback for client routing
app.get("*", (req, res) => {
  res.sendFile(path.join(clientPath, "index.html"));
});

// Start Server
const serverInstance = app.listen(PORT, async () => {
  try {
    await initDb();
    console.log(`=========================================`);
    console.log(`🚀 Tech Nova Server running on http://localhost:${PORT}`);
    console.log(`📁 Serving client frontend from ${clientPath}`);
    console.log(`📦 Open-Source Database: SQLite (server/data/technova.db)`);
    console.log(`📸 Local upload endpoint: http://localhost:${PORT}/api/upload`);
    console.log(`♻️ Pickup requests endpoint: http://localhost:${PORT}/api/requests`);
    console.log(`=========================================`);
  } catch (err) {
    console.error("❌ Failed to initialize database:", err);
  }
});

serverInstance.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`=========================================`);
    console.log(`ℹ️ Port ${PORT} is already in use!`);
    console.log(`✅ Tech Nova Server is ALREADY running at: http://localhost:${PORT}`);
    console.log(`👉 Simply open http://localhost:${PORT} in your browser.`);
    console.log(`=========================================`);
    process.exit(0);
  } else {
    console.error("❌ Server error:", err);
    process.exit(1);
  }
});
