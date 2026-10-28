/**
 * lib/scheduler.js – sunset ON / sunrise OFF for every device.
 *
 * Sunrise and sunset are calculated from each device's stable GPS location
 * (see lib/gps.js). Each transition is dispatched exactly once, as the same
 * `relay` ON/OFF command the dashboard already uses, so the ESP32 firmware is
 * unchanged. The last dispatched transition is stored in the database, so a
 * server restart never re-sends it.
 *
 * Devices in Manual mode are left alone.
 */
const {
  getAllDevices,
  getScheduleState,
  setScheduleState,
  queueCommand,
  clearPendingCommands,
} = require("../db");
const { desiredState } = require("./schedule");

const TICK_MS = 30 * 1000;
let timer = null;
let running = false;

const isManual = (device) => /manual/i.test(String(device.mode || ""));
const isOn = (device) => device.on_off === 1 || device.on_off === true || device.on_off === "1";

async function tick() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const devices = await getAllDevices();
    for (const dev of devices) {
      const lat = Number(dev.latitude);
      const lon = Number(dev.longitude);
      if (dev.latitude == null || dev.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue; // no GPS location yet
      }
      const want = desiredState(lat, lon, now);
      if (!want) continue;

      const state = await getScheduleState(dev.device_id);
      if (state && state.last_key === want.key) continue; // this transition is already handled

      let dispatch = true;
      if (isManual(dev)) {
        dispatch = false; // never override a manual setting
      } else if (!state) {
        // First time we see this device: only act if it is in the wrong state.
        const reported = dev.on_off === undefined || dev.on_off === null ? null : isOn(dev) ? "ON" : "OFF";
        dispatch = reported !== null && reported !== want.state;
      }

      if (dispatch) {
        await clearPendingCommands(dev.device_id, "relay");
        await queueCommand(dev.device_id, "relay", want.state);
        console.log(
          `[scheduler] ${dev.device_id}: relay ${want.state} (${want.key.split(":").slice(1).join(":") === "sunset" ? "sunset" : "sunrise"} ${want.at.toISOString()})`
        );
      }
      await setScheduleState(dev.device_id, want.key, want.state);
    }
  } catch (err) {
    console.error("[scheduler] error:", err.message);
  } finally {
    running = false;
  }
}

function startScheduler() {
  if (timer) return;
  tick();
  timer = setInterval(tick, TICK_MS);
  timer.unref();
  console.log("Sunset/sunrise scheduler started.");
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startScheduler, stopScheduler, tick };
