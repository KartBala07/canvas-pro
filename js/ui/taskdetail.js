import { esc, fmtDate, daysUntil } from "../utils.js";
import * as canvas from "../canvas.js";

let open = false;

function sanitize(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "");
}

export async function openTask(task, state) {
  if (open) return;
  open = true;

  const due = daysUntil(task.dueAt);
  const wrap = document.createElement("div");
  wrap.className = "modal-overlay hidden";
  wrap.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h2>${esc(task.title)}</h2>
        <button class="btn btn-small btn-ghost" data-close>✕</button>
      </div>
      <div class="meta">
        <div class="small muted">${esc(task.courseName || "")}${task.groupName ? ` · ${esc(task.groupName)}` : ""}${task.groupWeight != null ? ` · ${task.groupWeight}%` : ""}</div>
        <div class="small muted">Due ${fmtDate(task.dueAt)}${due != null ? ` · ${due < 0 ? Math.abs(due) + "d overdue" : due === 0 ? "today" : "in " + due + "d"}` : ""}</div>
        <div class="small muted">${task.pointsPossible ? task.pointsPossible + " pts" : ""}${task.baseMinutes ? ` · ~${task.baseMinutes} min` : ""}</div>
      </div>
      <div class="status-row">
        <span class="tag ${task.type === "exam" ? "tag-red" : task.type === "quiz" ? "tag-yellow" : task.type === "project" ? "tag-purple" : "tag-blue"}">${esc(task.type)}</span>
        <span class="tag ${task.submitted ? "tag-green" : "tag-yellow"}">${task.submitted ? "Submitted" : "Not submitted"}</span>
      </div>
      <div class="desc">${task.description ? sanitize(task.description) : "<p class='muted'>Loading description…</p>"}</div>
      <div class="modal-foot">
        ${task.htmlUrl ? `<a class="btn" href="${esc(task.htmlUrl)}" target="_blank" rel="noopener">Open on Canvas ↗</a>` : ""}
      </div>
    </div>`;

  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.remove("hidden"));

  const close = () => {
    wrap.classList.add("hidden");
    setTimeout(() => wrap.remove(), 200);
    document.removeEventListener("keydown", onKey);
    open = false;
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey);

  if (task.canvasId && task.courseId && !task.description) {
    try {
      const detail = await canvas.getAssignment(task.courseId, task.canvasId);
      const desc = sanitize(detail.description);
      const box = wrap.querySelector(".desc");
      if (box) {
        box.innerHTML = desc || "<p class='muted'>No description on Canvas.</p>";
        box.classList.add("loaded");
      }
    } catch {
      const box = wrap.querySelector(".desc");
      if (box) box.innerHTML = "<p class='muted'>Could not load the description (offline or token issue).</p>";
    }
  }
}