// The list of further Mempool apps the wrapper hands over (MEMPOOL_APPS).
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseMempoolApps,
  mergeMempoolApps,
} = require("../utils/mempoolApps.js");

const ONION = "a".repeat(56) + ".onion";

test("an Umbrel entry: a container name, a port, an onion", () => {
  assert.deepEqual(
    parseMempoolApps(
      "kilombino-mempool|Mempool Kilombino|" +
        `http://kilombino-mempool_web_1:8080|7162|${ONION}`
    ),
    [{
      id: "kilombino-mempool",
      name: "Mempool Kilombino",
      api: "http://kilombino-mempool_web_1:8080",
      uiUrl: "",
      uiPort: "7162",
      hiddenService: ONION,
    }]
  );
});

test("a StartOS entry: a full URL for the UI, no onion", () => {
  const [app] = parseMempoolApps(
    "mempool-x|Mempool X|http://mempool-x.embassy:8080/|https://x.local|"
  );
  assert.equal(app.uiUrl, "https://x.local");
  assert.equal(app.uiPort, "");
  assert.equal(app.hiddenService, "");
});

test("entries of the wrong shape are dropped, the rest kept", () => {
  const good = "ok|OK|http://10.0.0.1:8080|3000|";
  const apps = parseMempoolApps([
    "",
    "short|Name|http://10.0.0.1:8080|3000",
    "toolong|Name|http://10.0.0.1:8080|3000||x",
    "bad id|Name|http://10.0.0.1:8080|3000|",
    "noname||http://10.0.0.1:8080|3000|",
    "path|Name|http://10.0.0.1:8080/api|3000|",
    "creds|Name|http://u:p@10.0.0.1:8080|3000|",
    "file|Name|file:///etc/passwd|3000|",
    "port|Name|http://10.0.0.1:8080|30a0|",
    "onion|Name|http://10.0.0.1:8080|3000|x.onion",
    good,
  ].join(";"));
  assert.deepEqual(apps.map(app => app.id), ["ok"]);
  assert.deepEqual(parseMempoolApps(undefined), []);
});

test("an id already named keeps its first entry", () => {
  const named = [{ id: "mempool", name: "Mempool" }];
  const listed = parseMempoolApps(
    "mempool|Other|http://10.0.0.2:8080|1|;" +
      "extra|Extra|http://10.0.0.3:8080|2|;extra|Again|http://10.0.0.4:8080|3|"
  );
  const merged = mergeMempoolApps(named, listed);
  assert.deepEqual(merged.map(app => app.name), ["Mempool", "Extra"]);
});
