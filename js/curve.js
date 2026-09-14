import { fmtDate, esc } from "./utils.js";

export function letterForScore(score, scale = "standard") {
  if (scale === "standard") {
    if (score == null || Number.isNaN(score)) return "—";
    if (score >= 93) return "A";
    if (score >= 90) return "A-";
    if (score >= 87) return "B+";
    if (score >= 83) return "B";
    if (score >= 80) return "B-";
    if (score >= 77) return "C+";
    if (score >= 73) return "C";
    if (score >= 70) return "C-";
    if (score >= 67) return "D+";
    if (score >= 63) return "D";
    if (score >= 60) return "D-";
    return "F";
  }
  return "—";
}

// percentage (0-100) -> letter via standard scale
export function solveCurve({ rawScore, possible, averageScore, curvePoints = 0, targetPct = 93 }) {
  const p = possible > 0 ? possible : 1;
  const rawPct = (rawScore / p) * 100;
  const avgPct = averageScore != null && possible > 0 ? (averageScore / p) * 100 : null;

  const curvedPct = ((rawScore + curvePoints) / p) * 100;
  const avgCurvedPct = avgPct != null ? ((averageScore + curvePoints) / p) * 100 : null;

  let curveToTarget = null;
  if (rawPct < targetPct) {
    const need = (targetPct / 100) * p - rawScore;
    curveToTarget = Math.ceil(need * 100) / 100;
  }

  return {
    rawPct,
    avgPct,
    curvedPct,
    avgCurvedPct,
    rawLetter: letterForScore(rawPct),
    curvedLetter: letterForScore(curvedPct),
    hitsTarget: curvedPct >= targetPct,
    curveToTarget,
  };
}

export function renderHistory(list, containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<p class="muted">No curve data yet. Log one below and it syncs to the cloud.</p>';
    return;
  }
  const totals = new Map();
  for (const e of list) {
    const t = totals.get(e.course_name) || { sum: 0, n: 0, count: 0 };
    t.sum += e.curve_applied || 0;
    t.n += 1;
    t.count = e.count || 1;
    totals.set(e.course_name, t);
  }

  const rows = list
    .slice()
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 40)
    .map((e) => `
      <tr>
        <td>${esc(e.course_name)}</td>
        <td>${esc(e.test_name || "—")}</td>
        <td>${fmtDate(e.created_at).split(" · ")[0]}</td>
        <td>${(+e.raw_pct || 0).toFixed(1)}%</td>
        <td>${e.avg_pct != null ? (+e.avg_pct).toFixed(1) + "%" : "—"}</td>
        <td>${+e.curve_applied || 0}</td>
        <td>${esc(letterForScore((+e.raw_pct || 0) + (+e.curve_applied || 0)))}</td>
      </tr>`).join("");

  const courseRows = [...totals.entries()]
    .map(([name, t]) => `<div class="flex between"><span>${esc(name)}</span><span class="muted">avg curve <b>${(t.sum / t.n).toFixed(1)} pts</b> over ${t.n} tests</span></div>`)
    .join("");

  box.innerHTML = `
    <div class="small muted" style="margin-bottom:10px">Course averages (cloud + local, deduped):</div>
    <div style="margin-bottom:14px">${courseRows || `<span class="muted">No course totals.</span>`}</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Course</th><th>Test</th><th>Date</th><th>Raw</th><th>Class avg</th><th>Curve</th><th>Final</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}