import { esc, fmtDate, pct, toast, daysUntil } from "../utils.js";
import { settings, saveSettings, doneIds, setDone, saveLocalTask } from "../storage.js";
import { generateSchedule } from "../schedule.js";
import { parseSyllabus } from "../syllabus.js";
import * as canvas from "../canvas.js";
import { openTask } from "./taskdetail.js";

const TABS = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "modules", label: "Modules", icon: "📚" },
  { id: "assignments", label: "Assignments", icon: "📝" },
  { id: "grades", label: "Grades", icon: "📊" },
  { id: "files", label: "Files", icon: "📁" },
];

function courseHeader(c) {
  const hasGrade = c.currentScore != null;
  const spread = hasGrade ? pct(c.currentScore) : "—";
  const delta = hasGrade ? Math.round((c.currentScore - c.targetGrade) * 10) / 10 : null;
  const deltaCls = delta == null ? "" : delta >= 0 ? "grade-high" : "grade-low";
  const fill = hasGrade ? Math.max(0, Math.min(100, c.currentScore)) : 0;
  const typeBadge = { ap: "tag-red", honors: "tag-yellow", regular: "tag-green" }[c.type] || "tag-blue";
  return `
    <header class="course-header">
      <div class="header-left">
        <button class="back-btn" id="backToCourses" aria-label="Back to courses">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
          <span>${esc(c.name)}</span>
        </button>
        <div class="course-badges">
          ${c.code ? `<span class="tag tag-blue">${esc(c.code)}</span>` : ""}
          <span class="tag ${typeBadge}">${c.type?.toUpperCase() || "REGULAR"}</span>
          ${c.term ? `<span class="tag tag-purple">${esc(c.term)}</span>` : ""}
        </div>
      </div>
      <div class="header-right">
        ${hasGrade ? `
          <div class="grade-summary">
            <div class="grade-ring" style="--score:${fill}" role="img" aria-label="Current grade ${spread}, target ${c.targetGrade}%">
              <div class="grade-ring-inner">
                <div class="grade-value">${spread}</div>
                <div class="grade-target">Target ${c.targetGrade}%</div>
              </div>
            </div>
            <div class="grade-delta ${deltaCls}">${delta >= 0 ? "+" : ""}${delta} vs target</div>
          </div>
        ` : `<div class="grade-empty"><span class="tag tag-blue">No grade yet</span></div>`}
      </div>
    </header>
  `;
}

function tabBar(activeTab) {
  return `
    <nav class="course-tabs" role="tablist" aria-label="Course sections">
      ${TABS.map((t) => `
        <button class="tab-btn ${t.id === activeTab ? "active" : ""}" 
                role="tab" 
                aria-selected="${t.id === activeTab}" 
                data-tab="${t.id}"
                aria-controls="${t.id}-panel">
          <span class="tab-icon">${t.icon}</span>
          <span class="tab-label">${t.label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

// Switch which course tab panel is visible. Used by the tab bar AND by
// "View all" quick links so browsing stays inside the course.
function switchCourseTab(root, tabId) {
  if (!TABS.some((t) => t.id === tabId)) return;
  root.querySelectorAll(".course-tabs .tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabId);
    b.setAttribute("aria-selected", b.dataset.tab === tabId);
  });
  root.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("hidden", p.id !== `${tabId}-panel`);
  });
}

function homePanel(course, tasks, done, anns, base) {
  const courseTasks = tasks.filter((t) => t.courseId === course.id);
  const open = courseTasks.filter((t) => !t.submitted && !done.has(t.id)).sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || ""));
  const dueSoon = open.filter((t) => t.dueAt && daysUntil(t.dueAt) !== null && daysUntil(t.dueAt) <= 7).slice(0, 5);
  const overdue = open.filter((t) => t.dueAt && new Date(t.dueAt) < new Date() && !t.submitted && !done.has(t.id)).slice(0, 5);
  const courseAnns = (anns || []).filter((a) => a.context_code === `course_${course.id}`).slice(0, 3);

  return `
    <div class="tab-panel" id="home-panel" role="tabpanel">
      ${dueSoon.length || overdue.length ? `
        <section class="panel-section">
          <div class="section-head">
            <h2>Upcoming</h2>
            <a class="btn btn-ghost btn-small" data-goto="assignments">View all</a>
          </div>
          <div class="task-list">
            ${overdue.map((t) => taskRow(t, done, true)).join("")}
            ${dueSoon.map((t) => taskRow(t, done, false)).join("")}
            ${!overdue.length && !dueSoon.length ? `<p class="muted">Nothing due soon.</p>` : ""}
          </div>
        </section>
      ` : `<section class="panel-section"><p class="muted">No upcoming work.</p></section>`}

      ${courseAnns.length ? `
        <section class="panel-section">
          <div class="section-head">
            <h2>Recent Announcements</h2>
            <a class="btn btn-ghost btn-small" data-goto="announcements">View all</a>
          </div>
          <div class="ann-list">
            ${courseAnns.map((a) => {
              const read = (a.read_state || "read") === "read";
              const date = a.posted_at ? fmtDate(a.posted_at.split("T")[0]) : "";
              return `
                <article class="ann-item ${read ? "read" : ""}" data-id="${esc(a.id)}">
                  <header class="ann-header">
                    <span class="ann-dot" aria-label="${read ? "Read" : "Unread"}"></span>
                    <div class="ann-title-block">
                      <h4 class="ann-title">${esc(a.title || "Untitled")}</h4>
                      <div class="ann-meta">${date}</div>
                    </div>
                  </header>
                  <div class="ann-body small muted">${esc((a.message || "").replace(/<[^>]+>/g, "")).slice(0, 150)}</div>
                  <footer class="ann-footer">
                    <button class="btn btn-ghost btn-small ann-read" ${read ? "disabled" : ""} data-cid="${course.id}" data-aid="${esc(a.id)}">${read ? "✓ Read" : "Mark read"}</button>
                  </footer>
                </article>
              `;
            }).join("")}
          </div>
        </section>
      ` : ""}

      <section class="panel-section">
        <div class="section-head"><h2>Quick Actions</h2></div>
        <div class="quick-actions">
          <button class="btn btn-primary add-assignment" data-course="${course.id}"><span>+</span> Add Assignment</button>
          <button class="btn btn-primary add-test" data-course="${course.id}"><span>+</span> Add Test/Quiz</button>
          <button class="btn btn-ghost open-syllabus" data-course="${course.id}">View/Edit Syllabus</button>
        </div>
      </section>
    </div>
  `;
}

function taskRow(t, doneSet, isOverdue) {
  const due = t.dueAt ? fmtDate(t.dueAt) : "No due date";
  const overdue = isOverdue || (t.dueAt && new Date(t.dueAt) < new Date() && !t.submitted && !doneSet.has(t.id));
  const typeTag = { exam: "tag-red", quiz: "tag-yellow", project: "tag-purple", assignment: "tag-blue" }[t.type] || "tag-blue";
  return `
    <div class="task-row ${overdue ? "overdue" : ""}" data-id="${esc(t.id)}">
      <input type="checkbox" class="done-box" ${doneSet.has(t.id) ? "checked" : ""} title="${doneSet.has(t.id) ? "Un-mark done" : "Mark done"}" aria-label="${doneSet.has(t.id) ? "Un-mark done" : "Mark done"}">
      <div class="task-info">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          <span class="tag ${typeTag}">${t.type}</span>
          <span class="due ${overdue ? "overdue" : ""}">${esc(due)}${overdue ? " · OVERDUE" : ""}</span>
          ${t.pointsPossible ? `<span class="points">${t.pointsPossible} pts</span>` : ""}
        </div>
      </div>
      <button class="btn btn-ghost btn-small task-open" aria-label="Open ${esc(t.title)}">Open</button>
    </div>
  `;
}

function assignmentsPanel(course, tasks, done, isStale) {
  const courseTasks = tasks.filter((t) => t.courseId === course.id);
  const open = courseTasks.filter((t) => !t.submitted && !done.has(t.id)).sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || ""));
  const completed = courseTasks.filter((t) => t.submitted || done.has(t.id)).sort((a, b) => (b.dueAt || "").localeCompare(a.dueAt || ""));

  const openHtml = open.length ? open.map((t) => taskRow(t, done, false)).join("") : `<p class="muted">No open assignments.</p>`;
  const doneHtml = completed.length ? completed.map((t) => {
    const due = t.dueAt ? fmtDate(t.dueAt) : "No due date";
    const typeTag = { exam: "tag-red", quiz: "tag-yellow", project: "tag-purple", assignment: "tag-blue" }[t.type] || "tag-blue";
    return `
      <div class="task-row done" data-id="${esc(t.id)}">
        <input type="checkbox" class="done-box" checked title="Un-mark done" aria-label="Un-mark done">
        <div class="task-info">
          <div class="task-title">${esc(t.title)}</div>
          <div class="task-meta">
            <span class="tag ${typeTag}">${t.type}</span>
            <span class="due">${esc(due)}</span>
            ${t.pointsPossible ? `<span class="points">${t.pointsPossible} pts</span>` : ""}
            ${t.submitted ? `<span class="tag tag-green">Submitted</span>` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("") : "";

  return `
    <div class="tab-panel" id="assignments-panel" role="tabpanel">
      <div class="panel-toolbar">
        <h2>Assignments</h2>
        <div class="toolbar-actions">
          <label class="check"><input type="checkbox" id="showCompleted" ${done.size ? "" : "checked"}> Show completed</label>
          <button class="btn btn-primary add-assignment" data-course="${course.id}"><span>+</span> Add</button>
        </div>
      </div>
      <div class="task-list" id="openTasks">${openHtml}</div>
      ${doneHtml ? `<details class="done-fold" id="completedFold"><summary>Completed (${completed.length})</summary><div class="task-list">${doneHtml}</div></details>` : ""}
    </div>
  `;
}

// Standard letter cutoffs, used only for the projected "what-if" letter.
function letterFromPct(p) {
  if (p == null || Number.isNaN(p)) return null;
  if (p >= 93) return "A";
  if (p >= 90) return "A-";
  if (p >= 87) return "B+";
  if (p >= 83) return "B";
  if (p >= 80) return "B-";
  if (p >= 77) return "C+";
  if (p >= 73) return "C";
  if (p >= 70) return "C-";
  if (p >= 67) return "D+";
  if (p >= 63) return "D";
  if (p >= 60) return "D-";
  return "F";
}

// Effective points-earned view for a task under what-if overrides:
// explicit override wins, else the real grade if present, else null (excluded).
function effectiveEarned(t, whatIf) {
  const w = whatIf[t.id];
  if (w != null) return Math.max(0, +w || 0);
  if (t.pointsEarned != null) return Math.max(0, t.pointsEarned || 0);
  return null;
}

function projectedTotal(courseTasks, whatIf) {
  let earned = 0, possible = 0, included = 0, excluded = 0;
  for (const t of courseTasks) {
    const p = t.pointsPossible || 0;
    if (!p) continue;
    const e = effectiveEarned(t, whatIf);
    if (e == null) { excluded++; continue; }
    earned += e;
    possible += p;
    included++;
  }
  return {
    pct: possible > 0 ? Math.round((earned / possible) * 1000) / 10 : null,
    earned, possible, included, excluded,
  };
}

const TYPE_LABEL = { assignment: "Assignments", quiz: "Quizzes", exam: "Tests/Exams", project: "Projects", participation: "Participation" };

function weightSourceFor(courseId, courseTasks, s) {
  const syll = s.syllabus?.[courseId] || s.syllabus?._all || null;
  const mode = syll?.mode || "auto";
  const canvas = courseTasks.some((t) => t.groupWeight != null);
  const sy = syll?.weights || {};
  const hasSyll = Object.values(sy).some((v) => v != null);
  const useCanvas = mode === "canvas" || (mode === "auto" && canvas);
  const useSyllabus = mode === "syllabus" || (mode === "auto" && !canvas);
  return { mode, useCanvas, useSyllabus, canvas, hasSyll, syll };
}

function weightOf(t, src) {
  if (src.useCanvas && t.groupWeight != null) return t.groupWeight;
  if (src.useSyllabus && src.syll?.weights?.[t.type] != null) return src.syll.weights[t.type];
  return null;
}

function bucketOf(t, src) {
  if (src.useCanvas && t.groupWeight != null) return t.groupName || "Other";
  if (src.useSyllabus) return TYPE_LABEL[t.type] || "Other";
  return t.groupName || "Other";
}

function methodLabel(src) {
  if (src.useCanvas && src.canvas) return "Canvas assignment groups";
  if (src.useSyllabus && src.hasSyll) return "Syllabus weights";
  return "Point totals (no category weights)";
}

// Weighted projected grade: each category's % weighted by its category weight.
// Returns { pct, buckets, count, excluded }.
function weightedProjected(courseTasks, whatIf, src) {
  const buckets = new Map();
  let excluded = 0;
  for (const t of courseTasks) {
    const p = t.pointsPossible || 0;
    if (!p) continue;
    const e = effectiveEarned(t, whatIf);
    if (e == null) { excluded++; continue; }
    const key = bucketOf(t, src);
    if (!buckets.has(key)) buckets.set(key, { w: weightOf(t, src), earned: 0, possible: 0 });
    const b = buckets.get(key);
    b.earned += e;
    b.possible += p;
  }
  let num = 0, den = 0, count = 0;
  for (const b of buckets.values()) {
    if (b.w == null || !b.possible) continue;
    const pct = (b.earned / b.possible) * 100;
    num += pct * b.w;
    den += b.w;
    count++;
  }
  return count ? { pct: Math.round((num / den) * 10) / 10, buckets, count, excluded } : { pct: null, buckets, count, excluded };
}

function gradesPanel(course, tasks, whatIf) {
  const courseTasks = tasks.filter((t) => t.courseId === course.id);
  const sorted = [...courseTasks].sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || ""));
  const actualTasks = courseTasks.filter((t) => t.pointsEarned != null && t.pointsPossible > 0);
  const actualPct = (() => {
    const poss = actualTasks.reduce((s, t) => s + (t.pointsPossible || 0), 0);
    return poss > 0 ? Math.round((actualTasks.reduce((s, t) => s + (t.pointsEarned || 0), 0) / poss) * 1000) / 10 : null;
  })();
  const src = weightSourceFor(course.id, courseTasks, settings());
  const wproj = weightedProjected(courseTasks, whatIf, src);
  const proj = projectedTotal(courseTasks, whatIf);
  const headPct = wproj.pct ?? proj.pct;
  const method = methodLabel(src);
  const target = course.targetGrade || 93;
  const fill = Math.max(0, Math.min(100, headPct || 0));
  const delta = headPct != null ? Math.round((headPct - target) * 10) / 10 : null;
  const deltaCls = delta == null ? "" : delta >= 0 ? "grade-high" : "grade-low";

  const rows = sorted.map((t) => {
    const gradedRow = t.pointsEarned != null;
    const possible = t.pointsPossible || 0;
    const actual = gradedRow ? t.pointsEarned : null;
    const w = weightOf(t, src);
    const override = whatIf[t.id];
    const value = override != null ? override : (actual != null ? actual : "");
    return `
      <tr class="${gradedRow ? "" : "gwi-ungraded"}">
        <td><b>${esc(t.title)}</b> ${t.submitted && !gradedRow ? `<span class="tag tag-yellow small">Submitted</span>` : ""}</td>
        <td class="small muted">${esc(t.groupName || (t.type === "exam" ? "Test" : "Assignment"))}${w != null ? `<span class="small tag tag-blue">${w}%</span>` : ""}</td>
        <td>${possible ? possible : "—"}</td>
        <td>${actual != null ? `${actual} <span class="small muted">/ ${possible}</span>` : '<span class="small muted">Not graded</span>'}</td>
        <td><input class="gwi-input" type="number" min="0" max="${possible || ""}" step="any" inputmode="decimal"
              data-id="${esc(t.id)}" data-possible="${possible || ""}" data-actual="${actual ?? ""}"
              value="${value}" placeholder="${gradedRow ? "override" : "what if…"}" aria-label="What-if grade for ${esc(t.title)}"></td>
      </tr>`;
  }).join("");

  const groupRows = (() => {
    if (!wproj.buckets.size) return "";
    return [...wproj.buckets.entries()].map(([name, g]) => `
      <tr>
        <td>${esc(name)}</td>
        <td>${g.w != null ? g.w + "%" : "—"}</td>
        <td>${Math.round(g.earned * 100) / 100}</td>
        <td>${g.possible}</td>
        <td>${g.w != null ? Math.round((g.earned / g.possible) * 1000) / 10 + "%" : "—"}</td>
        <td>${g.w != null ? Math.round((g.earned / g.possible || 0) * g.w * 10) / 10 : "—"}</td>
      </tr>`).join("");
  })();

  const excludedNote = (wproj.excluded || proj.excluded) ? `Excludes ${wproj.excluded || proj.excluded} ungraded (enter points to include)` : "";

  return `
    <div class="tab-panel" id="grades-panel" role="tabpanel">
      <div class="panel-toolbar">
        <h2>Grades — what-if calculator</h2>
        <div class="toolbar-actions">
          <button class="btn btn-ghost btn-small" id="openWeights" data-open-syllabus="${course.id}">Edit weights</button>
          <span class="small muted" id="gwiStatus">${excludedNote}</span>
          <button class="btn btn-ghost btn-small" id="resetWhatIf">Reset</button>
        </div>
      </div>

      <div class="grade-overview">
        <div class="grade-card">
          <div class="grade-ring large" id="gwiRing" style="--score:${fill}" role="img" aria-label="Projected grade">
            <div class="grade-ring-inner">
              <div class="grade-value" id="gwiPct">${headPct != null ? headPct + "%" : "—"}</div>
              <div class="grade-target">Projected</div>
            </div>
          </div>
          <div class="grade-details">
            <div id="gwiLetter">Letter ${esc(letterFromPct(headPct) || "—")}</div>
            <div>Actual: ${actualPct != null ? actualPct + "%" : "—"}</div>
            <div id="gwiDelta" class="${deltaCls}">${delta != null ? (delta >= 0 ? "✓ +" + delta : "⚠ " + delta) + " vs " + target + "% target" : "No graded work yet"}</div>
          </div>
          <span class="small muted">${wproj.count >= 2 ? "Weighted across " + wproj.count + " categories" : "Point-based projected grade"}</span>
        </div>
        <div class="grade-breakdown">
          <h3>By Category <span class="small muted">· ${esc(method)}</span></h3>
          ${wproj.buckets.size ? `
          <table class="grade-table">
            <thead><tr><th>Category</th><th>Weight</th><th>Earned</th><th>Possible</th><th>%</th><th>Contrib.</th></tr></thead>
            <tbody id="gwiGroups">${groupRows}</tbody>
          </table>` : `<p class="small muted">No graded category data yet.</p>`}
          ${!src.canvas && !src.useSyllabus ? `
          <p class="small muted">No category weights on Canvas for this course. Paste your syllabus in <b>Edit weights</b> — or it may just be a flat point-based class.</p>` : ""}
        </div>
      </div>

      <div class="card">
        <div class="small muted mb">Type points into the last column for any assignment — graded or not — to test how the course grade changes. Blank = fall back to the real grade (or leave ungraded out).</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Assignment</th><th>Group</th><th>Possible</th><th>Earned</th><th>What-if points</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
    </div>
  `;
}

function modulesPanel(course, tasks) {
  const courseTasks = tasks.filter((t) => t.courseId === course.id);
  const byGroup = {};
  courseTasks.forEach((t) => {
    const g = t.groupName || "Ungrouped";
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(t);
  });

  return `
    <div class="tab-panel" id="modules-panel" role="tabpanel">
      ${Object.entries(byGroup).length ? `
        ${Object.entries(byGroup).map(([name, items]) => `
          <section class="module-section">
            <div class="module-header">
              <h3>${esc(name)}</h3>
              <span class="badge">${items.length} items</span>
            </div>
            <div class="module-items">
              ${items.sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || "")).map((t) => `
                <div class="module-item ${t.type}" data-id="${esc(t.id)}">
                  <span class="module-icon">${t.type === "exam" ? "📝" : t.type === "quiz" ? "❓" : t.type === "project" ? "📂" : "📄"}</span>
                  <div class="module-info">
                    <div class="module-title">${esc(t.title)}</div>
                    <div class="module-meta">
                      <span class="tag ${t.type === "exam" ? "tag-red" : t.type === "quiz" ? "tag-yellow" : t.type === "project" ? "tag-purple" : "tag-blue"}">${t.type}</span>
                      ${t.dueAt ? `<span class="due">${esc(fmtDate(t.dueAt))}</span>` : ""}
                      ${t.pointsPossible ? `<span class="points">${t.pointsPossible} pts</span>` : ""}
                    </div>
                  </div>
                  <button class="btn btn-ghost btn-small module-open">Open</button>
                </div>
              `).join("")}
            </div>
          </section>
        `).join("")}
      ` : `<p class="muted">No modules found for this course.</p>`}
    </div>
  `;
}

function filesPanel(course, files) {
  const courseFiles = (files || []).filter((f) => f._courseId === course.id).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  if (!courseFiles.length) return `<div class="tab-panel" id="files-panel" role="tabpanel"><p class="muted">No files found for this course.</p></div>`;

  return `
    <div class="tab-panel" id="files-panel" role="tabpanel">
      <div class="file-grid">
        ${courseFiles.map((f) => {
          const k = kindFor(f);
          return `
            <article class="file-card" data-id="${esc(f.id)}" data-course="${course.id}">
              <div class="file-icon">${k.icon}</div>
              <div class="file-name">${esc(f.display_name || f.filename)}</div>
              <div class="file-meta"><span class="tag ${k.cls}">${k.tag}</span> ${f.size ? fmtSize(f.size) : ""}</div>
            </article>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function kindFor(f) {
  const ct = (f.content_type || "").toLowerCase();
  if (f.mime_class === "image" || ct.startsWith("image/")) return { icon: "🖼", tag: "Image", cls: "tag-purple" };
  if (f.mime_class === "audio") return { icon: "🎵", tag: "Audio", cls: "tag-blue" };
  if (f.mime_class === "video") return { icon: "🎬", tag: "Video", cls: "tag-blue" };
  if (ct.includes("pdf")) return { icon: "📕", tag: "PDF", cls: "tag-red" };
  if (ct.includes("word") || ct.includes("document") || /\b(docx?|odt)\b/.test(f.filename || "")) return { icon: "📘", tag: "Doc", cls: "tag-blue" };
  if (ct.includes("sheet") || ct.includes("excel") || /\b(xlsx?|ods|csv)\b/.test(f.filename || "")) return { icon: "📊", tag: "Sheet", cls: "tag-green" };
  if (ct.includes("presentation") || ct.includes("powerpoint") || /\b(pptx?|odp)\b/.test(f.filename || "")) return { icon: "📽", tag: "Slides", cls: "tag-yellow" };
  if (/\b(zip|gzip|rar)\b/.test(ct) || /\b(?:zip|rar|7z|tar|gz)\b/.test(f.filename || "")) return { icon: "🗜", tag: "Archive", cls: "tag-green" };
  if (ct.includes("text") || /\b(txt|md|rtf)\b/.test(f.filename || "")) return { icon: "📄", tag: "Text", cls: "tag-blue" };
  return { icon: "📁", tag: (ct.split("/")[1] || "File").toUpperCase(), cls: "tag-blue" };
}

function fmtSize(n) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function loadCourseData(courseId) {
  let anns = [], files = [], modules = [];
  try { anns = await canvas.getAnnouncements([`course_${courseId}`]); } catch { anns = []; }
  try {
    const fileRes = await canvas.getCourseFiles(courseId);
    files = (fileRes || []).map((f) => ({ ...f, _courseId: courseId }));
  } catch { files = []; }
  try {
    const modRes = await canvas.getModuleFiles(courseId);
    modules = modRes || [];
  } catch { modules = []; }
  return { anns, files, modules };
}

export async function render(state, root, isStale) {
  const courseId = state.ui?.courseDetailId;
  const activeTab = state.ui?.courseDetailTab || "home";

  if (!courseId) {
    root.innerHTML = `<div class="card"><h2>No course selected</h2><p class="muted">Click a course from the Dashboard.</p></div>`;
    return;
  }

  const course = state.data?.courses?.find((c) => c.id === courseId);
  if (!course) {
    root.innerHTML = `<div class="card"><h2>Course not found</h2></div>`;
    return;
  }

  const tasks = state.data?.tasks || [];
  const todos = state.data?.todos || [];
  const allTasks = [...tasks, ...todos.filter((t) => !tasks.some((x) => x.id === t.id))];
  const done = new Set(doneIds());

  // Initial render with loading panels
  root.innerHTML = `
    <div class="course-detail">
      ${courseHeader(course)}
      ${tabBar(activeTab)}
      <main class="course-main">
        <div class="tab-panel loading" id="home-panel" role="tabpanel"><div class="loading-inline">Loading…</div></div>
        <div class="tab-panel hidden" id="modules-panel" role="tabpanel"></div>
        <div class="tab-panel hidden" id="assignments-panel" role="tabpanel"></div>
        <div class="tab-panel hidden" id="grades-panel" role="tabpanel"></div>
        <div class="tab-panel hidden" id="files-panel" role="tabpanel"></div>
      </main>
    </div>
  `;

  // Back button
  root.querySelector("#backToCourses").addEventListener("click", () => {
    state.ui = state.ui || {};
    delete state.ui.courseDetailId;
    delete state.ui.courseDetailTab;
    state.tab = "dashboard";
    window.dispatchEvent(new CustomEvent("tab-change", { detail: { tab: "dashboard" } }));
  });

  // Tab switching
  root.querySelectorAll(".course-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.ui.courseDetailTab = btn.dataset.tab;
      switchCourseTab(root, btn.dataset.tab);
    });
  });

  // "View all" quick links: course tabs stay in-course, global tabs navigate.
  root.querySelectorAll("[data-goto]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const goto = a.dataset.goto;
      if (TABS.some((t) => t.id === goto)) {
        state.ui.courseDetailTab = goto;
        switchCourseTab(root, goto);
      } else {
        document.querySelector(`.sidebar .tab-btn[data-tab="${goto}"]`)?.click();
      }
    });
  });

  // Load data and render panels
  const { anns, files } = await loadCourseData(courseId);
  if (isStale()) return;

  const whatIf = state.ui?.whatIf?.[course.id] || {};

  // Render all panels
  root.querySelector("#home-panel").innerHTML = homePanel(course, allTasks, done, anns, settings().canvasBaseUrl || "");
  root.querySelector("#assignments-panel").innerHTML = assignmentsPanel(course, allTasks, done, isStale);
  root.querySelector("#grades-panel").innerHTML = gradesPanel(course, allTasks, whatIf);
  root.querySelector("#modules-panel").innerHTML = modulesPanel(course, allTasks);
  root.querySelector("#files-panel").innerHTML = filesPanel(course, files);

  // Shared handlers for all panels
  attachSharedHandlers(root, state, course, allTasks, done, isStale);
}

function attachSharedHandlers(root, state, course, allTasks, done, isStale) {
  // Task checkboxes
  root.querySelectorAll(".done-box").forEach((cb) => {
    cb.addEventListener("change", () => {
      const row = cb.closest(".task-row, .module-item");
      if (!row) return;
      const id = row.dataset.id;
      setDone(id, cb.checked);
      row.classList.toggle("done", cb.checked);
      row.classList.toggle("overdue", cb.checked === false && row.classList.contains("overdue"));
    });
  });

  // Task/module open buttons
  root.querySelectorAll(".task-open, .module-open").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".task-row, .module-item");
      if (!row) return;
      const task = allTasks.find((t) => t.id === row.dataset.id);
      if (task) openTask(task, { ...state, data: { ...state.data, tasks: allTasks } });
    });
  });

  // Announcement mark-read
  root.querySelectorAll(".ann-read").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cid = +btn.dataset.cid;
      const aid = btn.dataset.aid;
      try {
        await canvas.markAnnouncementRead(cid, aid);
        btn.disabled = true;
        btn.textContent = "✓ Read";
        btn.closest(".ann-item").classList.add("read");
        toast("Marked as read.");
      } catch (e) {
        toast("Couldn't mark read: " + e.message, "err");
      }
    });
  });

  // Add assignment/test
  root.querySelectorAll(".add-assignment").forEach((btn) => {
    btn.addEventListener("click", () => openAddAssignmentModal(+btn.dataset.course, { ...state, data: { ...state.data, tasks: allTasks } }, false));
  });
  root.querySelectorAll(".add-test").forEach((btn) => {
    btn.addEventListener("click", () => openAddAssignmentModal(+btn.dataset.course, { ...state, data: { ...state.data, tasks: allTasks } }, true));
  });
  root.querySelector(".open-syllabus")?.addEventListener("click", () => openSyllabusModal(course, state));
  root.querySelectorAll("[data-open-syllabus]").forEach((btn) => btn.addEventListener("click", () => openSyllabusModal(course, state)));

  // What-if grade calculator on the Grades tab
  const gwi = root.querySelector("#grades-panel");
  if (gwi) {
    const recalc = () => {
      const whatIf = {};
      gwi.querySelectorAll(".gwi-input").forEach((inp) => {
        if (inp.value.trim() === "") return;
        let v = +inp.value;
        if (Number.isNaN(v)) return;
        const max = +inp.dataset.possible;
        if (Number.isFinite(max) && max > 0) v = Math.min(v, max);
        whatIf[inp.dataset.id] = Math.max(0, v);
      });
      state.ui.whatIf = state.ui.whatIf || {};
      state.ui.whatIf[course.id] = whatIf;

      const courseTasks = allTasks.filter((t) => t.courseId === course.id);
      const src = weightSourceFor(course.id, courseTasks, settings());
      const wproj = weightedProjected(courseTasks, whatIf, src);
      const proj = projectedTotal(courseTasks, whatIf);
      const headPct = wproj.pct ?? proj.pct;
      const target = course.targetGrade || 93;
      const delta = headPct != null ? Math.round((headPct - target) * 10) / 10 : null;
      const ring = gwi.querySelector("#gwiRing");
      const pctEl = gwi.querySelector("#gwiPct");
      const letterEl = gwi.querySelector("#gwiLetter");
      const deltaEl = gwi.querySelector("#gwiDelta");
      const statusEl = gwi.querySelector("#gwiStatus");

      if (ring) ring.style.setProperty("--score", Math.max(0, Math.min(100, headPct || 0)));
      if (pctEl) pctEl.textContent = headPct != null ? headPct + "%" : "—";
      if (letterEl) letterEl.textContent = "Letter " + (letterFromPct(headPct) || "—");
      if (deltaEl) {
        deltaEl.textContent = delta != null ? (delta >= 0 ? "✓ +" + delta : "⚠ " + delta) + " vs " + target + "% target" : "No graded work yet";
        deltaEl.className = delta == null ? "" : delta >= 0 ? "grade-high" : "grade-low";
      }
      const excl = wproj.excluded || proj.excluded;
      if (statusEl) statusEl.textContent = excl ? `Excludes ${excl} ungraded (enter points to include)` : "";

      // Rebuild the category table (weighted)
      const tbody = gwi.querySelector("#gwiGroups");
      if (tbody) {
        tbody.innerHTML = [...wproj.buckets.entries()].map(([name, g]) => `
          <tr>
            <td>${esc(name)}</td>
            <td>${g.w != null ? g.w + "%" : "—"}</td>
            <td>${Math.round(g.earned * 100) / 100}</td>
            <td>${g.possible}</td>
            <td>${g.w != null ? Math.round((g.earned / g.possible) * 1000) / 10 + "%" : "—"}</td>
            <td>${g.w != null ? Math.round((g.earned / g.possible || 0) * g.w * 10) / 10 : "—"}</td>
          </tr>`).join("");
      }
    };

    gwi.querySelectorAll(".gwi-input").forEach((inp) => inp.addEventListener("input", recalc));
    gwi.querySelector("#resetWhatIf")?.addEventListener("click", () => {
      state.ui.whatIf = state.ui.whatIf || {};
      delete state.ui.whatIf[course.id];
      gwi.querySelectorAll(".gwi-input").forEach((inp) => {
        inp.value = inp.dataset.actual || "";
      });
      recalc();
    });
  }
}

function openAddAssignmentModal(courseId, state, isTest) {
  const course = state.data?.courses?.find((c) => c.id === courseId);
  if (!course) return;

  const types = isTest ? ["exam", "quiz"] : ["assignment", "project", "quiz", "homework"];
  const wrap = document.createElement("div");
  wrap.className = "modal-overlay";
  wrap.innerHTML = `
    <div class="modal modal-wide add-task-modal">
      <div class="modal-head">
        <div>
          <h2>${isTest ? "Add Test / Quiz" : "Add Assignment"}</h2>
          <div class="small muted">for ${esc(course.name)}</div>
        </div>
        <button class="btn btn-small btn-ghost" data-close>✕</button>
      </div>
      <form id="addTaskForm">
        <div class="add-grid">
          <label class="field add-full"><span>Title</span>
            <input name="title" required autofocus placeholder="e.g. Chapter 3 Homework">
          </label>
          <label class="field"><span>Type</span>
            <select name="type">${types.map((t) => `<option value="${t}" ${t === (isTest ? "exam" : "assignment") ? "selected" : ""}>${t}</option>`).join("")}</select>
          </label>
          <label class="field"><span>Points possible</span>
            <input name="points" type="number" min="0" step="any" value="10">
          </label>
          <label class="field add-full"><span>Due date &amp; time <span class="muted small">(optional)</span></span>
            <input name="dueAt" type="datetime-local">
          </label>
          <label class="field add-full"><span>Description <span class="muted small">(optional)</span></span>
            <textarea name="desc" rows="3" placeholder="Optional details…"></textarea>
          </label>
        </div>
        <p class="small muted add-note"><b>Stored on this device</b> — appears in Assignments, To-Do and Study like any Canvas task, and survives refreshes. If it's a real class assignment, add it on Canvas and sync instead.</p>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">Create</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.remove("hidden"));

  const close = () => { wrap.classList.add("hidden"); setTimeout(() => wrap.remove(), 200); };
  wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });

  wrap.querySelector("#addTaskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const task = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      canvasId: null,
      courseId,
      courseName: course.name,
      courseCode: course.code,
      title: fd.get("title").trim(),
      type: fd.get("type"),
      dueAt: fd.get("dueAt") || null,
      pointsPossible: +fd.get("points") || 0,
      pointsEarned: null,
      submitted: false,
      needsGrading: false,
      htmlUrl: null,
      groupId: null,
      groupName: isTest ? "Tests & Quizzes" : "Assignments",
      groupWeight: null,
      lockExplanation: null,
      locked: false,
      baseMinutes: Math.round((+fd.get("points") || 0) * settings().baseMinutesPerPoint),
      difficultyOverride: null,
      description: fd.get("desc").trim() || null,
      isLocal: true,
    };
    state.data.tasks.push(task);
    saveLocalTask(task);
    const root = document.getElementById("mainContent");
    if (state.ui?.courseDetailId === courseId) render(state, root, () => false);
    close();
    toast(`Created ${isTest ? "test" : "assignment"} — stored locally.`);
  });
}

function openSyllabusModal(course, state) {
  const s = settings();
  const syll = s.syllabus?.[course.id] || s.syllabus?._all || { mode: "auto", weights: {}, latePolicy: null, raw: "" };
  const courseTasks = (state.data?.tasks || []).filter((t) => t.courseId === course.id);
  const canvasWeights = [...new Map(courseTasks.filter((t) => t.groupWeight != null).map((t) => [t.groupName, t.groupWeight])).entries()]
    .sort((a, b) => (b[1] || 0) - (a[1] || 0));
  const wrap = document.createElement("div");
  wrap.className = "modal-overlay";
  wrap.innerHTML = `
    <div class="modal modal-wide">
      <div class="modal-head"><h2>Syllabus: ${esc(course.name)}</h2><button class="btn btn-small btn-ghost" data-close>✕</button></div>
      <div class="modal-body">
        <p class="small muted">Canvas already sends category weights with each assignment — the app uses them automatically, no syllabus needed. Paste a syllabus to override the categories with your own weights.</p>

        <div class="field"><span>Weight source</span>
          <select id="syllMode">
            <option value="auto" ${(syll.mode || "auto") === "auto" ? "selected" : ""}>Auto — Canvas groups, else syllabus</option>
            <option value="canvas" ${syll.mode === "canvas" ? "selected" : ""}>Canvas groups only</option>
            <option value="syllabus" ${syll.mode === "syllabus" ? "selected" : ""}>Syllabus (type-based) only</option>
            <option value="off" ${syll.mode === "off" ? "selected" : ""}>Off — plain point totals</option>
          </select>
        </div>

        ${canvasWeights.length ? `
        <div class="field"><span>Pulled off Canvas right now</span>
          <div class="canvas-weights">
            ${canvasWeights.map(([name, w]) => `<span class="tag tag-blue">${esc(name)} · ${w}%</span>`).join(" ")}
          </div>
        </div>` : `<p class="small muted">No category weights found on Canvas for this course — it's probably point-based, or weights live in the syllabus below.</p>`}

        <div class="field"><span>Paste syllabus text → auto-extract weights &amp; late policy</span>
          <textarea id="syllRaw" rows="5" placeholder="e.g.  Homework 20%&#10;Quizzes 30%&#10;Tests and Final 40%&#10;Participation 10%&#10;Late work only accepted within 2 days, −10% per day">${esc(syll.raw || "")}</textarea>
          <button class="btn btn-small mt" id="extractSyllabus">Extract weights + late policy</button>
        </div>

        <div class="grid-2">
          <div class="field"><span>Weights (JSON, one per category)</span><textarea id="syllWeights" rows="5">${esc(JSON.stringify(syll.weights || {}, null, 2))}</textarea></div>
          <div class="field"><span>Late Policy (JSON)</span><textarea id="syllLate" rows="5">${esc(JSON.stringify(syll.latePolicy || {}, null, 2))}</textarea></div>
        </div>
      </div>
      <div class="modal-foot"><button class="btn btn-primary" id="saveSyllabus">Save</button><button class="btn btn-ghost" data-close>Cancel</button></div>
    </div>
  `;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.remove("hidden"));

  const close = () => { wrap.classList.add("hidden"); setTimeout(() => wrap.remove(), 200); };
  wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });

  wrap.querySelector("#extractSyllabus").addEventListener("click", () => {
    const parsed = parseSyllabus(wrap.querySelector("#syllRaw").value);
    wrap.querySelector("#syllWeights").value = JSON.stringify(parsed.weights, null, 2);
    wrap.querySelector("#syllLate").value = JSON.stringify(parsed.latePolicy, null, 2);
    wrap.querySelector("#syllMode").value = "syllabus";
    toast(parsed.latePolicy.noLate ? "Note: syllabus says no late work accepted." : "Weights extracted from syllabus.");
  });

  wrap.querySelector("#saveSyllabus").addEventListener("click", () => {
    try {
      const weights = JSON.parse(wrap.querySelector("#syllWeights").value || "{}");
      const latePolicy = JSON.parse(wrap.querySelector("#syllLate").value || "{}");
      const raw = wrap.querySelector("#syllRaw").value;
      const mode = wrap.querySelector("#syllMode").value;
      s.syllabus = s.syllabus || {};
      s.syllabus[course.id] = { mode, weights, latePolicy, raw };
      saveSettings();
      toast("Syllabus saved — grading now uses these weights.");
      close();
      const root = document.getElementById("mainContent");
      if (state.ui?.courseDetailId === course.id) render(state, root, () => false);
    } catch (e) {
      toast("Invalid JSON: " + e.message, "err");
    }
  });
}