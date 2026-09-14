import { esc, toast, fmtDate } from "../utils.js";
import { settings } from "../storage.js";
import * as canvas from "../canvas.js";

function clean(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "");
}

// Embedded file <img>s point at Canvas file URLs that need auth the page
// doesn't have (they show bare JSON here). Swap them for attachment links.
function attachmentLinks(html, base) {
  return String(html || "").replace(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi, (m, src) => {
    if (!/\/files\/|preview|download/i.test(src)) return m;
    const href = /^https?:\/\//.test(src) ? src : `${base}${src}`;
    return `<a href="${esc(href)}" target="_blank" rel="noopener" class="ann-att">📎 file attachment</a>`;
  });
}

function annCard(a, courseName, base) {
  const read = (a.read_state || "read") === "read";
  const date = a.posted_at ? fmtDate(a.posted_at.split("T")[0]) : "";
  return `
    <div class="card ann-item ${read ? "read" : ""}" data-id="${esc(a.id)}" data-code="${esc(a.context_code || "")}">
      <details>
        <summary>
          <div class="ann-head">
            <span class="ann-dot" title="${read ? "Read" : "Unread"}"></span>
            <div class="ann-title">${esc(a.title || "Untitled")}</div>
            <span class="small muted ann-date">${date}</span>
          </div>
          <div class="small muted ann-meta">${esc(courseName)}${a.author?.display_name ? ` · ${esc(a.author.display_name)}` : ""}</div>
        </summary>
        <div class="ann-body">${attachmentLinks(clean(a.message), base)}</div>
        <div class="flex mt">
          <button class="btn btn-ghost btn-small ann-read" ${read ? "disabled" : ""}>Mark read</button>
          ${a.html_url || a.url ? `<a class="btn btn-ghost btn-small" href="${esc(a.html_url || a.url)}" target="_blank" rel="noopener">Open in Canvas ↗</a>` : ""}
        </div>
      </details>
    </div>`;
}

export async function render(state, root, isStale = () => false) {
  root.innerHTML = `
    <div class="flex between" style="align-items:baseline">
      <div>
        <h1>Announcements</h1>
        <p class="subtitle">The latest from your teachers, across all classes (last 60 days).</p>
      </div>
      <button id="annMarkAll" class="btn btn-ghost btn-small hidden">Mark all read</button>
    </div>
    <div id="annList"><div class="loading" style="padding:40px 0"><div class="spinner"></div><p class="muted small">Loading announcements…</p></div></div>
  `;
  const list = root.querySelector("#annList");
  const markAll = root.querySelector("#annMarkAll");

  const courses = state.data?.courses || [];
  if (!courses.length) {
    list.innerHTML = `<div class="card"><p class="muted">No courses. Refresh data first.</p></div>`;
    return;
  }

  let items;
  try {
    items = await canvas.getAnnouncements(courses.map((c) => `course_${c.id}`));
    if (isStale()) return;
    items = (items || []).filter((a) => a.posted_at);
    items.sort((a, b) => b.posted_at.localeCompare(a.posted_at));
  } catch (e) {
    if (isStale()) return;
    list.innerHTML = `<div class="card"><p class="error">Couldn't load announcements: ${esc(e.message)}</p><p class="hint muted">Your token may be missing the "Announcements" / Discussion scope. Regenerate it in Canvas settings with Announcements access to use this tab.</p></div>`;
    return;
  }

  if (!items.length) {
    if (isStale()) return;
    list.innerHTML = `<div class="card"><p class="muted">No announcements in the last 60 days.</p></div>`;
    return;
  }

  const courseName = (code) => {
    const id = parseInt(String(code || "").split("_")[1], 10);
    const c = courses.find((x) => x.id === id);
    return c ? c.name : code;
  };
  const unread = items.filter((a) => (a.read_state || "read") !== "read").length;
  if (isStale()) return;

  list.innerHTML = `
    <p class="small muted mb">${items.length} announcement${items.length === 1 ? "" : "s"}${unread ? ` · <b style="color:var(--accent)">${unread} unread</b>` : ""}</p>
    ${items.map((a) => annCard(a, courseName(a.context_code), settings().canvasBaseUrl || "")).join("")}
  `;
  markAll.classList.toggle("hidden", unread === 0);

  const card = (el) => el.closest(".ann-item");
  const setRead = (itemEl, a, { silent = false } = {}) => {
    itemEl.classList.add("read");
    const dot = itemEl.querySelector(".ann-dot");
    if (dot) dot.classList.remove("unread");
    const btn = itemEl.querySelector(".ann-read");
    if (btn) btn.disabled = true;
    if (!silent) toast("Marked as read.");
  };

  list.querySelectorAll(".ann-read").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemEl = card(btn);
      const cid = parseInt(String(itemEl.dataset.code || "course_0").split("_")[1], 10);
      try {
        await canvas.markAnnouncementRead(cid, itemEl.dataset.id);
        setRead(itemEl, null, {});
        if (!list.querySelector(".ann-item:not(.read)")) markAll.classList.add("hidden");
      } catch (e) {
        toast("Couldn't mark read: " + e.message, "err");
      }
    });
  });

  markAll.addEventListener("click", async () => {
    const todo = items.filter((a) => (a.read_state || "read") !== "read");
    for (const a of todo) {
      const cid = parseInt(String(a.context_code || "course_0").split("_")[1], 10);
      try { await canvas.markAnnouncementRead(cid, a.id); } catch {}
    }
    list.querySelectorAll(".ann-item").forEach((el) => setRead(el, null, { silent: true }));
    markAll.classList.add("hidden");
    toast(`Marked ${todo.length} announcement${todo.length === 1 ? "" : "s"} read.`);
  });
}