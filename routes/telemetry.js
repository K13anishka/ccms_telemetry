/**
 * routes/telemetry.js – endpoints the ESP32 devices call.
 *
 *   POST /api/v1/save           – store a telemetry reading
 *   POST /api/v1/event          – record a fault/alarm event
 *   GET  /api/v1/commands/:id   – poll & consume queued commands
 */
const { Router } = require("express");
const { saveReading, saveEvent, getAndClearCommands, findDevice } = require("../db");
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
const STRING_KEYS = new Set([
  "device_id",
  "imei",
  "kit_id",
  "kitId",
  "router_name",
  "router_id",
  "alarmCode",
  "cmd",
  "value",
]);

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
      out[k] = !STRING_KEYS.has(k) && NUMERIC.test(t) ? Number(t) : t;
      continue;
    }
    out[k] = v; // booleans, nested objects/arrays pass through unchanged
  }

  // Support kit aliases
  if (out.kitId && !out.kit_id) out.kit_id = String(out.kitId);
  if (out.routerName && !out.router_name) out.router_name = String(out.routerName);
  if (out.router_name && !out.router_id) out.router_id = String(out.router_name);
  if (out.router_id && !out.router_name) out.router_name = String(out.router_id);

  if (out.imei && !out.device_id) out.device_id = String(out.imei);
  if (out.device_id && !out.imei) out.imei = String(out.device_id);

  // Normalize single-phase / 3-phase meter measurements
  if (out.voltage !== undefined && out.voltage_v === undefined) out.voltage_v = out.voltage;
  if (out.voltage !== undefined && out.v_r === undefined) out.v_r = out.voltage;
  if (out.v_r !== undefined && out.voltage === undefined) out.voltage = out.v_r;

  if (out.current !== undefined && out.current_a === undefined) out.current_a = out.current;
  if (out.current !== undefined && out.i_r === undefined) out.i_r = out.current;
  if (out.i_r !== undefined && out.current === undefined) out.current = out.i_r;

  if (out.power !== undefined && out.kw === undefined) out.kw = Number((out.power / 1000).toFixed(4));
  if (out.kw !== undefined && out.power === undefined) out.power = Number((out.kw * 1000).toFixed(1));

  if (out.energy !== undefined && out.kwh === undefined) out.kwh = out.energy;
  if (out.kwh !== undefined && out.energy === undefined) out.energy = out.kwh;

  if (out.relay !== undefined && out.on_off === undefined) out.on_off = out.relay ? 1 : 0;
  if (out.on_off !== undefined && out.relay === undefined) out.relay = out.on_off ? 1 : 0;

  if (out.lat !== undefined && out.latt === undefined) out.latt = out.lat;
  if (out.lon !== undefined && out.long === undefined) out.long = out.lon;

  if (out.device_id) out.device_id = String(out.device_id);
  if (out.kit_id) out.kit_id = String(out.kit_id);

  if (!out.timestamp) out.timestamp = new Date().toISOString();

  return out;
}

const truthy = (v) => v === true || v === 1 || ["1", "true", "yes", "on"].includes(String(v).trim().toLowerCase());

// --------------- POST /api/v1/save ---------------
const saveTelemetry = async (req, res, next) => {
  try {
    const clean = cleanTelemetry(req.body);
    const idHint = clean.device_id || clean.imei || clean.kit_id;
    if (!idHint) return res.status(400).json({ error: "device_id/imei/kit_id is required" });

    const device = await findDevice(idHint);
    const targetId = device ? device.device_id : String(idHint);

    clean.device_id = targetId;
    if (device && device.kit_id && !clean.kit_id) clean.kit_id = device.kit_id;
    if (device && device.router_id && !clean.router_name) clean.router_name = device.router_id;

    await saveReading(targetId, clean);

    // Persist a stable GPS site location, but never let location handling
    // prevent telemetry from being acknowledged.
    await captureLocation(targetId, clean).catch((e) =>
      console.warn("location capture failed:", e.message)
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// Accept both endpoint names so older flashed ESP32 firmware keeps working.
router.post("/save", deviceAuth, saveTelemetry);
router.post("/telemetry", deviceAuth, saveTelemetry);

// --------------- POST /api/v1/event ---------------
router.post("/event", deviceAuth, async (req, res, next) => {
  try {
    const rawId = req.body.device_id || req.body.imei || req.body.kit_id;
    const { alarmCode, active } = req.body;
    if (alarmCode === undefined || alarmCode === null || String(alarmCode).trim() === "") {
      return res.status(400).json({ error: "alarmCode is required" });
    }
    const device = await findDevice(rawId);
    const targetId = device ? device.device_id : String(rawId);
    await saveEvent(targetId, String(alarmCode).trim(), truthy(active));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --------------- GET /api/v1/commands/:id ---------------
router.get("/commands/:id", deviceAuth, async (req, res, next) => {
  try {
    const device = await findDevice(req.params.id);
    const targetId = device ? device.device_id : req.params.id;
    const commands = await getAndClearCommands(targetId);
    res.json(commands);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
