import { esc, toast, num } from "../utils.js";
import { settings, saveSettings, doneIds } from "../storage.js";
import { parseSyllabus, lateCredit } from "../syllabus.js";

const DEFAULT_W = { exam: 0.4, project: 0.22, quiz: 0.15, assignment: 0.12, participation: 0.08 };

function daysLate(t) {
  return Math.max(1, Math.ceil((Date.now() - +new Date(t.dueAt)) / 86400000));
}

function metric(t, s) {
  const syll = s.syllabus?.[t.courseId] || s.syllabus?._all || null;
  const weight = syll?.weights?.[t.type] != null
    ? syll.weights[t.type] / 100
    : (t.groupWeight != null ? t.groupWeight / 100 : DEFAULT_W[t.type] ?? 0.1);
  const { credit, note } = lateCredit(syll?.latePolicy || null, daysLate(t));
  const worth = (t.pointsPossible || 0) * credit;
  const mins = Math.max(t.baseMinutes || 10, 5);
  const impact = worth * weight;
  return { weight, credit, note, worth, mins, impact, score: impact / mins };
}

function fileText(file, cb) {
  const r = new FileReader();
  r.onload = () => cb(String(r.result || ""));
  r.onerror = () => cb("");
  r.readAsText(file);
}

function policyLine(p) {
  if (!p || !(p.note && p.note.length)) return "No late policy detected.";
  const bits = [];
  if (p.noLate) bits.push("no late work accepted");
  if (p.perDay) bits.push(`${p.perDay}% off per day`);
  if (p.flat) bits.push(`${p.flat}% flat penalty`);
  if (p.fullDays) bits.push(`full credit within ${p.fullDays} day(s)`);
  if (p.capMin) bits.push(`min ${p.capMin}%`);
  const line = bits.length ? bits.join(" · ") : (p.note[0] || "");
  return `📋 ${line}`;
}

export function render(state, root, isStale = () => false) {
  const s = settings();
  const courses = state.data?.courses || [];
  const courseNameById = new Map(courses.map((c) => [c.id, c.name]));
  const courseName = (id) => courseNameById.get(id) || "";
  const all = state.data?.tasks || [];
  const done = new Set(doneIds());
  const late = all.filter((t) =>
    !t.submitted && !done.has(t.id) && t.dueAt && (Date.now() - +new Date(t.dueAt)) > 0 && t.canvasId);

  const rows = late.map((t) => ({ t, m: metric(t, s) })).sort((a, b) => b.m.score - a.m.score);
  const potential = rows.reduce((n, r) => n + r.m.impact, 0);
  const top = rows[0];

  root.innerHTML = `
    <h1>Late Work Manager</h1>
    <p class="subtitle">Scores your overdue, unsubmitted work by how many weighted grade points each earns per minute, honoring your syllabus's late policy. Do the top of the list first.</p>

    <div class="grid grid-3">
      <div class="card"><div class="small muted">Overdue &amp; not submitted</div><div class="mini-num">${late.length}</div></div>
      <div class="card"><div class="small muted">Recoverable (weighted pts)</div><div class="mini-num">${num(potential)} <span class="small muted">pts</span></div></div>
      <div class="card"><div class="small muted">Do first</div><div class="mini-num" style="font-size:15px;line-height:1.35">${top ? esc(top.t.title) : "🎉 Nothing overdue!"}</div></div>
    </div>

    <div class="card mt">
      <div class="flex between">
        <h2 style="margin:0">Syllabus → weights &amp; late policy</h2>
        <span class="small muted">upload or paste, we read it for you</span>
      </div>
      <p class="small muted mt" style="margin:4px 0 0">Paste syllabus text or upload <b>.txt / .md / .html</b> (PDFs can't be read in-browser — paste the text from one instead).</p>
      <div class="field">
        <span>Apply syllabus to</span>
        <select id="syllCourse">
          <option value="_all">All courses</option>
          ${courses.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <span>Syllabus text</span>
        <textarea id="syllText" rows="5" placeholder="Paste the grading breakdown & late-work policy here, or choose a file below…" style="width:100%;padding:11px 13px;border-radius:11px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text);font-size:13px;resize:vertical"></textarea>
      </div>
      <div class="flex">
        <label for="syllFile" class="btn btn-ghost btn-small" style="display:inline-block;cursor:pointer">📂 Upload file</label>
        <input id="syllFile" type="file" accept=".txt,.md,.markdown,.htm,.html,.text,.rtf,.json" style="display:none" />
        <button id="syllParse" class="btn btn-primary btn-small">Read syllabus</button>
      </div>
      <div id="syllPreview" class="mt"></div>
    </div>

    <div id="lateBox" class="card mt"></div>
  `;

  const preview = root.querySelector("#syllPreview");
  const lateBox = root.querySelector("#lateBox");

  // File upload → loads text into the textarea, then parses.
  root.querySelector("#syllFile").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (/\.(pdf|docx?|xlsx?|pptx?)$/i.test(f.name)) {
      toast(f.name + ": can't read that type in-browser — paste its text instead.", "err");
      return;
    }
    fileText(f, (txt) => {
      root.querySelector("#syllText").value = txt;
      showParse(txt);
    });
  });

  root.querySelector("#syllText").addEventListener("input", (e) => showParseLazy(e.target.value));

  root.querySelector("#syllParse").addEventListener("click", () => showParse(root.querySelector("#syllText").value));

  let lastText = "";
  let timer = null;
  function showParseLazy(text) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (isStale()) return;
      showParse(text);
    }, 500);
  }

  function showParse(text) {
    text = text.trim();
    if (!text) { preview.innerHTML = ""; return; }
    if (text.trim() === lastText) return;
    lastText = text.trim();
    const parsed = parseSyllabus(text);
    const w = parsed.weights;
    const wChips = Object.keys(w).length
      ? Object.entries(w).map(([t, pct]) => `<span class="tag tag-blue">${t} ${pct}%</span>`).join(" ")
      : `<span class="tag tag-yellow">No % weights found</span>`;
    preview.innerHTML = `
      <div class="flex between" style="flex-wrap:wrap;gap:8px">
        <div class="flex" style="flex-wrap:wrap;gap:6px">${wChips}</div>
        <div class="small muted" style="flex:1;min-width:200px">${esc(policyLine(parsed.latePolicy))}</div>
        <button id="syllApply" class="btn btn-primary btn-small">Apply</button>
      </div>`;
    root.querySelector("#syllApply").addEventListener("click", () => {
      const key = root.querySelector("#syllCourse").value;
      s.syllabus[key] = parsed;
      saveSettings();
      toast(`Syllabus applied to ${key === "_all" ? "all courses" : courseName(+key) || "course"}.`);
      refresh();
    });
  }

  function refresh() {
    const rows2 = late.map((t) => ({ t, m: metric(t, s) })).sort((a, b) => b.m.score - a.m.score);
    const potential2 = rows2.reduce((n, r) => n + r.m.impact, 0);
    root.querySelectorAll(".mini-num")[1].innerHTML = `${num(potential2)} <span class="small muted">pts</span>`;
    drawLate(rows2);
  }

  function drawLate(rows2) {
    if (!rows2.length) {
      lateBox.innerHTML = `<div class="flex" style="justify-content:center;padding:30px"><b>🎉 Nothing to do — no overdue &amp; unsubmitted work.</b></div>`;
      return;
    }
    lateBox.innerHTML = `
      <div class="flex between" style="margin-bottom:6px">
        <h2 style="margin:0">Do these first (points per minute)</h2>
        <span class="small muted">impact = points × weight × late-credit ÷ minutes</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Task</th><th>Late</th><th>Credit</th><th>Worth</th><th>Impact</th><th style="width:150px">Priority</th></tr></thead>
        <tbody>
        ${rows2.map((r, i) => `
          <tr>
            <td><b>${i + 1}</b></td>
            <td><div><b>${esc(r.t.title)}</b></div><div class="small muted">${esc(r.t.courseName || courseName(r.t.courseId) || "")}</div></td>
            <td class="small muted">${daysLate(r.t)}d</td>
            <td><span class="tag ${r.m.credit >= 1 ? "tag-green" : r.m.credit > 0.5 ? "tag-yellow" : "tag-red"}">${Math.round(r.m.credit * 100)}%</span> <span class="small muted" title="${esc(r.m.note)}">${esc(r.m.note)}</span></td>
            <td class="small">${num(r.m.worth)} pts</td>
            <td class="small"><b>${num(r.m.impact)}</b> <span class="small muted">w.</span></td>
            <td><div class="priority-bar"><div class="priority-fill p-${i === 0 ? "high" : i < 3 ? "mid" : "low"}" style="width:${Math.min(100, Math.round(r.m.score * 6))}%"></div></div></td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
  }

  drawLate(rows);
}