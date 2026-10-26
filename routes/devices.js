/**
 * routes/devices.js – CRUD operations for device management.
 *
 *   GET    /api/v1/devices      – list all devices with latest status
 *   POST   /api/v1/devices      – register a new device (IMEI + name + router)
 *   GET    /api/v1/devices/:id/config – admin: credentials to flash into the controller
 *   PUT    /api/v1/devices/:id  – update device name, router, api_key or location
 *   DELETE /api/v1/devices/:id  – remove a device
 */
const crypto = require("crypto");
const { Router } = require("express");
const {
  getAllDevices,
  addDevice,
  updateDevice,
  deleteDevice,
  getDeviceCredentials,
} = require("../db");
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
// Body: { device_id (15-digit IMEI), name?, router_id?, api_key? }
// If api_key is left out a random one is generated and returned once here
// (and any time later via GET /:id/config for admins).
router.post("/", adminAuth, async (req, res, next) => {
  try {
    const device_id = String(req.body.device_id || "").trim();
    const name = String(req.body.name || "").trim();
    const router_id = String(req.body.router_id || "").trim();
    const api_key = String(req.body.api_key || "").trim() || crypto.randomBytes(12).toString("hex");

    if (!/^\d{15}$/.test(device_id)) {
      return res.status(400).json({ error: "IMEI must be exactly 15 digits" });
    }
    if (router_id.length > 64 || name.length > 80 || api_key.length > 64) {
      return res.status(400).json({ error: "name / router / key is too long" });
    }
    const device = await addDevice(device_id, name, api_key, router_id);
    res.status(201).json({ ...device, api_key });
  } catch (err) {
    if (err.code === "23505" || err.message?.includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "a device with this IMEI already exists" });
    }
    next(err);
  }
});

// --------------- GET /api/v1/devices/:id/config ---------------
// Admin only: what to put in the firmware for this controller.
router.get("/:id/config", adminAuth, async (req, res, next) => {
  try {
    const cred = await getDeviceCredentials(req.params.id);
    if (!cred) return res.status(404).json({ error: "device not found" });
    res.json(cred);
  } catch (err) {
    next(err);
  }
});

// --------------- PUT /api/v1/devices/:id ---------------
router.put("/:id", adminAuth, async (req, res, next) => {
  try {
    const { name, api_key, router_id, latitude, longitude } = req.body;
    if (name === undefined && api_key === undefined && router_id === undefined && latitude === undefined && longitude === undefined) {
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
    const updated = await updateDevice(req.params.id, { name, api_key, router_id, latitude, longitude });
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
