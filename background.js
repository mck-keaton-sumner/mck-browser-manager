/**
 * MCK Browser Manager - Background Service Worker (Manifest V3)
 * -----------------------------------------------------------------
 * Responsibilities:
 *   1. Apply managed defaults on install.
 *   2. On Chrome startup, clear cache if `clearOnStartup` is enabled and
 *      re-apply all stored privacy / performance settings.
 *   3. Run a periodic alarm for Tab Hibernation.
 *
 * Managed by McKinney IT Help Desk.
 */

/* ------------------------------------------------------------------ *
 * Default settings (everything OFF by default).
 * ------------------------------------------------------------------ */
const DEFAULT_SETTINGS = {
  clearOnStartup: true, // Auto-clear cache on Chrome startup.
  tabHibernation: false, // Discard tabs inactive > HIBERNATION_MINUTES.
  memoryLimiter: false, // Auto-hibernate inactive tabs under memory pressure.
  memoryThresholdPercent: 20, // Kick in when free system memory drops below this %.
  tabDedupe: true, // Redirect to existing tab instead of opening a duplicate.
  doNotTrack: false, // chrome.privacy.websites.doNotTrackEnabled.
  blockThirdPartyCookies: false, // chrome.privacy.websites.thirdPartyCookiesAllowed (false = block).
  webRTCProtection: false, // chrome.privacy.network.webRTCIPHandlingPolicy.
  lastCleared: null // Timestamp of last successful cache clear.
};

const HIBERNATION_MINUTES = 60; // Tabs inactive longer than this are hibernated.

const HIBERNATION_ALARM = "mck-tab-hibernation";
const MEMORY_GUARD_ALARM = "mck-memory-guard";
const MEMORY_GUARD_MINUTES = 1; // How often the limiter checks memory pressure.

/* Tracks the last time each tab was activated (in-memory, best effort). */
const tabLastActive = {};

/* Tracks tab IDs that were freshly created this session (for deduplication). */
const newTabIds = new Set();

/* Caches tab metadata captured from onUpdated changeInfo events.
   Populated via changeInfo, which is available without the `tabs` permission.
   Used by deduplication and the GET_TABS_INFO message handler. */
const tabUrlMap     = new Map(); // tabId → URL string
const tabTitleMap   = new Map(); // tabId → page title string
const tabFaviconMap = new Map(); // tabId → favIconUrl string

/* ------------------------------------------------------------------ *
 * Storage helpers
 * ------------------------------------------------------------------ */
async function getSettings() {
  try {
    const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch (e) {
    // console.debug("MCK: getSettings failed", e);
    return { ...DEFAULT_SETTINGS };
  }
}

async function setSetting(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (e) {
    // console.debug("MCK: setSetting failed", e);
  }
}

/* ------------------------------------------------------------------ *
 * Cache clearing
 * ------------------------------------------------------------------ */
async function clearCache() {
  try {
    await chrome.browsingData.removeCache({ since: 0 });
    await setSetting("lastCleared", Date.now());
    return true;
  } catch (e) {
    // console.debug("MCK: clearCache failed", e);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Cookie clearing (triggered from the popup's quick-action menu)
 * ------------------------------------------------------------------ */
async function clearCookies() {
  try {
    await chrome.browsingData.removeCookies({ since: 0 });
    return true;
  } catch (e) {
    // console.debug("MCK: clearCookies failed", e);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Privacy / performance appliers
 * Each wraps a Chrome API call in try/catch so one failure can't break
 * the rest of the startup sequence.
 * ------------------------------------------------------------------ */
async function applyDoNotTrack(enabled) {
  try {
    await chrome.privacy.websites.doNotTrackEnabled.set({ value: !!enabled });
  } catch (e) {
    // console.debug("MCK: applyDoNotTrack failed", e);
  }
}

async function applyThirdPartyCookies(block) {
  try {
    // `thirdPartyCookiesAllowed = false` blocks third-party cookies.
    await chrome.privacy.websites.thirdPartyCookiesAllowed.set({
      value: !block
    });
  } catch (e) {
    // console.debug("MCK: applyThirdPartyCookies failed", e);
  }
}

async function applyWebRTCProtection(enabled) {
  try {
    await chrome.privacy.network.webRTCIPHandlingPolicy.set({
      value: enabled ? "disable_non_proxied_udp" : "default"
    });
  } catch (e) {
    // console.debug("MCK: applyWebRTCProtection failed", e);
  }
}

/**
 * Re-apply every stored privacy/performance setting. Called on startup and
 * on install so the managed configuration survives browser restarts.
 */
async function applyAllSettings(settings) {
  const s = settings || (await getSettings());
  await applyDoNotTrack(s.doNotTrack);
  await applyThirdPartyCookies(s.blockThirdPartyCookies);
  await applyWebRTCProtection(s.webRTCProtection);
  await syncAlarms(s);
}

/* ------------------------------------------------------------------ *
 * Alarm for Tab Hibernation
 * ------------------------------------------------------------------ */
async function syncAlarms(settings) {
  const s = settings || (await getSettings());
  try {
    if (s.tabHibernation) {
      await chrome.alarms.create(HIBERNATION_ALARM, { periodInMinutes: 10 });
    } else {
      await chrome.alarms.clear(HIBERNATION_ALARM);
    }

    if (s.memoryLimiter) {
      await chrome.alarms.create(MEMORY_GUARD_ALARM, {
        periodInMinutes: MEMORY_GUARD_MINUTES
      });
    } else {
      await chrome.alarms.clear(MEMORY_GUARD_ALARM);
    }
  } catch (e) {
    // console.debug("MCK: syncAlarms failed", e);
  }
}

/* ------------------------------------------------------------------ *
 * Resource helpers (system memory / CPU)
 * These read SYSTEM-wide stats; Chrome has no stable API for its own
 * per-process memory, so system usage is used as a practical proxy.
 * ------------------------------------------------------------------ */
function getMemoryInfo() {
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

function freePercent(info) {
  if (!info || !info.capacity) return 100;
  return (info.availableCapacity / info.capacity) * 100;
}

/**
 * Hibernate (discard) inactive tabs to relieve memory pressure.
 * When `force` is true, discards every eligible inactive tab immediately
 * (used by the "Free memory now" button). Otherwise discards least-recently
 * used tabs one at a time until free memory rises above the threshold.
 * Returns { discarded, freePct }.
 */
async function enforceMemoryLimit(force) {
  const s = await getSettings();
  if (!force && !s.memoryLimiter) return { discarded: 0 };

  let discarded = 0;
  try {
    let info = await getMemoryInfo();
    let freePct = freePercent(info);
    const threshold = s.memoryThresholdPercent || 20;

    if (!force && freePct >= threshold) {
      return { discarded: 0, freePct };
    }

    const tabs = await chrome.tabs.query({});
    const candidates = tabs.filter(
      (t) =>
        !t.active &&
        !t.audible &&
        !t.pinned &&
        !t.discarded &&
        typeof t.id === "number"
    );
    // Least-recently-active first.
    candidates.sort(
      (a, b) => (tabLastActive[a.id] || 0) - (tabLastActive[b.id] || 0)
    );

    for (const tab of candidates) {
      try {
        await chrome.tabs.discard(tab.id);
        discarded++;
      } catch (inner) {
        // console.debug("MCK: discard failed for tab", tab.id, inner);
      }
      if (!force) {
        info = await getMemoryInfo();
        freePct = freePercent(info);
        if (freePct >= threshold) break;
      }
    }
    return { discarded, freePct };
  } catch (e) {
    // console.debug("MCK: enforceMemoryLimit failed", e);
    return { discarded };
  }
}

/**
 * Discard tabs that have been inactive longer than `thresholdMinutes`.
 * Skips the active tab, audible tabs, pinned tabs, and already-discarded tabs.
 */
async function discardInactiveTabs(thresholdMinutes) {
  const now = Date.now();
  const thresholdMs = thresholdMinutes * 60 * 1000;
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (
        tab.active ||
        tab.audible ||
        tab.pinned ||
        tab.discarded ||
        typeof tab.id !== "number"
      ) {
        continue;
      }
      const lastActive = tabLastActive[tab.id] || now;
      if (now - lastActive >= thresholdMs) {
        try {
          await chrome.tabs.discard(tab.id);
        } catch (inner) {
          // console.debug("MCK: discard failed for tab", tab.id, inner);
        }
      }
    }
  } catch (e) {
    // console.debug("MCK: discardInactiveTabs failed", e);
  }
}

/* ------------------------------------------------------------------ *
 * Tab deduplication helper
 * Normalises a URL for comparison: strips fragment, removes trailing
 * slash from the pathname so /mail/u/0/ and /mail/u/0 match, keeps
 * query string (different params = different page).
 * ------------------------------------------------------------------ */
function normalizeTabUrl(url) {
  try {
    const u = new URL(url);
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return u.protocol + "//" + u.host + path + u.search;
  } catch (e) {
    return url;
  }
}

/* ------------------------------------------------------------------ *
 * Event listeners
 * ------------------------------------------------------------------ */

// Seed defaults on first install / upgrade, then apply managed settings.
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(null);
  const merged = { ...DEFAULT_SETTINGS, ...current };
  await chrome.storage.local.set(merged);
  await applyAllSettings(merged);
});

// On Chrome startup: clear cache (if enabled) and re-apply all settings.
chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  if (settings.clearOnStartup) {
    await clearCache();
  }
  await applyAllSettings(settings);
});

// Mark brand-new tabs so the dedup listener can distinguish them from
// existing tabs navigating to a new URL.
chrome.tabs.onCreated.addListener((tab) => {
  newTabIds.add(tab.id);
});

// Track tab activity for Memory Saver / Hibernation,
// cache tab metadata from changeInfo (no `tabs` permission needed),
// AND perform tab deduplication for newly-created tabs.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  tabLastActive[tabId] = Date.now();

  // Cache tab metadata from changeInfo — available without the `tabs` permission.
  if (changeInfo.url)        tabUrlMap.set(tabId, changeInfo.url);
  if (changeInfo.title)      tabTitleMap.set(tabId, changeInfo.title);
  if (changeInfo.favIconUrl) tabFaviconMap.set(tabId, changeInfo.favIconUrl);

  // Deduplication: only fires once per new tab, only for http(s) URLs.
  if (
    newTabIds.has(tabId) &&
    changeInfo.status === "loading" &&
    changeInfo.url &&
    (changeInfo.url.startsWith("http://") || changeInfo.url.startsWith("https://"))
  ) {
    newTabIds.delete(tabId); // Only check once per tab.
    const s = await getSettings();
    if (!s.tabDedupe) return;

    const normalized = normalizeTabUrl(changeInfo.url);

    // Search our URL cache instead of querying tab.url (which needs `tabs` perm).
    let existingTabId = null;
    for (const [tid, tUrl] of tabUrlMap) {
      if (tid !== tabId && normalizeTabUrl(tUrl) === normalized) {
        existingTabId = tid;
        break;
      }
    }

    if (existingTabId !== null) {
      try {
        // tab.windowId is available without `tabs` permission.
        const existingTab = await chrome.tabs.get(existingTabId);
        await chrome.tabs.update(existingTabId, { active: true });
        await chrome.windows.update(existingTab.windowId, { focused: true });
        await chrome.tabs.remove(tabId);
      } catch (e) {
        // Tab may have already navigated or been closed — no-op.
      }
    }
  }
});

chrome.tabs.onActivated.addListener((info) => {
  tabLastActive[info.tabId] = Date.now();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabLastActive[tabId];
  newTabIds.delete(tabId);
  tabUrlMap.delete(tabId);
  tabTitleMap.delete(tabId);
  tabFaviconMap.delete(tabId);
});

// Alarm handler for Tab Hibernation sweeps.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const settings = await getSettings();
  if (alarm.name === HIBERNATION_ALARM && settings.tabHibernation) {
    await discardInactiveTabs(HIBERNATION_MINUTES);
  } else if (alarm.name === MEMORY_GUARD_ALARM && settings.memoryLimiter) {
    await enforceMemoryLimit(false);
  }
});

/* ------------------------------------------------------------------ *
 * Message bridge (used by popup for actions that benefit from the
 * service worker context, e.g. clearing cache and syncing alarms).
 * ------------------------------------------------------------------ */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case "CLEAR_CACHE": {
          const ok = await clearCache();
          const { lastCleared } = await chrome.storage.local.get("lastCleared");
          sendResponse({ ok, lastCleared });
          break;
        }
        case "CLEAR_COOKIES": {
          const ok = await clearCookies();
          sendResponse({ ok });
          break;
        }
        case "SYNC_ALARMS": {
          await syncAlarms();
          sendResponse({ ok: true });
          break;
        }
        case "FREE_MEMORY_NOW": {
          const result = await enforceMemoryLimit(true);
          sendResponse({ ok: true, ...result });
          break;
        }
        case "APPLY_ALL": {
          await applyAllSettings();
          sendResponse({ ok: true });
          break;
        }
        case "GET_TABS_INFO": {
          // Returns tab objects enriched with cached url/title/favIconUrl
          // from our Maps (captured via changeInfo — no `tabs` permission needed).
          let rawTabs;
          try {
            rawTabs = await chrome.tabs.query({});
          } catch (e) {
            rawTabs = [];
          }
          const enriched = rawTabs.map((t) => ({
            id:           t.id,
            windowId:     t.windowId,
            index:        t.index,
            active:       t.active,
            pinned:       t.pinned,
            audible:      t.audible,
            discarded:    t.discarded,
            lastAccessed: t.lastAccessed,
            url:          tabUrlMap.get(t.id)     || "",
            title:        tabTitleMap.get(t.id)   || "",
            favIconUrl:   tabFaviconMap.get(t.id) || ""
          }));
          sendResponse({ ok: true, tabs: enriched });
          break;
        }
        default:
          sendResponse({ ok: false, error: "Unknown message type" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // Keep the message channel open for the async response.
});
