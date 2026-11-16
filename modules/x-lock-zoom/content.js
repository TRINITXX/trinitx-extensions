// X — Zoom bloque — Ctrl + molette ne zoome plus sur x.com
// Le zoom lui-meme (110 %) est pose et retabli par background.js : la page ne
// peut pas changer le zoom de Chrome, seulement empecher le geste d'arriver.
(() => {
  // Guard : éviter une double exécution si le module est ré-injecté (toggle).
  if (window.__xLockZoomLoaded) return;
  window.__xLockZoomLoaded = true;

  // Chrome envoie Ctrl + molette a la page avant de zoomer : un preventDefault
  // annule le zoom. Il faut pour ca un ecouteur wheel non passif, qui oblige
  // Chrome a attendre le fil principal de X avant CHAQUE defilement (mesure :
  // ceux de X sont tous passifs). Il n'est donc pose que pendant que Ctrl est
  // enfonce. Cas rate (Ctrl enfonce hors de la page, sans bouger la souris,
  // pincement du pave tactile) : background.js remet 110 % aussitot.
  const OPTS = { capture: true, passive: false };
  const block = (e) => {
    if (e.ctrlKey) e.preventDefault();
  };
  let armed = false;
  function setArmed(on) {
    if (on === armed) return;
    armed = on;
    if (on) window.addEventListener("wheel", block, OPTS);
    else window.removeEventListener("wheel", block, OPTS);
  }

  // keydown / keyup : Ctrl enfonce ou relache dans la page. mousemove : Ctrl
  // enfonce ailleurs (barre d'adresse) puis souris amenee sur la page.
  window.addEventListener("keydown", (e) => setArmed(e.ctrlKey), true);
  window.addEventListener("keyup", (e) => setArmed(e.ctrlKey), true);
  window.addEventListener("mousemove", (e) => setArmed(e.ctrlKey), {
    capture: true,
    passive: true,
  });
  window.addEventListener("blur", () => setArmed(false));
})();
