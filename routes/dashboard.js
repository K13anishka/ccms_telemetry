/**
 * routes/dashboard.js – endpoints the React dashboard consumes.
 *
 *   GET  /api/v1/meter               – latest reading for every device
 *   GET  /api/v1/meter/:id/history   – time-series history for one device
 *   GET  /api/v1/meter/:id/energy    – kWh & kVAh history for one device
 *   GET  /api/v1/events              – recent fault/alarm events
 *   POST /api/v1/command/:id         – queue a command for a device
 *   GET  /api/v1/stats               – aggregate statistics
 */
const { Router } = require("express");
const {
  getMeterReadings,
  getDeviceHistory,
  getDeviceEnergy,
  getEvents,
  queueCommand,
  getStats,
} = require("../db");
const { adminAuth, requireAuth } = require("../middleware/auth");
const { withSchedule } = require("../lib/schedule");

const router = Router();

// --------------- GET /api/v1/meter ---------------
router.get("/meter", requireAuth, async (req, res, next) => {
  try {
    const readings = await getMeterReadings();
    res.json(readings.map((d) => withSchedule(d)));
  } catch (err) {
    next(err);
  }
});

// --------------- GET /api/v1/meter/:id/history ---------------
router.get("/meter/:id/history", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
    const history = await getDeviceHistory(req.params.id, limit);
    res.json(history);
  } catch (err) {
    next(err);
  }
});

// --------------- GET /api/v1/meter/:id/energy ---------------
router.get("/meter/:id/energy", requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 2000);
    const energy = await getDeviceEnergy(req.params.id, limit);
    res.json(energy);
  } catch (err) {
    next(err);
  }
});

// --------------- GET /api/v1/events ---------------
router.get("/events", requireAuth, async (req, res, next) => {
  try {
    const events = await getEvents(100);
    res.json(events);
  } catch (err) {
    next(err);
  }
});

// --------------- POST /api/v1/command/:id ---------------
const ALLOWED_COMMANDS = ["relay", "report", "set_nsl", "set_nwsl", "auto"];

router.post("/command/:id", adminAuth, async (req, res, next) => {
  try {
    const { cmd, value } = req.body || {};
    if (!ALLOWED_COMMANDS.includes(cmd)) {
      return res.status(400).json({ error: "unknown command" });
    }
    await queueCommand(req.params.id, cmd, value);
    res.json({ ok: true, note: "device picks it up within ~10 seconds" });
  } catch (err) {
    next(err);
  }
});

// --------------- GET /api/v1/stats ---------------
router.get("/stats", requireAuth, async (req, res, next) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
