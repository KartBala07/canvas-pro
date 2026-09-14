const PREFIX = "cp:";

export const DEFAULT_JSON = {
  canvasBaseUrl: "",
  token: "",
  profile: null,                       // { id, name, email, schoolDomain }
  allowedDomains: [],                  // allowlist; empty = heuristic blocklist
  blockPersonalEmails: true,
  targets: { regular: 93, honors: 88, ap: 83 },
  studySlots: [{ start: "18:00", end: "21:00", label: "Evening" }],
  maxStudyMinutesPerDay: 240,
  baseMinutesPerPoint: 1.2,
  difficulty: { assignment: 1, quiz: 1.6, exam: 2.6, test: 2.6, project: 2.2 },
  difficultyOverrides: {},             // courseId => { factor, label }
  supabase: { url: "", anonKey: "" },
  courseTypes: {},                     // courseId => "ap" | "honors" | "regular"
  filterSubmitted: true,
  todoHideDone: false,
  lastSync: null,
};

let cache = null;

export function settings() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(PREFIX + "settings");
    cache = { ...DEFAULT_JSON, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    cache = { ...DEFAULT_JSON };
  }
  return cache;
}

export function saveSettings() {
  localStorage.setItem(PREFIX + "settings", JSON.stringify(settings()));
}

// ---------- cached dataset (courses/assignments/todos/grades from Canvas) ----------
export function cacheData() {
  try { return JSON.parse(localStorage.getItem(PREFIX + "data") || "null"); }
  catch { return null; }
}

export function saveData(data) {
  settings().lastSync = new Date().toISOString();
  saveSettings();
  localStorage.setItem(PREFIX + "data", JSON.stringify(data));
}

export function clearData() {
  localStorage.removeItem(PREFIX + "data");
}

// ---------- small typed caches ----------
export function cacheGet(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

export function cacheSet(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

// ---------- "I did this" checkmarks (local only, this device) ----------
const DONE_KEY = PREFIX + "doneIds";

export function doneIds() {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) || "[]"); }
  catch { return []; }
}

export function setDone(id, done) {
  const set = new Set(doneIds());
  if (done) set.add(id); else set.delete(id);
  localStorage.setItem(DONE_KEY, JSON.stringify([...set]));
  return [...set];
}

export function markAllDone(ids) {
  const set = new Set(doneIds());
  for (const id of ids) set.add(id);
  localStorage.setItem(DONE_KEY, JSON.stringify([...set]));
  return [...set];
}

export function clearDone() {
  localStorage.setItem(DONE_KEY, "[]");
}

// ---------- Supabase ----------
const EMAIL_RE = /^[^@]+@([^@]+)$/;

export function cloudConfig() { return settings().supabase; }

export function cloudReady() { const c = cloudConfig(); return !!(c.url && c.anonKey); }

function rest(path, opts = {}) {
  const { url, anonKey } = cloudConfig();
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  return fetch(url.replace(/\/$/, "") + path, { ...opts, headers });
}

export async function cloudFetch(path) {
  const r = await rest(path);
  if (!r.ok) throw new Error(`Cloud error ${r.status}`);
  return r.json();
}

export async function cloudUpsert(table, rows) {
  const r = await rest(`/rest/v1/${table}`, {
    method: "POST",
    body: JSON.stringify(rows),
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
  if (!r.ok) throw new Error(`Upload failed (${r.status})`);
  return true;
}

export function deriveUserId(profile) {
  if (!profile?.email) return null;
  return btoa(unescape(encodeURIComponent(profile.email)));
}

export function emailDomain(email) {
  const m = EMAIL_RE.exec(email || "");
  return m ? m[1].toLowerCase() : null;
}

const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "me.com", "proton.me", "protonmail.com", "live.com",
  "msn.com", "comcast.net", "verizon.net", "zoho.com", "gmx.com",
  "qq.com", "163.com", "126.com", "foxmail.com",
]);

export function emailAllowed(profile) {
  const s = settings();
  const domain = emailDomain(profile?.email);
  if (!domain) return { ok: false, reason: "Could not read an email from your Canvas profile." };
  if (!s.allowedDomains?.length) {
    if (s.blockPersonalEmails && PERSONAL_DOMAINS.has(domain)) {
      return {
        ok: false,
        reason: `"${domain}" looks like a personal email, not a school Canvas email. Ask your admin or add it in Settings → Access.`,
      };
    }
  } else {
    if (!s.allowedDomains.map((d) => d.toLowerCase()).includes(domain)) {
      return {
        ok: false,
        reason: `"${domain}" is not an allowed school domain (allowed: ${s.allowedDomains.join(", ")}). Contact your admin or update Settings → Access.`,
      };
    }
  }
  return { ok: true };
}