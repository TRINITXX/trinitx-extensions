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
  xMuteSelection: true,
  xHideByCountry: false,
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

  // --- X — Masquer par pays (liste de pays a masquer) ------------------------
  // La blacklist vit dans chrome.storage.local (cle hiddenCountries). Le content
  // script la lit via storage.onChanged et re-evalue le fil en direct. Tant que
  // la cle est absente, on part des defauts (Afrique + Inde + Pakistan).
  const XHBC_KEY = "hiddenCountries";
  const xhbcData = window.X_HIDE_BY_COUNTRY || {
    COUNTRIES: [],
    DEFAULT_HIDDEN: [],
  };
  const xhbcPanel = document.getElementById("xhbc-panel");
  const xhbcSearch = document.getElementById("xhbc-search");
  const xhbcList = document.getElementById("xhbc-list");
  const xhbcSummary = document.getElementById("xhbc-summary");
  let xhbcHidden = new Set();
  let xhbcRendered = false;

  const xhbcStored = await chrome.storage.local.get(XHBC_KEY);
  xhbcHidden = new Set(
    Array.isArray(xhbcStored[XHBC_KEY])
      ? xhbcStored[XHBC_KEY]
      : xhbcData.DEFAULT_HIDDEN,
  );

  const xhbcSave = () =>
    chrome.storage.local.set({ [XHBC_KEY]: [...xhbcHidden] });

  const xhbcRenderSummary = () => {
    const n = xhbcHidden.size;
    xhbcSummary.textContent = `${n} pays masqué${n > 1 ? "s" : ""}`;
  };

  const xhbcRender = () => {
    const frag = document.createDocumentFragment();
    const sorted = [...xhbcData.COUNTRIES].sort((a, b) =>
      a.n.localeCompare(b.n, "en"),
    );
    for (const { n, f } of sorted) {
      const row = document.createElement("label");
      row.className = "xhbc-row";
      row.dataset.name = n.toLowerCase();

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = xhbcHidden.has(n);
      cb.addEventListener("change", () => {
        if (cb.checked) xhbcHidden.add(n);
        else xhbcHidden.delete(n);
        xhbcRenderSummary();
        xhbcSave();
      });

      const flag = document.createElement("span");
      flag.className = "xhbc-flag";
      flag.textContent = f;

      const name = document.createElement("span");
      name.className = "xhbc-name";
      name.textContent = n;

      row.append(cb, flag, name);
      frag.appendChild(row);
    }
    xhbcList.appendChild(frag);
    xhbcRenderSummary();
    xhbcRendered = true;
  };

  xhbcSearch.addEventListener("input", () => {
    const term = xhbcSearch.value.trim().toLowerCase();
    xhbcList.querySelectorAll(".xhbc-row").forEach((r) => {
      r.style.display = !term || r.dataset.name.includes(term) ? "" : "none";
    });
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
      } else if (action === "xhbc-settings") {
        xhbcPanel.hidden = !xhbcPanel.hidden;
        a.textContent = xhbcPanel.hidden ? "Réglages pays →" : "Réglages pays ↓";
        if (!xhbcPanel.hidden) {
          if (!xhbcRendered) xhbcRender();
          xhbcSearch.focus();
        }
      }
    });
  });
});
