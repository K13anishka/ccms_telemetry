/**
 * routes/kits.js — Multi-Kit CCMS Registry & Monitoring Endpoints.
 *
 *   POST /api/kits        — Register a new kit (kit_id, imei, router_name, api_key)
 *   GET  /api/kits        — List all kits with online/offline status, meter data & GPS
 *   GET  /api/kits/:id    — Single kit telemetry, status and history by kit_id or IMEI
 */
const crypto = require("crypto");
const { Router } = require("express");
const {
  getMeterReadings,
  getDeviceHistory,
  addDevice,
  findDevice,
  getDeviceCredentials,
} = require("../db");
const { withSchedule } = require("../lib/schedule");

const router = Router();

function formatKit(d) {
  const kit_id = d.kit_id || d.name || d.device_id;
  const imei = d.device_id;
  const router_name = d.router_name || d.router_id || "";
  const name = d.name || kit_id;

  const voltage = d.voltage !== undefined ? d.voltage : (d.v_r || d.voltage_v || null);
  const current = d.current !== undefined ? d.current : (d.i_r || d.current_a || null);
  const power = d.power !== undefined ? d.power : (d.kw !== undefined ? Number((d.kw * 1000).toFixed(1)) : null);
  const energy = d.energy !== undefined ? d.energy : (d.kwh !== undefined ? Number(d.kwh) : null);
  const relay = d.relay !== undefined ? d.relay : (d.on_off !== undefined ? d.on_off : null);
  const online = Boolean(d.online);

  return {
    kit_id,
    name,
    imei,
    device_id: imei,
    router_name,
    router_id: router_name,
    status: online ? "ONLINE" : (d.last_seen ? "OFFLINE" : "WAITING"),
    online,
    last_seen: d.last_seen || null,
    last_update: d.last_seen || null,
    received_at: d.received_at || null,
    meter_readings: {
      voltage: voltage !== null ? Number(voltage) : null,
      current: current !== null ? Number(current) : null,
      power: power !== null ? Number(power) : null,
      energy: energy !== null ? Number(energy) : null,
      pf: d.pf !== undefined ? Number(d.pf) : null,
      freq: d.freq !== undefined ? Number(d.freq) : null,
      relay: relay !== null ? Number(relay) : null,
    },
    voltage: voltage !== null ? Number(voltage) : null,
    current: current !== null ? Number(current) : null,
    power: power !== null ? Number(power) : null,
    energy: energy !== null ? Number(energy) : null,
    pf: d.pf !== undefined ? Number(d.pf) : null,
    freq: d.freq !== undefined ? Number(d.freq) : null,
    relay: relay !== null ? Number(relay) : null,
    gps: {
      latitude: d.latitude !== null && d.latitude !== undefined ? Number(d.latitude) : null,
      longitude: d.longitude !== null && d.longitude !== undefined ? Number(d.longitude) : null,
      source: d.location_source || null,
    },
    latitude: d.latitude !== null && d.latitude !== undefined ? Number(d.latitude) : null,
    longitude: d.longitude !== null && d.longitude !== undefined ? Number(d.longitude) : null,
    created_at: d.created_at || null,
  };
}

// --------------- GET /api/kits ---------------
router.get("/", async (req, res, next) => {
  try {
    const raw = await getMeterReadings();
    const kits = raw.map((d) => formatKit(withSchedule(d)));
    res.json(kits);
  } catch (err) {
    next(err);
  }
});

// --------------- GET /api/kits/:id ---------------
router.get("/:id", async (req, res, next) => {
  try {
    const searchId = String(req.params.id).trim();
    const device = await findDevice(searchId);
    if (!device) {
      return res.status(404).json({ error: `Kit '${searchId}' not found` });
    }

    const all = await getMeterReadings();
    const match = all.find((d) => d.device_id === device.device_id) || device;
    const history = await getDeviceHistory(device.device_id, 20);

    const kit = formatKit(withSchedule(match));
    res.json({
      ...kit,
      history,
    });
  } catch (err) {
    next(err);
  }
});

// --------------- POST /api/kits ---------------
router.post("/", async (req, res, next) => {
  try {
    const imei = String(req.body.imei || req.body.device_id || "").trim();
    const kit_id = String(
      req.body.kit_id || req.body.kitId || req.body.name || (imei ? `KIT_${imei.slice(-4)}` : "")
    ).trim();
    const router_name = String(req.body.router_name || req.body.router_id || "").trim();
    const name = String(req.body.name || kit_id).trim();
    const api_key =
      String(req.body.api_key || "").trim() || crypto.randomBytes(12).toString("hex");

    if (!imei) {
      return res.status(400).json({ error: "IMEI is required" });
    }
    if (imei.length < 3 || imei.length > 32) {
      return res.status(400).json({ error: "IMEI must be between 3 and 32 characters" });
    }
    if (!kit_id) {
      return res.status(400).json({ error: "Kit ID / Name is required" });
    }

    const created = await addDevice(imei, name, api_key, router_name, kit_id);
    res.status(201).json({
      ok: true,
      kit_id: created.kit_id || kit_id,
      imei: created.device_id,
      device_id: created.device_id,
      name: created.name || name,
      router_name: created.router_id || router_name,
      router_id: created.router_id || router_name,
      api_key,
      created_at: created.created_at,
    });
  } catch (err) {
    if (err.code === "23505" || err.message?.includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "A kit with this IMEI already exists" });
    }
    next(err);
  }
});

module.exports = router;
