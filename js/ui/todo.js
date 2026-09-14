import { fmtDate, num, esc } from "../utils.js";
import { recommendedOrder, bandClass } from "../priorities.js";
import { cacheGet, cacheSet } from "../storage.js";

let ignored = cacheGet("ignored", []);
function saveIgnored() { cacheSet("ignored", ignored); }

export function render(state, root) {
  const { courses, tasks, todos } = state.data;
  const merged = [...tasks, ...todos.filter((t) => !tasks.some((x) => x.id === t.id))];
  const ranked = recommendedOrder(merged.filter((t) => !t.submitted), courses)
    .filter((r) => !ignored.includes(r.task.id));

  root.innerHTML = `
    <h1>To-Do</h1>
    <p class="subtitle">Ranked by due date, how much the assignment weighs, the points at stake, and how far your grade is from its target (AP classes only need a B; regular classes need an A).</p>
    <div class="flex mt">
      <input id="todoSearch" placeholder="Filter…" style="padding:9px 13px;border-radius:10px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text);flex:1;max-width:320px" />
      <select id="todoBand" style="padding:9px 13px;border-radius:10px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)">
        <option value="all">All priorities</option>
        <option value="high">High only</option>
        <option value="mid">Mid only</option>
        <option value="low">Low only</option>
      </select>
      ${ignored.length ? `<button id="todoRestore" class="btn btn-small">Restore ignored</button>` : ""}
    </div>
    <div id="todoList" class="mt"></div>
  `;

  const search = root.querySelector("#todoSearch");
  const bandSel = root.querySelector("#todoBand");
  const list = root.querySelector("#todoList");

  function draw() {
    const q = search.value.toLowerCase();
    const band = bandSel.value;
    const rows = ranked.filter((r) => {
      if (band !== "all" && r.band !== band) return false;
      if (q && !(r.task.title + " " + r.task.courseName).toLowerCase().includes(q)) return false;
      return true;
    }).map(({ task, course, score, band: b, reasons }) => `
      <tr data-id="${esc(task.id)}">
        <td style="width:34px"><input type="checkbox" class="todo-done" data-id="${esc(task.id)}" title="Mark done/ignore" /></td>
        <td>
          <div>${task.htmlUrl ? `<a href="${esc(task.htmlUrl)}" target="_blank" rel="noopener" style="color:var(--text);text-decoration:none"><b>${esc(task.title)}</b></a>` : `<b>${esc(task.title)}</b>`}
            <span class="tag ${bandClass(b)?.split(" ")[0]}">${b}</span> <span class="tag ${task.type === "exam" ? "tag-red" : "tag-blue"}">${task.type}</span></div>
          <div class="small muted">${esc(task.courseName || "")} · due ${fmtDate(task.dueAt)}</div>
        </td>
        <td style="width:150px"><div class="priority-bar"><div class="priority-fill ${band === "high" ? "p-high" : band === "mid" ? "p-mid" : "p-low"}" style="width:${score}%"></div></div><div class="small muted">${score}/100</div></td>
        <td class="small muted" style="max-width:260px">${reasons.map(esc).join(" · ")}</td>
        <td>${course ? `<span class="grade-pill ${course.currentScore >= (course.targetGrade || 93) ? "grade-high" : "grade-low"}">${course.currentScore != null ? Math.round(course.currentScore) + "%" : "—"}</span>` : ""}</td>
      </tr>`).join("");

    list.innerHTML = `
      <div class="card">
        ${rows ? `<div class="table-wrap"><table>
          <thead><tr><th></th><th>Assignment</th><th>Priority</th><th>Why</th><th>Grade now</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : `<p class="muted">All clear, or nothing matches the filter.</p>`}
      </div>`;
  }

  list.addEventListener("change", (e) => {
    const cb = e.target.closest(".todo-done");
    if (!cb) return;
    if (cb.checked) { ignored = [...new Set([...ignored, cb.dataset.id])]; saveIgnored(); }
    else { ignored = ignored.filter((i) => i !== cb.dataset.id); saveIgnored(); }
    draw();
  });

  const restore = root.querySelector("#todoRestore");
  restore?.addEventListener("click", () => { ignored = []; saveIgnored(); render(state, root); });

  search.addEventListener("input", draw);
  bandSel.addEventListener("change", draw);
  draw();
}