/* eslint-disable id-length */
const { parseMempoolApps, mergeMempoolApps } = require("./mempoolApps.js");

module.exports = {
  LN_REQUIRED_CONFIRMATIONS: 3,
  LND_STATUS_CODES: {
    UNAVAILABLE: 14,
    UNKNOWN: 2
  },
  DEVICE_DOMAIN_NAME: process.env.DEVICE_DOMAIN_NAME,
  // Which platform hosts the dashboard. Umbrel is the original. StartOS runs
  // the same image with DASHBOARD_PLATFORM=startos, which switches off the
  // pieces Umbrel provides or that StartOS provides itself (see app.js), and
  // puts a password on the door because nothing else does. "native" is a
  // plain Linux machine (scripts/native-ubuntu.sh in Lightning Fork): it works
  // as on Umbrel, settings and all, with a password on the door as on StartOS,
  // since no Umbrel sign-in stands in front of it.
  PLATFORM: ["startos", "native"].includes(process.env.DASHBOARD_PLATFORM) ? process.env.DASHBOARD_PLATFORM : "umbrel",
  IS_STARTOS: process.env.DASHBOARD_PLATFORM === "startos",
  IS_NATIVE: process.env.DASHBOARD_PLATFORM === "native",
  // What the machine is called in messages.
  DEVICE_NOUN: process.env.DASHBOARD_PLATFORM === "native" ? "this computer" : "this Umbrel",
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD,
  // A JSON file holding {"password": "..."}; read on every request, so the
  // platform can change the password without restarting the dashboard.
  DASHBOARD_PASSWORD_FILE: process.env.DASHBOARD_PASSWORD_FILE,
  // A bitcoind cookie file to read RPC credentials from, instead of RPC_USER
  // and RPC_PASSWORD. Re-read on every call: the node rewrites it at each start.
  RPC_COOKIE_FILE: process.env.RPC_COOKIE_FILE,
  USER_FILE: process.env.USER_FILE || "/db/user.json",
  JSON_STORE_FILE: process.env.JSON_STORE_FILE || "/data/state.json",
  JSON_SETTINGS_FILE: process.env.JSON_SETTINGS_FILE || "/data/settings.json",
  UMBREL_LND_CONF_FILEPATH: process.env.UMBREL_LND_CONF_FILEPATH || "/lnd/.lnd/umbrel-lnd.conf",
  LND_CONF_FILEPATH: process.env.LND_CONF_FILEPATH || "/lnd/.lnd/lnd.conf",
  LND_INITIALIZE_WITH_TOR_ONLY: process.env.LND_INITIALIZE_WITH_TOR_ONLY === 'true',
  MANAGED_CHANNELS_FILE: process.env.MANAGED_CHANNELS_FILE || "/channel-data/managedChannels.json",
  LND_WALLET_PASSWORD: process.env.LND_WALLET_PASSWORD || "moneyprintergobrrr",
  REQUEST_CORRELATION_NAMESPACE_KEY: "umbrel-middleware-request",
  REQUEST_CORRELATION_ID_KEY: "reqId",
  STATUS_CODES: {
    BAD_GATEWAY: 502,
    FORBIDDEN: 403,
    OK: 200
  },
  CHANNEL_BACKUP_FILE: process.env.CHANNEL_BACKUP_FILE,
  // The node's data directory as this container sees it, where the channel
  // backup agent keeps its settings and state: LND_DIR, or four levels above
  // channel.backup (<dir>/data/chain/bitcoin/<network>/channel.backup), or
  // where the Umbrel app mounts it.
  LND_DIR: process.env.LND_DIR
    || (process.env.CHANNEL_BACKUP_FILE ? require("path").resolve(process.env.CHANNEL_BACKUP_FILE, "../../../../..") : "/data/.lnd"),
  BACKUP_AGENT: process.env.BACKUP_AGENT || "/usr/local/bin/backup-agent.sh",
  LND_REST_HIDDEN_SERVICE:
    process.env.LND_REST_HIDDEN_SERVICE || "unset.onion",
  LND_GRPC_HIDDEN_SERVICE:
    process.env.LND_GRPC_HIDDEN_SERVICE || "unset.onion",
  LND_REST_PORT: process.env.LND_REST_PORT || 8080,
  LND_GRPC_PORT: process.env.LND_GRPC_PORT || 10009,
  LND_CERT_FILE: process.env.TLS_FILE || "/lnd/tls.cert",
  LND_ADMIN_MACAROON_FILE:
    process.env.MACAROON_FILE || process.env.MACAROON_DIR
      ? `${process.env.MACAROON_DIR}admin.macaroon`
      : "/lnd/data/chain/bitcoin/mainnet/admin.macaroon",
  TOR_PROXY_IP: process.env.TOR_PROXY_IP,
  TOR_PROXY_PORT: process.env.TOR_PROXY_PORT,
  TOR_PROXY_CONTROL_PORT: process.env.TOR_PROXY_CONTROL_PORT,
  TOR_PROXY_CONTROL_PASSWORD: process.env.TOR_PROXY_CONTROL_PASSWORD,

  TERMS_ACKNOWLEDGE_FILE:
    process.env.TERMS_ACKNOWLEDGE_FILE || "/statuses/terms-acknowledge.json",
  EXPLORER_PORT: process.env.EXPLORER_PORT,
  EXPLORER_HIDDEN_SERVICE: process.env.EXPLORER_HIDDEN_SERVICE,

  // The Mempool apps the package can reach, for fee rates and transaction
  // links. Each is offered when the wrapper set its API base (the app's web
  // UI, whose nginx serves /api/v1/fees/recommended); the browser-facing
  // address is a full URL (StartOS) or a port on the same host (Umbrel),
  // with an onion address for a page opened over Tor. Any others come as
  // one list (MEMPOOL_APPS, see utils/mempoolApps.js).
  MEMPOOL_APPS: mergeMempoolApps([
    // The StartOS package id "mempool" is both Start9's Mempool and the
    // Mempool Guide build, so the name the wrapper passes wins; without
    // one, both are named.
    { id: "mempool", name: "Mempool / Mempool Guide", prefix: "MEMPOOL_GUIDE" },
    { id: "mempool-pruned", name: "Mempool Pruned", prefix: "MEMPOOL_PRUNED" },
  ]
    .map(({ id, name, prefix }) => ({
      id,
      name: process.env[`${prefix}_NAME`] || name,
      api: process.env[`${prefix}_API`] || "",
      uiUrl: process.env[`${prefix}_UI_URL`] || "",
      uiPort: process.env[`${prefix}_UI_PORT`] || "",
      hiddenService: process.env[`${prefix}_HIDDEN_SERVICE`] || "",
    }))
    .filter(app => /^https?:\/\//.test(app.api)),
  parseMempoolApps(process.env.MEMPOOL_APPS)),
};
