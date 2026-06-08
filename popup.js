// Popup : pilote les toggles de modules + actions.
const DEFAULT_MODULES = { pip: true, xAutoSort: true, xAutoScroll: true };

function showStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.style.opacity = "1";
  setTimeout(() => (el.style.opacity = "0"), 1800);
}

async function getModules() {
  const { modules } = await chrome.storage.local.get("modules");
  return { ...DEFAULT_MODULES, ...(modules || {}) };
}

function reflect(modules) {
  document
    .querySelectorAll('input[type="checkbox"][data-module]')
    .forEach((cb) => {
      const key = cb.dataset.module;
      cb.checked = !!modules[key];
      const section = document.querySelector(
        `section.module[data-module="${key}"]`,
      );
      if (section) section.classList.toggle("off", !modules[key]);
    });
}

document.addEventListener("DOMContentLoaded", async () => {
  const modules = await getModules();
  reflect(modules);

  // Toggles
  document
    .querySelectorAll('input[type="checkbox"][data-module]')
    .forEach((cb) => {
      cb.addEventListener("change", async () => {
        const current = await getModules();
        current[cb.dataset.module] = cb.checked;
        await chrome.storage.local.set({ modules: current });
        reflect(current);
        showStatus(cb.checked ? "Module activé" : "Module désactivé");
      });
    });

  // Actions
  document.querySelectorAll("a.action").forEach((a) => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      const action = a.dataset.action;
      if (action === "shortcuts") {
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
      } else if (action === "clear-scroll") {
        await chrome.storage.local.remove("lastSeenTweetHref");
        showStatus("Position effacée");
      }
    });
  });
});
