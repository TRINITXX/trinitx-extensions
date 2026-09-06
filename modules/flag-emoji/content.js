// Drapeaux emoji — repare les drapeaux affiches en lettres ("FR", "MA") sous
// Windows. La police systeme (Segoe UI Emoji) ne contient aucun glyphe de
// drapeau et Chrome, contrairement a Firefox, n'embarque pas de police de
// secours : les paires d'indicateurs regionaux retombent donc sur les deux
// lettres du code pays.
//
// Principe : on charge une police Twemoji ne couvrant QUE les drapeaux
// (unicode-range), et on encapsule chaque sequence de drapeau dans un <span>
// qui utilise cette police. Le reste du texte n'est jamais touche, donc la
// typographie des sites reste intacte.
(() => {
  // Guard : eviter une double execution si le module est re-injecte (toggle).
  if (window.__flagEmojiLoaded) return;
  window.__flagEmojiLoaded = true;

  const TAG = "[FlagEmoji]";
  const FAMILY = "TRINITX Country Flags";
  const CLASS = "trinitx-flag";
  const FONT_PATH = "modules/flag-emoji/TwemojiCountryFlags.woff2";
  // Indicateurs regionaux (drapeaux pays) + drapeau a tags (Ecosse, Pays de
  // Galles, Angleterre).
  const UNICODE_RANGE = "U+1F1E6-1F1FF, U+1F3F4, U+E0060-E007F";
  const FLAG_RE = /[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[\u{E0060}-\u{E007F}]+/gu;
  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "TITLE",
    "TEMPLATE",
  ]);
  // Zones ou remplacer un noeud texte casserait le site (editeurs de X, de
  // Discord…) ou n'est pas du HTML (SVG).
  const SKIP_ANCESTORS = '[contenteditable="true"], [contenteditable=""], svg';

  // --- Detection : Chrome/OS sait-il deja dessiner un drapeau ? -------------
  // Le repli Windows est du texte monochrome ; un vrai drapeau a des pixels
  // colores. On dessine un drapeau francais et on cherche une couleur.
  function supportsFlags() {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 24;
      canvas.height = 24;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return true; // pas de canvas : dans le doute, ne rien faire
      ctx.font = "20px sans-serif";
      ctx.fillStyle = "#000";
      ctx.fillText("\u{1F1EB}\u{1F1F7}", 0, 20);
      const { data } = ctx.getImageData(0, 0, 24, 24);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue; // pixel transparent
        if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) return true;
      }
      return false;
    } catch {
      return true;
    }
  }

  // --- Police ---------------------------------------------------------------
  // Chargee en ArrayBuffer puis ajoutee via l'API FontFace : un @font-face CSS
  // classique pointant sur chrome-extension:// est bloque par la CSP de
  // certains sites (x.com : font-src 'self'), pas ce chemin-la.
  async function loadFont() {
    const url = chrome.runtime.getURL(FONT_PATH);
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buffer = await res.arrayBuffer();
    const face = new FontFace(FAMILY, buffer, { unicodeRange: UNICODE_RANGE });
    await face.load();
    document.fonts.add(face);
  }

  function injectStyle() {
    const style = document.createElement("style");
    style.textContent =
      "." +
      CLASS +
      '{font-family:"' +
      FAMILY +
      '"!important;font-style:normal!important;font-weight:400!important}';
    (document.head || document.documentElement).appendChild(style);
  }

  // --- Encapsulation des drapeaux -------------------------------------------
  function wrapTextNode(node) {
    const text = node.data;
    const frag = document.createDocumentFragment();
    let last = 0;
    let match;
    FLAG_RE.lastIndex = 0;
    while ((match = FLAG_RE.exec(text))) {
      if (match.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, match.index)));
      }
      const span = document.createElement("span");
      span.className = CLASS;
      // Style en ligne en plus de la regle CSS : certains sites interdisent
      // les <style> injectes (CSP style-src sans 'unsafe-inline').
      span.style.setProperty("font-family", FAMILY, "important");
      span.textContent = match[0];
      frag.appendChild(span);
      last = match.index + match[0].length;
    }
    if (!last) return;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.replaceWith(frag);
  }

  function acceptNode(node) {
    const parent = node.parentElement;
    if (!parent) return NodeFilter.FILTER_REJECT;
    if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
    if (parent.classList.contains(CLASS)) return NodeFilter.FILTER_REJECT;
    FLAG_RE.lastIndex = 0;
    if (!FLAG_RE.test(node.data)) return NodeFilter.FILTER_REJECT;
    if (parent.closest(SKIP_ANCESTORS)) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  }

  function process(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (acceptNode(root) === NodeFilter.FILTER_ACCEPT) wrapTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE && SKIP_TAGS.has(root.tagName)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(wrapTextNode);
  }

  // --- Observation ----------------------------------------------------------
  // Les noeuds a traiter sont empiles puis traites en une passe par frame :
  // sur X, le fil genere des centaines de mutations a chaque defilement.
  const pending = new Set();
  let scheduled = false;

  function flush() {
    scheduled = false;
    const batch = [...pending];
    pending.clear();
    for (const node of batch) {
      if (node.isConnected) process(node);
    }
  }

  function queue(node) {
    pending.add(node);
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(flush);
  }

  function start() {
    process(document.body);
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") queue(record.target);
        else for (const node of record.addedNodes) queue(node);
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  (async () => {
    if (supportsFlags()) {
      console.log(TAG, "drapeaux natifs disponibles, module inactif");
      return;
    }
    try {
      await loadFont();
    } catch (e) {
      console.warn(TAG, "police non chargee:", e.message);
      return;
    }
    injectStyle();
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start, { once: true });
    console.log(TAG, "actif");
  })();
})();
