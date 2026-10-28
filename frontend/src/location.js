/* Helpers for showing a device's GPS location (stored server-side from the ESP32 GPS). */

export function getCoords(d) {
  if (!d) return null;
  const lat = Number(d.latitude ?? d.latt);
  const lon = Number(d.longitude ?? d.long);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}

export function formatCoords(d, digits = 5) {
  const c = getCoords(d);
  return c ? `${c.lat.toFixed(digits)}, ${c.lon.toFixed(digits)}` : 'Waiting for GPS fix';
}

export function mapLink(d) {
  const c = getCoords(d);
  return c ? `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=17/${c.lat}/${c.lon}` : null;
}

export function sourceLabel(d) {
  if (!getCoords(d)) return '';
  return d.location_source === 'manual' ? 'Manual' : 'GPS';
}
