import { esc, toast, daysUntil } from "../utils.js";
import { doneIds, setDone, markAllDone, clearDone } from "../storage.js";
import { rowHTML } from "./_rows.js";
import { openTask } from "./taskdetail.js";

function byDue(a, b) {
  return (a.dueAt || "9999")?.localeCompare(b.dueAt || "9999") || (a.title || "").localeCompare(b.title || "");
}

const HEAD = `<thead><tr><th></th><th>Test</th><th>Type</th><th>Due</th><th>Study time</th></tr></thead>`;

export function render(state, root) {
  const { courses, tasks, todos } = state.data;
  let done = new Set(doneIds());
  const all = [...tasks, ...todos.filter((t) => !tasks.some((x) => x.id === t.id))];
  const isTest = (t) => t.type === "exam" || t.type === "quiz";
  const tests = all.filter(isTest);

  const totalPrep = tests.reduce((a, t) => a + (t.baseMinutes || 0), 0);
  const openTests = tests.filter((t) => !t.submitted && !done.has(t.id));

  root.innerHTML = `
    <h1>Tests &amp; Quizzes</h1>
    <p class="subtitle">Exams and quizzes kept separate from homework, with study-time estimates. Click a title to open it right here.</p>
    <div class="flex mt">
      <input id="tsSearch" placeholder="Search…" style="padding:9px 13px;border-radius:10px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text);flex:1;max-width:300px" />
      <button id="tsMarkAll" class="btn btn-small">✓ Mark all open done</button>
      ${doneIds().length ? `<button id="tsClearDone" class="btn btn-small btn-ghost">Reset done ✓</button>` : ""}
    </div>
    <div id="tsList" class="mt"></div>
  `;

  const q = root.querySelector("#tsSearch");
  const list = root.querySelector("#tsList");

  function draw() {
    const term = q.value.toLowerCase();
    const passes = (t) => !term || `${t.title} ${t.courseName}`.toLowerCase().includes(term);
    const ddOf = new Map(tests.map((t) => [t.id, daysUntil(t.dueAt)]));
    const urgentSoon = (t) => (ddOf.get(t.id) ?? 99) <= 3;

    let courseHTML = "";
    for (const c of courses) {
      const inCourse = tests.filter((t) => t.courseId === c.id).sort(byDue);
      const active = inCourse.filter((t) => !t.submitted && !done.has(t.id));
      const completed = inCourse.filter((t) => t.submitted || done.has(t.id));
      const activeShown = active.filter(passes);
      const completedShown = completed.filter(passes);
      if (!activeShown.length && !completedShown.length) continue;

      const displayDone = new Set(done);
      for (const t of completed) if (t.submitted) displayDone.add(t.id);

      const prep = activeShown.reduce((a, t) => a + (t.baseMinutes || 0), 0);
      const urgent = activeShown.filter(urgentSoon).length;

      const doneFold = completedShown.length
        ? `<details class="done-collapse"${term ? " open" : ""}>
            <summary>Completed ✓ · ${completed.length}</summary>
            <div class="table-wrap"><table>
              ${HEAD}
              <tbody>${completedShown.map((t) => rowHTML(t, displayDone, { withMinutes: true })).join("")}</tbody>
            </table></div>
          </details>`
        : "";

      courseHTML += `
        <div class="card mt">
          <div class="flex between">
            <h3>${esc(c.name)}</h3>
            <div class="small muted">${urgent ? `${urgent} with 3d ⚠️ · ` : ""}${prep ? `${Math.round(prep / 30)}⅓ h` : ""} · ${completed.length} done</div>
          </div>
          <div class="table-wrap"><table>
            ${HEAD}
            <tbody>${activeShown.map((t) => rowHTML(t, done, { withMinutes: true })).join("")}</tbody>
          </table></div>
          ${doneFold}
        </div>`;
    }

    const summary = `
      <div class="grid grid-3 mt">
        <div class="card"><div class="small muted">Tests open</div><div class="stat"><b>${openTests.length}</b></div></div>
        <div class="card"><div class="small muted">Total study time</div><div class="stat"><b>${Math.round(totalPrep / 60 * 10) / 10}h</b></div></div>
        <div class="card"><div class="small muted">Due within 3 days</div><div class="stat"><b>${openTests.filter(urgentSoon).length}</b></div></div>
      </div>`;

    list.innerHTML = summary + (courseHTML || `<p class="muted">No tests on the calendar.</p>`);
  }

  q.addEventListener("input", draw);

  list.addEventListener("change", (e) => {
    const cb = e.target.closest(".done-box");
    if (!cb) return;
    done = new Set(setDone(cb.dataset.id, cb.checked));
    draw();
  });

  list.addEventListener("click", (e) => {
    const open = e.target.closest(".task-open");
    if (open) {
      const task = all.find((t) => t.id === open.dataset.id);
      if (task) openTask(task, state);
      return;
    }
    const clear = e.target.closest("#tsClearDone");
    if (clear) {
      clearDone();
      done = new Set();
      draw();
    }
  });

  root.querySelector("#tsMarkAll").addEventListener("click", () => {
    const openIds = tests.filter((t) => !t.submitted && !done.has(t.id)).map((t) => t.id);
    if (openIds.length) {
      done = new Set(markAllDone(openIds));
      toast(`${openIds.length} tests marked done.`, "ok");
      draw();
    } else {
      toast("Nothing open left to mark.", "");
    }
  });

  draw();
}