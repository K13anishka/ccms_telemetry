/**
 * lib/gps.js – turns the noisy GPS coordinates in telemetry into one stable
 * site location per device.
 *
 * A street-light controller never moves, so we keep the first valid fix and
 * ignore normal GPS jitter. A genuine relocation is only accepted after several
 * consecutive readings agree on the new spot. Manually set coordinates are
 * never overwritten by GPS.
 */
const { getDeviceLocation, setDeviceLocation } = require("../db");

const JITTER_METERS = 1000; // fixes closer than this to the stored spot are ignored
const AGREE_METERS = 200; // candidate fixes must agree within this to count together
const CONFIRMATIONS = 5; // consecutive agreeing far-away fixes needed to relocate

const pending = new Map(); // deviceId -> { lat, lon, count }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Pull a valid decimal-degree fix out of a telemetry body, or null. */
function extractCoords(body) {
  if (!body) return null;
  const pick = (...keys) => {
    for (const k of keys) {
      if (body[k] !== undefined && body[k] !== null && body[k] !== "") {
        const n = Number(body[k]);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };
  const lat = pick("latt", "lat", "latitude");
  const lon = pick("long", "lon", "lng", "longitude");
  if (lat === null || lon === null) return null;
  if (lat === 0 && lon === 0) return null; // "no fix" placeholder
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

async function captureLocation(deviceId, body) {
  const fix = extractCoords(body);
  if (!fix) return;
  const id = String(deviceId);
  const cur = await getDeviceLocation(id);

  if (!cur || cur.latitude === null || cur.latitude === undefined) {
    await setDeviceLocation(id, fix.lat, fix.lon, "gps");
    pending.delete(id);
    return;
  }
  if (cur.location_source === "manual") return;

  const dist = haversine(Number(cur.latitude), Number(cur.longitude), fix.lat, fix.lon);
  if (dist <= JITTER_METERS) {
    pending.delete(id);
    return;
  }
  const p = pending.get(id);
  if (p && haversine(p.lat, p.lon, fix.lat, fix.lon) <= AGREE_METERS) {
    p.count += 1;
    if (p.count >= CONFIRMATIONS) {
      await setDeviceLocation(id, fix.lat, fix.lon, "gps");
      pending.delete(id);
    }
  } else {
    pending.set(id, { lat: fix.lat, lon: fix.lon, count: 1 });
  }
}

module.exports = { captureLocation, extractCoords };
