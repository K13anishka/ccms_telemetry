/**
 * lib/solar.js – sunrise / sunset calculator (NOAA solar algorithm, ~1 min accuracy).
 *
 * Pure functions, no dependencies. Used by the server-side street-light
 * scheduler so the ON (sunset) / OFF (sunrise) times are calculated once from
 * the device's stable GPS location instead of being re-derived on every GPS fix.
 */
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function julianDay(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}
const centuries = (jd) => (jd - 2451545) / 36525;

function meanLongSun(t) {
  const L0 = 280.46646 + t * (36000.76983 + t * 0.0003032);
  return ((L0 % 360) + 360) % 360;
}
const meanAnomSun = (t) => 357.52911 + t * (35999.05029 - 0.0001537 * t);
const eccentricity = (t) => 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

function eqOfCenter(t) {
  const m = rad(meanAnomSun(t));
  return (
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289
  );
}
function apparentLongSun(t) {
  const trueLong = meanLongSun(t) + eqOfCenter(t);
  return trueLong - 0.00569 - 0.00478 * Math.sin(rad(125.04 - 1934.136 * t));
}
function obliquityCorrected(t) {
  const sec = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const e0 = 23 + (26 + sec / 60) / 60;
  return e0 + 0.00256 * Math.cos(rad(125.04 - 1934.136 * t));
}
function declination(t) {
  return deg(Math.asin(Math.sin(rad(obliquityCorrected(t))) * Math.sin(rad(apparentLongSun(t)))));
}
function equationOfTime(t) {
  const eps = rad(obliquityCorrected(t));
  const l0 = rad(meanLongSun(t));
  const e = eccentricity(t);
  const m = rad(meanAnomSun(t));
  let y = Math.tan(eps / 2);
  y *= y;
  const E =
    y * Math.sin(2 * l0) -
    2 * e * Math.sin(m) +
    4 * e * y * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) -
    1.25 * e * e * Math.sin(2 * m);
  return 4 * deg(E); // minutes
}

/** UTC minutes after 0h UT of the given Julian day, or NaN (polar day / night). */
function eventUtcMinutes(rising, jd, lat, lon) {
  let t = centuries(jd);
  let eqTime = equationOfTime(t);
  let decl = declination(t);
  const calc = () => {
    const cosHa =
      Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(rad(decl))) -
      Math.tan(rad(lat)) * Math.tan(rad(decl));
    if (cosHa > 1 || cosHa < -1) return NaN;
    let ha = Math.acos(cosHa);
    if (!rising) ha = -ha;
    return 720 - 4 * (lon + deg(ha)) - eqTime;
  };
  const first = calc();
  if (Number.isNaN(first)) return NaN;
  // second pass, evaluated at the first estimate for better accuracy
  t = centuries(jd + first / 1440);
  eqTime = equationOfTime(t);
  decl = declination(t);
  return calc();
}

/**
 * Sunrise and sunset for a civil date at a location.
 * @param {number} year @param {number} month (1-12) @param {number} day
 * @param {number} lat  degrees north  @param {number} lon degrees east
 * @returns {{sunrise: Date|null, sunset: Date|null}}
 */
function sunTimes(year, month, day, lat, lon) {
  const jd = julianDay(year, month, day);
  const base = Date.UTC(year, month - 1, day);
  const toDate = (min) => (Number.isNaN(min) ? null : new Date(base + min * 60000));
  return {
    sunrise: toDate(eventUtcMinutes(true, jd, lat, lon)),
    sunset: toDate(eventUtcMinutes(false, jd, lat, lon)),
  };
}

module.exports = { sunTimes };
