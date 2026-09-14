import { settings } from "./storage.js";
import { recommendedOrder, scoreTask } from "./priorities.js";
import { clamp, daysUntil } from "./utils.js";

const HORIZON = 7;

function difficultyFactor(task) {
  const s = settings();
  const ov = task.difficultyOverride;
  if (ov?.factor) return ov.factor * 0.4 + 0.6;
  return s.difficulty[task.type] ?? 1.4;
}

function targetMinutes(task) {
  const base = task.baseMinutes || (task.pointsPossible || 0) * settings().baseMinutesPerPoint || 20;
  const factor = difficultyFactor(task);
  let mins = Math.round(base * factor);
  if (task.type === "exam") mins = clamp(mins * 2.5, 30, 300);
  else if (task.type === "quiz") mins = clamp(mins, 15, 90);
  else mins = clamp(mins, 10, 120);
  return mins;
}

function minute(str) {
  const [h, m] = str.split(":").map(Number);
  return h * 60 + (m || 0);
}

function fmtClock(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function generateSchedule(courses, tasks) {
  const conf = settings();
  const slots = conf.studySlots.length ? conf.studySlots : [{ start: "18:00", end: "21:00", label: "Evening" }];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days = Array.from({ length: HORIZON }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const avail = Math.min(
      conf.maxStudyMinutesPerDay,
      slots.reduce((sum, s) => sum + Math.max(0, minute(s.end) - minute(s.start)), 0),
    );
    return {
      index: i,
      date,
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
      available: avail,
      remaining: avail,
      slots: [],
    };
  });

  const open = tasks.filter((t) => !t.submitted && daysUntil(t.dueAt) < 30 && t.dueAt);
  const ranked = recommendedOrder(open, courses);

  const exams = ranked.filter((r) => r.task.type === "exam");
  const others = ranked.filter((r) => r.task.type !== "exam");

  function placeOnDay(idx, item, placeAtStart) {
    const d = days[idx];
    if (d.remaining < 10) return false;
    const mins = targetMinutes(item.task);
    const take = Math.min(d.remaining, mins);
    const entry = {
      kind: item.task.type === "exam" ? "study" : "homework",
      what: item.task.courseName ? `${item.task.courseName} — ${item.task.title}` : item.task.title,
      courseId: item.task.courseId,
      taskId: item.task.id,
      mins: take,
      priority: item.score,
      labels: item.task.type === "exam" ? "Test prep" : item.task.type === "quiz" ? "Quiz: " + item.task.title : "HW: " + item.task.title,
    };
    if (placeAtStart) d.slots.unshift(entry); else d.slots.push(entry);
    d.remaining -= take;
    return take >= mins - 1; // fully placed?
  }

  // Homework: day before due, rolling backward onto earlier days if needed.
  for (const r of others) {
    if (!r.task.dueAt) continue;
    const dueIdx = Math.min(HORIZON - 1, Math.max(0, daysUntil(r.task.dueAt)));
    let target = Math.max(0, dueIdx - 1);
    while (target >= 0) {
      if (days[target].remaining >= 10) break;
      target--;
    }
    if (target < 0) target = Math.max(0, dueIdx - 1);
    let placed = placeOnDay(target, r, false);
    // spill extra onto adjacent earlier days
    if (!placed) {
      for (let i = target - 1; i >= 0; i--) {
        if (placeOnDay(i, r, false)) break;
      }
    }
  }

  // Exams: weighted prep in the 3 days before the exam.
  for (const r of exams) {
    const dueIdx = Math.min(HORIZON - 1, Math.max(0, daysUntil(r.task.dueAt)));
    const startIdx = Math.max(0, dueIdx - 3);
    const range = [];
    for (let i = startIdx; i <= Math.min(dueIdx, HORIZON - 1); i++) range.push(i);
    const weights = range.map((i, k) => (k === range.length - 1 && i === dueIdx ? 0.5 : 1 + k));
    const wsum = weights.reduce((a, b) => a + b, 0);
    const study = targetMinutes(r.task);
    for (let k = 0; k < range.length; k++) {
      const idx = range[k];
      if (!days[idx] || days[idx].remaining < 10) continue;
      const minutes = Math.round((study * weights[k]) / wsum);
      if (minutes < 10) continue;
      const d = days[idx];
      const take = Math.min(d.remaining, minutes);
      d.slots.push({
        kind: "study",
        what: `${r.task.courseName} — ${r.task.title}`,
        courseId: r.task.courseId,
        taskId: r.task.id,
        mins: take,
        priority: r.score,
        labels: "Test prep",
      });
      d.remaining -= take;
    }
  }

  // Order slots within each day by priority, then stamp times from the windows.
  for (const d of days) {
    d.slots.sort((a, b) => b.priority - a.priority);

    const windows = slots
      .map((s, i) => ({ ...s, startM: minute(s.start), endM: minute(s.end), label: s.label || `Block ${i + 1}` }))
      .sort((a, b) => a.startM - b.startM);

    let cursor = 0;
    let inWindow = false;
    let currentStart = 0;
    const placed = [];
    for (const slot of d.slots) {
      while (cursor < windows.length && slot.mins > 0) {
        const w = windows[cursor];
        const free = w.endM - (inWindow ? currentStart + 0 : w.startM);
        if (free <= 0) { cursor++; inWindow = false; currentStart = 0; continue; }
        if (!inWindow) { inWindow = true; currentStart = w.startM; }
        const take = Math.min(slot.mins, free);
        placed.push({ ...slot, mins: take, start: fmtClock(currentStart), end: fmtClock(currentStart + take) });
        currentStart += take;
        slot.mins -= take;
        if (currentStart >= w.endM) { cursor++; inWindow = false; currentStart = 0; }
      }
    }
    d.slots = placed;
    const total = placed.reduce((a, s) => a + s.mins, 0);
    d.used = total;
  }

  return { days, today };
}

export function scheduleSummary(days) {
  const total = days.reduce((a, d) => a + d.used, 0);
  const exams = days.flatMap((d) => d.slots).filter((s) => s.kind === "study").length;
  return { totalMins: total, studySessions: exams };
}