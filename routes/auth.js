/**
 * routes/auth.js – dashboard login / sign-up.
 *
 *   POST /api/v1/auth/login      – { username, password }  → { token, username, role }
 *   POST /api/v1/auth/register   – { username, password, email? } → { token, username, role }
 *   GET  /api/v1/auth/me         – current user (validates a stored token)
 */
const { Router } = require("express");
const { countUsers, findUser, createUser } = require("../db");
const { hashPassword, verifyPassword, signToken, requireAuth } = require("../middleware/auth");

const router = Router();

const SIGNUP_ROLE = process.env.SIGNUP_ROLE === "admin" ? "admin" : "user";
const USERNAME_RE = /^[A-Za-z0-9_.@-]{3,40}$/;

// Basic brute-force protection: 5 failed logins per username+IP → 15 minute lock.
const failures = new Map();
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

function lockKey(req, username) {
  return `${req.ip}|${String(username).toLowerCase()}`;
}
function isLocked(key) {
  const f = failures.get(key);
  if (!f) return false;
  if (f.until && f.until > Date.now()) return true;
  if (f.until && f.until <= Date.now()) failures.delete(key);
  return false;
}
function noteFailure(key) {
  const f = failures.get(key) || { count: 0 };
  f.count += 1;
  if (f.count >= MAX_FAILS) f.until = Date.now() + LOCK_MS;
  failures.set(key, f);
}

const session = (user) => ({ token: signToken(user), username: user.username, role: user.role });

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }
    const key = lockKey(req, username);
    if (isLocked(key)) {
      return res.status(429).json({ error: "too many failed attempts, try again in 15 minutes" });
    }
    const user = await findUser(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      noteFailure(key);
      return res.status(401).json({ error: "invalid username or password" });
    }
    failures.delete(key);
    res.json(session(user));
  } catch (err) {
    next(err);
  }
});

router.post("/register", async (req, res, next) => {
  try {
    const { username, password, email } = req.body || {};
    if (!username || !USERNAME_RE.test(String(username).trim())) {
      return res
        .status(400)
        .json({ error: "username must be 3-40 characters (letters, numbers, . _ - @)" });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "password must be at least 6 characters" });
    }
    const name = String(username).trim();
    if (await findUser(name)) {
      return res.status(409).json({ error: "username already taken" });
    }
    const user = await createUser(name, email ? String(email).trim() : null, hashPassword(password), SIGNUP_ROLE);
    res.status(201).json(session(user));
  } catch (err) {
    if (err.code === "23505" || err.message?.includes("UNIQUE constraint failed")) {
      return res.status(409).json({ error: "username already taken" });
    }
    next(err);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

/** Creates the default admin on first start (credentials from env, see .env.example). */
async function seedAdmin() {
  if ((await countUsers("admin")) > 0) return;
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  if (await findUser(username)) return;
  await createUser(username, null, hashPassword(password), "admin");
  console.log(`Default admin user "${username}" created.`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn("ADMIN_PASSWORD not set – using the default password. Change it before going live.");
  }
}

module.exports = router;
module.exports.seedAdmin = seedAdmin;
