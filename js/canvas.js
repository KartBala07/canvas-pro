const PER_PAGE = 100;

let base = "";
let token = "";

export function client(url, tok) {
  base = url.replace(/\/$/, "");
  token = tok;
  return api;
}

export async function api(path, { method = "GET", body } = {}) {
  if (!base || !token) throw new Error("Canvas client not initialized.");
  const url = base + path + (path.includes("?") ? "&" : "?") + `per_page=${PER_PAGE}`;
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    let msg = `Canvas error ${res.status}`;
    try {
      const j = await res.json();
      if (j?.errors?.[0]?.message) msg = j.errors[0].message;
      else if (j?.message) msg = j.message;
    } catch {}
    if (res.status === 401) throw new Error("401 — Token rejected. Regenerate it in Canvas settings.");
    throw new Error(msg);
  }
  return res.json();
}

// Follows pagination and returns every element.
export async function all(path, init) {
  let out = [];
  let url = base + path + (path.includes("?") ? "&" : "?") + `per_page=${PER_PAGE}`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      ...(init || {}),
    });
    if (!res.ok) {
      let msg = `Canvas error ${res.status}`;
      try {
        const j = await res.json();
        msg = j?.errors?.[0]?.message || j?.message || msg;
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

export async function getCourses() {
  return all("/api/v1/courses?enrollment_state=active&include[]=total_scores&state[]=active&state[]=completed");
}

export function getAssignmentGroups(courseId) {
  return all(`/api/v1/courses/${courseId}/assignment_groups?include[]=assignments&assignment[]=submission&override_assignment_dates=false`);
}

export function getTodos() {
  return api("/api/v1/users/self/todo?include[]=course"); // include course name
}

export function getCalendarEvents(startIso, endIso) {
  return all(`/api/v1/calendar_events?type=assignment&start_date=${encodeURIComponent(startIso)}&end_date=${encodeURIComponent(endIso)}`);
}