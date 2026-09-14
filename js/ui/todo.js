import { fmtDate, esc } from "../utils.js";
import { recommendedOrder, bandClass } from "../priorities.js";
import { settings, saveSettings, doneIds, setDone, clearDone } from "../storage.js";
import { openTask } from "./taskdetail.js";

function activeRowHTML({ task, course, score, band, reasons }, done) {
  return `
    <tr class="${done.has(task.id) ? "done" : ""}" data-id="${esc(task.id)}">
      <td style="width:36px"><input type="checkbox" class="todo-done" data-id="${esc(task.id)}" ${done.has(task.id) ? "checked" : ""} title="Mark done" /></td>
      <td>
        <div>${task.htmlUrl ? `<button class="task-open link-btn" data-id="${esc(task.id)}"><b>${esc(task.title)}</b></button>` : `<b>${esc(task.title)}</b>`}
          <span class="tag ${bandClass(band)?.split(" ")[0]}">${band}</span> <span class="tag ${task.type === "exam" ? "tag-red" : "tag-blue"}">${task.type}</span></div>
        <div class="small muted">${esc(task.courseName || "")} · due ${fmtDate(task.dueAt)}</div>
      </td>
      <td style="width:150px"><div class="priority-bar"><div class="priority-fill ${band === "high" ? "p-high" : band === "mid" ? "p-mid" : "p-low"}" style="width:${score}%"></div></div><div class="small muted">${score}/100</div></td>
      <td class="small muted" style="max-width:260px">${reasons.map(esc).join(" · ")}</td>
      <td>${course ? `<span class="grade-pill ${course.currentScore >= (course.targetGrade || 93) ? "grade-high" : "grade-low"}">${course.currentScore != null ? Math.round(course.currentScore) + "%" : "—"}</span>` : ""}</td>
    </tr>`;
}

function doneRowHTML(task) {
  return `
    <tr class="done" data-id="${esc(task.id)}">
      <td style="width:36px"><input type="checkbox" class="todo-done" data-id="${esc(task.id)}" checked title="Un-mark done" /></td>
      <td>
        <div><b>${esc(task.title)}</b> <span class="tag tag-blue">${task.type}</span></div>
        <div class="small muted">${esc(task.courseName || "")} · due ${fmtDate(task.dueAt)}</div>
      </td>
      <td class="muted">Completed ✓</td>
      <td class="muted"></td>
      <td></td>
    </tr>`;
}

function byTitle(a, b) {
  return (a.title || "").localeCompare(b.title || "");
}

export function render(state, root) {
  const { courses, tasks, todos } = state.data;
  let done = new Set(doneIds());
  const merged = [...tasks, ...todos.filter((t) => !tasks.some((x) => x.id === t.id))];
  const active = merged.filter((t) => !t.submitted && !done.has(t.id));
  const ranked = recommendedOrder(active, courses);
  const completed = merged.filter((t) => done.has(t.id)).sort(byTitle);
  const hideDone = settings().todoHideDone;

  root.innerHTML = `
    <h1>To-Do</h1>
    <p class="subtitle">Ranked by due date, how much the assignment weighs, the points at stake, and how far your grade is from its target (AP classes only need a B; regular classes need an A). Check a box to mark done — same list as Assignments.</p>
    <div class="flex mt">
      <input id="todoSearch" placeholder="Filter…" style="padding:9px 13px;border-radius:10px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text);flex:1;max-width:320px" />
      <select id="todoBand" style="padding:9px 13px;border-radius:10px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)">
        <option value="all">All priorities</option>
        <option value="high">High only</option>
        <option value="mid">Mid only</option>
        <option value="low">Low only</option>
      </select>
      <label class="flex small muted" style="white-space:nowrap">
        <input type="checkbox" id="todoHideDone" ${hideDone ? "checked" : ""} /> Hide completed
      </label>
    </div>
    <div id="todoList" class="mt"></div>
  `;

  const search = root.querySelector("#todoSearch");
  const bandSel = root.querySelector("#todoBand");
  const list = root.querySelector("#todoList");

  function draw() {
    const q = search.value.toLowerCase();
    const band = bandSel.value;
    const showDone = !settings().todoHideDone;

    const activeRows = ranked.filter((r) => {
      if (band !== "all" && r.band !== band) return false;
      if (q && !(r.task.title + " " + r.task.courseName).toLowerCase().includes(q)) return false;
      return true;
    }).map((r) => activeRowHTML(r, done)).join("");

    const doneRows = showDone
      ? completed.filter((t) => !q || `${t.title} ${t.courseName}`.toLowerCase().includes(q))
          .map((t) => doneRowHTML(t)).join("")
      : "";

    const activeCard = `
      <div class="card">
        ${activeRows ? `<div class="table-wrap"><table>
          <thead><tr><th></th><th>Assignment</th><th>Priority</th><th>Why</th><th>Grade now</th></tr></thead>
          <tbody>${activeRows}</tbody>
        </table></div>` : `<p class="muted">All clear, or nothing matches the filter.</p>`}
      </div>`;

    const doneCard = doneRows
      ? `<div class="card mt">
          <div class="flex between">
            <h3>Completed ✓ · ${completed.length}</h3>
            <button id="todoClearDone" class="btn btn-small btn-ghost">Reset done ✓</button>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th></th><th>Assignment</th><th>Status</th><th></th><th></th></tr></thead>
            <tbody>${doneRows}</tbody>
          </table></div>
        </div>`
      : "";

    list.innerHTML = activeCard + doneCard;
  }

  list.addEventListener("change", (e) => {
    const cb = e.target.closest(".todo-done");
    if (!cb) return;
    done = new Set(setDone(cb.dataset.id, cb.checked));
    draw();
  });

  list.addEventListener("click", (e) => {
    const open = e.target.closest(".task-open");
    if (open) {
      const t = merged.find((x) => x.id === open.dataset.id);
      if (t) openTask(t, state);
      return;
    }
    const btn = e.target.closest("#todoClearDone");
    if (!btn) return;
    clearDone();
    render(state, root);
  });

  search.addEventListener("input", draw);
  bandSel.addEventListener("change", draw);
  root.querySelector("#todoHideDone").addEventListener("change", (e) => {
    settings().todoHideDone = e.target.checked;
    saveSettings();
    draw();
  });

  draw();
}