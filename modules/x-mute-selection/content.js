// Masquer sur X — pilote le formulaire natif des mots masques.
// -----------------------------------------------------------------------------
// Ce script tourne UNIQUEMENT sur x.com/settings/add_muted_keyword. Quand le
// menu contextuel "Masquer sur X" est declenche sur une selection, le background
// ouvre cette page dans une fenetre minimisee en arriere-plan et memorise un
// "job" (le mot a masquer) pour cet onglet. Ce script demande son job au
// background : si un job existe, il remplit le formulaire natif de X et clique
// Enregistrer -> c'est le client de X lui-meme qui genere la signature
// x-client-transaction-id requise par l'endpoint (aucune crypto reimplementee).
// Si aucun job (visite manuelle des reglages), il ne touche a rien.
(() => {
  // Guard : eviter une double execution si le script est reinjecte.
  if (window.__xMuteSelectionLoaded) return;
  window.__xMuteSelectionLoaded = true;

  const TAG = "[X-MuteSelection]";
  const log = (...a) => console.log(TAG, ...a);

  // Selecteurs du formulaire (releves sur x.com/settings/add_muted_keyword).
  const INPUT_SEL = 'input[name="keyword"]';
  const WHO_GROUP = "radioGroupmute_notifications_option"; // De tout le monde / ...
  const DURATION_GROUP = "radioGrouptime_duration"; // Jusqu'a reaffichage / 24h / ...
  const WHO_EVERYONE = "De tout le monde"; // defaut = "Des personnes que vous ne suivez pas"
  const DURATION_FOREVER = "Jusqu'à ce que vous réaffichiez"; // defaut deja coche
  const SAVE_LABEL = "Enregistrer";

  // Le background repond avec le mot a masquer si CET onglet correspond a un job.
  chrome.runtime.sendMessage({ type: "mute-job-request" }, (res) => {
    if (chrome.runtime.lastError) return; // background injoignable -> abandon
    const keyword = res && res.keyword;
    if (!keyword) return; // visite manuelle : ne rien faire
    log("job recu, masquage de:", keyword);
    runJob(String(keyword)).then(
      () => finish(true, keyword),
      (e) => {
        log("echec:", (e && e.message) || e);
        finish(false, keyword);
      },
    );
  });

  // Signale au background que le job est termine (il ferme la fenetre).
  function finish(ok, keyword) {
    chrome.runtime.sendMessage({ type: "mute-job-done", ok, keyword }, () => {
      void chrome.runtime.lastError;
    });
  }

  // Attend qu'un finder renvoie un element (via MutationObserver), avec timeout.
  // Robuste au throttling des fenetres d'arriere-plan : ne depend pas des timers
  // pour detecter l'element (l'observer se declenche sur les mutations reelles).
  function waitForEl(find, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const first = find();
      if (first) return resolve(first);
      const obs = new MutationObserver(() => {
        const el = find();
        if (el) {
          obs.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      const timer = setTimeout(() => {
        obs.disconnect();
        reject(new Error("timeout"));
      }, timeout);
    });
  }

  // Ecrit dans un input controle par React : le setter natif contourne le setter
  // React, puis l'event 'input' fait re-render (sinon la valeur est ignoree et
  // le bouton Enregistrer reste desactive).
  function setReactInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Coche l'option d'un radiogroup dont le label commence par un texte donne.
  function selectRadio(groupTestId, labelText) {
    const group = document.querySelector(`[data-testid="${groupTestId}"]`);
    if (!group) return false;
    const label = [...group.querySelectorAll("label")].find((l) =>
      (l.textContent || "").trim().startsWith(labelText),
    );
    if (!label) return false;
    const radio = label.querySelector('input[type="radio"]');
    (radio || label).click();
    return true;
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function runJob(keyword) {
    // 1) Champ mot-cle (attend le boot de l'app X).
    const input = await waitForEl(() => document.querySelector(INPUT_SEL));
    setReactInputValue(input, keyword);

    // 2) "De tout le monde" : le defaut est "Des personnes que vous ne suivez
    //    pas", donc il FAUT changer. On attend que le radiogroup soit monte
    //    avant de cocher, sinon on soumettrait avec le mauvais reglage.
    await waitForEl(() =>
      document.querySelector(`[data-testid="${WHO_GROUP}"]`),
    );
    if (!selectRadio(WHO_GROUP, WHO_EVERYONE)) {
      log("option 'De tout le monde' introuvable (defaut conserve)");
    }

    // 3) Duree "pour toujours" : deja cochee par defaut, on la reaffirme.
    selectRadio(DURATION_GROUP, DURATION_FOREVER);

    // 4) Bouton Enregistrer (attendre qu'il devienne actif).
    const save = await waitForEl(() => {
      const b = [...document.querySelectorAll('[role="button"]')].find(
        (x) => (x.textContent || "").trim() === SAVE_LABEL,
      );
      return b && b.getAttribute("aria-disabled") !== "true" ? b : null;
    }, 8000);

    // Laisser React committer l'etat des radios avant le submit.
    await wait(100);
    save.click();

    // 5) Confirmer : au succes, X renavigue vers la liste des mots masques.
    await waitForSaved();
  }

  function waitForSaved() {
    return new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (
          location.pathname.endsWith("/muted_keywords") ||
          Date.now() - start > 6000
        ) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  }

  log("driver pret");
})();
