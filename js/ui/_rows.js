import { fmtDate, num, esc, daysUntil } from "../utils.js";

export function rowHTML(t, done, opts = {}) {
  const due = daysUntil(t.dueAt);
  const overdue = due != null && due < 0;
  const courseLabel = opts.withCourse ? `<div class="small muted">${esc(t.courseName || "—")}</div>` : "";
  return `
    <tr class="${done.has(t.id) ? "done" : ""}">
      <td style="width:36px"><input type="checkbox" class="done-box" data-id="${esc(t.id)}" title="Mark done (saved on this device)" ${done.has(t.id) ? "checked" : ""} /></td>
      <td>
        <button class="task-open link-btn" data-id="${esc(t.id)}">${esc(t.title)}</button>
        ${courseLabel}
        <div class="small muted">${t.groupName ? ` · ${esc(t.groupName)}` : ""}${t.groupWeight != null ? ` · ${t.groupWeight}%` : ""}${t.pointsPossible ? ` · ${t.pointsPossible} pts` : ""}</div>
      </td>
      <td><span class="tag ${t.type === "exam" ? "tag-red" : t.type === "quiz" ? "tag-yellow" : t.type === "project" ? "tag-purple" : "tag-blue"}">${t.type}</span></td>
      <td class="muted">${fmtDate(t.dueAt)}${overdue ? " ⚠️" : ""}</td>
      ${opts.withMinutes ? `<td class="muted">${t.baseMinutes ? `~${t.baseMinutes} min` : "—"}</td>` : `<td>${t.pointsEarned != null ? `${num(t.pointsEarned)} / ${num(t.pointsPossible)}` : t.submitted ? "Submitted" : `<span class="tag tag-yellow">Open</span>`}</td>`}
    </tr>`;
}