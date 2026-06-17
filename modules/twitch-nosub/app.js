// Vendored from besuper/TwitchNoSub (https://github.com/besuper/TwitchNoSub)
// Licensed under Apache-2.0 — see modules/twitch-nosub/LICENSE. Unmodified.
// Runs in the page MAIN world: wraps window.Worker so the Amazon IVS WASM
// worker imports the TwitchNoSub patch (patch_url, defined by chrome/app.js).
// From vaft script (https://github.com/pixeltris/TwitchAdSolutions/blob/master/vaft/vaft.user.js#L299)
function getWasmWorkerJs(twitchBlobUrl) {
  var req = new XMLHttpRequest();
  req.open("GET", twitchBlobUrl, false);
  req.overrideMimeType("text/javascript");
  req.send();
  return req.responseText;
}

const oldWorker = window.Worker;

window.Worker = class Worker extends oldWorker {
  constructor(twitchBlobUrl) {
    var workerString = getWasmWorkerJs(
      `${twitchBlobUrl.replaceAll("'", "%27")}`,
    );

    const blobUrl = URL.createObjectURL(
      new Blob([
        `
            importScripts(
                '${patch_url}',
            );
            ${workerString}
        `,
      ]),
    );

    super(blobUrl);
  }
};
