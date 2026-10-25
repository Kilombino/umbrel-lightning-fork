const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");
const http = require("http");

// Advanced Settings' writes: nothing a request sends can add a line of its
// own to the file lnd reads.
process.env.NODE_PATH = path.join(__dirname, "..");
Module._initPaths();

const stub = (name, exports) => {
  const p = require.resolve(name);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
stub("utils/logger.js", { info() {}, warn() {}, error() {}, debug() {} });

const written = [];
const writtenMarks = [];
stub("logic/config.js", {
  normalizeSettings: (s) => s,
  writeLndConfig: async (config, bridge, marks) => { written.push(config); writtenMarks.push(marks); },
});
stub("logic/lightning.js", { stopDaemon: async () => {} });
stub("services/disk.js", {
  readJsonFile: async () => ({ lnd: {} }),
  readUtf8File: async () => "",
  writeJsonFile: async () => {},
  writePlainTextFile: async () => {},
});

const express = require("express");
const lndConfig = require("utils/lnd-config.js");
const DEFAULT_CONFIG = require("utils/defaultConfig.js");
const lndConfMap = require("utils/lndConfMap.js");
const router = require("routes/v1/lnd/conf.js");

const app = express();
app.use(express.json());
app.use("/v1/lnd/conf", router);
const server = http.createServer(app);
const listening = new Promise((r) => server.listen(0, "127.0.0.1", r));
test.after(() => server.close());

// The form's payload as the camelCase middleware leaves it.
const camel = Object.fromEntries(Object.entries(lndConfMap).filter(([, k]) => k in DEFAULT_CONFIG).map(([c, k]) => [c, DEFAULT_CONFIG[k]]));

async function post(lndConfig) {
  await listening;
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/v1/lnd/conf/lnd-config`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lndConfig }),
  });
  return { status: res.status, body: await res.json() };
}

test("the defaults are accepted as they are", async () => {
  written.length = 0;
  const r = await post({ ...camel });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(written.length, 1);
});

test("a line break in a value is refused, checked or not", async () => {
  for (const extra of [
    { alias: "node\nrpclisten=0.0.0.0:10009" },
    { dbBoltFreelistType: "map\nbitcoind.rpchost=203.0.113.1" },
    { paymentsExpirationGracePeriod: "30m\r" },
  ]) {
    written.length = 0;
    const r = await post({ ...camel, ...extra });
    assert.equal(r.status, 400, JSON.stringify(extra));
    assert.equal(written.length, 0);
  }
});

test("a value that is not plain is refused", async () => {
  written.length = 0;
  const r = await post({ ...camel, dbBoltPageSize: { a: 1 } });
  assert.equal(r.status, 400);
  assert.equal(written.length, 0);
});

test("settings the form does not manage are dropped", async () => {
  written.length = 0;
  const r = await post({ ...camel, bitcoindRpchost: "203.0.113.1", constructor: "x" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(written[0]).filter((k) => !(k in DEFAULT_CONFIG)), []);
});

test("generate refuses a line break or a strange key as a last resort", () => {
  assert.throws(() => lndConfig.generate({ alias: "a\nb=c" }), /line break/);
  assert.throws(() => lndConfig.generate({ externalip: ["1.2.3.4", "5.6.7.8\nx=y"] }), /line break/);
  assert.throws(() => lndConfig.generate({ "a b": "c" }), /key/);
  assert.match(lndConfig.generate({ alias: "fine = name" }), /\nalias=fine = name$/);
});

test("resizing channels is a boolean setting, its choice marked", async () => {
  written.length = 0;
  writtenMarks.length = 0;
  let r = await post({ ...camel, protocolSplice: true, protocolSpliceChosen: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(written[0]["protocol.splice"], true);
  assert.equal(written[0].protocolSpliceChosen, undefined, "the mark is no lnd.conf line");
  assert.deepEqual(writtenMarks[0], { spliceChosen: true });
  assert.match(lndConfig.generate(written[0]), /^protocol\.splice=true$/m);

  // Saved without touching it: no mark.
  r = await post({ ...camel });
  assert.equal(r.status, 200);
  assert.deepEqual(writtenMarks[1], {});
  assert.equal(written[1]["protocol.splice"], false);

  r = await post({ ...camel, protocolSplice: "yes" });
  assert.equal(r.status, 400);
  assert.ok(r.body.validationErrors.some((e) => /Resize Channels/.test(e)));
});

test("the anchor commit fee rate is a whole number from 1 to 10000 sat/vB", async () => {
  for (const value of [1, 10, 10_000]) {
    written.length = 0;
    const r = await post({ ...camel, maxCommitFeeRateAnchors: value });
    assert.equal(r.status, 200, `${value}: ${JSON.stringify(r.body)}`);
    assert.equal(written.length, 1);
  }
  for (const value of [0, 2.5, 10_001, 1e20, -1, "10"]) {
    written.length = 0;
    const r = await post({ ...camel, maxCommitFeeRateAnchors: value });
    assert.equal(r.status, 400, String(value));
    assert.equal(written.length, 0);
    assert.deepEqual(r.body.validationErrors, [
      "Maximum Anchor Channel Commit Fee Rate must be a whole number between 1 and 10000 sat/vB.",
    ]);
  }
});

test("a setting lnd reads as a whole number refuses a fraction or a number too large", async () => {
  for (const key of [
    "maxpendingchannels", "minchansize", "maxchansize", "coopCloseTargetConfs",
    "maxCltvExpiry", "bitcoinDefaultchanconfs", "bitcoinBasefee", "bitcoinFeerate",
    "bitcoinTimelockdelta", "wtclientSweepFeeRate", "routerrpcAttemptcost",
    "routerrpcAttemptcostppm", "routerrpcMaxmchistory", "cachesChannelCacheSize",
  ]) {
    for (const value of [camel[key] + 0.5, 1e20]) {
      written.length = 0;
      const r = await post({ ...camel, [key]: value });
      assert.equal(r.status, 400, `${key}=${value}`);
      assert.equal(written.length, 0);
      assert.ok(r.body.validationErrors.some((e) => /whole number/.test(e)), `${key}=${value}: ${r.body.validationErrors}`);
    }
  }
});

test("the lock-up time and timelock delta stay within what lnd starts with", async () => {
  let r = await post({ ...camel, maxCltvExpiry: 65_536 });
  assert.equal(r.status, 400);
  r = await post({ ...camel, bitcoinTimelockdelta: 65_536 });
  assert.equal(r.status, 400);
  r = await post({ ...camel, maxCltvExpiry: 40, bitcoinTimelockdelta: 80 });
  assert.equal(r.status, 400);
  assert.deepEqual(r.body.validationErrors, ["Maximum Payment Lock-up Time must be at least the Timelock Delta."]);
  written.length = 0;
  r = await post({ ...camel, maxCltvExpiry: 80, bitcoinTimelockdelta: 80 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

test("the probabilities may still be fractions", async () => {
  written.length = 0;
  const r = await post({ ...camel, routerrpcMinrtprob: 0.25, routerrpcApriorihopprob: 0.75, routerrpcAprioriweight: 0.3 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
