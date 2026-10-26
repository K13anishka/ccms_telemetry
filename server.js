/**
 * server.js – CCMS (Centralized Control and Monitoring System) backend.
 *
 * Receives telemetry from ESP32 street-light controllers, stores readings in
 * PostgreSQL (AWS) or SQLite (local), and exposes a REST API for the React dashboard.
 *
 *   npm install          # install dependencies
 *   node server.js       # start the server
 */
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { initDb, checkHealth, closeDb } = require("./db");

// Route modules
const telemetryRoutes = require("./routes/telemetry");
const dashboardRoutes = require("./routes/dashboard");
const devicesRoutes = require("./routes/devices");
const authRoutes = require("./routes/auth");
const { startScheduler, stopScheduler } = require("./lib/scheduler");

const PORT = process.env.PORT || 8000;

const app = express();

// ────────────────────────── Middleware ──────────────────────────
app.use(cors());
app.use(express.json({ limit: "100kb" }));

// Serve the React production build from public/
app.use(express.static(path.join(__dirname, "public")));

// ────────────────────────── Health check ──────────────────────────
app.get("/health", async (_req, res) => {
  try {
    const health = await checkHealth();
    res.json({ ...health, uptime: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: "error", message: err.message });
  }
});

// ────────────────────────── API routes ──────────────────────────
// Dashboard login / sign-up
app.use("/api/v1/auth", authRoutes);

// Device telemetry (ESP32 → server)
app.use("/api/v1", telemetryRoutes);

// Dashboard (React → server)
app.use("/api/v1", dashboardRoutes);

// Device management (CRUD)
app.use("/api/v1/devices", devicesRoutes);

// ────────────────────────── SPA fallback ──────────────────────────
// Any route that doesn't match an API or static file serves index.html
// so the React client-side router can handle it.
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ────────────────────────── Error handler ──────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal server error" });
});

// ────────────────────────── Start ──────────────────────────
async function start() {
  await initDb();
  await authRoutes.seedAdmin();

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`CCMS server running on port ${PORT}`);
    console.log(`Access the dashboard at http://localhost:${PORT}`);
  });

  startScheduler();

  // ── Graceful shutdown ──
  const shutdown = async (signal) => {
    console.log(`\n${signal} received – shutting down gracefully…`);
    stopScheduler();
    server.close(async () => {
      try {
        await closeDb();
        console.log("Database closed.");
      } catch (err) {
        console.error("Error closing DB:", err);
      }
      process.exit(0);
    });

    setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
