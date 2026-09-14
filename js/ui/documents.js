import { esc, toast, fmtDate } from "../utils.js";
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

export function fileRow(f) {
  const k = kindFor(f);
  const link = !f.locked && f.url;
  const name = link
    ? `<a href="${esc(f.url)}" target="_blank" rel="noopener" class="doc-name">${esc(f.display_name || f.filename)}</a>`
    : `<span class="doc-name muted">${esc(f.display_name || f.filename)}${f.locked ? " 🔒" : ""}</span>`;
  return `
    <tr>
      <td>${k.icon} ${name}</td>
      <td><span class="tag ${k.cls}">${k.tag}</span></td>
      <td class="small muted">${esc(f.size != null ? fmtSize(f.size) : "—")}</td>
      <td class="small muted">${f.updated_at ? fmtDate(f.updated_at.split("T")[0]) : "—"}</td>
      ${link ? `<td class="doc-open"><a href="${esc(f.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-small">Open ↗</a></td>` : "<td></td>"}
    </tr>`;
}

export async function render(state, root) {
  root.innerHTML = `
    <h1>Documents</h1>
    <p class="subtitle">Files your teachers posted that aren't graded assignments — notes, handouts, slides, and study resources.</p>
    <div id="docList"><div class="loading" style="padding:40px 0"><div class="spinner"></div><p id="docProgress" class="muted small">Loading files…</p></div></div>
  `;
  const list = root.querySelector("#docList");
  const progress = root.querySelector("#docProgress");

  const courses = state.data?.courses || [];
  if (!courses.length) {
    list.innerHTML = `<div class="card"><p class="muted">No courses to scan. Refresh data first.</p></div>`;
    return;
  }

  const results = await Promise.allSettled(courses.map(async (c) => {
    if (progress) progress.textContent = `Loading files for ${c.name}…`;
    const files = await canvas.getCourseFiles(c.id);
    return { course: c, files: (files || []).filter((f) => f.display_name) };
  }));

  const groups = [];
  results.forEach((r) => {
    if (r.status === "rejected" || !r.value.files.length) return;
    groups.push(r.value);
  });
  const total = groups.reduce((n, g) => n + g.files.length, 0);
  const errors = results.filter((r) => r.status === "rejected");

  if (!groups.length) {
    list.innerHTML = errors.length
      ? `<div class="card"><p class="error">Couldn't load files: ${esc(errors[0].reason?.message || "Canvas error")}</p><p class="hint muted">This token may not have file access. Regenerate it with the Files permission, or check per-course permissions.</p></div>`
      : `<div class="card"><p class="muted">No files posted yet.</p></div>`;
    return;
  }

  list.innerHTML = `
    <p class="small muted mb">${total} file${total === 1 ? "" : "s"} · newest first · click a file to open it</p>
    ${groups.map((g) => `
      <div class="card">
        <div class="flex between" style="margin-bottom:6px">
          <h2 style="margin:0">${esc(g.course.name)}</h2>
          <span class="tag tag-blue">${g.files.length} file${g.files.length === 1 ? "" : "s"}</span>
        </div>
        <div class="table-wrap"><table>
          <tbody>${g.files.map(fileRow).join("")}</tbody>
        </table></div>
      </div>`).join("")}
    ${errors.length ? `<p class="small muted">${errors.length} course${errors.length === 1 ? "" : "s"} skipped (no file access).</p>` : ""}
  `;
}