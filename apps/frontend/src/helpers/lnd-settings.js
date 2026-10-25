// Advanced Settings that lnd reads as whole numbers (int, int64, uint32,
// uint64): a fraction, or a number too large to write out exactly, stops lnd
// from starting, so the form refuses them before saving. The backend checks
// the same (routes/v1/lnd/conf.js) with the same wording.

const UINT32_MAX = 4294967295;
const MAX_CLTV_DELTA = 65535;
const MAX_COMMIT_FEE_RATE_ANCHORS = 10000;

// [setting, name, min, max (undefined: none), unit]
const WHOLE_NUMBER_SETTINGS = [
  ["maxpendingchannels", "Maximum Pending Channels per Peer", 0],
  ["minchansize", "Minimum Channel Size", 1, 16777215, "sats"],
  ["coop-close-target-confs", "Confirmations for Channel Close", 1, UINT32_MAX],
  [
    "max-cltv-expiry",
    "Maximum Payment Lock-up Time",
    1,
    MAX_CLTV_DELTA,
    "blocks"
  ],
  [
    "max-commit-fee-rate-anchors",
    "Maximum Anchor Channel Commit Fee Rate",
    1,
    MAX_COMMIT_FEE_RATE_ANCHORS,
    "sat/vB"
  ],
  ["bitcoin.defaultchanconfs", "Confirmations for Channel Open", 0],
  ["bitcoin.basefee", "Base Forwarding Fee", 0, undefined, "msats"],
  ["bitcoin.feerate", "Forwarding Fee Rate", 0, undefined, "ppm"],
  ["bitcoin.timelockdelta", "Timelock Delta", 18, MAX_CLTV_DELTA, "blocks"],
  [
    "wtclient.sweep-fee-rate",
    "Watchtower Client Sweep Fee Rate",
    0,
    undefined,
    "sat/vB"
  ],
  ["routerrpc.attemptcost", "Failed Payment Cost", 0, undefined, "sats"],
  [
    "routerrpc.attemptcostppm",
    "Proportional Failed Payment Cost",
    0,
    undefined,
    "ppm"
  ],
  ["routerrpc.maxmchistory", "Maximum Mission Control History", 0],
  ["caches.channel-cache-size", "Maximum Channel Cache Entries", 1000]
];

export function isWholeNumber(value, min, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

export function wholeNumberError(name, min, max, unit) {
  const range =
    max === undefined ? `of at least ${min}` : `between ${min} and ${max}`;
  return `${name} must be a whole number ${range}${unit ? ` ${unit}` : ""}.`;
}

// The form's messages for its whole-number settings, empty when all are
// good.
export function wholeNumberErrors(settings) {
  const errors = [];
  for (const [key, name, min, max, unit] of WHOLE_NUMBER_SETTINGS) {
    if (!isWholeNumber(settings[key], min, max)) {
      errors.push(wholeNumberError(name, min, max, unit));
    }
  }
  const wumbo = settings["protocol.wumbo-channels"];
  const maxChanSize = wumbo ? 1000000000 : 16777215;
  if (!isWholeNumber(settings["maxchansize"], 1, maxChanSize)) {
    errors.push(
      `Maximum Channel Size must be a whole number between 1 and ${maxChanSize} sats when Larger Channels are ${
        wumbo ? "enabled" : "disabled"
      }`
    );
  }
  const cltv = settings["max-cltv-expiry"];
  const delta = settings["bitcoin.timelockdelta"];
  if (
    isWholeNumber(cltv, 1, MAX_CLTV_DELTA) &&
    isWholeNumber(delta, 18, MAX_CLTV_DELTA) &&
    cltv < delta
  ) {
    errors.push(
      "Maximum Payment Lock-up Time must be at least the Timelock Delta."
    );
  }
  return errors;
}
