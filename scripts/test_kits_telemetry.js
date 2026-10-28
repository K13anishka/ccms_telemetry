/**
 * scripts/test_kits_telemetry.js
 * End-to-end verification of multi-kit CCMS telemetry flow & data isolation.
 */
const http = require("http");
const express = require("express");
const { initDb, closeDb } = require("../db");
const telemetryRoutes = require("../routes/telemetry");
const kitsRoutes = require("../routes/kits");
const devicesRoutes = require("../routes/devices");

function doRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (_) {
          json = body;
        }
        resolve({ status: res.statusCode, data: json });
      });
    });
    req.on("error", reject);
    if (postData) {
      req.write(typeof postData === "string" ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTest() {
  console.log("=== CCMS Multi-Kit Telemetry Isolation Test ===\n");

  await initDb();

  const app = express();
  app.use(express.json());
  app.use("/api/v1", telemetryRoutes);
  app.use("/api/kits", kitsRoutes);
  app.use("/api/v1/devices", devicesRoutes);

  const server = app.listen(0);
  const port = server.address().port;
  console.log(`[TEST SERVER] Running on port ${port}`);

  try {
    // 1. Register Kit 1
    console.log("\n[1] Registering KIT_001...");
    const regKit1 = await doRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/kits",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      {
        kit_id: "KIT_001",
        imei: "123456789012345",
        router_name: "CCMS_ROUTER_001",
        api_key: "secret_kit_001",
      }
    );
    console.log("Kit 1 Registered:", regKit1.data);
    if (regKit1.status !== 201 && regKit1.status !== 409) {
      throw new Error(`Failed to register Kit 1, status ${regKit1.status}: ${JSON.stringify(regKit1.data)}`);
    }

    // 2. Register Kit 2
    console.log("\n[2] Registering KIT_002...");
    const regKit2 = await doRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/kits",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      {
        kit_id: "KIT_002",
        imei: "987654321098765",
        router_name: "CCMS_ROUTER_002",
        api_key: "secret_kit_002",
      }
    );
    console.log("Kit 2 Registered:", regKit2.data);
    if (regKit2.status !== 201 && regKit2.status !== 409) {
      throw new Error(`Failed to register Kit 2, status ${regKit2.status}: ${JSON.stringify(regKit2.data)}`);
    }

    // 3. Send Telemetry for Kit 1 (Bangalore coordinates, 234.5 V, 996.6 W)
    console.log("\n[3] Sending Telemetry for KIT_001...");
    const kit1Payload = {
      kit_id: "KIT_001",
      imei: "123456789012345",
      router_name: "CCMS_ROUTER_001",
      voltage: 234.5,
      current: 4.25,
      power: 996.6,
      energy: 15.4,
      pf: 0.98,
      freq: 50.0,
      lat: 12.9716,
      lon: 77.5946,
      relay: 1,
      timestamp: Date.now(),
    };

    const res1 = await doRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/v1/save",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "secret_kit_001",
        },
      },
      kit1Payload
    );
    console.log("Kit 1 Telemetry Response:", res1.data);
    if (res1.status !== 200 || !res1.data.ok) {
      throw new Error(`Kit 1 save failed: ${JSON.stringify(res1.data)}`);
    }

    // 4. Send Telemetry for Kit 2 (New Delhi coordinates, 219.0 V, 613.2 W)
    console.log("\n[4] Sending Telemetry for KIT_002...");
    const kit2Payload = {
      kit_id: "KIT_002",
      imei: "987654321098765",
      router_name: "CCMS_ROUTER_002",
      voltage: 219.0,
      current: 2.80,
      power: 613.2,
      energy: 48.2,
      pf: 0.96,
      freq: 50.1,
      lat: 28.6139,
      lon: 77.2090,
      relay: 0,
      timestamp: Date.now(),
    };

    const res2 = await doRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/v1/save",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "secret_kit_002",
        },
      },
      kit2Payload
    );
    console.log("Kit 2 Telemetry Response:", res2.data);
    if (res2.status !== 200 || !res2.data.ok) {
      throw new Error(`Kit 2 save failed: ${JSON.stringify(res2.data)}`);
    }

    // 5. Test Unauthorized Reject
    console.log("\n[5] Testing invalid API Key rejection...");
    const rejectRes = await doRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/v1/save",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "WRONG_KEY",
        },
      },
      kit1Payload
    );
    console.log("Unauthorized rejection status:", rejectRes.status);
    if (rejectRes.status !== 401) {
      throw new Error(`Expected 401 for wrong API key, got ${rejectRes.status}`);
    }

    // 6. Verify Isolation on GET /api/kits
    console.log("\n[6] Fetching all kits from /api/kits...");
    const kitsRes = await doRequest({
      hostname: "127.0.0.1",
      port,
      path: "/api/kits",
      method: "GET",
    });

    const kitsList = kitsRes.data;
    console.log(`Received ${kitsList.length} kit(s)`);

    const kit1 = kitsList.find((k) => k.imei === "123456789012345" || k.kit_id === "KIT_001");
    const kit2 = kitsList.find((k) => k.imei === "987654321098765" || k.kit_id === "KIT_002");

    if (!kit1 || !kit2) {
      throw new Error("Missing Kit 1 or Kit 2 in /api/kits result!");
    }

    console.log("\n--- Verification of KIT_001 ---");
    console.log("Kit ID      :", kit1.kit_id);
    console.log("IMEI        :", kit1.imei);
    console.log("Router      :", kit1.router_name);
    console.log("Status      :", kit1.status);
    console.log("Voltage     :", kit1.voltage, "V");
    console.log("Current     :", kit1.current, "A");
    console.log("Power       :", kit1.power, "W");
    console.log("GPS         :", kit1.latitude, kit1.longitude);
    console.log("Relay       :", kit1.relay);

    console.log("\n--- Verification of KIT_002 ---");
    console.log("Kit ID      :", kit2.kit_id);
    console.log("IMEI        :", kit2.imei);
    console.log("Router      :", kit2.router_name);
    console.log("Status      :", kit2.status);
    console.log("Voltage     :", kit2.voltage, "V");
    console.log("Current     :", kit2.current, "A");
    console.log("Power       :", kit2.power, "W");
    console.log("GPS         :", kit2.latitude, kit2.longitude);
    console.log("Relay       :", kit2.relay);

    // Assertions
    if (kit1.voltage !== 234.5 || kit2.voltage !== 219.0) {
      throw new Error("Meter readings mixed up! Kit 1 and Kit 2 voltages do not match independent values.");
    }

    if (Math.abs(kit1.latitude - 12.9716) > 0.001 || Math.abs(kit2.latitude - 28.6139) > 0.001) {
      throw new Error("GPS coordinates mixed up! Kit 1 and Kit 2 locations do not match independent values.");
    }

    if (kit1.router_name !== "CCMS_ROUTER_001" || kit2.router_name !== "CCMS_ROUTER_002") {
      throw new Error("Router names mixed up!");
    }

    if (kit1.status !== "ONLINE" || kit2.status !== "ONLINE") {
      throw new Error("Both kits should be ONLINE after receiving recent telemetry!");
    }

    // 7. Verify single kit lookup GET /api/kits/:id
    console.log("\n[7] Testing single kit lookup GET /api/kits/KIT_001...");
    const single1 = await doRequest({
      hostname: "127.0.0.1",
      port,
      path: "/api/kits/KIT_001",
      method: "GET",
    });
    if (single1.status !== 200 || single1.data.imei !== "123456789012345") {
      throw new Error(`Failed to get Kit 1 by ID: ${JSON.stringify(single1.data)}`);
    }
    console.log("GET /api/kits/KIT_001 returned correct kit!");

    console.log("\n=======================================================");
    console.log("✓ ALL TESTS PASSED! Telemetry isolation fully verified.");
    console.log("✓ Kits maintain strictly separated meters, GPS, and status.");
    console.log("=======================================================\n");
  } finally {
    server.close();
    await closeDb();
  }
}

runTest().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
