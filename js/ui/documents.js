import { esc, toast, fmtDate } from "../utils.js";
import { settings } from "../storage.js";
import * as canvas from "../canvas.js";

function fmtSize(n) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

function downloadBlob(url, name) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function openFile(f) {
  const s = settings();
  try {
    const res = await fetch("/api/dl?u=" + encodeURIComponent(f.url || ""), {
      headers: { "X-Canvas-Token": s.token, "X-Canvas-Base": s.canvasBaseUrl },
    });
    if (!res.ok) {
      let msg = `Download failed (${res.status})`;
      try { const j = await res.json(); msg = (j && j.message) || msg; } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const name = (f.display_name || f.filename || "file").split("?")[0];
    const ct = blob.type || f.content_type || "";
    const previewable = /pdf|^image\/|^audio\/|^video\/|^text\//.test(ct);
    const obj = URL.createObjectURL(blob);
    if (previewable) {
      const w = window.open(obj, "_blank");
      if (!w) downloadBlob(obj, name);
    } else {
      downloadBlob(obj, name);
    }
  } catch (e) {
    toast("Couldn't open file: " + e.message, "err");
  }
}

export function fileRow(f, idx) {
  const k = kindFor(f);
  const link = !f.locked && f.url;
  const name = link
    ? `<button class="doc-name doc-click" data-idx="${idx}" title="${f.locked ? "" : "Open / download"}">${esc(f.display_name || f.filename)}${f.locked ? " 🔒" : ""}</button>`
    : `<span class="doc-name muted">${esc(f.display_name || f.filename)}${f.locked ? " 🔒" : ""}</span>`;
  return `
    <tr>
      <td>${k.icon} ${name}</td>
      <td><span class="tag ${k.cls}">${k.tag}</span></td>
      <td class="small muted">${esc(f.size != null ? fmtSize(f.size) : "—")}</td>
      <td class="small muted">${f.updated_at ? fmtDate(f.updated_at.split("T")[0]) : "—"}</td>
      ${link ? `<td class="doc-open"><button class="doc-click btn btn-ghost btn-small" data-idx="${idx}">Open ↗</button></td>` : "<td></td>"}
    </tr>`;
}

export async function collectFiles(courses, { files: getFiles, modules: getModules } = {}, progress) {
  return Promise.allSettled(courses.map(async (c) => {
    if (progress) progress.textContent = `Scanning ${c.name}…`;
    try {
      const files = await getFiles(c.id);
      return { course: c, source: "files", files: (files || []).filter((f) => f.display_name) };
    } catch {
      try {
        const files = await getModules(c.id);
        return { course: c, source: "modules", files };
      } catch (e) {
        return { course: c, source: "none", error: e };
      }
    }
  }));
}

export async function render(state, root) {
  root.innerHTML = `
    <h1>Documents</h1>
    <p class="subtitle">Uploads your teachers posted that aren't graded assignments — notes, handouts, slides, and study resources (from course Files, or File items in Modules).</p>
    <div id="docList"><div class="loading" style="padding:40px 0"><div class="spinner"></div><p id="docProgress" class="muted small">Loading files…</p></div></div>
  `;
  const list = root.querySelector("#docList");
  const progress = root.querySelector("#docProgress");

  const courses = state.data?.courses || [];
  if (!courses.length) {
    list.innerHTML = `<div class="card"><p class="muted">No courses to scan. Refresh data first.</p></div>`;
    return;
  }

  const results = await collectFiles(courses, {
    files: canvas.getCourseFiles,
    modules: canvas.getModuleFiles,
  }, (msg) => { progress.textContent = msg; });

  const dedupe = (files) => {
    const seen = new Set();
    return files.filter((f) => {
      const k = f.url || f.display_name;
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const groups = [];
  let failed = 0, fromModules = 0;
  const allFiles = [];
  results.forEach((r) => {
    const g = r.status === "fulfilled" ? r.value : { source: "none", error: r.reason };
    const files = dedupe(g.files || []).sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    if (g.source === "none") { if (g.course) failed++; return; }
    if (!files.length) return;
    if (g.source === "modules") fromModules += files.length;
    const start = allFiles.length;
    allFiles.push(...files);
    files.forEach((f, i) => { f._idx = start + i; });
    groups.push({ ...g, files, source: g.source });
  });
  const total = groups.reduce((n, g) => n + g.files.length, 0);

  if (!groups.length && failed === courses.length) {
    list.innerHTML = `
      <div class="card">
        <p class="error">Couldn't load files — "${
          esc(results[0].status === "fulfilled" ? results[0].value?.error?.message || "not authorized" : "Canvas error")
        }".</p>
        <div class="mt">
          <b class="small">Why this happens</b>
          <p class="small muted" style="margin-top:4px">The Files API needs a specific permission ("Files" scope) on your access token. Many student tokens aren't created with it, and some districts hide Files from students entirely.</p>
          <div class="small muted" style="margin-top:8px">
            <b>Fix it (1 minute, in Canvas):</b><br>
            1. Click your profile → <b>Settings</b> → bottom left <b>+ New Access Token</b>.<br>
            2. In the <b>Scopes</b> selector, search for and tick <b>Files</b> and <b>Modules</b> (or pick "REST API access" / the scope list shown by your admin).<br>
            3. Paste the new token back in <b>Settings → Canvas connection</b> here.
          </div>
          <p class="small muted" style="margin-top:8px">If your district hides the Files tab for students, the Documents tab also reads file items from Modules — that usually still works.</p>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = `
    <p class="small muted mb">${total} file${total === 1 ? "" : "s"} · newest first · click a file to open it${fromModules ? ` · ${fromModules} from Modules` : ""}</p>
    ${groups.map((g) => `
      <div class="card">
        <div class="flex between" style="margin-bottom:6px">
          <h2 style="margin:0">${esc(g.course.name)}</h2>
          <div class="flex">
            ${g.source === "modules" ? `<span class="tag tag-purple">via Modules</span>` : ""}
            <span class="tag tag-blue">${g.files.length} file${g.files.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div class="table-wrap"><table>
          <tbody>${g.files.map((f) => fileRow(f, f._idx)).join("")}</tbody>
        </table></div>
      </div>`).join("")}
    ${failed ? `<p class="small muted">${failed} course${failed === 1 ? "" : "s"} skipped (no file or module access).</p>` : ""}
  `;

  list.querySelectorAll(".doc-click").forEach((btn) => {
    btn.addEventListener("click", () => {
      const f = allFiles[+btn.dataset.idx];
      if (f) openFile(f);
    });
  });
}