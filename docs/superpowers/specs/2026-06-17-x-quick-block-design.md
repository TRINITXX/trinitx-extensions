# X — Block en 1 clic (`x-quick-block`)

> Spec de conception — 2026-06-17

## Objectif

Ajouter un module à l'extension TRINITX qui place une **icône de blocage discrète**
en haut à droite de chaque tweet sur `x.com`. Un clic bloque l'auteur du tweet
**immédiatement**, avec un toast « Bloqué @user — Annuler » permettant de revenir
en arrière. Inspiré de l'extension « 1-Click Blocker for Twitter/X ».

Le bouton doit apparaître partout où il y a des tweets : fil d'actualité, page
d'un tweet précis, et fils de réponses.

## Décisions validées

| Sujet                           | Choix                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Méthode de blocage              | **API web interne de X** (on rejoue l'appel que le site fait lui-même, via la session/cookies de l'utilisateur). Pas l'API développeur payante. |
| Garde-fou anti-erreur           | **1 clic + toast « Annuler »** (~6 s). Pas de confirmation préalable.                                                                           |
| Apparence du bouton             | **Icône cercle-barré grise et discrète**, à gauche du caret « … ». **Aucun rouge** — gris au repos, gris légèrement plus marqué au survol.      |
| Tweet après blocage             | **Grisé localement** (estompé). « Annuler » le restaure.                                                                                        |
| Domaines                        | **`x.com` uniquement** (twitter.com redirige vers x.com), comme `x-auto-scroll`.                                                                |
| Première étape d'implémentation | **Valider l'appel de blocage en réel** sur un compte test avant de bâtir l'UI.                                                                  |

## Architecture (calquée sur les modules existants)

Nouveau content-script `modules/x-quick-block/content.js`, monde **ISOLATED**,
`runAt: document_idle` — même profil que `x-auto-scroll`. Intégration via le
mécanisme de modules déjà en place :

1. **`background.js`** → ajouter une entrée dans `CONTENT_MODULES` :
   ```js
   xQuickBlock: {
     id: "x-quick-block",
     js: ["modules/x-quick-block/content.js"],
     matches: ["*://x.com/*"],
     world: "ISOLATED",
     runAt: "document_idle",
   },
   ```
2. **`background.js`** + **`popup.js`** → ajouter `xQuickBlock: true` dans
   `DEFAULT_MODULES` (les deux copies doivent rester synchronisées).
3. **`popup.html`** → une nouvelle `<section class="module" data-module="xQuickBlock">`
   avec son toggle.
4. **`README.md`** → ligne dans le tableau des modules + arborescence.

**Aucune nouvelle permission.** `scripting`, `storage` et le `host_permissions`
`*://x.com/*` existants suffisent. L'enregistrement/retrait dynamique et
l'injection dans les onglets ouverts sont déjà gérés génériquement par
`syncRegistrations()` / `injectIntoOpenTabs()`.

Le module est protégé par un garde de double-injection :
`if (window.__xQuickBlockLoaded) return; window.__xQuickBlockLoaded = true;`
(même pattern que `x-auto-scroll`).

## Détail technique — l'appel de blocage

### Endpoints internes

- **Bloquer** : `POST https://x.com/i/api/1.1/blocks/create.json`
- **Débloquer** : `POST https://x.com/i/api/1.1/blocks/destroy.json`
- Corps : `screen_name=<handle>` (en `application/x-www-form-urlencoded`).
  Repli si `screen_name` n'est plus accepté : résoudre puis envoyer `user_id=<id>`.

### Headers

```
authorization: Bearer <BEARER_WEB>          # bearer public du client web X (constante)
x-csrf-token: <ct0>                          # = valeur du cookie ct0 (lisible en JS)
x-twitter-active-user: yes
x-twitter-auth-type: OAuth2Session
content-type: application/x-www-form-urlencoded
```

Appel en `fetch(..., { method: 'POST', credentials: 'include', headers, body })`.
Le content-script s'exécute sur l'origine `x.com`, donc les cookies de session
(`auth_token`, `ct0`) partent automatiquement et la requête est same-origin
(pas de problème CORS).

### Lecture du cookie `ct0`

`ct0` n'est pas `httpOnly` (double-submit cookie) → lisible via `document.cookie`.
Parser `document.cookie` pour extraire `ct0`. Si absent → l'utilisateur n'est pas
connecté : afficher un toast « Connecte-toi à X » et ne pas appeler l'API.

### Identification de l'auteur à bloquer

Depuis le bouton cliqué :

1. `const article = btn.closest('article[data-testid="tweet"]')`.
2. `const userName = article.querySelector('[data-testid="User-Name"]')`
   (le **premier** dans l'ordre DOM = auteur du tweet principal, pas un quote
   imbriqué).
3. Extraire le `@handle` depuis le lien profil : `a[href^="/"]` dont le `href`
   matche `^/[A-Za-z0-9_]+$` (exclut `/status/…`, `/i/…`, `/hashtag/…`).
   `screen_name = href.slice(1)`.

Si le handle est introuvable → ne pas injecter le bouton sur ce tweet (ou, au
clic, toast d'erreur).

## ⚠️ Hypothèses à valider empiriquement (étape 1 de l'implémentation)

Ces trois points **ne sont pas garantis** et seront testés en réel sur un compte
jetable **avant** de construire l'UI :

1. **`screen_name` accepté** par `blocks/create.json` (sinon : résoudre `user_id`
   via `users/show.json?screen_name=` ou capture GraphQL).
2. **Bearer web public toujours valide** (sinon : l'intercepter depuis une vraie
   requête de la page).
3. **Aucun header calculé exigé** (type `x-client-transaction-id`).

**Repli commun si l'appel direct échoue** : capturer les en-têtes d'auth réels
d'une requête X authentifiée. Le module `x-auto-sort` intercepte déjà `fetch`/XHR
en monde MAIN — la même technique peut alimenter un cache de headers exposé au
module de blocage (via `window`/`postMessage` ou un script MAIN dédié). On ne
construit ce repli **que si** la voie directe échoue à l'étape 1.

## UI / styles

### Bouton

- SVG **cercle-barré** (`⊘`), ~18 px, inséré juste **avant** le
  `button[data-testid="caret"]` dans son conteneur, pour chaque article.
- Repos : gris discret (`color: rgb(113,118,123)` ~ gris X, opacité ~0.35).
- Survol : opacité pleine + fond rond gris léger (`rgba(127,127,127,0.1)`),
  curseur `pointer`. **Aucun rouge.**
- `title="Bloquer @user"` pour l'infobulle native.
- `id`/classe préfixés `x-quick-block-…` pour éviter les collisions.

### Tweet bloqué (feedback)

Après succès : appliquer sur l'`article` une classe `x-quick-block-blocked`
→ `opacity: 0.4; filter: grayscale(0.7)`. Retirée si « Annuler ».

### Toast

- Élément fixe positionné **en bas** (centre/droite), pour ne pas chevaucher le
  bouton auto-scroll (haut-gauche).
- Style sombre/neutre, texte « Bloqué @user » + bouton/lien « **Annuler** ».
- Auto-disparition après ~6 s. Réutilise l'esprit du toast de `x-auto-scroll`.
- Conserve une référence `{ screenName, article }` du dernier blocage pour
  l'annulation.

## Flux utilisateur

```
Clic sur l'icône de blocage d'un tweet
        │
        ├─ lire screen_name + ct0
        │     └─ ct0 absent ? → toast « Connecte-toi à X », stop
        │
        ├─ POST blocks/create.json (screen_name)
        │
        ├─ succès ─→ griser l'article + toast « Bloqué @user — Annuler » (6s)
        │                 └─ clic « Annuler » → POST blocks/destroy.json
        │                        └─ succès → dé-griser + toast « Déblocage OK »
        │
        └─ échec ──→ toast « Échec du blocage » (article inchangé)
```

## Injection continue (timeline virtualisée)

- `MutationObserver` sur `document.body` (`childList`, `subtree`), avec
  re-scan throttlé.
- `scanAndInject()` : pour chaque `article[data-testid="tweet"]` ne portant pas
  encore notre bouton, localiser le caret et insérer l'icône. Marquer l'article
  traité (data-attribut) pour l'idempotence.
- Re-scan aussi sur changement d'URL SPA (navigation interne X).

## Fichiers touchés

| Fichier                            | Changement                                                             |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `modules/x-quick-block/content.js` | **Nouveau** — toute la logique du module.                              |
| `background.js`                    | +entrée `CONTENT_MODULES.xQuickBlock`, +`DEFAULT_MODULES.xQuickBlock`. |
| `popup.js`                         | +`DEFAULT_MODULES.xQuickBlock`.                                        |
| `popup.html`                       | +section toggle « X — Block en 1 clic ».                               |
| `README.md`                        | +ligne tableau + arborescence.                                         |
| `manifest.json`                    | Inchangé (permissions déjà suffisantes).                               |

## Critères de succès

- [ ] Étape 1 : un `fetch` de blocage manuel réussit en réel (compte test
      apparaît dans _Réglages → Comptes bloqués_), et le déblocage le retire.
- [ ] L'icône grise apparaît à gauche du « … » sur le fil, une page de tweet,
      et un fil de réponses.
- [ ] Un clic bloque réellement l'auteur ; le tweet est grisé.
- [ ] Le toast « Annuler » débloque et restaure le tweet.
- [ ] Le toggle du popup active/désactive le module (et l'injecte/retire des
      onglets ouverts via la mécanique existante).
- [ ] Aucun rouge ; le bouton reste discret au repos.

## Hors périmètre (YAGNI)

- Pas de blocage en masse / liste.
- Pas de « mute » (uniquement block).
- Pas de masquage des tweets déjà bloqués au chargement.
- Détection « ne pas afficher le bouton sur mes propres tweets » : _nice-to-have_
  optionnel (sinon l'API renverra une erreur gérée par le toast). Non requis.
