// Vendored from besuper/TwitchNoSub (https://github.com/besuper/TwitchNoSub)
// Licensed under Apache-2.0 — see modules/twitch-nosub/LICENSE. Unmodified.
class RestrictionRemover {
  constructor() {
    this.observer = null;

    this.removeExistingRestrictions();
    this.createObserver();
  }

  removeExistingRestrictions() {
    document
      .querySelectorAll(".video-preview-card-restriction")
      .forEach((element) => {
        element.remove();
      });
  }

  createObserver() {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processNode(node);
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false,
    });
  }

  processNode(node) {
    if (
      node.classList &&
      node.classList.contains("video-preview-card-restriction")
    ) {
      node.remove();
      return;
    }

    node
      .querySelectorAll(".video-preview-card-restriction")
      .forEach((restriction) => {
        restriction.remove();
      });
  }
}

document.addEventListener("DOMContentLoaded", function () {
  new RestrictionRemover();
});
