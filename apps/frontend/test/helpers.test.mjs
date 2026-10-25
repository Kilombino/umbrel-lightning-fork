// The frontend's helpers that hold wording and arithmetic, run under plain
// Node (node --test test/): the ones with no imports, loaded as modules from
// their source, so nothing of the Vue build is needed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const load = (name) =>
  import(
    `data:text/javascript;base64,${fs
      .readFileSync(new URL(`../src/helpers/${name}.js`, import.meta.url))
      .toString("base64")}`
  );

const bridge = await load("bridge");
const invoices = await load("bitcoin-invoices");
const { default: getErrorMessage } = await load("error-message");

test("a channel's state reads as a phrase, with a forced close's wait", () => {
  assert.equal(bridge.channelState({ state: "active" }).text, "Open");
  assert.equal(bridge.channelState({ state: "inactive" }).variant, "warning");
  assert.equal(
    bridge.channelState({ state: "force-closing", blocksTilMaturity: 140 }).text,
    "Closing (forced): its coins are spendable in 140 blocks"
  );
  assert.equal(
    bridge.channelState({ state: "force-closing", blocksTilMaturity: 1 }).text,
    "Closing (forced): its coins are spendable in 1 block"
  );
  assert.equal(bridge.channelState({ state: "new-thing" }).text, "new-thing");
  assert.equal(bridge.channelState(null).text, "Unknown");
});

test("only an open channel can be closed, and only with a connected peer together", () => {
  assert.deepEqual(bridge.closeOptions({ state: "active" }), { closable: true, coop: true });
  assert.deepEqual(bridge.closeOptions({ state: "inactive" }), { closable: true, coop: false });
  for (const state of ["opening", "closing", "force-closing"]) {
    assert.equal(bridge.closeOptions({ state }).closable, false, state);
  }
});

test("a fee rate field is empty or a whole number of sat/vB", () => {
  assert.deepEqual(bridge.feeRateInput(""), { ok: true, value: undefined });
  assert.deepEqual(bridge.feeRateInput("  "), { ok: true, value: undefined });
  assert.deepEqual(bridge.feeRateInput("12"), { ok: true, value: 12 });
  assert.deepEqual(bridge.feeRateInput(5), { ok: true, value: 5 });
  for (const bad of ["0", "1.5", "-3", "abc", "10001"]) {
    assert.equal(bridge.feeRateInput(bad).ok, false, bad);
  }
});

test("directions are named from the payer's side", () => {
  assert.equal(bridge.directionName("toSHA256"), "Paying SHA256 invoices for BTCB2");
  assert.equal(bridge.directionName("toBLAKE2b"), "Paying BLAKE2b invoices for BTC (SHA256)");
  assert.equal(bridge.directionName("other"), "other");
});

test("durations and the rate's age read in words", () => {
  assert.equal(bridge.duration(1), "1 second");
  assert.equal(bridge.duration(120), "2 minutes");
  assert.equal(bridge.duration(3 * 3600), "3 hours");
  assert.equal(bridge.duration(3 * 86400), "3 days");
  assert.deepEqual(bridge.rateAge({ rateState: "unset" }), { text: "Not set yet", variant: "warning" });
  const expired = bridge.rateAge({ now: 10000, rateSetAt: 10000 - 7200, rateState: "expired" });
  assert.equal(expired.variant, "danger");
  assert.match(expired.text, /^Set 2 hours ago, expired/);
  const fresh = bridge.rateAge({ now: 10000, rateSetAt: 10000 - 60, rateExpiresAt: 10000 + 3600, rateState: "fresh" });
  assert.equal(fresh.text, "Set 60 seconds ago, expires in 60 minutes");
});

test("the rate against the market is said from the payer's side", () => {
  assert.equal(bridge.marketDifference(null), "");
  assert.equal(bridge.marketDifference(0.0001), "At the market rate");
  assert.match(bridge.marketDifference(0.02), /above the market: payers get more/);
  assert.match(bridge.marketDifference(-0.02), /below the market$/);
});

test("a price against the market says what the service's own widening adds", () => {
  assert.equal(invoices.marketComparison(null), "");
  assert.equal(
    invoices.marketComparison({ premium: 0.03, premiumAllowed: 0.06 }),
    "3% above the market rate (up to 6% is allowed)"
  );
  assert.equal(
    invoices.marketComparison({ premium: 0.056, premiumAllowed: 0.08, serviceWidening: 0.03 }),
    "5.6% above the market rate (up to 8% is allowed, including 3% the service added to its fee)"
  );
  assert.equal(invoices.marketComparison({ premium: -0.01, premiumAllowed: 0.08, serviceWidening: 0.03 }), "1% below the market rate");
});

test("node states have a phrase, and unknown ones say themselves", () => {
  assert.equal(bridge.nodeState("ready").variant, "success");
  assert.deepEqual(bridge.nodeState("odd"), { text: "odd", variant: "muted" });
  assert.equal(bridge.sha256NodeState("behind").text, "Still syncing");
});

test("amounts, percentages and keys are written the same everywhere", () => {
  assert.equal(invoices.sats(1), "1 sat");
  assert.equal(invoices.sats(0), "0 sats");
  assert.equal(invoices.percent(0.0525), "5.25%");
  assert.equal(invoices.percent("x"), "");
  assert.equal(invoices.shortKey("ab".repeat(33)), `${"ab".repeat(5)}…${"ab".repeat(5)}`);
  assert.equal(invoices.shortKey("short"), "short");
});

test("an error's message is the server's sentence, never an HTML page", () => {
  const fallback = "Fallback.";
  assert.equal(
    getErrorMessage({ response: { status: 409, data: "Two payments are not finished." } }, fallback),
    "Two payments are not finished."
  );
  assert.equal(
    getErrorMessage({ response: { status: 502, headers: { "Content-Type": "text/html" }, data: "<html><body>Bad gateway</body></html>" } }, fallback),
    fallback
  );
  assert.equal(getErrorMessage(null, fallback), fallback);
});

test("the bridge node's backup copy is said in a sentence", () => {
  assert.equal(bridge.sha256BackupText(null, 0), null);
  assert.equal(bridge.sha256BackupText({ state: "off" }, 0).variant, "warning");
  assert.match(bridge.sha256BackupText({ state: "failing", detail: "dropbox: upload (401)" }, 0).text, /failing: dropbox: upload \(401\)\.$/);
  assert.equal(bridge.sha256BackupText({ state: "copied", at: 1000 }, 1000 + 7200).text,
    "Copied off this server to your Channel backups targets 2 hours ago.");
  assert.equal(bridge.sha256BackupText({ state: "odd" }, 0), null);
});

test("the market rate's line says why nothing is quoted, or how it stands", () => {
  assert.equal(bridge.marketLine({ marketRefusal: "quoting nothing while the market settles: …" }).variant, "danger");
  assert.match(bridge.marketLine({ marketRefusal: "no rate yet: reading the market" }).text, /^No rate yet/);
  assert.equal(bridge.marketLine({ rate: 0 }).text, "Reading the market");
  const line = bridge.marketLine({ rate: 0.006, rateSetAt: 1000, now: 1012, rateCrossCheck: 0.00603, rateVolatility: 0.012 });
  assert.equal(line.variant, "muted");
  assert.match(line.text, /^Read 12 seconds ago; its BTCB2_USDC price agrees within 0\.5%; it moved 1\.2% in the last minutes/);
});

test("Advanced Settings refuses a fraction or a too-large number where lnd reads a whole one", async () => {
  const { wholeNumberErrors } = await load("lnd-settings");
  const good = {
    maxpendingchannels: 1, minchansize: 20000, maxchansize: 16777215,
    "coop-close-target-confs": 6, "max-cltv-expiry": 2016, "max-commit-fee-rate-anchors": 10,
    "bitcoin.defaultchanconfs": 2, "bitcoin.basefee": 1000, "bitcoin.feerate": 1,
    "bitcoin.timelockdelta": 80, "wtclient.sweep-fee-rate": 10, "routerrpc.attemptcost": 100,
    "routerrpc.attemptcostppm": 1000, "routerrpc.maxmchistory": 1000,
    "caches.channel-cache-size": 20000, "protocol.wumbo-channels": false,
    "routerrpc.minrtprob": 0.01,
  };
  assert.deepEqual(wholeNumberErrors(good), []);
  assert.deepEqual(wholeNumberErrors({ ...good, "max-commit-fee-rate-anchors": 10000 }), []);
  for (const value of [2.5, 1e20, 0, 10001, ""]) {
    assert.deepEqual(wholeNumberErrors({ ...good, "max-commit-fee-rate-anchors": value }), [
      "Maximum Anchor Channel Commit Fee Rate must be a whole number between 1 and 10000 sat/vB.",
    ]);
  }
  assert.deepEqual(wholeNumberErrors({ ...good, "bitcoin.basefee": 1.5 }), [
    "Base Forwarding Fee must be a whole number of at least 0 msats.",
  ]);
  assert.equal(wholeNumberErrors({ ...good, maxchansize: 20000000 }).length, 1);
  assert.deepEqual(wholeNumberErrors({ ...good, maxchansize: 20000000, "protocol.wumbo-channels": true }), []);
  assert.deepEqual(wholeNumberErrors({ ...good, "max-cltv-expiry": 40 }), [
    "Maximum Payment Lock-up Time must be at least the Timelock Delta.",
  ]);
});
