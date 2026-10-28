/**
 * middleware/auth.js – authentication helpers for device, dashboard-user and admin routes.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { verifyDeviceKey } = require("../db");

const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";
const TOKEN_TTL_MS = (parseInt(process.env.AUTH_TOKEN_TTL_HOURS, 10) || 24) * 3600 * 1000;

// ───────────── signing secret (env, or generated once and kept on disk) ─────────────
function loadSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const file = path.join(__dirname, "..", ".auth_secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch (_) {
    const secret = crypto.randomBytes(48).toString("hex");
    try {
      fs.writeFileSync(file, secret, { mode: 0o600 });
    } catch (err) {
      console.warn("Could not persist auth secret (sessions reset on restart):", err.message);
    }
    return secret;
  }
}
const SECRET = loadSecret();

// ───────────── passwords (scrypt) ─────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split("$");
    if (scheme !== "scrypt") return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, "hex"), expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

// ───────────── signed session tokens ─────────────
const b64 = (buf) => Buffer.from(buf).toString("base64url");

function signToken(user) {
  const payload = b64(
    JSON.stringify({ u: user.username, r: user.role, exp: Date.now() + TOKEN_TTL_MS })
  );
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function readToken(token) {
  if (!token || typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || data.exp < Date.now()) return null;
    return { username: data.u, role: data.r };
  } catch (_) {
    return null;
  }
}

function userFromRequest(req) {
  const h = req.header("authorization") || "";
  return h.startsWith("Bearer ") ? readToken(h.slice(7)) : null;
}

/** Any signed-in dashboard user. */
function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: "login required" });
  req.user = user;
  next();
}

/**
 * Device authentication.
 * Expects the device_id in req.params.id OR req.body.device_id and a valid
 * x-api-key header that matches the stored key for that device.
 */
async function deviceAuth(req, res, next) {
  try {
    const id = req.params.id || (req.body && (req.body.device_id || req.body.imei || req.body.kit_id));
    const key = req.header("x-api-key");

    if (!id || !key) {
      return res.status(401).json({ error: "missing id or key" });
    }

    const valid = await verifyDeviceKey(id, key);
    if (!valid) {
      return res.status(401).json({ error: "unauthorized" });
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Admin authentication.
 * Accepts a signed-in admin user (Authorization: Bearer <token>) or, for
 * scripts, the x-admin-key header matching ADMIN_KEY.
 */
function adminAuth(req, res, next) {
  const user = userFromRequest(req);
  if (user) {
    if (user.role !== "admin") return res.status(403).json({ error: "admin access required" });
    req.user = user;
    return next();
  }
  if (req.header("x-admin-key") === ADMIN_KEY) return next();
  return res.status(401).json({ error: "login required" });
}

module.exports = {
  deviceAuth,
  adminAuth,
  requireAuth,
  hashPassword,
  verifyPassword,
  signToken,
  readToken,
};
