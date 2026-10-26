/**
 * routes/telemetry.js – endpoints the ESP32 devices call.
 *
 *   POST /api/v1/save           – store a telemetry reading
 *   POST /api/v1/event          – record a fault/alarm event
 *   GET  /api/v1/commands/:id   – poll & consume queued commands
 */
const { Router } = require("express");
const { saveReading, saveEvent, getAndClearCommands } = require("../db");
const { deviceAuth } = require("../middleware/auth");
const { captureLocation } = require("../lib/gps");

const router = Router();

/**
 * Clean a telemetry body coming from firmware.
 * A failed Modbus read often shows up as "", "nan", "--" or null; numbers are
 * often sent as strings. Numeric strings become numbers, junk values are dropped
 * (so the dashboard shows "no data" instead of storing garbage), and device_id
 * is always a string.
 */
const NUMERIC = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const JUNK = new Set(["", "nan", "-nan", "inf", "-inf", "infinity", "null", "undefined", "--", "-"]);

function cleanTelemetry(body) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (v === null || v === undefined) continue;
    if (typeof v === "number") {
      if (Number.isFinite(v)) out[k] = v;
      continue;
    }
    if (typeof v === "string") {
      const t = v.trim();
      if (JUNK.has(t.toLowerCase())) continue;
      out[k] = NUMERIC.test(t) && k !== "device_id" ? Number(t) : t;
      continue;
    }
    out[k] = v; // booleans, nested objects/arrays pass through unchanged
  }
  out.device_id = String(body.device_id);
  return out;
}

const truthy = (v) => v === true || v === 1 || ["1", "true", "yes", "on"].includes(String(v).trim().toLowerCase());

// --------------- POST /api/v1/save ---------------
router.post("/save", deviceAuth, async (req, res, next) => {
  try {
    const clean = cleanTelemetry(req.body);
    await saveReading(clean.device_id, clean);
    // keep one stable GPS location per device (never blocks or fails the save)
    await captureLocation(clean.device_id, clean).catch((e) =>
      console.warn("location capture failed:", e.message)
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --------------- POST /api/v1/event ---------------
router.post("/event", deviceAuth, async (req, res, next) => {
  try {
    const { device_id, alarmCode, active } = req.body;
    if (alarmCode === undefined || alarmCode === null || String(alarmCode).trim() === "") {
      return res.status(400).json({ error: "alarmCode is required" });
    }
    await saveEvent(device_id, String(alarmCode).trim(), truthy(active));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --------------- GET /api/v1/commands/:id ---------------
router.get("/commands/:id", deviceAuth, async (req, res, next) => {
  try {
    const commands = await getAndClearCommands(req.params.id);
    res.json(commands);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
