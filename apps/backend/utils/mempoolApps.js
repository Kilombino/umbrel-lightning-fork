// More Mempool apps than the two the wrapper names one by one
// (MEMPOOL_GUIDE_* and MEMPOOL_PRUNED_*): "id|name|api|ui|onion" per app,
// joined with ";" (MEMPOOL_APPS). The API base is the app's web UI, as for
// the other two, and may be a container name (Umbrel); the UI is a port on
// the same host (Umbrel) or a full URL (StartOS); the onion address may be
// empty. Anything that does not have that shape is dropped, not guessed at.
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const NAME = /^[^\u0000-\u001f\u007f]{1,64}$/;
const API = /^https?:\/\/[A-Za-z0-9._-]+(:\d{1,5})?\/?$/;
const UI_URL = /^https?:\/\/[A-Za-z0-9._-]+(:\d{1,5})?(\/\S*)?$/;
const PORT = /^\d{1,5}$/;
const ONION = /^[a-z2-7]{56}\.onion$/;

function parseMempoolApps(text) {
  return String(text || "")
    .split(";")
    .map(entry => entry.split("|").map(part => part.trim()))
    .filter(p => p.length === 5 && ID.test(p[0]) && NAME.test(p[1]))
    .filter(p => API.test(p[2]))
    .filter(p => p[3] === "" || PORT.test(p[3]) || UI_URL.test(p[3]))
    .filter(p => p[4] === "" || ONION.test(p[4]))
    .map(([id, name, api, ui, hiddenService]) => ({
      id,
      name,
      api,
      uiUrl: PORT.test(ui) ? "" : ui,
      uiPort: PORT.test(ui) ? ui : "",
      hiddenService,
    }));
}

// The apps named one by one first, then the list; an id already taken
// keeps its first entry, so a choice saved under it still means the same
// app.
function mergeMempoolApps(named, listed) {
  const seen = new Set();
  return [...named, ...listed].filter(app => {
    if (seen.has(app.id)) {
      return false;
    }
    seen.add(app.id);
    return true;
  });
}

module.exports = { parseMempoolApps, mergeMempoolApps };
