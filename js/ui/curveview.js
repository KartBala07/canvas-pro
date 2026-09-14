import { num, esc, toast } from "../utils.js";
import { solveCurve, renderHistory, letterForScore } from "../curve.js";
import { settings, cacheGet, cacheSet, cloudUpsert, cloudReady } from "../storage.js";

function localHistory() { return cacheGet("curvehistory", []); }
function setLocalHistory(h) { cacheSet("curvehistory", h); }

export async function render(state, root, isStale = () => false) {
  const { courses, tasks } = state.data;
  const s = settings();

  const nextExam = tasks.filter((t) => t.type === "exam" && t.dueAt && !t.submitted)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];

  const courseOptions = courses.map((c) => `<option value="${c.id}" ${c.id === nextExam?.courseId ? "selected" : ""}>${esc(c.name)}</option>`).join("");

  root.innerHTML = `
    <h1>Curve Calculator</h1>
    <p class="subtitle">Estimate what a curve does to your test grade — and log it so the app learns how your classes have curved historically.</p>

    <div class="grid grid-2 mt">
      <div class="card">
        <label class="field"><span>Course</span><select id="cvCourse">${courseOptions}</select></label>
        <label class="field"><span>Test name <span class="muted small">(optional)</span></span>
          <input id="cvTest" type="text" value="" placeholder="${nextExam ? esc(nextExam.title) : "e.g. Unit 3 exam"}" />
        </label>
        <div class="grid grid-2">
          <label class="field"><span>Your score</span><input id="cvScore" type="number" step="0.01" min="0" placeholder="82" /></label>
          <label class="field"><span>Points possible</span><input id="cvPossible" type="number" step="0.01" min="1" placeholder="100" /></label>
        </div>
        <label class="field"><span>Class average <span class="muted small">(points, optional)</span></span><input id="cvAvg" type="number" step="0.01" min="0" placeholder="Skip if unknown" /></label>
        <label class="field"><span>Target grade % <span id="cvTargetHint" class="muted small"></span></span><input id="cvTarget" type="number" min="0" max="100" step="1" /></label>
        <label class="field"><span>Curve to add (+points) <b id="cvCurveVal">0</b></span>
          <input id="cvCurve" type="range" min="0" max="20" step="0.5" value="0" style="width:100%;accent-color:var(--accent)" />
        </label>
        <div class="flex mt">
          <button id="cvCalc" class="btn btn-primary">Calculate</button>
          <button id="cvSave" class="btn">Log this curve</button>
        </div>
      </div>

      <div class="card" id="cvResult">
        <p class="muted">Enter a score and press Calculate. Try the slider to see how many points push you past your target.</p>
      </div>
    </div>

    <div class="card mt" id="cvHistoryBox"></div>
  `;

  const pick = courses.find((c) => c.id === (nextExam?.courseId));
  root.querySelector("#cvTarget").value = pick?.targetGrade ?? 93;
  root.querySelector("#cvTargetHint").textContent = pick ? `(${pick.type} → ${pick.targetGrade}%)` : "";

  root.querySelector("#cvCourse").addEventListener("change", async () => {
    const cid = +root.querySelector("#cvCourse").value;
    const c = courses.find((x) => x.id === cid);
    root.querySelector("#cvTarget").value = c?.targetGrade ?? 93;
    root.querySelector("#cvTargetHint").textContent = c ? `(${c.type} → ${c.targetGrade}%)` : "";
    const exam = tasks.find((t) => t.type === "exam" && t.courseId === cid && t.dueAt && !t.submitted);
    if (exam && !root.querySelector("#cvTest").value) root.querySelector("#cvTest").value = exam.title;
    await drawResult();
  });

  root.querySelector("#cvCurve").addEventListener("input", (e) => {
    root.querySelector("#cvCurveVal").textContent = e.target.value;
  });

  async function drawResult() {
    const possible = +root.querySelector("#cvPossible").value;
    const raw = +root.querySelector("#cvScore").value;
    const avg = root.querySelector("#cvAvg").value === "" ? null : +root.querySelector("#cvAvg").value;
    const curve = +root.querySelector("#cvCurve").value;
    const target = +root.querySelector("#cvTarget").value;
    const box = root.querySelector("#cvResult");
    if (!possible || Number.isNaN(raw)) {
      box.innerHTML = `<p class="muted">Enter a score and possible points, then press Calculate.</p>`;
      return;
    }
    const r = solveCurve({ rawScore: raw, possible, averageScore: avg, curvePoints: curve, targetPct: target });
    const targetLetter = letterForScore(target);
    box.innerHTML = `
      <div class="curve-result">
        <div class="ring" style="--score:${Math.max(0, Math.min(100, r.curvedPct))}">
          <div class="ring-inner"><div class="num">${r.curvedPct.toFixed(1)}%</div><div class="small muted">${r.curvedLetter} after +${curve}</div></div>
        </div>
        <div style="flex:1;min-width:220px">
          <div class="flex between"><span class="muted">Raw</span><b>${r.rawPct.toFixed(1)}% (${r.rawLetter})</b></div>
          <div class="flex between"><span class="muted">Class avg</span><b>${r.avgPct != null ? r.avgPct.toFixed(1) + "%" : "—"}</b></div>
          <div class="flex between"><span class="muted">Avg after curve</span><b>${r.avgCurvedPct != null ? r.avgCurvedPct.toFixed(1) + "%" : "—"}</b></div>
          <div class="flex between"><span class="muted">Target (${target}% = ${targetLetter})</span>
            <b class="${r.hitsTarget ? "grade-high" : "grade-low"}">${r.hitsTarget ? "✓ " + r.curvedLetter : r.curvedLetter + " · still short"}</b></div>
          ${r.curveToTarget != null ? `<div class="flex between muted"><span>Curve needed for ${target}%</span><b class="grade-mid">${num(r.curveToTarget)} pts</b></div>` : `<div class="flex between muted"><span>Curve needed</span><b>None — above target already</b></div>`}
        </div>
      </div>`;
  }

  root.querySelector("#cvCalc").addEventListener("click", drawResult);

  root.querySelector("#cvSave").addEventListener("click", async () => {
    const course = courses.find((c) => c.id === +root.querySelector("#cvCourse").value);
    const test = root.querySelector("#cvTest").value.trim();
    const possible = +root.querySelector("#cvPossible").value;
    const raw = +root.querySelector("#cvScore").value;
    if (!course || !possible || Number.isNaN(raw)) { toast("Enter course, score and possible points first.", "err"); return; }
    const curve = +root.querySelector("#cvCurve").value;
    const target = +root.querySelector("#cvTarget").value;
    const avg = root.querySelector("#cvAvg").value === "" ? null : +root.querySelector("#cvAvg").value;
    const rawPct = (raw / possible) * 100;
    const entry = {
      course_name: course.name,
      test_name: test || "Unnamed test",
      canvas_email: state.profile?.email || null,
      raw_pct: Math.round(rawPct * 100) / 100,
      avg_pct: avg != null ? Math.round((avg / possible) * 100 * 100) / 100 : null,
      curve_applied: curve,
      target_pct: target,
      created_at: new Date().toISOString(),
    };
    const hist = localHistory();
    hist.push(entry);
    setLocalHistory(hist);
    toast("Saved locally.");

    if (cloudReady()) {
      try {
        await cloudUpsert("curve_data", [entry]);
        toast("Synced to cloud.");
      } catch (e) { toast("Cloud sync failed (local copy kept). " + e.message, "err"); }
    } else {
      toast("Add Supabase keys in Settings to share curves across users.");
    }
    await refreshHistory();
  });

  async function refreshHistory() {
    const box = root.querySelector("#cvHistoryBox");
    box.innerHTML = `<div class="loading"><div class="spinner"></div><p class="small muted">Loading history…</p></div>`;
    let cloud = [];
    if (cloudReady()) {
      try {
        const { cloudFetch } = await import("../storage.js");
        cloud = await cloudFetch("/rest/v1/curve_data?select=*&order=created_at.desc&limit=200");
      } catch { cloud = []; }
    }
    if (isStale()) return;
    const merged = mergeHistory(cloud, localHistory());
    box.innerHTML = `<h2>Curve history <span class="muted small">(${merged.length})</span></h2>`;
    renderHistory(merged, box.id);
  }

  await refreshHistory();

  function mergeHistory(cloudArr, localArr) {
    const key = (e) => `${e.course_name}|${e.test_name}|${(e.created_at || "").slice(0, 10)}|${e.raw_pct}|${e.curve_applied}`;
    const map = new Map();
    for (const e of cloudArr) map.set(key(e), e);
    for (const e of localArr) map.set(key(e), e);
    return [...map.values()];
  }
}