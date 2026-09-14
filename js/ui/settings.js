import { esc, toast } from "../utils.js";
import { settings, saveSettings, cloudReady } from "../storage.js";
import { courseTypeFor } from "../data.js";

export function render(state, root) {
  const s = settings();
  const p = state.profile;

  const typeOptions = (cur) => `
    <option value="regular" ${cur === "regular" ? "selected" : ""}>Regular</option>
    <option value="honors" ${cur === "honors" ? "selected" : ""}>Honors</option>
    <option value="ap" ${cur === "ap" ? "selected" : ""}>AP / IB</option>`;

  const courseTypeRows = state.data.courses.map((c) => `
    <div class="row">
      <span class="small" style="flex:1">${esc(c.name)}</span>
      <select class="course-type" data-course="${c.id}" style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-soft);color:var(--text)">
        ${typeOptions(courseTypeFor(c))}
      </select>
    </div>`).join("");

  root.innerHTML = `
    <h1>Settings</h1>

    <div class="card">
      <h2>Canvas connection</h2>
      ${p ? `<div class="flex between">
        <div><b>${esc(p.name)}</b><div class="small muted">${esc(p.email)} · user #${esc(p.id)}</div></div>
        <button id="reconnect" class="btn btn-small">Change token</button>
      </div>` : `<p class="muted">Not connected.</p>`}
      <div class="field"><span>Canvas base URL</span><input id="setUrl" value="${esc(s.canvasBaseUrl)}" /></div>
      <div class="field"><span>Access token <span class="muted small">(always local, never uploaded)</span></span><input id="setToken" type="password" placeholder="••••••••" autocomplete="off" /></div>
    </div>

    <div class="card mt">
      <h2>Account access (Canvas email only)</h2>
      <p class="small muted">This app only accepts accounts tied to real Canvas emails. The email is verified from your Canvas profile when you connect.</p>
      <div class="field">
        <span>Allowed email domains <span class="muted small">(comma-separated; e.g. school.edu. Leave empty → blocks common personal mail like gmail.com)</span></span>
        <input id="setDomains" value="${esc(s.allowedDomains?.join(", ") || "")}" placeholder="school.edu, district.k12.us" />
      </div>
      <div class="check-item">
        <div><div>Block personal email domains</div><div class="desc">If no allowlist above, reject gmail/yahoo/etc. accounts automatically.</div></div>
        <label class="toggle"><input type="checkbox" id="setBlockMail" ${s.blockPersonalEmails ? "checked" : ""} /><span class="track"></span></label>
      </div>
    </div>

    <div class="card mt">
      <h2>GPA targets</h2>
      <p class="small muted">Subjects keep a 4.0 when regular = A, honors = B+, AP = B. Grades below these targets make the priority system work harder on that class.</p>
      <div class="grid grid-3 mt">
        <label class="field"><span>Regular (%)</span><input id="tgtRegular" type="number" min="0" max="100" value="${s.targets.regular}" /></label>
        <label class="field"><span>Honors (%)</span><input id="tgtHonors" type="number" min="0" max="100" value="${s.targets.honors}" /></label>
        <label class="field"><span>AP / IB (%)</span><input id="tgtAp" type="number" min="0" max="100" value="${s.targets.ap}" /></label>
      </div>
      <div class="mt"><b class="small muted">Per-class type</b> <span class="small muted">(overrides auto-detection from the course name)</span>
        <div class="allocation mt">${courseTypeRows || `<span class="muted small">Connect to Canvas to set per-class types.</span>`}</div>
      </div>
    </div>

    <div class="card mt">
      <h2>Cloud storage (Supabase)</h2>
      <p class="small muted">Optional. Curve logs sync here so future users can see how classes have curved historically. Your Canvas token is <b>never</b> sent anywhere.</p>
      <div class="field"><span>Supabase URL</span><input id="sbUrl" value="${esc(s.supabase.url || "")}" placeholder="https://xxxx.supabase.co" /></div>
      <div class="field"><span>Anon key</span><input id="sbKey" value="${esc(s.supabase.anonKey || "")}" type="password" autocomplete="off" /></div>
      <div class="flex mt">
        <button id="sbTest" class="btn btn-small">Test connection</button>
        <span id="sbStatus" class="small muted"></span>
      </div>
    </div>

    <div class="card mt">
      <h2>Local data</h2>
      <div class="flex mt">
        <button id="exportData" class="btn btn-small">Export JSON</button>
        <button id="clearData" class="btn btn-small" style="color:var(--red)">Disconnect &amp; clear local data</button>
      </div>
    </div>
  `;

  const save = () => saveSettings();

  root.querySelector("#reconnect")?.addEventListener("click", () => {
    localStorage.removeItem("cp:settings");
    localStorage.removeItem("cp:data");
    location.reload();
  });

  root.querySelector("#setUrl")?.addEventListener("change", (e) => { s.canvasBaseUrl = e.target.value.trim(); save(); });
  root.querySelector("#setToken")?.addEventListener("change", (e) => { s.token = e.target.value.trim(); save(); });
  root.querySelector("#setDomains")?.addEventListener("change", (e) => {
    s.allowedDomains = e.target.value.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean); save();
  });
  root.querySelector("#setBlockMail")?.addEventListener("change", (e) => { s.blockPersonalEmails = e.target.checked; save(); });

  root.querySelector("#tgtRegular")?.addEventListener("change", (e) => { s.targets.regular = +e.target.value; save(); });
  root.querySelector("#tgtHonors")?.addEventListener("change", (e) => { s.targets.honors = +e.target.value; save(); });
  root.querySelector("#tgtAp")?.addEventListener("change", (e) => { s.targets.ap = +e.target.value; save(); });

  root.querySelectorAll(".course-type").forEach((sel) => {
    sel.addEventListener("change", () => {
      s.courseTypes[sel.dataset.course] = sel.value;
      save();
      toast("Saved.");
    });
  });

  root.querySelector("#sbUrl")?.addEventListener("change", (e) => { s.supabase.url = e.target.value.trim(); save(); });
  root.querySelector("#sbKey")?.addEventListener("change", (e) => { s.supabase.anonKey = e.target.value.trim(); save(); });

  root.querySelector("#sbTest")?.addEventListener("click", async () => {
    const st = root.querySelector("#sbStatus");
    saveSettings();
    if (!cloudReady()) { st.textContent = "Fill URL and anon key first."; return; }
    st.textContent = "Testing…";
    const { cloudFetch } = await import("../storage.js");
    try {
      await cloudFetch("/rest/v1/curve_data?select=count&limit=1");
      st.textContent = "✓ Connected";
    } catch (e) {
      st.textContent = "✗ " + e.message;
    }
  });

  root.querySelector("#exportData")?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ settings: settings(), data: localStorage.getItem("cp:data") || null }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "canvas-pro-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  root.querySelector("#clearData")?.addEventListener("click", () => {
    if (!confirm("Disconnect and delete all locally stored data?")) return;
    Object.keys(localStorage).filter((k) => k.startsWith("cp:")).forEach((k) => localStorage.removeItem(k));
    location.reload();
  });
}

function toastSaved() {
  const { toast } = window.__cpToast || { toast: () => {} };
  toast?.("Saved.");
}