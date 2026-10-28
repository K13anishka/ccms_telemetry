/**
 * lib/schedule.js – helpers that turn a device's stored GPS location into
 * today's sunrise / sunset (in the site's local time zone).
 */
const { sunTimes } = require("./solar");

const LOCAL_TZ = process.env.LOCAL_TZ || "Asia/Kolkata";

function localParts(date, tz = LOCAL_TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const o = {};
  for (const p of parts) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, hh: o.hour, mm: o.minute };
}

const pad = (n) => String(n).padStart(2, "0");
const dateKey = (p) => `${p.y}-${pad(p.m)}-${pad(p.d)}`;
const hhmm = (date) => {
  if (!date) return null;
  const p = localParts(date);
  return `${p.hh}:${p.mm}`;
};

/** Sunrise / sunset for the local civil day that contains `now`, shifted by `dayOffset` days. */
function solarForDay(lat, lon, now = new Date(), dayOffset = 0) {
  const p = localParts(new Date(now.getTime() + dayOffset * 86400000));
  const { sunrise, sunset } = sunTimes(p.y, p.m, p.d, lat, lon);
  return { key: dateKey(p), sunrise, sunset };
}

/**
 * What state should the street light be in right now, and which scheduled
 * event (sunset = ON / sunrise = OFF) put it there?  The returned `key` is
 * unique per event, so the scheduler can dispatch each transition exactly once.
 */
function desiredState(lat, lon, now = new Date()) {
  const today = solarForDay(lat, lon, now, 0);
  if (!today.sunrise || !today.sunset) return null; // polar day/night: leave to the device
  if (now >= today.sunset) return { state: "ON", key: `${today.key}:sunset`, at: today.sunset, today };
  if (now >= today.sunrise) return { state: "OFF", key: `${today.key}:sunrise`, at: today.sunrise, today };
  const prev = solarForDay(lat, lon, now, -1);
  if (!prev.sunset) return null;
  return { state: "ON", key: `${prev.key}:sunset`, at: prev.sunset, today };
}

/** Adds server-calculated schedule fields to a device object (used by the API). */
function withSchedule(device, now = new Date()) {
  const lat = Number(device.latitude);
  const lon = Number(device.longitude);
  if (device.latitude == null || device.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return device;
  }
  const t = solarForDay(lat, lon, now, 0);
  if (!t.sunrise || !t.sunset) return device;
  return {
    ...device,
    sun_rise_time: hhmm(t.sunrise),
    sun_set_time: hhmm(t.sunset),
    schedule_source: "server-gps",
  };
}

module.exports = { desiredState, withSchedule, solarForDay, hhmm, LOCAL_TZ };
