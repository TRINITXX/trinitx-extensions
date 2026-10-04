// Capture de zone — selection d'un rectangle qui peut depasser l'ecran.
// Injecte A LA DEMANDE par background.js (menu clic droit) dans tous les
// cadres de l'onglet, pas enregistre.
// 1er clic = premier coin, molette libre, 2e clic = coin oppose. Echap annule.
// D'abord le redessin instantane de la zone par snapdom (vendore, MIT, charge
// avant ce fichier). Repli quand le DOM ne contient pas toute la zone (listes
// virtualisees de X, Discord...) : la zone est defilee ecran par ecran, le
// service worker prend chaque ecran (chrome.debugger, sinon
// captureVisibleTab) et il est recolle ici.
// Le resultat est copie dans le presse-papiers et telecharge depuis ici.
(() => {
  // Guard : une seule selection a la fois, meme si le menu est re-clique.
  if (window.__areaScreenshotActive) return;
  window.__areaScreenshotActive = true;

  const TAG = "[AreaScreenshot]";
  // Plafond Chrome d'un cote de canvas (~32767 px) avec une marge.
  const MAX_SIDE = 32000;
  // captureVisibleTab : ~2 appels par seconde maximum.
  const CAPTURE_GAP_MS = 550;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextPaint = () =>
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // --- Conteneur de defilement -----------------------------------------------
  // Le "scroller" est soit la page (document.scrollingElement), soit le panneau
  // interne qui defile sous le premier clic. Coordonnees "contenu" = position
  // dans le contenu defilable, stables quand on defile.
  const root = document.scrollingElement || document.documentElement;

  function isScrollable(el) {
    if (el.scrollHeight <= el.clientHeight + 1) return false;
    const oy = getComputedStyle(el).overflowY;
    return oy === "auto" || oy === "scroll" || oy === "overlay";
  }

  function findScroller(target) {
    for (let el = target; el && el !== document.body; el = el.parentElement) {
      if (el === document.documentElement) break;
      if (el instanceof Element && isScrollable(el)) return el;
    }
    return root;
  }

  // Zone visible du scroller dans la fenetre (sans les barres de defilement).
  function viewRect(sc) {
    if (sc === root) {
      return {
        left: 0,
        top: 0,
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      };
    }
    const r = sc.getBoundingClientRect();
    return {
      left: r.left + sc.clientLeft,
      top: r.top + sc.clientTop,
      width: sc.clientWidth,
      height: sc.clientHeight,
    };
  }

  function toContent(sc, cx, cy) {
    const v = viewRect(sc);
    return {
      x: cx - v.left + sc.scrollLeft,
      y: cy - v.top + sc.scrollTop,
    };
  }

  function toViewport(sc, x, y) {
    const v = viewRect(sc);
    return { x: x - sc.scrollLeft + v.left, y: y - sc.scrollTop + v.top };
  }

  // --- Cadres (iframes) --------------------------------------------------------
  // Le script est injecte dans TOUS les cadres de l'onglet : sur une page dont
  // le contenu vit dans une iframe (artefacts claude.ai...), les clics et la
  // molette n'atteignent que le cadre sous la souris. Le cadre du 1er clic
  // devient proprietaire de la selection ; les autres passent en mode passif
  // (clics bloques, rien d'affiche) jusqu'au message "end".
  const isTop = window === window.top;
  const token = Math.random().toString(36).slice(2);

  function broadcast(event) {
    chrome.runtime.sendMessage({ type: "area-broadcast", event, token }).catch(() => {});
  }

  function onRuntimeMessage(msg, _sender, sendResponse) {
    if (msg && msg.type === "area-log" && isTop) {
      console.log(TAG, "[iframe]", msg.line);
      keepLog("[iframe] " + msg.line);
      return;
    }
    if (msg && msg.type === "area-copy" && isTop) {
      fetch(msg.dataUrl)
        .then((r) => r.blob())
        .then(copyBlob)
        .then((ok) => sendResponse({ ok }))
        .catch(() => sendResponse({ ok: false }));
      return true; // reponse asynchrone
    }
    if (!msg || msg.type !== "area-broadcast" || msg.token === token) return;
    if (msg.event === "claim") goPassive();
    // "end" pendant la prise = Echap tape dans un autre cadre (souvent le
    // cadre principal, qui garde le focus clavier) : on interrompt.
    else if (msg.event === "end") {
      if (capturing) aborted = true;
      else shutdown();
    }
  }

  // Position du cadre dans l'onglet + largeur de la fenetre principale, par
  // une chaine de postMessage vers les parents : chacun retrouve l'iframe
  // emettrice (contentWindow === source, comparable meme cross-origin).
  function frameOffset() {
    if (isTop) return Promise.resolve({ x: 0, y: 0, topWidth: window.innerWidth });
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const onReply = (e) => {
        const d = e.data;
        if (e.source !== window.parent || !d || d.__areaShot !== "offset-reply" || d.id !== id) return;
        window.removeEventListener("message", onReply);
        clearTimeout(timer);
        resolve(d.offset);
      };
      const timer = setTimeout(() => {
        window.removeEventListener("message", onReply);
        reject(new Error("position du cadre introuvable"));
      }, 3000);
      window.addEventListener("message", onReply);
      window.parent.postMessage({ __areaShot: "offset-ask", id }, "*");
    });
  }

  async function onOffsetAsk(e) {
    const d = e.data;
    if (!d || d.__areaShot !== "offset-ask") return;
    const frame = [...document.querySelectorAll("iframe, frame")].find(
      (f) => f.contentWindow === e.source,
    );
    if (!frame) return;
    const base = await frameOffset();
    const r = frame.getBoundingClientRect();
    const cs = getComputedStyle(frame);
    const offset = {
      x: base.x + r.left + frame.clientLeft + parseFloat(cs.paddingLeft),
      y: base.y + r.top + frame.clientTop + parseFloat(cs.paddingTop),
      topWidth: base.topWidth,
    };
    e.source.postMessage({ __areaShot: "offset-reply", id: d.id, offset }, "*");
  }

  // --- Interface de selection -------------------------------------------------
  // L'overlay est en pointer-events: none : la molette defile donc nativement
  // ce qui est sous la souris (page OU panneau). Les clics sont bloques par
  // des ecouteurs en capture sur window.
  const ui = document.createElement("div");
  ui.style.cssText =
    "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  // Voile sombre d'attente : dessine par le cadre principal seulement, il
  // recouvre deja les iframes (sinon double assombrissement).
  const shade = document.createElement("div");
  shade.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.35);" + (isTop ? "" : "display:none;");
  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;display:none;outline:2px dashed #fff;" +
    "box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 0 100000px rgba(0,0,0,.35);";
  const label = document.createElement("div");
  label.style.cssText =
    "position:fixed;display:none;padding:4px 8px;border-radius:6px;background:#111;" +
    "color:#fff;font:600 12px/1.3 system-ui,sans-serif;white-space:nowrap;";
  label.textContent = "Clique le premier coin · molette pour descendre · Échap pour annuler";
  ui.append(shade, box, label);

  const cursorStyle = document.createElement("style");
  cursorStyle.textContent = "html, html * { cursor: crosshair !important; }";

  let scroller = null;
  let anchor = null; // premier coin, coordonnees contenu du scroller
  let anchorScroll = 0; // scrollTop du scroller au premier clic
  let anchorEl = null; // elements cliques aux deux coins (choix du redessin)
  let endEl = null;
  let pointer = { x: 0, y: 0 }; // derniere position souris (fenetre)
  let passive = false; // un autre cadre a la selection
  let capturing = false;
  let aborted = false; // Echap pendant la prise
  const ABORTED = "annulée";
  const WATCHDOG_MS = 60000;
  let step = "sélection";
  let t0 = 0; // debut de la prise
  // DIAGNOSTIC TEMPORAIRE : journal lisible depuis la page (data-area-shot-log).
  function keepLog(line) {
    const de = document.documentElement;
    const lines = (de.dataset.areaShotLog || "").split("\n").filter(Boolean);
    lines.push(new Date().toISOString().slice(11, 23) + " " + line);
    de.dataset.areaShotLog = lines.slice(-80).join("\n");
  }
  // Etape courante, horodatee depuis le debut de la prise. Depuis une iframe,
  // recopiee aussi dans la console du cadre principal (plus facile a lire).
  function mark(s) {
    step = s;
    const line = `${s} (+${t0 ? Date.now() - t0 : 0} ms)`;
    console.log(TAG, line);
    if (!isTop) chrome.runtime.sendMessage({ type: "area-log", line }).catch(() => {});
    else keepLog(line);
  }
  let finished = false;

  function currentRect() {
    const end = toContent(scroller, pointer.x, pointer.y);
    const x = Math.min(anchor.x, end.x);
    const y = Math.min(anchor.y, end.y);
    return {
      x,
      y,
      width: Math.abs(end.x - anchor.x),
      height: Math.abs(end.y - anchor.y),
    };
  }

  function render() {
    if (passive) return;
    label.style.left = pointer.x + 14 + "px";
    label.style.top = pointer.y + 14 + "px";
    if (!anchor) return;
    const r = currentRect();
    const p = toViewport(scroller, r.x, r.y);
    box.style.left = p.x + "px";
    box.style.top = p.y + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
    label.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`;
  }

  function swallow(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onPointerDown(e) {
    swallow(e);
    if (passive || e.button !== 0) return;
    pointer = { x: e.clientX, y: e.clientY };
    if (!anchor) {
      scroller = findScroller(e.target);
      anchor = toContent(scroller, e.clientX, e.clientY);
      anchorScroll = scroller.scrollTop;
      anchorEl = e.target;
      shade.style.display = "none";
      box.style.display = "block";
      broadcast("claim");
      render();
      return;
    }
    const rect = currentRect();
    if (rect.width < 4 || rect.height < 4) return; // clic sans deplacement
    endEl = e.target;
    capturing = true;
    removeUi();
    // Garde-fou : une etape bloquee (message sans reponse...) finit en erreur
    // qui la nomme, jamais en silence.
    const watchdog = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`bloquée à l'étape « ${step} »`)), WATCHDOG_MS),
    );
    Promise.race([capture(rect), watchdog])
      .catch((err) => {
        if (aborted) return toast("Capture annulée");
        console.warn(TAG, "echec:", err);
        toast("Capture impossible : " + (err.message || err), true);
      })
      .finally(() => {
        capturing = false;
        broadcast("end");
        shutdown();
      });
  }

  function onMove(e) {
    pointer = { x: e.clientX, y: e.clientY };
    if (!passive) label.style.display = "block";
    render();
  }

  // La souris quitte ce cadre (vers une iframe enfant ou vers le parent) :
  // l'etiquette suit la souris dans l'autre cadre, on cache celle-ci.
  function onOver(e) {
    if (e.target instanceof HTMLIFrameElement || e.target instanceof HTMLFrameElement) {
      label.style.display = "none";
    }
  }
  function onOut(e) {
    if (!e.relatedTarget) label.style.display = "none";
  }

  // Echap (ou clic droit) annule la selection, et interrompt aussi la prise
  // en cours : le recollage s'arrete a l'ecran suivant, rien n'est livre.
  function cancel(e) {
    if (e.type === "keydown" && e.key !== "Escape") return;
    swallow(e);
    if (capturing) {
      aborted = true;
      return;
    }
    broadcast("end");
    shutdown();
  }

  const BLOCKED = ["mousedown", "mouseup", "click", "dblclick", "auxclick", "pointerup"];
  const opts = { capture: true, passive: false };

  function setup() {
    document.documentElement.append(ui, cursorStyle);
    window.addEventListener("pointerdown", onPointerDown, opts);
    for (const t of BLOCKED) window.addEventListener(t, swallow, opts);
    window.addEventListener("pointermove", onMove, opts);
    window.addEventListener("keydown", cancel, opts);
    window.addEventListener("contextmenu", cancel, opts);
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    // scroll ne remonte pas : la capture sur document attrape aussi les panneaux.
    document.addEventListener("scroll", render, true);
    window.addEventListener("message", onOffsetAsk);
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
  }

  // Overlay et suivi de la souris retires ; clics encore bloques.
  function removeUi() {
    ui.remove();
    cursorStyle.remove();
    window.removeEventListener("pointermove", onMove, opts);
    document.removeEventListener("mouseover", onOver, true);
    document.removeEventListener("mouseout", onOut, true);
    document.removeEventListener("scroll", render, true);
  }

  function goPassive() {
    if (passive || anchor) return;
    passive = true;
    removeUi();
  }

  function shutdown() {
    if (finished) return;
    finished = true;
    removeUi();
    window.removeEventListener("pointerdown", onPointerDown, opts);
    // Les mouseup/click du 2e clic arrivent apres le pointerdown : on les
    // laisse encore bloques un instant pour qu'ils n'atteignent pas la page.
    setTimeout(() => {
      for (const t of BLOCKED) window.removeEventListener(t, swallow, opts);
    }, 400);
    window.removeEventListener("keydown", cancel, opts);
    window.removeEventListener("contextmenu", cancel, opts);
    window.removeEventListener("message", onOffsetAsk);
    chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    window.__areaScreenshotActive = false;
  }

  // --- Capture -----------------------------------------------------------------
  // Elements flottants (fixed / sticky colle) qui chevauchent la zone visible.
  // "top" = colle en haut de la zone (en-tete) : garde sur le 1er ecran, donc
  // une seule fois en haut de l'image. "other" = le reste (barre cookies,
  // bouton flottant, pied colle) : masque des le depart. Jamais un ancetre du
  // scroller : beaucoup d'apps posent toute leur mise en page en position: fixed.
  // Un sticky au milieu de la zone n'est pas colle : il reste dans le contenu.
  function findFloating(sc) {
    const v = viewRect(sc);
    const vBottom = v.top + v.height;
    const top = [];
    const other = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (el === sc || el.contains(sc)) continue;
      const pos = getComputedStyle(el).position;
      if (pos !== "fixed" && pos !== "sticky") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= v.left || r.left >= v.left + v.width) continue;
      if (r.bottom <= v.top || r.top >= vBottom) continue;
      const atTop = Math.abs(r.top - v.top) <= 4;
      if (atTop) top.push(el);
      else if (pos === "fixed" || Math.abs(r.bottom - vBottom) <= 4) other.push(el);
    }
    return { top, other };
  }

  function hideAll(els, hidden) {
    for (const el of els) {
      hidden.push([el, el.style.getPropertyValue("visibility"), el.style.getPropertyPriority("visibility")]);
      el.style.setProperty("visibility", "hidden", "important");
    }
  }

  async function capture(rect) {
    t0 = Date.now();
    mark(`préparation (${Math.round(rect.width)} × ${Math.round(rect.height)}, cadre ${isTop ? "principal" : "iframe"})`);
    await nextPaint(); // l'overlay doit avoir disparu de l'ecran
    const timeout = wait(REDRAW_TIMEOUT_MS).then(() => {
      throw new Error("trop long");
    });
    let dataUrl = await Promise.race([redraw(scroller, rect), timeout]).catch((e) => {
      mark(`redessin en échec (${e.message}), repli sur le défilement`);
      return null;
    });
    if (aborted) throw new Error(ABORTED);
    if (!dataUrl) dataUrl = await captureByScrolling(rect);
    if (aborted) throw new Error(ABORTED);
    await deliver(dataUrl);
  }

  // --- Redessin (snapdom) ---------------------------------------------------------
  // Instantane et sans mouvement : snapdom redessine la zone depuis le DOM.
  // Ecarte (null -> defilement) quand le DOM ne contient pas toute la zone :
  // listes virtualisees (X, Discord) qui dechargent ce qui est loin de l'ecran.
  const REDRAW_TIMEOUT_MS = 10000;

  function pageBox(el) {
    const r = el.getBoundingClientRect();
    return { left: r.left + window.scrollX, top: r.top + window.scrollY, right: r.right + window.scrollX, bottom: r.bottom + window.scrollY };
  }

  function commonAncestor(a, b) {
    for (let el = a; el; el = el.parentElement) if (el.contains(b)) return el;
    return document.documentElement;
  }

  // Plus grand trou vertical (en px) de la zone sans aucun element feuille :
  // le signe d'une liste qui a decharge son contenu.
  function largestGap(el, clip) {
    const spans = [];
    for (const leaf of el.querySelectorAll("*")) {
      if (leaf.firstElementChild) continue;
      const b = pageBox(leaf);
      if (b.bottom <= clip.y || b.top >= clip.y + clip.height || b.bottom - b.top < 1) continue;
      spans.push([Math.max(b.top, clip.y), Math.min(b.bottom, clip.y + clip.height)]);
    }
    spans.sort((p, q) => p[0] - q[0]);
    let gap = 0;
    let reach = clip.y;
    for (const [top, bottom] of spans) {
      gap = Math.max(gap, top - reach);
      reach = Math.max(reach, bottom);
    }
    return Math.max(gap, clip.y + clip.height - reach);
  }

  function backgroundOf(el) {
    for (let e = el; e; e = e.parentElement) {
      const bg = getComputedStyle(e).backgroundColor;
      if (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
    }
    return "#ffffff";
  }

  async function redraw(sc, rect) {
    if (typeof window.snapdom !== "function") return null;
    if (!anchorEl.isConnected || !endEl.isConnected) {
      mark("redessin écarté : contenu déchargé pendant le défilement");
      return null;
    }
    // Zone en coordonnees de page (celles de l'option clip de snapdom).
    const v = viewRect(sc);
    const clip = {
      x: rect.x - sc.scrollLeft + v.left + window.scrollX,
      y: rect.y - sc.scrollTop + v.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
    // Plus petit element qui contient toute la zone. Dans un panneau, il doit
    // etre DANS le panneau : la boite du panneau s'arrete au bord visible.
    let el = commonAncestor(anchorEl, endEl);
    const contains = (e) => {
      const b = pageBox(e);
      return b.left <= clip.x + 1 && b.top <= clip.y + 1 &&
        b.right >= clip.x + clip.width - 1 && b.bottom >= clip.y + clip.height - 1;
    };
    while (el && el !== document.documentElement && !contains(el)) el = el.parentElement;
    // Le panneau lui-meme ne convient pas : snapdom n'en dessine que la partie
    // visible (verifie, le reste sort blanc).
    if (!el || (sc !== root && (el === sc || !sc.contains(el)))) {
      mark("redessin écarté : aucun élément ne couvre la zone");
      return null;
    }
    const gap = largestGap(el, clip);
    if (gap > Math.max(v.height, 600)) {
      mark(`redessin écarté : trou de ${Math.round(gap)} px (liste virtualisée ?)`);
      return null;
    }
    mark(`redessin de <${el.tagName.toLowerCase()}>`);
    // Elements flottants (fixed, sticky colle) ecartes : snapdom les placerait
    // a leur position a l'ecran au moment du redessin, donc au milieu de
    // l'image. Les autres fixed (hors zone visible) aussi, par securite ;
    // jamais un element qui contient la zone (mise en page en position: fixed).
    const floating = findFloating(sc);
    const skip = new Set([...floating.top, ...floating.other]);
    const exclude = (n) =>
      n instanceof Element &&
      (skip.has(n) || (!n.contains(anchorEl) && getComputedStyle(n).position === "fixed"));
    const shot = await window.snapdom(el, {
      clip,
      backgroundColor: backgroundOf(el),
      exclude,
    });
    const blob = await shot.toBlob({ format: "png" });
    mark(`redessin terminé (${(blob.size / 1048576).toFixed(1)} Mo)`);
    return blobToDataUrl(blob);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("image illisible"));
      reader.readAsDataURL(blob);
    });
  }

  // --- Defilement + recollage (repli) -------------------------------------------
  async function captureByScrolling(rect) {
    const sc = scroller;
    const endScroll = sc.scrollTop;
    // On revient a la position d'ecran ou le coin du HAUT a ete clique : les
    // en-tetes fixes sont alors la ou tu les voyais en le cliquant.
    const topScroll = anchor.y <= rect.y + 0.5 ? anchorScroll : endScroll;
    const prevBehavior = sc.style.getPropertyValue("scroll-behavior");
    sc.style.setProperty("scroll-behavior", "auto", "important");
    const hidden = [];
    let dataUrl = null;
    try {
      sc.scrollTop = topScroll;
      await nextPaint();
      const floating = findFloating(sc);
      hideAll(floating.other, hidden);
      await nextPaint();
      mark("ouverture de la session de capture");
      const session = await chrome.runtime
        .sendMessage({ type: "area-session-start" })
        .catch(() => null);
      fast = !!(session && session.fast);
      mark(fast ? "session rapide" : `session lente (${(session && session.reason) || "?"})`);
      dataUrl = await stitch(sc, rect, () => hideAll(floating.top, hidden));
    } finally {
      chrome.runtime.sendMessage({ type: "area-session-end" }).catch(() => {});
      for (const [el, val, prio] of hidden) {
        if (val) el.style.setProperty("visibility", val, prio);
        else el.style.removeProperty("visibility");
      }
      sc.scrollTop = endScroll;
      if (prevBehavior) sc.style.setProperty("scroll-behavior", prevBehavior);
      else sc.style.removeProperty("scroll-behavior");
    }
    return dataUrl;
  }

  // Prises via le debugger (fast) : pas de limite de debit, juste le temps
  // d'un rendu. Sinon captureVisibleTab : ~2 prises par seconde maximum.
  let fast = false;

  async function grab() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await chrome.runtime.sendMessage({ type: "area-capture-visible" });
      if (res && res.dataUrl) {
        fast = res.fast;
        mark(`  reçu (${fast ? "rapide" : "lent"}, prise ${res.ms} ms, ${(res.dataUrl.length / 1048576).toFixed(1)} Mo)`);
        const img = await loadImage(res.dataUrl);
        mark(`  décodé ${img.naturalWidth}×${img.naturalHeight}`);
        return img;
      }
      mark(`prise refusée (${res && res.reason}), nouvel essai`);
      // Limite de debit depassee : attendre puis reessayer.
      await wait(CAPTURE_GAP_MS);
    }
    throw new Error("capture de l'écran refusée par Chrome");
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image illisible"));
      img.src = src;
    });
  }

  // Le 1er ecran est pris a la position courante, puis le panneau descend.
  // afterFirst() masque les en-tetes pour qu'ils ne se repetent pas.
  async function stitch(sc, rect, afterFirst) {
    const v = viewRect(sc);
    // Largeur limitee a la partie visible : pas de recollage horizontal.
    const x0 = Math.max(rect.x, sc.scrollLeft);
    const x1 = Math.min(rect.x + rect.width, sc.scrollLeft + v.width);
    const y0 = rect.y;
    const y1 = rect.y + rect.height;
    if (x1 - x0 < 1) throw new Error("zone hors de l'écran");

    // Position du cadre dans l'onglet (0, 0 hors iframe).
    mark("position du cadre");
    const frame = await frameOffset();
    // Le canvas est cree a la 1re image : son echelle (pixels d'image par
    // pixel CSS) vient de la capture elle-meme, juste meme dans une iframe.
    let canvas = null;
    let ctx = null;
    let outW = 0;

    let lastShot = 0;
    let shots = 0;
    let y = y0;
    let first = true;
    while (y < y1 - 0.5) {
      if (aborted) throw new Error(ABORTED);
      if (!first) sc.scrollTop = y;
      await nextPaint();
      // Laisse le temps au contenu charge a la demande d'apparaitre.
      await wait(fast ? 80 : Math.max(80, CAPTURE_GAP_MS - (Date.now() - lastShot)));
      const top = sc.scrollTop; // peut etre plafonne en bas du contenu
      const vv = viewRect(sc);
      const segStart = Math.max(y, top);
      const segEnd = Math.min(y1, top + vv.height);
      if (segEnd <= segStart) break; // plus aucun progres possible
      lastShot = Date.now();
      mark(`écran ${++shots}`);
      const img = await grab();
      // Rapport image / fenetre principale : DPR et zoom de la page compris.
      const k = img.naturalWidth / frame.topWidth;
      if (!canvas) {
        outW = Math.round((x1 - x0) * k);
        const outH = Math.round((y1 - y0) * k);
        if (outH > MAX_SIDE || outW > MAX_SIDE) {
          throw new Error(`zone trop haute (${outH} px, maximum ${MAX_SIDE})`);
        }
        canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        ctx = canvas.getContext("2d");
      }
      const sx = (frame.x + x0 - sc.scrollLeft + vv.left) * k;
      const sy = (frame.y + segStart - top + vv.top) * k;
      ctx.drawImage(
        img,
        sx,
        sy,
        (x1 - x0) * k,
        (segEnd - segStart) * k,
        0,
        (segStart - y0) * k,
        outW,
        (segEnd - segStart) * k,
      );
      if (first) {
        afterFirst();
        first = false;
      }
      y = segEnd;
    }
    if (!canvas) throw new Error("zone vide");
    mark("assemblage");
    return canvas.toDataURL("image/png");
  }

  // --- Livraison : presse-papiers + fichier -----------------------------------
  // Le fichier est enregistre par le service worker (chrome.downloads) : un
  // lien <a download> dans la page depend d'elle (iframe sandboxee, CSP...).
  async function copyBlob(blob) {
    try {
      // Nos clics bloques empechent le cadre de prendre le focus, et le
      // presse-papiers refuse un document sans focus.
      if (!document.hasFocus()) window.focus();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    } catch (e) {
      console.warn(TAG, "presse-papiers:", e.message);
      return false;
    }
  }

  async function deliver(dataUrl) {
    mark("copie dans le presse-papiers");
    const blob = await (await fetch(dataUrl)).blob();
    let copied = await copyBlob(blob);
    // Iframe sans focus : le cadre principal, encore actif ici, reessaie.
    if (!copied && !isTop) {
      const res = await chrome.runtime
        .sendMessage({ type: "area-copy", dataUrl })
        .catch(() => null);
      copied = !!(res && res.ok);
    }
    mark("enregistrement du fichier");
    const res = await chrome.runtime
      .sendMessage({ type: "area-save", dataUrl })
      .catch(() => null);
    const saved = !!(res && res.ok);
    if (!saved) console.warn(TAG, "telechargement:", res && res.reason);
    if (copied && saved) toast("Capture copiée et enregistrée");
    else if (saved) toast("Capture enregistrée (copie impossible)", true);
    else if (copied) toast("Capture copiée (enregistrement impossible)", true);
    else toast("Capture impossible", true);
  }

  function toast(text, warn) {
    const t = document.createElement("div");
    t.textContent = text;
    t.style.cssText =
      "all:initial;position:fixed;left:50%;bottom:28px;transform:translateX(-50%);" +
      "z-index:2147483647;padding:10px 16px;border-radius:10px;" +
      `background:${warn ? "#7a2a1a" : "#111"};color:#fff;` +
      "font:600 13px/1.3 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);" +
      "transition:opacity .3s;";
    document.documentElement.append(t);
    setTimeout(() => (t.style.opacity = "0"), 2200);
    setTimeout(() => t.remove(), 2600);
  }

  setup();
  console.log(TAG, "selection demarree");
})();
