import { fmtDate, num, esc, daysUntil } from "../utils.js";
import { settings } from "../storage.js";

export function render(state, root) {
  const { courses, tasks } = state.data;

  root.innerHTML = `
    <h1>Assignments</h1>
    <p class="subtitle">Every assignment across your classes with weights and due dates.</p>
    <div class="flex mt">
      <input id="asgSearch" class="search" placeholder="Search assignments…" style="padding:9px 13px;border-radius:10px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text);flex:1;max-width:380px" />
      <label class="flex small muted" style="white-space:nowrap">
        <input type="checkbox" id="asgHideDone" ${settings().filterSubmitted ? "checked" : ""} /> Hide submitted
      </label>
    </div>
    <div id="asgList" class="mt"></div>
  `;

  const q = root.querySelector("#asgSearch");
  const hide = root.querySelector("#asgHideDone");
  const list = root.querySelector("#asgList");

  function draw() {
    const term = q.value.toLowerCase();
    const caches = {};

    let rows = "";
    for (const c of courses) {
      const items = tasks
        .filter((t) => t.courseId === c.id)
        .sort((a, b) => (a.dueAt || "")?.localeCompare(b.dueAt || "") || (a.title || "").localeCompare(b.title || ""));
      if (!items.length) continue;
      const groupWeights = new Map();
      for (const t of items) groupWeights.set(t.groupName, t.groupWeight);

      const itemRows = items.filter((t) => {
        if (hide.checked && t.submitted) return false;
        if (term && !t.title.toLowerCase().includes(term) && !c.name.toLowerCase().includes(term)) return false;
        return true;
      }).map((t) => {
        const due = daysUntil(t.dueAt);
        const overdue = due != null && due < 0;
        return `
        <tr class="${t.submitted ? "done" : ""}">
          <td>
            <a href="${esc(t.htmlUrl)}" target="_blank" rel="noopener" style="color:var(--text);text-decoration:none">${esc(t.title)}</a>
            <div class="small muted">${esc(t.groupName || "—")}${t.groupWeight != null ? ` · ${t.groupWeight}%` : ""} ${t.pointsPossible ? `· ${t.pointsPossible} pts` : ""}</div>
          </td>
          <td><span class="tag ${t.type === "exam" ? "tag-red" : t.type === "quiz" ? "tag-yellow" : t.type === "project" ? "tag-purple" : "tag-blue"}">${t.type}</span></td>
          <td class="muted">${fmtDate(t.dueAt)}${overdue ? " ⚠️" : ""}</td>
          <td>${t.pointsEarned != null ? `${num(t.pointsEarned)} / ${num(t.pointsPossible)}` : t.submitted ? "Submitted" : `<span class="tag tag-yellow">Open</span>`}</td>
        </tr>`;
      }).join("");

      if (itemRows) {
        rows += `
          <div class="card mt">
            <div class="flex between">
              <h3>${esc(c.name)}</h3>
              <div class="small muted">${itemRows ? itemRows.split("<tr").length - 1 : 0} shown</div>
            </div>
            <div class="table-wrap"><table>
              <thead><tr><th>Assignment</th><th>Type</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>${itemRows}</tbody>
            </table></div>
          </div>`;
      }
    }
    list.innerHTML = rows || `<p class="muted">No assignments match.</p>`;
  }

  q.addEventListener("input", draw);
  hide.addEventListener("change", () => {
    settings().filterSubmitted = hide.checked;
    import("../storage.js").then((s) => s.saveSettings());
    draw();
  });
  draw();
}