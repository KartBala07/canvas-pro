import { esc, fmtDate, pct, toast } from "../utils.js";
import { settings, saveSettings, doneIds, setDone } from "../storage.js";
import { generateSchedule } from "../schedule.js";
import * as canvas from "../canvas.js";
import { openTask } from "./taskdetail.js";

function courseHeader(c, opts = {}) {
  const hasGrade = c.currentScore != null;
  const spread = hasGrade ? pct(c.currentScore) : "—";
  const delta = hasGrade ? Math.round((c.currentScore - c.targetGrade) * 10) / 10 : null;
  const deltaCls = delta == null ? "" : delta >= 0 ? "grade-high" : "grade-low";
  const fill = hasGrade ? Math.max(0, Math.min(100, c.currentScore)) : 0;
  const typeBadge = { ap: "tag-red", honors: "tag-yellow", regular: "tag-green" }[c.type] || "tag-blue";
  return `
    <div class="course-hero">
      <div class="hero-main">
        <div>
          <h1>${esc(c.name)}</h1>
          <div class="hero-meta">
            ${c.code ? `<span class="tag tag-blue">${esc(c.code)}</span>` : ""}
            <span class="tag ${typeBadge}">${c.type?.toUpperCase() || "REGULAR"}</span>
            ${c.term ? `<span class="tag tag-purple">${esc(c.term)}</span>` : ""}
          </div>
        </div>
        <div class="hero-grade">
          ${hasGrade ? `
            <div class="grade-ring" style="--score:${fill}">
              <div class="grade-ring-inner">
                <div class="grade-value">${spread}</div>
                <div class="grade-target">Target: ${c.targetGrade}%</div>
              </div>
            </div>
            <div class="grade-delta ${deltaCls}">${delta >= 0 ? "+" : ""}${delta} vs target</div>
          ` : `<div class="grade-empty"><span class="tag tag-blue">No grade yet</span></div>`}
        </div>
      </div>
      <div class="hero-progress">
        <div class="progress-bar"><div class="progress-fill" style="width:${fill}%"></div></div>
        <div class="progress-labels">
          <span>Current</span>
          <span>Target: ${c.targetGrade}%</span>
        </div>
      </div>
    </div>
  `;
}

function assignmentsSection(course, tasks, done, isStale) {
  const courseTasks = tasks.filter((t) => t.courseId === course.id);
  const open = courseTasks.filter((t) => !t.submitted && !done.has(t.id)).sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || ""));
  const completed = courseTasks.filter((t) => t.submitted || done.has(t.id)).sort((a, b) => (b.dueAt || "").localeCompare(a.dueAt || ""));

  const openHtml = open.length ? open.map((t) => {
    const due = t.dueAt ? fmtDate(t.dueAt) : "No due date";
    const overdue = t.dueAt && new Date(t.dueAt) < new Date() && !t.submitted && !done.has(t.id);
    const typeTag = { exam: "tag-red", quiz: "tag-yellow", project: "tag-purple", assignment: "tag-blue" }[t.type] || "tag-blue";
    return `
      <div class="task-row ${overdue ? "overdue" : ""}" data-id="${esc(t.id)}">
        <input type="checkbox" class="done-box" ${done.has(t.id) ? "checked" : ""} title="Mark done">
        <div class="task-info">
          <div class="task-title">${esc(t.title)}</div>
          <div class="task-meta">
            <span class="tag ${typeTag}">${t.type}</span>
            <span class="due ${overdue ? "overdue" : ""}">${esc(due)}${overdue ? " · OVERDUE" : ""}</span>
            ${t.pointsPossible ? `<span class="points">${t.pointsPossible} pts</span>` : ""}
          </div>
        </div>
        <button class="btn btn-ghost btn-small task-open">Open</button>
      </div>
    `;
  }).join("") : `<p class="muted">No open assignments.</p>`;

  const doneHtml = completed.length ? completed.map((t) => `
    <div class="task-row done" data-id="${esc(t.id)}">
      <input type="checkbox" class="done-box" checked title="Un-mark done">
      <div class="task-info">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          <span class="tag tag-blue">${t.type}</span>
          <span class="due">${t.dueAt ? esc(fmtDate(t.dueAt)) : "No due date"}</span>
          ${t.pointsPossible ? `<span class="points">${t.pointsPossible} pts</span>` : ""}
          ${t.submitted ? `<span class="tag tag-green">Submitted</span>` : ""}
        </div>
      </div>
    </div>
  `).join("") : "";

  return `
    <div class="section-card">
      <div class="section-head">
        <h2>Assignments</h2>
        <span class="badge">${open.length} open</span>
        <button class="btn btn-primary btn-small add-assignment" data-course="${course.id}">+ Add</button>
      </div>
      <div class="task-list" data-tab="open">${openHtml}</div>
      ${doneHtml ? `<details class="done-fold"><summary>Completed (${completed.length})</summary><div class="task-list">${doneHtml}</div></details>` : ""}
    </div>
  `;
}

function announcementsSection(course, anns, base) {
  const courseAnns = anns.filter((a) => a.context_code === `course_${course.id}`).slice(0, 10);
  if (!courseAnns.length) return `<div class="section-card"><h2>Announcements</h2><p class="muted">No recent announcements.</p></div>`;
  return `
    <div class="section-card">
      <div class="section-head"><h2>Announcements</h2></div>
      ${courseAnns.map((a) => {
        const read = (a.read_state || "read") === "read";
        const date = a.posted_at ? fmtDate(a.posted_at.split("T")[0]) : "";
        return `
          <div class="ann-item ${read ? "read" : ""}" data-id="${esc(a.id)}">
            <div class="ann-head">
              <span class="ann-dot" title="${read ? "Read" : "Unread"}"></span>
              <div class="ann-title">${esc(a.title || "Untitled")}</div>
              <span class="small muted ann-date">${date}</span>
            </div>
            <div class="ann-body small muted">${esc((a.message || "").replace(/<[^>]+>/g, "")).slice(0, 200)}</div>
            <div class="flex mt">
              <button class="btn btn-ghost btn-small ann-read" ${read ? "disabled" : ""} data-cid="${course.id}" data-aid="${esc(a.id)}">Mark read</button>
              ${a.html_url ? `<a class="btn btn-ghost btn-small" href="${esc(a.html_url)}" target="_blank" rel="noopener">Open in Canvas ↗</a>` : ""}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function filesSection(course, files) {
  const courseFiles = (files || []).filter((f) => f._courseId === course.id).slice(0, 20);
  if (!courseFiles.length) return `<div class="section-card"><h2>Files</h2><p class="muted">No files found.</p></div>`;
  return `
    <div class="section-card">
      <div class="section-head"><h2>Files</h2></div>
      <div class="file-grid">
        ${courseFiles.map((f) => {
          const k = kindFor(f);
          return `
            <div class="file-card" data-id="${esc(f.id)}" data-course="${course.id}">
              <div class="file-icon">${k.icon}</div>
              <div class="file-name">${esc(f.display_name || f.filename)}</div>
              <div class="file-meta"><span class="tag ${k.cls}">${k.tag}</span> ${f.size ? fmtSize(f.size) : ""}</div>
            </div>
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

function studyPlanSection(course, tasks) {
  const courseTasks = tasks.filter((t) => t.courseId === course.id && !t.submitted && t.dueAt);
  const sched = generateSchedule([course], courseTasks);
  const today = sched.days[0];
  if (!today || !today.slots.length) return "";
  return `
    <div class="section-card">
      <div class="section-head"><h2>Study Plan (Next 3 Days)</h2></div>
      ${sched.days.slice(0, 3).map((d) => `
        <div class="day-mini">
          <div class="day-label">${d.label}</div>
          ${d.slots.map((s) => `
            <div class="slot-mini ${s.kind === "break" ? "break" : ""}">
              <span class="time">${s.start}</span>
              <span class="what">${esc(s.what)}</span>
              <span class="mins">${s.mins}m</span>
            </div>
          `).join("")}
        </div>
      `).join("")}
    </div>
  `;
}

export async function render(state, root, isStale) {
  const courseId = state.ui?.courseDetailId;
  if (!courseId) {
    root.innerHTML = `<div class="card"><h2>No course selected</h2><p class="muted">Click a course from the Dashboard or Courses tab.</p></div>`;
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

  root.innerHTML = `
    <div class="course-detail">
      <button class="back-btn" id="backToCourses" title="Back to courses">← Back</button>
      ${courseHeader(course)}
      <div class="detail-grid" id="detailGrid">
        <div class="loading">Loading…</div>
      </div>
    </div>
  `;

  const grid = root.querySelector("#detailGrid");
  const backBtn = root.querySelector("#backToCourses");
  backBtn.addEventListener("click", () => {
    state.ui = state.ui || {};
    delete state.ui.courseDetailId;
    state.tab = "dashboard";
    const event = new CustomEvent("tab-change", { detail: { tab: "dashboard" } });
    window.dispatchEvent(event);
  });

  // Load announcements and files in background
  let anns = [], files = [];
  try {
    anns = await canvas.getAnnouncements([`course_${courseId}`]);
    if (isStale()) return;
  } catch (e) { anns = []; }
  try {
    const fileRes = await canvas.getCourseFiles(courseId);
    if (isStale()) return;
    files = (fileRes || []).map((f) => ({ ...f, _courseId: courseId }));
  } catch (e) { files = []; }

  grid.innerHTML = `
    ${assignmentsSection(course, allTasks, done, isStale)}
    ${announcementsSection(course, anns, settings().canvasBaseUrl || "")}
    ${filesSection(course, files)}
    ${studyPlanSection(course, allTasks)}
    <div class="section-card">
      <div class="section-head"><h2>Quick Actions</h2></div>
      <div class="quick-actions">
        <button class="btn btn-primary add-assignment" data-course="${course.id}">+ Add Assignment</button>
        <button class="btn btn-primary add-test" data-course="${course.id}">+ Add Test/Quiz</button>
        <button class="btn btn-ghost open-syllabus" data-course="${course.id}">View/Edit Syllabus</button>
      </div>
    </div>
  `;

  // Task checkbox handlers
  grid.querySelectorAll(".done-box").forEach((cb) => {
    cb.addEventListener("change", () => {
      const row = cb.closest(".task-row");
      const id = row.dataset.id;
      const newDone = new Set(setDone(id, cb.checked));
      row.classList.toggle("done", cb.checked);
    });
  });

  // Task open handlers
  grid.querySelectorAll(".task-open").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".task-row");
      const task = allTasks.find((t) => t.id === row.dataset.id);
      if (task) openTask(task, state);
    });
  });

  // Announcement mark-read
  grid.querySelectorAll(".ann-read").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cid = +btn.dataset.cid;
      const aid = btn.dataset.aid;
      try {
        await canvas.markAnnouncementRead(cid, aid);
        btn.disabled = true;
        btn.closest(".ann-item").classList.add("read");
        toast("Marked as read.");
      } catch (e) {
        toast("Couldn't mark read: " + e.message, "err");
      }
    });
  });

  // Add assignment/test buttons
  grid.querySelectorAll(".add-assignment").forEach((btn) => {
    btn.addEventListener("click", () => openAddAssignmentModal(+btn.dataset.course, state, false));
  });
  grid.querySelectorAll(".add-test").forEach((btn) => {
    btn.addEventListener("click", () => openAddAssignmentModal(+btn.dataset.course, state, true));
  });
  grid.querySelector(".open-syllabus")?.addEventListener("click", () => openSyllabusModal(course, state));
}

function openAddAssignmentModal(courseId, state, isTest) {
  const course = state.data?.courses?.find((c) => c.id === courseId);
  if (!course) return;

  const types = isTest ? ["exam", "quiz"] : ["assignment", "project", "quiz", "homework"];
  const wrap = document.createElement("div");
  wrap.className = "modal-overlay";
  wrap.innerHTML = `
    <div class="modal modal-wide">
      <div class="modal-head">
        <h2>${isTest ? "Add Test / Quiz" : "Add Assignment"}</h2>
        <button class="btn btn-small btn-ghost" data-close>✕</button>
      </div>
      <form id="addTaskForm">
        <div class="form-row"><label>Title <input name="title" required placeholder="e.g. Chapter 3 Homework"></label></div>
        <div class="form-row"><label>Type <select name="type">${types.map((t) => `<option value="${t}">${t}</option>`).join("")}</select></label></div>
        <div class="form-row"><label>Due Date <input name="dueAt" type="datetime-local"></label></div>
        <div class="form-row"><label>Points Possible <input name="points" type="number" min="0" step="1" value="10"></label></div>
        <div class="form-row"><label>Description <textarea name="desc" rows="3" placeholder="Optional details..."></textarea></label></div>
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
    const root = document.getElementById("mainContent");
    if (state.ui?.courseDetailId === courseId) render(state, root, () => false);
    close();
    toast(`Created ${isTest ? "test" : "assignment"} locally.`);
  });
}

function openSyllabusModal(course, state) {
  const s = settings();
  const syll = s.syllabus?.[course.id] || s.syllabus?._all || { weights: {}, latePolicy: null, raw: "" };
  const wrap = document.createElement("div");
  wrap.className = "modal-overlay";
  wrap.innerHTML = `
    <div class="modal modal-wide">
      <div class="modal-head"><h2>Syllabus: ${esc(course.name)}</h2><button class="btn btn-small btn-ghost" data-close>✕</button></div>
      <div class="modal-body">
        <div class="field"><label>Weights JSON</label><textarea id="syllWeights" rows="5">${esc(JSON.stringify(syll.weights || {}, null, 2))}</textarea></div>
        <div class="field"><label>Late Policy JSON</label><textarea id="syllLate" rows="5">${esc(JSON.stringify(syll.latePolicy || {}, null, 2))}</textarea></div>
        <div class="field"><label>Raw Text</label><textarea id="syllRaw" rows="6">${esc(syll.raw || "")}</textarea></div>
      </div>
      <div class="modal-foot"><button class="btn btn-primary" id="saveSyllabus">Save</button><button class="btn btn-ghost" data-close>Cancel</button></div>
    </div>
  `;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.remove("hidden"));

  const close = () => { wrap.classList.add("hidden"); setTimeout(() => wrap.remove(), 200); };
  wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });

  wrap.querySelector("#saveSyllabus").addEventListener("click", () => {
    try {
      const weights = JSON.parse(wrap.querySelector("#syllWeights").value || "{}");
      const latePolicy = JSON.parse(wrap.querySelector("#syllLate").value || "{}");
      const raw = wrap.querySelector("#syllRaw").value;
      s.syllabus = s.syllabus || {};
      s.syllabus[course.id] = { weights, latePolicy, raw };
      saveSettings();
      toast("Syllabus saved for this course.");
      close();
    } catch (e) {
      toast("Invalid JSON: " + e.message, "err");
    }
  });
}