/**
 * scripts/simulate_telemetry.js
 * Multi-Kit Telemetry Simulator (simulates ESP32 firmware transmitting to AWS backend).
 *
 * Usage:
 *   node scripts/simulate_telemetry.js [SERVER_URL]
 *
 * Example:
 *   node scripts/simulate_telemetry.js http://localhost:8000
 */
const http = require("http");
const https = require("https");

const SERVER_URL = process.argv[2] || process.env.SERVER_URL || "http://localhost:8000";

const KITS = [
  {
    kit_id: "KIT_001",
    imei: "123456789012345",
    router_name: "CCMS_ROUTER_001",
    api_key: "secret_kit_001",
    base_v: 232.0,
    base_i: 4.2,
    base_p: 974.4,
    base_kwh: 14.5,
    lat: 12.9716,
    lon: 77.5946,
    relay: 1,
  },
  {
    kit_id: "KIT_002",
    imei: "987654321098765",
    router_name: "CCMS_ROUTER_002",
    api_key: "secret_kit_002",
    base_v: 228.5,
    base_i: 3.1,
    base_p: 708.35,
    base_kwh: 36.2,
    lat: 28.6139,
    lon: 77.2090,
    relay: 1,
  },
];

function sendTelemetry(kit) {
  // Add small natural jitter
  const v = +(kit.base_v + (Math.random() * 4 - 2)).toFixed(1);
  const i = +(kit.base_i + (Math.random() * 0.3 - 0.15)).toFixed(2);
  const p = +(v * i).toFixed(1);
  kit.base_kwh = +(kit.base_kwh + 0.002).toFixed(3);

  const payload = JSON.stringify({
    kit_id: kit.kit_id,
    imei: kit.imei,
    device_id: kit.imei,
    router_name: kit.router_name,
    voltage: v,
    current: i,
    power: p,
    energy: kit.base_kwh,
    pf: 0.98,
    freq: 50.0,
    lat: kit.lat,
    lon: kit.lon,
    relay: kit.relay,
    timestamp: Date.now(),
  });

  const parsedUrl = new URL(`${SERVER_URL}/api/v1/save`);
  const isHttps = parsedUrl.protocol === "https:";
  const client = isHttps ? https : http;

  const req = client.request(
    parsedUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "x-api-key": kit.api_key,
      },
      timeout: 5000,
    },
    (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        const time = new Date().toLocaleTimeString();
        if (res.statusCode === 200) {
          console.log(`[${time}] [${kit.kit_id}] -> Sent: ${v}V | ${i}A | ${p}W | Lat:${kit.lat} Lon:${kit.lon} (OK)`);
        } else {
          console.warn(`[${time}] [${kit.kit_id}] -> HTTP ${res.statusCode}: ${data}`);
        }
      });
    }
  );

  req.on("error", (err) => {
    console.error(`[${kit.kit_id}] Connection error:`, err.message);
  });

  req.write(payload);
  req.end();
}

console.log(`=== CCMS Telemetry Simulator ===`);
console.log(`Target AWS Server: ${SERVER_URL}`);
console.log(`Streaming telemetry for ${KITS.length} kits every 8 seconds...\n`);

// First transmit immediately
KITS.forEach((k) => sendTelemetry(k));

// Transmit periodically
setInterval(() => {
  KITS.forEach((k) => sendTelemetry(k));
}, 8000);
