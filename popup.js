/**
 * MCK Browser Manager - Popup controller
 * -----------------------------------------------------------------
 * - Restores UI state from chrome.storage.local and the live chrome.privacy
 *   values on open.
 * - Persists and applies each change immediately.
 * - Handles the Clear Cache action with loading + success states.
 *
 * Managed by McKinney IT Help Desk.
 */

/* ------------------------------------------------------------------ *
 * Defaults (kept in sync with background.js)
 * ------------------------------------------------------------------ */
const DEFAULT_SETTINGS = {
  clearOnStartup: true,
  tabHibernation: false,
  memoryLimiter: false,
  memoryThresholdPercent: 20,
  tabDedupe: true,
  doNotTrack: false,
  blockThirdPartyCookies: false,
  webRTCProtection: false,
  lastCleared: null
};

/* ------------------------------------------------------------------ *
 * Administrator password required to change protected settings.
 * NOTE: Client-side extensions cannot truly hide a secret — a
 * determined user can read this value from the source. This gate is a
 * deterrent against casual/accidental changes, not a security boundary.
 * ------------------------------------------------------------------ */
const ADMIN_PASSWORD = "CHANGE_ME"; // SET YOUR OWN admin password here before deploying.

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);

function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { ok: false });
        }
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}

async function getStored() {
  try {
    const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSetting(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (e) {
    // console.debug("MCK popup: saveSetting failed", e);
  }
}

function formatTimestamp(ts) {
  if (!ts) return "Never";
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch (e) {
    return "Never";
  }
}

/* ------------------------------------------------------------------ *
 * Read live Chrome privacy / content settings so toggles reflect the
 * actual browser state, not just what we stored.
 * ------------------------------------------------------------------ */
function getPref(pref) {
  return new Promise((resolve) => {
    try {
      pref.get({}, (details) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(details ? details.value : null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

/* ------------------------------------------------------------------ *
 * Tab navigation
 * ------------------------------------------------------------------ */
function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("is-active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      panels.forEach((p) => {
        p.classList.toggle("is-active", p.dataset.panel === target);
      });
    });
  });
}

/* ------------------------------------------------------------------ *
 * Admin password modal
 * Returns a Promise that resolves true if the correct password was
 * entered, false if the user cancelled.
 * ------------------------------------------------------------------ */
function promptAdmin() {
  return new Promise((resolve) => {
    const modal = $("adminModal");
    const input = $("adminPassword");
    const error = $("adminError");
    const confirmBtn = $("adminConfirm");
    const cancelBtn = $("adminCancel");
    const backdrop = modal.querySelector(".modal__backdrop");

    // Reset state each time the modal opens.
    input.value = "";
    input.classList.remove("is-error");
    error.hidden = true;
    modal.hidden = false;
    setTimeout(() => input.focus(), 50);

    function cleanup(result) {
      modal.hidden = true;
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      backdrop.removeEventListener("click", onCancel);
      input.removeEventListener("keydown", onKey);
      resolve(result);
    }

    function onConfirm() {
      if (input.value === ADMIN_PASSWORD) {
        cleanup(true);
      } else {
        input.classList.add("is-error");
        error.hidden = false;
        input.value = "";
        input.focus();
      }
    }

    function onCancel() {
      cleanup(false);
    }

    function onKey(e) {
      if (e.key === "Enter") onConfirm();
      else if (e.key === "Escape") onCancel();
    }

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    backdrop.addEventListener("click", onCancel);
    input.addEventListener("keydown", onKey);
  });
}

/* ------------------------------------------------------------------ *
 * Admin Settings reveal (cog icon in header)
 * Keeps the popup clean by default: only the Cache view shows. Clicking
 * the cog prompts for the administrator password; only on success are the
 * Performance / Privacy / Settings tabs revealed.
 * ------------------------------------------------------------------ */
function initAdvanced() {
  const cog = $("advancedCog");
  const adminTabs = document.querySelectorAll(".tab--admin");
  if (!cog || !adminTabs.length) return;

  cog.addEventListener("click", async () => {
    const locked = [...adminTabs].some((t) =>
      t.classList.contains("is-hidden")
    );

    // If already unlocked this session, just jump back to the admin tabs.
    if (!locked) {
      const perfTab = document.querySelector('.tab[data-tab="performance"]');
      if (perfTab) perfTab.click();
      return;
    }

    const ok = await promptAdmin();
    if (!ok) return;

    adminTabs.forEach((t) => t.classList.remove("is-hidden"));

    // Jump straight to the first admin tab (Performance).
    const perfTab = document.querySelector('.tab[data-tab="performance"]');
    if (perfTab) perfTab.click();
  });
}

/* ------------------------------------------------------------------ *
 * Clear Cache action
 * ------------------------------------------------------------------ */
function initClearCache() {
  const btn = $("clearCacheBtn");
  const success = $("clearSuccess");

  btn.addEventListener("click", async () => {
    btn.classList.add("is-loading");
    success.hidden = true;

    // Minimum visible spinner time for a polished feel.
    const [response] = await Promise.all([
      sendMessage({ type: "CLEAR_CACHE" }),
      new Promise((r) => setTimeout(r, 550))
    ]);

    btn.classList.remove("is-loading");

    if (response && response.ok) {
      success.hidden = false;
      $("lastCleared").textContent = formatTimestamp(response.lastCleared);
      setTimeout(() => {
        success.hidden = true;
      }, 2000);
    } else {
      // Surface a lightweight error inline via the success container.
      success.hidden = false;
      success.querySelector("span:last-child").textContent =
        "Could not clear cache. Contact IT Help Desk.";
      setTimeout(() => {
        success.hidden = true;
        success.querySelector("span:last-child").textContent =
          "Cache cleared successfully";
      }, 2500);
    }
  });
}

/* ------------------------------------------------------------------ *
 * Clear Cookies quick action (dropdown next to Clear Cache)
 * ------------------------------------------------------------------ */
function initClearCookies() {
  const toggle = $("clearMenuToggle");
  const menu = $("clearMenu");
  const cookiesBtn = $("clearCookiesBtn");
  const success = $("clearSuccess");
  if (!toggle || !menu || !cookiesBtn) return;

  function closeMenu() {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  // Close the menu when clicking anywhere else.
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== toggle) {
      closeMenu();
    }
  });

  cookiesBtn.addEventListener("click", async () => {
    closeMenu();

    const [response] = await Promise.all([
      sendMessage({ type: "CLEAR_COOKIES" }),
      new Promise((r) => setTimeout(r, 300))
    ]);

    const label = success.querySelector("span:last-child");
    if (response && response.ok) {
      label.textContent = "Cookies cleared successfully";
    } else {
      label.textContent = "Could not clear cookies. Contact IT Help Desk.";
    }
    success.hidden = false;
    setTimeout(() => {
      success.hidden = true;
      label.textContent = "Cache cleared successfully";
    }, 2500);
  });
}

/* ------------------------------------------------------------------ *
 * Memory Saver: opens Chrome's built-in performance settings page.
 * (Chrome's built-in Memory Saver cannot be toggled via an extension API,
 * so we deep-link the user straight to the setting.)
 * ------------------------------------------------------------------ */
function initMemorySaver() {
  const btn = $("openMemorySaver");
  if (!btn) return;
  btn.addEventListener("click", () => {
    try {
      chrome.tabs.create({ url: "chrome://settings/performance" });
    } catch (e) {
      /* no-op */
    }
  });
}

/* ------------------------------------------------------------------ *
 * Monitor tab: live system memory / CPU usage + tab stats, plus the
 * memory limiter controls and a "Free memory now" action.
 *
 * NOTE: chrome.system.* reports SYSTEM-wide usage. Chrome has no stable
 * API for its own per-process memory, so this is a practical proxy.
 * ------------------------------------------------------------------ */
function getSystemMemory() {
  return new Promise((resolve) => {
    try {
      chrome.system.memory.getInfo((info) => {
        void chrome.runtime.lastError;
        resolve(info || null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

function getCpuInfo() {
  return new Promise((resolve) => {
    try {
      chrome.system.cpu.getInfo((info) => {
        void chrome.runtime.lastError;
        resolve(info || null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

function formatGB(bytes) {
  return (bytes / 1024 / 1024 / 1024).toFixed(1);
}

/** Sum busy/total ticks across all logical processors. */
function cpuTotals(info) {
  let busy = 0;
  let total = 0;
  if (info && Array.isArray(info.processors)) {
    for (const p of info.processors) {
      const u = p.usage || {};
      const t = (u.user || 0) + (u.kernel || 0) + (u.idle || 0);
      busy += (u.user || 0) + (u.kernel || 0);
      total += t;
    }
  }
  return { busy, total };
}

function initMonitor() {
  const memFill = $("memFill");
  const memValue = $("memValue");
  const memSub = $("memSub");
  const cpuFill = $("cpuFill");
  const cpuValue = $("cpuValue");
  const cpuSub = $("cpuSub");
  const tabTotal = $("tabTotal");
  const tabActive = $("tabActive");
  const tabHibernated = $("tabHibernated");
  if (!memFill) return; // Monitor panel not present.

  let prevCpu = null;

  async function refreshMemory() {
    const info = await getSystemMemory();
    if (!info || !info.capacity) {
      memValue.textContent = "N/A";
      memSub.textContent = "Memory info unavailable.";
      return;
    }
    const usedBytes = info.capacity - info.availableCapacity;
    const usedPct = (usedBytes / info.capacity) * 100;
    memFill.style.width = usedPct.toFixed(0) + "%";
    memFill.classList.toggle("is-high", usedPct >= 85);
    memValue.textContent = usedPct.toFixed(0) + "%";
    memSub.textContent =
      formatGB(usedBytes) +
      " GB used of " +
      formatGB(info.capacity) +
      " GB \u00b7 " +
      formatGB(info.availableCapacity) +
      " GB free";
  }

  async function refreshCpu() {
    const info = await getCpuInfo();
    if (!info) {
      cpuValue.textContent = "N/A";
      cpuSub.textContent = "CPU info unavailable.";
      return;
    }
    const cur = cpuTotals(info);
    if (prevCpu) {
      const dBusy = cur.busy - prevCpu.busy;
      const dTotal = cur.total - prevCpu.total;
      const load = dTotal > 0 ? Math.max(0, Math.min(100, (dBusy / dTotal) * 100)) : 0;
      cpuFill.style.width = load.toFixed(0) + "%";
      cpuFill.classList.toggle("is-high", load >= 85);
      cpuValue.textContent = load.toFixed(0) + "%";
      const cores = info.numOfProcessors || (info.processors || []).length;
      cpuSub.textContent =
        cores + (cores === 1 ? " logical core" : " logical cores");
    }
    prevCpu = cur;
  }

  async function refreshTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      const total = tabs.length;
      const hibernated = tabs.filter((t) => t.discarded).length;
      tabTotal.textContent = String(total);
      tabActive.textContent = String(total - hibernated);
      tabHibernated.textContent = String(hibernated);
    } catch (e) {
      /* leave defaults */
    }
  }

  async function refreshAll() {
    await Promise.all([refreshMemory(), refreshCpu(), refreshTabs()]);
  }

  // Prime CPU with two quick samples so a value shows almost immediately.
  refreshAll();
  setTimeout(refreshCpu, 600);
  setInterval(refreshAll, 2000);

  // ---- Free memory now ----
  const freeBtn = $("freeMemoryBtn");
  const freeResult = $("freeResult");
  if (freeBtn) {
    freeBtn.addEventListener("click", async () => {
      freeBtn.disabled = true;
      const response = await sendMessage({ type: "FREE_MEMORY_NOW" });
      freeBtn.disabled = false;
      if (response && response.ok) {
        const n = response.discarded || 0;
        freeResult.textContent =
          n === 0
            ? "No inactive tabs to hibernate."
            : "Hibernated " + n + (n === 1 ? " tab." : " tabs.");
      } else {
        freeResult.textContent = "Could not free memory.";
      }
      freeResult.hidden = false;
      await refreshTabs();
      setTimeout(() => {
        freeResult.hidden = true;
      }, 3000);
    });
  }
}

/* ------------------------------------------------------------------ *
 * Memory limiter controls (toggle + threshold slider) on the Monitor tab.
 * ------------------------------------------------------------------ */
async function initLimiter() {
  const toggle = $("memoryLimiter");
  const slider = $("memoryThreshold");
  const valueLabel = $("thresholdValue");
  if (!toggle || !slider) return;

  const stored = await getStored();

  toggle.checked = !!stored.memoryLimiter;
  slider.value = String(stored.memoryThresholdPercent || 20);
  valueLabel.textContent = slider.value + "%";
  slider.disabled = !toggle.checked;

  toggle.addEventListener("change", async () => {
    await saveSetting("memoryLimiter", toggle.checked);
    slider.disabled = !toggle.checked;
    await sendMessage({ type: "SYNC_ALARMS" });
  });

  // Live label while dragging.
  slider.addEventListener("input", () => {
    valueLabel.textContent = slider.value + "%";
  });

  // Persist on release.
  slider.addEventListener("change", async () => {
    await saveSetting("memoryThresholdPercent", parseInt(slider.value, 10));
  });
}

/* ------------------------------------------------------------------ *
 * Open Tabs list (Monitor tab)
 * Sorted by activity: active tab first, then most recently accessed,
 * hibernated tabs last. Click any row to switch to that tab.
 *
 * NOTE: chrome.processes (per-tab memory) is a Chrome Dev channel API
 * and is not available in stable Chrome builds.
 * ------------------------------------------------------------------ */

/** Format a timestamp as a relative "time ago" string. */
function timeAgo(ts) {
  if (!ts) return "\u2014";
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 10) return "Just now";
  if (seconds < 60) return seconds + "s ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}

/** Extract a display domain from a URL string. */
function getDomain(url) {
  if (!url) return "";
  try {
    const h = new URL(url).hostname;
    return h.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}

/**
 * Build a .tab-row DOM element for one tab.
 * @param {object} tab - chrome.tabs.Tab
 */
function buildTabRow(tab) {
  const row = document.createElement("div");
  row.className = "tab-row" + (tab.discarded ? " tab-row--discarded" : "");
  row.title = tab.title || tab.url || "(no title)";

  // Icon (favIconUrl img, fallback to inline SVG page icon)
  const iconWrap = document.createElement("span");
  iconWrap.className = "tab-row__icon";
  if (tab.favIconUrl && tab.favIconUrl.startsWith("http")) {
    const img = document.createElement("img");
    img.src = tab.favIconUrl;
    img.alt = "";
    img.onerror = () => {
      img.replaceWith(pageIconSvg());
    };
    iconWrap.appendChild(img);
  } else {
    iconWrap.appendChild(pageIconSvg());
  }

  // Info block
  const info = document.createElement("div");
  info.className = "tab-row__info";

  const titleEl = document.createElement("div");
  titleEl.className = "tab-row__title";
  titleEl.textContent = tab.title || tab.url || "(no title)";

  const domainEl = document.createElement("div");
  domainEl.className = "tab-row__domain";
  domainEl.textContent = getDomain(tab.url);

  info.appendChild(titleEl);
  info.appendChild(domainEl);

  // Status badge
  const status = document.createElement("div");
  let statusText, extraClass;
  if (tab.active) {
    statusText = "Active";
    extraClass = "tab-row__status--active";
  } else if (tab.discarded) {
    statusText = "Hibernated";
    extraClass = "tab-row__status--hibernated";
  } else {
    statusText = tab.lastAccessed ? timeAgo(tab.lastAccessed) : "\u2014";
    extraClass = "";
  }
  status.className = "tab-row__status" + (extraClass ? " " + extraClass : "");
  status.textContent = statusText;

  row.appendChild(iconWrap);
  row.appendChild(info);
  row.appendChild(status);

  // Click: switch to this tab.
  row.addEventListener("click", () => {
    try {
      chrome.tabs.update(tab.id, { active: true });
    } catch (e) { /* no-op */ }
  });

  return row;
}

/** Tiny inline SVG page icon for tabs without a favicon. */
function pageIconSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path1.setAttribute("d", "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z");
  const path2 = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  path2.setAttribute("points", "14 2 14 8 20 8");
  svg.appendChild(path1);
  svg.appendChild(path2);
  return svg;
}

function initTabMemory() {
  const list = $("tabMemList");
  const count = $("tabMemCount");
  if (!list) return;

  async function refresh() {
    let tabs;
    try {
      tabs = await chrome.tabs.query({});
    } catch (e) {
      return;
    }

    // Sort: active tab first, then most recently accessed, hibernated last.
    tabs.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (a.discarded !== b.discarded) return a.discarded ? 1 : -1;
      return (b.lastAccessed || 0) - (a.lastAccessed || 0);
    });

    // Render rows.
    list.innerHTML = "";
    tabs.forEach((tab) => {
      list.appendChild(buildTabRow(tab));
    });

    count.textContent = tabs.length + (tabs.length === 1 ? " tab" : " tabs");
  }

  refresh();
  const interval = setInterval(refresh, 3000);

  // Stop polling when the popup closes to avoid dangling timers.
  window.addEventListener("unload", () => clearInterval(interval));
}

/* ------------------------------------------------------------------ *
 * Toggle wiring
 * Each toggle: (1) restores state, (2) on change saves + applies.
 * ------------------------------------------------------------------ */
function bindToggle(id, onChange) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("change", async () => {
    await onChange(el.checked);
  });
}

async function initToggles() {
  const stored = await getStored();

  /* ---- Performance ---- */
  // Tab Hibernation lives only in storage (driven by an alarm).
  setChecked("tabHibernation", stored.tabHibernation);
  setChecked("tabDedupe", stored.tabDedupe);

  /* ---- Privacy ---- */
  const liveDnt = await getPref(chrome.privacy.websites.doNotTrackEnabled);
  setChecked("doNotTrack", liveDnt === null ? stored.doNotTrack : liveDnt);

  const liveThird = await getPref(
    chrome.privacy.websites.thirdPartyCookiesAllowed
  );
  // Toggle ON = block, so invert the "allowed" pref.
  setChecked(
    "blockThirdPartyCookies",
    liveThird === null ? stored.blockThirdPartyCookies : liveThird === false
  );

  const liveRtc = await getPref(chrome.privacy.network.webRTCIPHandlingPolicy);
  setChecked(
    "webRTCProtection",
    liveRtc === null
      ? stored.webRTCProtection
      : liveRtc === "disable_non_proxied_udp"
  );

  /* ---- Settings ---- */
  setChecked("clearOnStartup", stored.clearOnStartup);

  /* ---- Bindings ---- */
  bindToggle("tabHibernation", async (v) => {
    await saveSetting("tabHibernation", v);
    await sendMessage({ type: "SYNC_ALARMS" });
  });

  bindToggle("tabDedupe", async (v) => {
    await saveSetting("tabDedupe", v);
  });

  bindToggle("doNotTrack", async (v) => {
    await saveSetting("doNotTrack", v);
    await setPref(chrome.privacy.websites.doNotTrackEnabled, v);
  });

  bindToggle("blockThirdPartyCookies", async (v) => {
    await saveSetting("blockThirdPartyCookies", v);
    // ON = block, so allowed = !v.
    await setPref(chrome.privacy.websites.thirdPartyCookiesAllowed, !v);
  });

  bindToggle("webRTCProtection", async (v) => {
    await saveSetting("webRTCProtection", v);
    await setPref(
      chrome.privacy.network.webRTCIPHandlingPolicy,
      v ? "disable_non_proxied_udp" : "default"
    );
  });

  // Auto-clear on startup is a plain toggle (this whole Settings tab is
  // already behind the admin-password gate on the cog).
  bindToggle("clearOnStartup", async (v) => {
    await saveSetting("clearOnStartup", v);
  });
}

function setChecked(id, value) {
  const el = $(id);
  if (el) el.checked = !!value;
}

/* ---- Chrome pref setters (promisified, with error handling) ---- */
function setPref(pref, value) {
  return new Promise((resolve) => {
    try {
      pref.set({ value }, () => {
        // Read lastError to avoid unchecked warnings.
        void chrome.runtime.lastError;
        resolve();
      });
    } catch (e) {
      resolve();
    }
  });
}

/* ------------------------------------------------------------------ *
 * Footer / misc
 * ------------------------------------------------------------------ */
function initFooter() {
  try {
    const manifest = chrome.runtime.getManifest();
    $("versionNumber").textContent = manifest.version;
  } catch (e) {
    /* leave default */
  }

  // Ensure the Help Desk link opens in a new tab reliably.
  // NOTE: set a real support URL in the popup.html href before deploying.
  // Until then the placeholder href="#" is a no-op.
  const link = $("helpDeskLink");
  if (link) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const url = link.getAttribute("href");
      if (url && url !== "#") {
        chrome.tabs.create({ url });
      }
    });
  }
}

async function initLastCleared() {
  const stored = await getStored();
  $("lastCleared").textContent = formatTimestamp(stored.lastCleared);
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  initAdvanced();
  initClearCache();
  initClearCookies();
  initMemorySaver();
  initMonitor();
  initTabMemory();
  await initLimiter();
  initFooter();
  await initLastCleared();
  await initToggles();
});
