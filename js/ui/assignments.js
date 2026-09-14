import { fmtDate, num, esc, daysUntil, toast } from "../utils.js";
import { settings, saveSettings, doneIds, setDone, markAllDone, clearDone } from "../storage.js";

function rowHTML(t, done) {
  const due = daysUntil(t.dueAt);
  const overdue = due != null && due < 0;
  return `
    <tr class="${done.has(t.id) ? "done" : ""}">
      <td style="width:36px"><input type="checkbox" class="done-box" data-id="${esc(t.id)}" title="Mark done (saved on this device)" ${done.has(t.id) ? "checked" : ""} /></td>
      <td>
        ${t.htmlUrl ? `<a href="${esc(t.htmlUrl)}" target="_blank" rel="noopener" style="color:var(--text);text-decoration:none"><b>${esc(t.title)}</b></a>` : `<b>${esc(t.title)}</b>`}
        <div class="small muted">${esc(t.courseName || "—")}${t.groupName ? ` · ${esc(t.groupName)}` : ""}${t.groupWeight != null ? ` · ${t.groupWeight}%` : ""}${t.pointsPossible ? ` · ${t.pointsPossible} pts` : ""}</div>
      </td>
      <td><span class="tag ${t.type === "exam" ? "tag-red" : t.type === "quiz" ? "tag-yellow" : t.type === "project" ? "tag-purple" : "tag-blue"}">${t.type}</span></td>
      <td class="muted">${fmtDate(t.dueAt)}${overdue ? " ⚠️" : ""}</td>
      <td>${t.pointsEarned != null ? `${num(t.pointsEarned)} / ${num(t.pointsPossible)}` : t.submitted ? "Submitted" : `<span class="tag tag-yellow">Open</span>`}</td>
    </tr>`;
}

function byDue(a, b) {
  return (a.dueAt || "9999")?.localeCompare(b.dueAt || "9999") || (a.title || "").localeCompare(b.title || "");
}

export function render(state, root) {
  const { courses, tasks } = state.data;
  let done = new Set(doneIds());

  root.innerHTML = `
    <h1>Assignments</h1>
    <p class="subtitle">Every assignment across your classes, with due dates, weights, and your own personal "done" checkmarks.</p>
    <div class="flex mt">
      <input id="asgSearch" class="search" placeholder="Search assignments…" style="padding:9px 13px;border-radius:10px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text);flex:1;max-width:300px" />
      <label class="flex small muted" style="white-space:nowrap">
        <input type="checkbox" id="asgHideDone" ${settings().filterSubmitted ? "checked" : ""} /> Hide submitted
      </label>
      <button id="asgMarkAll" class="btn btn-small">✓ Mark all open done</button>
      ${doneIds().length ? `<button id="asgClearDone" class="btn btn-small btn-ghost">Reset done ✓</button>` : ""}
    </div>
    <div id="asgList" class="mt"></div>
  `;

  const q = root.querySelector("#asgSearch");
  const hide = root.querySelector("#asgHideDone");
  const list = root.querySelector("#asgList");

  function draw() {
    const term = q.value.toLowerCase();

    const passes = (t) => {
      if (term && !(`${t.title} ${t.courseName}`).toLowerCase().includes(term)) return false;
      if (hide.checked && t.submitted) return false;
      return true;
    };
    const isLate = (t) => t.dueAt && (daysUntil(t.dueAt) ?? 1) < 0 && !t.submitted && !done.has(t.id);
    const lateSet = new Set(tasks.filter(isLate).map((t) => t.id));

    const lateItems = tasks.filter((t) => lateSet.has(t.id) && passes(t)).sort(byDue);
    const lateHTML = lateItems.length
      ? `<div class="card mt card-late">
          <div class="flex between">
            <h3>⚠️ Late — ${lateItems.length}</h3>
            <span class="small muted">overdue & not submitted</span>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th></th><th>Assignment</th><th>Type</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>${lateItems.map((t) => rowHTML(t, done)).join("")}</tbody>
          </table></div>
        </div>`
      : "";

    let courseHTML = "";
    for (const c of courses) {
      const items = tasks.filter((t) => t.courseId === c.id && !lateSet.has(t.id)).sort(byDue);
      const shown = items.filter(passes);
      if (!shown.length) continue;
      courseHTML += `
        <div class="card mt">
          <div class="flex between">
            <h3>${esc(c.name)}</h3>
            <div class="small muted">${shown.length} ${done.size ? `· ${shown.filter((t) => done.has(t.id)).length} done` : ""}</div>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th></th><th>Assignment</th><th>Type</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>${shown.map((t) => rowHTML(t, done)).join("")}</tbody>
          </table></div>
        </div>`;
    }

    list.innerHTML = lateHTML + courseHTML || `<p class="muted">No assignments match.</p>`;
  }

  q.addEventListener("input", draw);
  hide.addEventListener("change", () => {
    settings().filterSubmitted = hide.checked;
    saveSettings();
    draw();
  });

  list.addEventListener("change", (e) => {
    const cb = e.target.closest(".done-box");
    if (!cb) return;
    done = new Set(setDone(cb.dataset.id, cb.checked));
    draw();
  });

  root.querySelector("#asgMarkAll").addEventListener("click", () => {
    const openIds = tasks.filter((t) => !t.submitted && !done.has(t.id)).map((t) => t.id);
    if (openIds.length) {
      done = new Set(markAllDone(openIds));
      toast(`${openIds.length} marked done.`, "ok");
      draw();
    } else {
      toast("Nothing open left to mark.", "");
    }
  });

  root.querySelector("#asgClearDone")?.addEventListener("click", () => {
    clearDone();
    done = new Set();
    draw();
  });

  draw();
}