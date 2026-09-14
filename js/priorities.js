import { daysUntil, clamp } from "./utils.js";

const TYPE_BOOST = { exam: 1, quiz: 0.7, project: 0.75, assignment: 0.5 };
const GRACE_DAYS = 14;

function scoreTask(task, course) {
  const due = daysUntil(task.dueAt);
  const urgency = due == null ? 0 : clamp(1 - (due / GRACE_DAYS), 0, 1);

  const current = course?.currentScore ?? null;
  const target = course?.targetGrade ?? 93;
  const deficit = current == null ? 0.3 : clamp((target - current) / 100, 0, 1);

  const weight = task.groupWeight;
  const weightFactor = weight == null ? 0.5 : clamp(weight / 100, 0, 1);
  const pointsFactor = clamp((task.pointsPossible || 0) / 150, 0, 1);
  const typeBoost = TYPE_BOOST[task.type] ?? 0.5;
  const impact = 0.45 * weightFactor + 0.35 * pointsFactor + 0.2 * typeBoost;

  const raw = urgency * 0.5 + impact * 0.35 + deficit * 0.15;
  const score = Math.round(raw * 100);

  const reasons = [];
  if (due == null) reasons.push("No due date");
  else if (due <= 0) reasons.push("Due today");
  else if (due === 1) reasons.push("Due tomorrow");
  else reasons.push(`Due in ${due}d`);
  if (weight != null && weight > 0) reasons.push(`${weight}% group`);
  if (task.pointsPossible > 0) reasons.push(`${task.pointsPossible} pts`);
  if (current != null && deficit > 0.005) reasons.push(`Need ${target}% (have ${Math.round(current)}%)`);
  if (task.type === "exam") reasons.push("Exam");

  const band = score >= 68 ? "high" : score >= 42 ? "mid" : "low";
  return { score, band, reasons, urgency, impact, deficit };
}

export function summarizeTasks(tasks, courses) {
  const byId = new Map(courses.map((c) => [c.id, c]));
  return tasks.map((t) => ({
    task: t,
    course: byId.get(t.courseId),
    ...scoreTask(t, byId.get(t.courseId)),
  }));
}

export function recommendedOrder(tasks, courses) {
  return summarizeTasks(tasks, courses).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = new Date(a.task.dueAt || 0);
    const db = new Date(b.task.dueAt || 0);
    return da - db || (a.task.title || "").localeCompare(b.task.title || "");
  });
}

export function bandClass(band) {
  return { high: "tag-red p-high", mid: "tag-yellow p-mid", low: "tag-green p-low" }[band] || "tag-blue p-low";
}