// Popup : pilote les toggles de modules + actions.
const DEFAULT_MODULES = {
  pip: true,
  xAutoSort: true,
  xAutoScroll: true,
  xQuickBlock: true,
  xHideSponsored: true,
  xDimTheme: true,
  twitchNoSub: true,
  twitchAdsVaft: true,
  twitchPreview: true,
  twitchVolumeLimiter: true,
  youtubeCustomSpeed: true,
  youtubeNoTranslation: true,
  youtubeBestQuality: true,
};

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

  // --- Interrupteur maitre (tout activer / desactiver) -----------------------
  // Surclasse tous les modules sans toucher a leurs etats individuels :
  // au rallumage, chaque module retrouve son reglage.
  const masterCb = document.getElementById("master-toggle");
  const { masterEnabled } = await chrome.storage.local.get("masterEnabled");
  const masterOn = masterEnabled !== false; // defaut : true
  masterCb.checked = masterOn;
  document.body.classList.toggle("master-off", !masterOn);
  masterCb.addEventListener("change", async () => {
    await chrome.storage.local.set({ masterEnabled: masterCb.checked });
    document.body.classList.toggle("master-off", !masterCb.checked);
    showStatus(masterCb.checked ? "Tout réactivé" : "Tout désactivé");
  });

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

  // --- Curseur du limiteur Twitch (seuil en dB) ------------------------------
  // Le content script lit la valeur via storage.onChanged et l'applique en live.
  const limiterSlider = document.getElementById("limiter-threshold");
  const limiterOut = document.getElementById("limiter-threshold-val");
  const LIMITER_KEY = "twitchLimiterThreshold";

  const renderLimiter = (v) => {
    limiterOut.textContent = v >= 0 ? "aucune limite" : `${v} dB`;
  };

  const { [LIMITER_KEY]: storedThreshold } =
    await chrome.storage.local.get(LIMITER_KEY);
  const initialThreshold =
    typeof storedThreshold === "number" ? storedThreshold : 0;
  limiterSlider.value = String(initialThreshold);
  renderLimiter(initialThreshold);

  let limiterTimer;
  limiterSlider.addEventListener("input", () => {
    const v = Number(limiterSlider.value);
    renderLimiter(v);
    clearTimeout(limiterTimer); // debounce : évite d'écrire à chaque pixel
    limiterTimer = setTimeout(
      () => chrome.storage.local.set({ [LIMITER_KEY]: v }),
      120,
    );
  });

  // --- Recharger les onglets -------------------------------------------------
  const reloadBtn = document.getElementById("reload-tabs-btn");
  const patternsEl = document.getElementById("reload-patterns");
  const filtersPanel = document.getElementById("filters-panel");

  // Charge les patterns sauvegardes dans le textarea
  const { reloadSkipPatterns } =
    await chrome.storage.local.get("reloadSkipPatterns");
  patternsEl.value = reloadSkipPatterns || "";

  // Sauvegarde : debounced pendant la frappe, immediate au blur
  const savePatterns = () =>
    chrome.storage.local.set({ reloadSkipPatterns: patternsEl.value });
  let saveTimer;
  patternsEl.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePatterns, 350);
  });
  patternsEl.addEventListener("blur", () => {
    clearTimeout(saveTimer);
    savePatterns();
  });

  // Clic -> le background recharge la fenetre active et renvoie les comptes
  reloadBtn.addEventListener("click", async () => {
    reloadBtn.disabled = true;
    try {
      const res = (await chrome.runtime.sendMessage({
        type: "reload-tabs",
      })) || {
        reloaded: 0,
        skipped: 0,
      };
      const plural = (n) => (n > 1 ? "s" : "");
      let msg = `${res.reloaded} rechargé${plural(res.reloaded)}`;
      if (res.skipped) msg += ` · ${res.skipped} ignoré${plural(res.skipped)}`;
      showStatus(msg);
    } catch {
      showStatus("Erreur");
    } finally {
      reloadBtn.disabled = false;
    }
  });

  // Actions
  document.querySelectorAll("a.action").forEach((a) => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      const action = a.dataset.action;
      if (action === "shortcuts") {
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
      } else if (action === "ynt-settings") {
        chrome.tabs.create({
          url: chrome.runtime.getURL(
            "modules/youtube-no-translation/dist/popup/settings.html",
          ),
        });
      } else if (action === "clear-scroll") {
        await chrome.storage.local.remove("lastSeenTweetHref");
        showStatus("Position effacée");
      } else if (action === "toggle-filters") {
        filtersPanel.hidden = !filtersPanel.hidden;
        a.textContent = filtersPanel.hidden
          ? "Filtres d'exclusion →"
          : "Filtres d'exclusion ↓";
        if (!filtersPanel.hidden) patternsEl.focus();
      }
    });
  });
});
