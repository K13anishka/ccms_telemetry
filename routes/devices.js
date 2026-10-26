/**
 * routes/devices.js – CRUD operations for device management.
 *
 *   GET    /api/v1/devices      – list all devices with latest status
 *   POST   /api/v1/devices      – register a new device
 *   PUT    /api/v1/devices/:id  – update device name, api_key or location
 *   DELETE /api/v1/devices/:id  – remove a device
 */
const { Router } = require("express");
const { getAllDevices, addDevice, updateDevice, deleteDevice } = require("../db");
const { adminAuth, requireAuth } = require("../middleware/auth");
const { withSchedule } = require("../lib/schedule");

const router = Router();

// --------------- GET /api/v1/devices ---------------
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const devices = await getAllDevices();
    res.json(devices.map((d) => withSchedule(d)));
  } catch (err) {
    next(err);
  }
});

// --------------- POST /api/v1/devices ---------------
router.post("/", adminAuth, async (req, res, next) => {
  try {
    const { device_id, name, api_key } = req.body;
    if (!device_id || !api_key) {
      return res.status(400).json({ error: "device_id and api_key are required" });
    }
    const device = await addDevice(device_id, name, api_key);
    res.status(201).json(device);
  } catch (err) {
    if (err.code === "23505" || err.message?.includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "device already exists" });
    }
    next(err);
  }
});

// --------------- PUT /api/v1/devices/:id ---------------
router.put("/:id", adminAuth, async (req, res, next) => {
  try {
    const { name, api_key, latitude, longitude } = req.body;
    if (name === undefined && api_key === undefined && latitude === undefined && longitude === undefined) {
      return res.status(400).json({ error: "nothing to update" });
    }
    // latitude/longitude: both numbers = manual location, both null = go back to GPS
    if (latitude !== undefined || longitude !== undefined) {
      const clearing = latitude === null && longitude === null;
      const lat = Number(latitude);
      const lon = Number(longitude);
      if (!clearing && (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)) {
        return res.status(400).json({ error: "latitude must be -90..90 and longitude -180..180" });
      }
    }
    const updated = await updateDevice(req.params.id, { name, api_key, latitude, longitude });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// --------------- DELETE /api/v1/devices/:id ---------------
router.delete("/:id", adminAuth, async (req, res, next) => {
  try {
    await deleteDevice(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
