const PER_PAGE = 100;

// When true, API calls go through the local server's /api/canvas proxy so the
// browser never hits Canvas CORS and the token never leaves the machine.
// Set USE_PROXY=false (and give a public CORS-enabled base) when deploying.
const USE_PROXY = true;
const PROXY_PATH = "/api/canvas";

let base = "";
let token = "";

function buildRequest(path, { method = "GET", body } = {}) {
  const suffix = (path.includes("?") ? "&" : "?") + `per_page=${PER_PAGE}`;
  const headers = {};
  let url;
  if (USE_PROXY) {
    url = PROXY_PATH + "?p=" + encodeURIComponent(path + suffix);
    headers["X-Canvas-Token"] = token || headers.Authorization;
    headers["X-Canvas-Base"] = base;
  } else {
    url = base + path + suffix;
    headers["Authorization"] = "Bearer " + token;
  }
  if (body) headers["Content-Type"] = "application/json";
  return { url, headers, body };
}

function errorFrom(res, status) {
  let msg = `Canvas error ${status}`;
  if (USE_PROXY && (status === 400 || status === 502 || status === 504)) {
    return msg + " (proxy issue — is the Node/python server running?)";
  }
  return msg;
}

export function client(url, tok) {
  base = url.replace(/\/$/, "");
  token = tok;
  return api;
}

export async function api(path, { method = "GET", body } = {}) {
  if (!base || !token) throw new Error("Canvas client not initialized.");
  const { url, headers } = buildRequest(path, { method, body });
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    let msg = errorFrom(res, res.status);
    try {
      const j = await res.json();
      if (typeof j === "object") msg = j.errors?.[0]?.message || j.message || JSON.stringify(j);
    } catch {}
    if (res.status === 401) throw new Error("401 — Token rejected. Regenerate it in Canvas settings.");
    throw new Error(msg);
  }
  return res.json();
}

// Follows pagination and returns every element.
export async function all(path, init) {
  let out = [];
  let url;
  let headers;
  {
    const r = buildRequest(path, init);
    url = r.url;
    headers = r.headers;
  }
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      let msg = errorFrom(res, res.status);
      try {
        const j = await res.json();
        if (typeof j === "object") msg = j.errors?.[0]?.message || j.message || JSON.stringify(j);
      } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    out = out.concat(Array.isArray(data) ? data : [data]);
    const link = res.headers.get("Link") || "";
    const m = /<([^>]+)>;\s*rel="next"/.exec(link);
    url = m ? m[1] : null;
  }
  return out;
}

export function getProfile() {
  return api("/api/v1/users/self/profile");
}

export function getCourses() {
  return all("/api/v1/courses?enrollment_state=active&include[]=total_scores");
}

export function getAssignmentGroups(courseId) {
  return all(`/api/v1/courses/${courseId}/assignment_groups?include[]=assignments&assignment[]=submission&override_assignment_dates=false`);
}

export function getTodos() {
  return api("/api/v1/users/self/todo?include[]=course");
}

export function getAssignment(courseId, assignmentId) {
  return api(`/api/v1/courses/${courseId}/assignments/${assignmentId}`);
}

export function getCalendarEvents(startIso, endIso) {
  return all(`/api/v1/calendar_events?type=assignment&start_date=${encodeURIComponent(startIso)}&end_date=${encodeURIComponent(endIso)}`);
}