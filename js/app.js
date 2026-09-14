import { $, toast, esc } from "./utils.js";
import * as canvas from "./canvas.js";
import { settings, saveSettings, cacheData, saveData, emailAllowed, cloudReady } from "./storage.js";
import * as data from "./data.js";

import { render as renderDashboard } from "./ui/dashboard.js";
import { render as renderAssignments } from "./ui/assignments.js";
import { render as renderTodo } from "./ui/todo.js";
import { render as renderGrades } from "./ui/grades.js";
import { render as renderStudy } from "./ui/study.js";
import { render as renderCurve } from "./ui/curveview.js";
import { render as renderSettings } from "./ui/settings.js";

const VIEWS = {
  dashboard: renderDashboard,
  assignments: renderAssignments,
  todo: renderTodo,
  grades: renderGrades,
  study: renderStudy,
  curve: renderCurve,
  settings: renderSettings,
};

const state = { data: cacheData(), profile: null, isLoggedIn: false };

function setBadge() {
  fetch("version.json").then((r) => r.json()).then((v) => {
    const badge = $("#versionBadge");
    if (v.channel === "main") { badge.className = "badge badge-main"; badge.textContent = `v${v.version} STABLE`; }
    else { badge.className = "badge badge-beta"; badge.textContent = `v${v.version} BETA`; }
  }).catch(() => {});
}

function setLoading(on, text) {
  $("#globalLoading").classList.toggle("hidden", !on);
  if (text) $("#loadingText").textContent = text;
  $("#userBtn").disabled = on;
}

function setSync(msg, kind = "") {
  const el = $("#syncState");
  el.className = "sync-state" + (kind ? " " + kind : "");
  el.innerHTML = `<span class="dot"></span>${esc(msg)}`;
}

function showApp() {
  $("#app").classList.remove("hidden");
  $("#onboarding").classList.add("hidden");
  setSync("Ready", "ok");
  const name = state.profile?.name || "—";
  const email = state.profile?.email || "";
  $("#userBtn").textContent = email ? `${name} · ${email}` : name;
}

async function renderTab(tab) {
  const root = $("#mainContent");
  setLoading(true, "Rendering…");
  try {
    const fn = VIEWS[tab] || renderDashboard;
    await fn(state, root);
  } catch (e) {
    root.innerHTML = `<div class="card"><h2>Something broke</h2><p class="error">${esc(e.message)}</p></div>`;
    console.error(e);
  } finally {
    setLoading(false);
  }
}

async function connectAndLoad({ silent = false } = {}) {
  const s = settings();
  if (!s.canvasBaseUrl || !s.token) {
    if (!silent) { toast("Canvas URL and token are required.", "err"); return false; }
    return false;
  }

  setLoading(true, "Verifying token…");
  canvas.client(s.canvasBaseUrl, s.token);
  let profile;
  try {
    profile = await canvas.getProfile();
  } catch (e) {
    setLoading(false);
    if (!silent) toast(e.message, "err");
    return false;
  }

  const check = emailAllowed(profile);
  if (!check.ok) {
    setLoading(false);
    if (!silent) toast(check.reason, "err");
    return false;
  }

  profile = { ...profile, email: profile.primary_email || profile.email || null };
  s.profile = profile;
  saveSettings();
  state.profile = profile;
  state.isLoggedIn = true;

  const ok = await fetchAll();
  return ok;
}

async function fetchAll() {
  setLoading(true, "Fetching your classes, grades, and assignments from Canvas…");
  try {
    const d = await data.loadAll((stage) => setLoading(true, stage));
    d.profile = state.profile;
    state.data = d;
    saveData(d);
    setSync(`Synced · updated ${new Date(settings().lastSync || Date.now()).toLocaleTimeString()}`, "ok");
    renderTab(state.tab || "dashboard");
    return true;
  } catch (e) {
    setSync("Sync failed", "err");
    toast("Could not load data: " + e.message, "err");
    console.error(e);
    return false;
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  $$(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.tab = btn.dataset.tab;
      renderTab(state.tab);
    });
  });

  $("#refreshBtn").addEventListener("click", () => fetchAll());

  $("#userBtn").addEventListener("click", () => {
    state.tab = "settings";
    $$(".tab-btn").forEach((b) => b.classList.remove("active"));
    $('.tab-btn[data-tab="settings"]').classList.add("active");
    renderTab("settings");
  });
}

function bindOnboarding() {
  $("#onConnect").addEventListener("click", async () => {
    const url = $("#onCanvasUrl").value.trim();
    const token = $("#onToken").value.trim();
    if (!url || !token) {
      $("#onboardingError").textContent = "Both the Canvas URL and token are required.";
      $("#onboardingError").classList.remove("hidden");
      return;
    }
    const s = settings();
    s.canvasBaseUrl = url;
    s.token = token;
    saveSettings();
    setLoading(true, "Verifying token…");
    const ok = await connectAndLoad();
    if (ok) showApp();
    else setLoading(false);
  });
}

async function init() {
  setBadge();
  bindEvents();
  const s = settings();
  const cached = cacheData();

  if (s.token && s.canvasBaseUrl) {
    state.profile = s.profile;
    state.isLoggedIn = true;

    if (cached && cached.courses) {
      state.data = cached;
      showApp();
      renderTab("dashboard");
      setSync("Loaded offline · refresh to sync", "");
    } else {
      await connectAndLoad();
      if (state.isLoggedIn) showApp();
    }
  } else {
    bindOnboarding();
    $("#onboarding").classList.remove("hidden");
  }
}

init();