/**
 * MCK Browser Manager - Options page controller.
 * Mirrors the "Auto-clear cache on startup" setting from the popup.
 * Managed by McKinney IT Help Desk.
 */

const DEFAULT_CLEAR_ON_STARTUP = true;

document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("clearOnStartup");
  const versionEl = document.getElementById("versionNumber");

  // Show extension version.
  try {
    versionEl.textContent = chrome.runtime.getManifest().version;
  } catch (e) {
    /* leave default */
  }

  // Restore stored value.
  try {
    const { clearOnStartup } = await chrome.storage.local.get({
      clearOnStartup: DEFAULT_CLEAR_ON_STARTUP
    });
    toggle.checked = !!clearOnStartup;
  } catch (e) {
    toggle.checked = DEFAULT_CLEAR_ON_STARTUP;
  }

  // Plain toggle: save on change (no admin gate on this setting).
  toggle.addEventListener("change", async () => {
    try {
      await chrome.storage.local.set({ clearOnStartup: toggle.checked });
    } catch (err) {
      // console.debug("MCK options: save failed", err);
    }
  });
});
