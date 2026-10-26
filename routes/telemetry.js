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

// --------------- POST /api/v1/save ---------------
router.post("/save", deviceAuth, async (req, res, next) => {
  try {
    await saveReading(req.body.device_id, req.body);
    // keep one stable GPS location per device (never blocks or fails the save)
    await captureLocation(req.body.device_id, req.body).catch((e) =>
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
    await saveEvent(device_id, alarmCode, active);
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
