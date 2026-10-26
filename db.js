/**
 * db.js – Dual database adapter (PostgreSQL on AWS RDS / SQLite locally).
 *
 * Automatically detects whether DATABASE_URL is configured:
 *  - If process.env.DATABASE_URL is set: connects to AWS RDS PostgreSQL.
 *  - If not set or connection fails: seamlessly falls back to local SQLite (ccms.db).
 */
const path = require("path");

let isPostgres = false;
let pgPool = null;
let sqliteDb = null;

const DATABASE_URL = process.env.DATABASE_URL;

if (DATABASE_URL && DATABASE_URL.startsWith("postgres")) {
  try {
    const { Pool } = require("pg");
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pgPool.on("error", (err) => {
      console.error("Unexpected error on idle PG client:", err.message);
    });
    isPostgres = true;
    console.log("Using PostgreSQL engine.");
  } catch (err) {
    console.warn("Failed to load pg module, falling back to SQLite:", err.message);
    isPostgres = false;
  }
}

if (!isPostgres) {
  const Database = require("better-sqlite3");
  const dbPath = path.join(__dirname, "ccms.db");
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma("journal_mode = WAL");
  console.log(`Using SQLite engine at ${dbPath}`);
}

async function initDb() {
  if (isPostgres) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TABLE IF NOT EXISTS devices (
          device_id   TEXT PRIMARY KEY,
          name        TEXT,
          api_key     TEXT NOT NULL,
          created_at  TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS readings (
          id          SERIAL PRIMARY KEY,
          device_id   TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
          received_at TIMESTAMPTZ DEFAULT NOW(),
          data        JSONB NOT NULL
        );
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_readings_device
          ON readings (device_id, id DESC);
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS events (
          id          SERIAL PRIMARY KEY,
          device_id   TEXT NOT NULL,
          received_at TIMESTAMPTZ DEFAULT NOW(),
          alarm_code  TEXT,
          active      BOOLEAN
        );
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS commands (
          id         SERIAL PRIMARY KEY,
          device_id  TEXT NOT NULL,
          cmd        TEXT NOT NULL,
          value      TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      // GPS location (latest stable fix from the ESP32, or a manual override)
      await client.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`);
      await client.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`);
      await client.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS location_source TEXT`);
      await client.query(`ALTER TABLE devices ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ`);
      // Dashboard users (admin login / sign-up)
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id            SERIAL PRIMARY KEY,
          username      TEXT UNIQUE NOT NULL,
          email         TEXT,
          password_hash TEXT NOT NULL,
          role          TEXT NOT NULL DEFAULT 'user',
          created_at    TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      // Last sunset/sunrise transition dispatched per device (so each fires once)
      await client.query(`
        CREATE TABLE IF NOT EXISTS schedule_state (
          device_id  TEXT PRIMARY KEY,
          last_key   TEXT,
          last_state TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await client.query(
        `INSERT INTO devices (device_id, name, api_key)
         VALUES ($1, $2, $3)
         ON CONFLICT (device_id) DO NOTHING`,
        ["355354200856237", "CMS-6237 (Feeder 1)", "secret123"]
      );
      await client.query("COMMIT");
      console.log("PostgreSQL schema initialized.");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } else {
    // SQLite schema
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        device_id   TEXT PRIMARY KEY,
        name        TEXT,
        api_key     TEXT NOT NULL,
        created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      );
      CREATE TABLE IF NOT EXISTS readings (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id   TEXT NOT NULL,
        received_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        data        TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_readings_device ON readings(device_id, id DESC);
      CREATE TABLE IF NOT EXISTS events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id   TEXT NOT NULL,
        received_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        alarm_code  TEXT,
        active      INTEGER
      );
      CREATE TABLE IF NOT EXISTS commands (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id   TEXT NOT NULL,
        cmd         TEXT NOT NULL,
        value       TEXT,
        created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      );
    `);
    for (const col of [
      "latitude REAL",
      "longitude REAL",
      "location_source TEXT",
      "location_updated_at TEXT",
    ]) {
      try {
        sqliteDb.exec(`ALTER TABLE devices ADD COLUMN ${col}`);
      } catch (_) {}
    }
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT UNIQUE NOT NULL,
        email         TEXT,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'user',
        created_at    TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      );
      CREATE TABLE IF NOT EXISTS schedule_state (
        device_id  TEXT PRIMARY KEY,
        last_key   TEXT,
        last_state TEXT,
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      );
    `);
    try {
      sqliteDb.exec("ALTER TABLE devices ADD COLUMN created_at TEXT");
    } catch (_) {}
    sqliteDb
      .prepare(
        `INSERT OR IGNORE INTO devices (device_id, name, api_key) VALUES (?, ?, ?)`
      )
      .run("355354200856237", "CMS-6237 (Feeder 1)", "secret123");
    console.log("SQLite schema initialized.");
  }
}

// ----------------- Data Access Methods -----------------

async function saveReading(deviceId, dataObj) {
  if (isPostgres) {
    await pgPool.query(
      "INSERT INTO readings (device_id, data) VALUES ($1, $2)",
      [String(deviceId), JSON.stringify(dataObj)]
    );
  } else {
    sqliteDb
      .prepare("INSERT INTO readings (device_id, data) VALUES (?, ?)")
      .run(String(deviceId), JSON.stringify(dataObj));
  }
}

async function saveEvent(deviceId, alarmCode, active) {
  if (isPostgres) {
    await pgPool.query(
      "INSERT INTO events (device_id, alarm_code, active) VALUES ($1, $2, $3)",
      [String(deviceId), String(alarmCode), Boolean(active)]
    );
  } else {
    sqliteDb
      .prepare("INSERT INTO events (device_id, alarm_code, active) VALUES (?, ?, ?)")
      .run(String(deviceId), String(alarmCode), active ? 1 : 0);
  }
}

async function getAndClearCommands(deviceId) {
  if (isPostgres) {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT id, cmd, value FROM commands WHERE device_id = $1 ORDER BY id",
        [String(deviceId)]
      );
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        await client.query("DELETE FROM commands WHERE id = ANY($1::int[])", [ids]);
      }
      await client.query("COMMIT");
      return rows.map((r) => ({ cmd: r.cmd, value: r.value }));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } else {
    const rows = sqliteDb
      .prepare("SELECT id, cmd, value FROM commands WHERE device_id = ? ORDER BY id")
      .all(String(deviceId));
    if (rows.length > 0) {
      const del = sqliteDb.prepare("DELETE FROM commands WHERE id = ?");
      rows.forEach((r) => del.run(r.id));
    }
    return rows.map((r) => ({ cmd: r.cmd, value: r.value }));
  }
}

/**
 * Stored GPS location for a device row. Falls back to whatever lat/long the
 * ESP32 last reported in telemetry (latt / long) when nothing is stored yet.
 */
function locationFields(r) {
  const hasStored = r.latitude !== null && r.latitude !== undefined && r.longitude !== null && r.longitude !== undefined;
  return {
    latitude: hasStored ? Number(r.latitude) : null,
    longitude: hasStored ? Number(r.longitude) : null,
    location_source: hasStored ? r.location_source || "gps" : null,
  };
}

async function getMeterReadings() {
  if (isPostgres) {
    const { rows } = await pgPool.query(`
      SELECT d.device_id, d.name, d.latitude, d.longitude, d.location_source, r.received_at, r.data
      FROM devices d
      LEFT JOIN LATERAL (
        SELECT received_at, data
        FROM readings
        WHERE device_id = d.device_id
        ORDER BY id DESC
        LIMIT 1
      ) r ON true
      ORDER BY d.device_id
    `);
    return rows.map((r) => ({
      device_id: r.device_id,
      name: r.name,
      received_at: r.received_at,
      ...(r.data || {}),
      ...locationFields(r),
    }));
  } else {
    const rows = sqliteDb
      .prepare(`
        SELECT d.device_id, d.name, d.latitude, d.longitude, d.location_source, r.received_at, r.data
        FROM devices d
        LEFT JOIN readings r ON r.id = (
          SELECT MAX(id) FROM readings WHERE device_id = d.device_id
        )
        ORDER BY d.device_id
      `)
      .all();
    return rows.map((r) => ({
      device_id: r.device_id,
      name: r.name,
      received_at: r.received_at,
      ...(r.data ? JSON.parse(r.data) : {}),
      ...locationFields(r),
    }));
  }
}

async function getDeviceHistory(deviceId, limit = 100) {
  if (isPostgres) {
    const { rows } = await pgPool.query(
      `SELECT received_at, data FROM readings WHERE device_id = $1 ORDER BY id DESC LIMIT $2`,
      [String(deviceId), limit]
    );
    return rows.map((r) => ({
      received_at: r.received_at,
      ...(r.data || {}),
    }));
  } else {
    const rows = sqliteDb
      .prepare(
        `SELECT received_at, data FROM readings WHERE device_id = ? ORDER BY id DESC LIMIT ?`
      )
      .all(String(deviceId), limit);
    return rows.map((r) => ({
      received_at: r.received_at,
      ...(r.data ? JSON.parse(r.data) : {}),
    }));
  }
}

async function getDeviceEnergy(deviceId, limit = 200) {
  if (isPostgres) {
    const { rows } = await pgPool.query(
      `SELECT received_at, data->>'kwh' AS kwh, data->>'kvah' AS kvah
       FROM readings WHERE device_id = $1 ORDER BY id DESC LIMIT $2`,
      [String(deviceId), limit]
    );
    return rows.map((r) => ({
      received_at: r.received_at,
      kwh: r.kwh !== null ? parseFloat(r.kwh) : null,
      kvah: r.kvah !== null ? parseFloat(r.kvah) : null,
    }));
  } else {
    const rows = sqliteDb
      .prepare(
        `SELECT received_at, data FROM readings WHERE device_id = ? ORDER BY id DESC LIMIT ?`
      )
      .all(String(deviceId), limit);
    return rows.map((r) => {
      const parsed = r.data ? JSON.parse(r.data) : {};
      return {
        received_at: r.received_at,
        kwh: parsed.kwh !== undefined ? parseFloat(parsed.kwh) : null,
        kvah: parsed.kvah !== undefined ? parseFloat(parsed.kvah) : null,
      };
    });
  }
}

async function getEvents(limit = 100) {
  if (isPostgres) {
    const { rows } = await pgPool.query(
      `SELECT id, device_id, received_at, alarm_code, active FROM events ORDER BY id DESC LIMIT $1`,
      [limit]
    );
    return rows;
  } else {
    return sqliteDb
      .prepare(
        `SELECT id, device_id, received_at, alarm_code, active FROM events ORDER BY id DESC LIMIT ?`
      )
      .all(limit);
  }
}

async function queueCommand(deviceId, cmd, value) {
  if (isPostgres) {
    await pgPool.query(
      "INSERT INTO commands (device_id, cmd, value) VALUES ($1, $2, $3)",
      [String(deviceId), String(cmd), value === undefined ? null : String(value)]
    );
  } else {
    sqliteDb
      .prepare("INSERT INTO commands (device_id, cmd, value) VALUES (?, ?, ?)")
      .run(String(deviceId), String(cmd), value === undefined ? null : String(value));
  }
}

async function getStats() {
  if (isPostgres) {
    const [devs, energy, faults] = await Promise.all([
      pgPool.query(`
        SELECT COUNT(*)::int AS total_devices,
               COUNT(*) FILTER (
                 WHERE last_seen > NOW() - INTERVAL '20 minutes'
               )::int AS devices_online
        FROM (
          SELECT d.device_id, (SELECT MAX(received_at) FROM readings WHERE device_id = d.device_id) AS last_seen
          FROM devices d
        ) sub
      `),
      pgPool.query(`
        SELECT COALESCE(SUM((r.data->>'kwh')::numeric), 0)::float AS total_kwh
        FROM devices d
        LEFT JOIN LATERAL (
          SELECT data FROM readings WHERE device_id = d.device_id ORDER BY id DESC LIMIT 1
        ) r ON true
      `),
      pgPool.query(`
        SELECT COUNT(*)::int AS total_faults
        FROM events
        WHERE received_at > NOW() - INTERVAL '24 hours'
      `),
    ]);
    return {
      total_devices: devs.rows[0].total_devices,
      online_devices: devs.rows[0].devices_online,
      total_kwh: energy.rows[0].total_kwh,
      active_faults: faults.rows[0].total_faults,
    };
  } else {
    const allDevices = await getAllDevices();
    const totalDevices = allDevices.length;
    const onlineDevices = allDevices.filter((d) => d.online).length;
    let totalKwh = 0;
    for (const d of allDevices) {
      if (d.kwh) totalKwh += parseFloat(d.kwh) || 0;
    }
    const faultRow = sqliteDb
      .prepare(
        `SELECT COUNT(*) as count FROM events WHERE received_at > datetime('now', '-24 hours')`
      )
      .get();
    return {
      total_devices: totalDevices,
      online_devices: onlineDevices,
      total_kwh: parseFloat(totalKwh.toFixed(2)),
      active_faults: faultRow ? faultRow.count : 0,
    };
  }
}

async function getAllDevices() {
  if (isPostgres) {
    const { rows } = await pgPool.query(`
      SELECT d.device_id, d.name, d.created_at, d.latitude, d.longitude, d.location_source,
             r.received_at AS last_seen, r.data
      FROM devices d
      LEFT JOIN LATERAL (
        SELECT received_at, data
        FROM readings
        WHERE device_id = d.device_id
        ORDER BY id DESC
        LIMIT 1
      ) r ON true
      ORDER BY d.device_id
    `);
    return rows.map((r) => ({
      device_id: r.device_id,
      name: r.name,
      created_at: r.created_at,
      last_seen: r.last_seen || null,
      online: r.last_seen
        ? Date.now() - new Date(r.last_seen).getTime() < 20 * 60 * 1000
        : false,
      ...(r.data || {}),
      ...locationFields(r),
    }));
  } else {
    const rows = sqliteDb
      .prepare(`
        SELECT d.device_id, d.name, d.created_at, d.latitude, d.longitude, d.location_source,
               r.received_at AS last_seen, r.data
        FROM devices d
        LEFT JOIN readings r ON r.id = (
          SELECT MAX(id) FROM readings WHERE device_id = d.device_id
        )
        ORDER BY d.device_id
      `)
      .all();
    return rows.map((r) => {
      const parsed = r.data ? JSON.parse(r.data) : {};
      return {
        device_id: r.device_id,
        name: r.name,
        created_at: r.created_at,
        last_seen: r.last_seen || null,
        online: r.last_seen
          ? Date.now() - new Date(r.last_seen).getTime() < 20 * 60 * 1000
          : false,
        ...parsed,
        ...locationFields(r),
      };
    });
  }
}

async function addDevice(deviceId, name, apiKey) {
  if (isPostgres) {
    const { rows } = await pgPool.query(
      `INSERT INTO devices (device_id, name, api_key)
       VALUES ($1, $2, $3)
       RETURNING device_id, name, created_at`,
      [String(deviceId), name || null, String(apiKey)]
    );
    return rows[0];
  } else {
    sqliteDb
      .prepare(
        `INSERT INTO devices (device_id, name, api_key) VALUES (?, ?, ?)`
      )
      .run(String(deviceId), name || null, String(apiKey));
    return { device_id: deviceId, name, created_at: new Date().toISOString() };
  }
}

async function updateDevice(deviceId, fields) {
  const { name, api_key } = fields;
  const hasLoc = fields.latitude !== undefined || fields.longitude !== undefined;
  const sets = [];
  const vals = [];
  if (name !== undefined) { sets.push("name"); vals.push(name); }
  if (api_key !== undefined) { sets.push("api_key"); vals.push(String(api_key)); }
  if (hasLoc) {
    const clear = fields.latitude === null || fields.longitude === null;
    sets.push("latitude"); vals.push(clear ? null : Number(fields.latitude));
    sets.push("longitude"); vals.push(clear ? null : Number(fields.longitude));
    sets.push("location_source"); vals.push(clear ? null : "manual");
    sets.push("location_updated_at"); vals.push(clear ? null : new Date().toISOString());
  }
  if (sets.length === 0) return { device_id: deviceId, name };
  if (isPostgres) {
    const assign = sets.map((c, i) => `${c} = $${i + 1}`).join(", ");
    vals.push(String(deviceId));
    const { rows } = await pgPool.query(
      `UPDATE devices SET ${assign} WHERE device_id = $${vals.length}
       RETURNING device_id, name, created_at, latitude, longitude, location_source`,
      vals
    );
    return rows[0];
  } else {
    const assign = sets.map((c) => `${c} = ?`).join(", ");
    vals.push(String(deviceId));
    sqliteDb.prepare(`UPDATE devices SET ${assign} WHERE device_id = ?`).run(...vals);
    return sqliteDb
      .prepare(`SELECT device_id, name, created_at, latitude, longitude, location_source FROM devices WHERE device_id = ?`)
      .get(String(deviceId));
  }
}

async function deleteDevice(deviceId) {
  if (isPostgres) {
    await pgPool.query("DELETE FROM schedule_state WHERE device_id = $1", [String(deviceId)]);
    await pgPool.query("DELETE FROM devices WHERE device_id = $1", [String(deviceId)]);
  } else {
    sqliteDb.prepare("DELETE FROM readings WHERE device_id = ?").run(String(deviceId));
    sqliteDb.prepare("DELETE FROM commands WHERE device_id = ?").run(String(deviceId));
    sqliteDb.prepare("DELETE FROM events WHERE device_id = ?").run(String(deviceId));
    sqliteDb.prepare("DELETE FROM schedule_state WHERE device_id = ?").run(String(deviceId));
    sqliteDb.prepare("DELETE FROM devices WHERE device_id = ?").run(String(deviceId));
  }
  return true;
}

async function verifyDeviceKey(deviceId, apiKey) {
  if (isPostgres) {
    const { rows } = await pgPool.query(
      "SELECT 1 FROM devices WHERE device_id = $1 AND api_key = $2",
      [String(deviceId), String(apiKey)]
    );
    return rows.length > 0;
  } else {
    const row = sqliteDb
      .prepare("SELECT 1 FROM devices WHERE device_id = ? AND api_key = ?")
      .get(String(deviceId), String(apiKey));
    return !!row;
  }
}

// ----------------- Device location -----------------

async function getDeviceLocation(deviceId) {
  if (isPostgres) {
    const { rows } = await pgPool.query(
      "SELECT latitude, longitude, location_source FROM devices WHERE device_id = $1",
      [String(deviceId)]
    );
    return rows[0] || null;
  }
  return (
    sqliteDb
      .prepare("SELECT latitude, longitude, location_source FROM devices WHERE device_id = ?")
      .get(String(deviceId)) || null
  );
}

async function setDeviceLocation(deviceId, lat, lon, source = "gps") {
  const now = new Date().toISOString();
  if (isPostgres) {
    await pgPool.query(
      `UPDATE devices SET latitude = $1, longitude = $2, location_source = $3, location_updated_at = $4
       WHERE device_id = $5`,
      [lat, lon, source, now, String(deviceId)]
    );
  } else {
    sqliteDb
      .prepare(
        `UPDATE devices SET latitude = ?, longitude = ?, location_source = ?, location_updated_at = ?
         WHERE device_id = ?`
      )
      .run(lat, lon, source, now, String(deviceId));
  }
}

// ----------------- Users (dashboard login / sign-up) -----------------

async function countUsers(role) {
  const where = role ? " WHERE role = " + (isPostgres ? "$1" : "?") : "";
  const args = role ? [role] : [];
  if (isPostgres) {
    const { rows } = await pgPool.query(`SELECT COUNT(*)::int AS c FROM users${where}`, args);
    return rows[0].c;
  }
  return sqliteDb.prepare(`SELECT COUNT(*) AS c FROM users${where}`).get(...args).c;
}

async function findUser(username) {
  if (isPostgres) {
    const { rows } = await pgPool.query(
      "SELECT id, username, email, password_hash, role FROM users WHERE LOWER(username) = LOWER($1)",
      [String(username)]
    );
    return rows[0] || null;
  }
  return (
    sqliteDb
      .prepare(
        "SELECT id, username, email, password_hash, role FROM users WHERE LOWER(username) = LOWER(?)"
      )
      .get(String(username)) || null
  );
}

async function createUser(username, email, passwordHash, role = "user") {
  if (isPostgres) {
    const { rows } = await pgPool.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id, username, email, role`,
      [String(username), email || null, passwordHash, role]
    );
    return rows[0];
  }
  const info = sqliteDb
    .prepare("INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)")
    .run(String(username), email || null, passwordHash, role);
  return { id: Number(info.lastInsertRowid), username, email: email || null, role };
}

// ----------------- Sunset / sunrise scheduler state -----------------

async function getScheduleState(deviceId) {
  if (isPostgres) {
    const { rows } = await pgPool.query(
      "SELECT last_key, last_state FROM schedule_state WHERE device_id = $1",
      [String(deviceId)]
    );
    return rows[0] || null;
  }
  return (
    sqliteDb
      .prepare("SELECT last_key, last_state FROM schedule_state WHERE device_id = ?")
      .get(String(deviceId)) || null
  );
}

async function setScheduleState(deviceId, key, state) {
  if (isPostgres) {
    await pgPool.query(
      `INSERT INTO schedule_state (device_id, last_key, last_state, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (device_id) DO UPDATE
         SET last_key = EXCLUDED.last_key, last_state = EXCLUDED.last_state, updated_at = NOW()`,
      [String(deviceId), key, state]
    );
  } else {
    sqliteDb
      .prepare(
        `INSERT INTO schedule_state (device_id, last_key, last_state, updated_at)
         VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
         ON CONFLICT(device_id) DO UPDATE SET
           last_key = excluded.last_key, last_state = excluded.last_state,
           updated_at = excluded.updated_at`
      )
      .run(String(deviceId), key, state);
  }
}

/** Drop not-yet-delivered commands of one kind so a stale relay command can't replay later. */
async function clearPendingCommands(deviceId, cmd) {
  if (isPostgres) {
    await pgPool.query("DELETE FROM commands WHERE device_id = $1 AND cmd = $2", [String(deviceId), String(cmd)]);
  } else {
    sqliteDb.prepare("DELETE FROM commands WHERE device_id = ? AND cmd = ?").run(String(deviceId), String(cmd));
  }
}

async function checkHealth() {
  if (isPostgres) {
    await pgPool.query("SELECT 1");
    return { engine: "postgresql", status: "ok" };
  } else {
    sqliteDb.prepare("SELECT 1").get();
    return { engine: "sqlite", status: "ok" };
  }
}

async function closeDb() {
  if (isPostgres && pgPool) {
    await pgPool.end();
  } else if (sqliteDb) {
    sqliteDb.close();
  }
}

module.exports = {
  isPostgres,
  initDb,
  saveReading,
  saveEvent,
  getAndClearCommands,
  getMeterReadings,
  getDeviceHistory,
  getDeviceEnergy,
  getEvents,
  queueCommand,
  getStats,
  getAllDevices,
  addDevice,
  updateDevice,
  deleteDevice,
  verifyDeviceKey,
  getDeviceLocation,
  setDeviceLocation,
  countUsers,
  findUser,
  createUser,
  getScheduleState,
  setScheduleState,
  clearPendingCommands,
  checkHealth,
  closeDb,
};
