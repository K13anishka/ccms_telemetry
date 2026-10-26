const BASE = '/api/v1';
const TOKEN_KEY = 'ccms_token';

/* ── Session token ── */
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request(url, options = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    // expired / invalid session → send the user back to the login screen
    if (res.status === 401 && !url.includes('/auth/')) {
      clearToken();
      window.dispatchEvent(new Event('ccms-logout'));
    }
    const text = await res.text().catch(() => res.statusText);
    let message = text;
    try { message = JSON.parse(text).error || text; } catch (_) {}
    throw new Error(message);
  }
  return res.json();
}

/* ── Login / Sign up ── */
export function loginUser(username, password) {
  return request(`${BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function registerUser(username, password, email) {
  return request(`${BASE}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({ username, password, email }),
  });
}

export function fetchMe() {
  return request(`${BASE}/auth/me`);
}

/* ── Dashboard / Telemetry ── */
export function fetchMeterData() {
  return request(`${BASE}/meter`);
}

export function fetchDeviceHistory(id, limit = 288) {
  return request(`${BASE}/meter/${id}/history?limit=${limit}`);
}

export function fetchStats() {
  return request(`${BASE}/stats`);
}

/* ── Device Management ── */
export function fetchDevices() {
  return request(`${BASE}/devices`);
}

export function addDevice(device) {
  return request(`${BASE}/devices`, {
    method: 'POST',
    body: JSON.stringify(device),
  });
}

export function fetchDeviceConfig(id) {
  return request(`${BASE}/devices/${id}/config`);
}

export function updateDevice(id, device) {
  return request(`${BASE}/devices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(device),
  });
}

export function deleteDevice(id) {
  return request(`${BASE}/devices/${id}`, { method: 'DELETE' });
}

/* ── Commands ── */
export function sendCommand(id, command) {
  // authenticated with the signed-in admin's session token (see request())
  return request(`${BASE}/command/${id}`, {
    method: 'POST',
    body: JSON.stringify(command),
  });
}

/* ── Events ── */
export function fetchEvents() {
  return request(`${BASE}/events`);
}
