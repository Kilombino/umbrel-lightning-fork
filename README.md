# Lightning Fork dashboard

A fork of [Umbrel's Lightning Node dashboard](https://github.com/getumbrel/umbrel-lightning)
for [Lightning Fork](https://github.com/paulscode/lightning-fork), the LND fork
that follows the Bitcoin BLAKE2b chain. It is the `app` container of the
`paulscode-lightning-fork` app in the PaulsCode Umbrel store, and the
`dashboard` image of the
[Lightning Fork StartOS package](https://github.com/paulscode/lightning-fork-startos).

What differs from upstream:

- Named Lightning Fork, with the chain named beside it and the daemon's
  version (`0.21.3-beta-blake2b.N`) shown where LND's was.
- Dark by default, in the storm-navy and electric blue of the app icon;
  the light theme stays available under the same toggle.
- The peer port is 9737 (the official app keeps 9735), so the hybrid-mode
  note and the node URI shortening say so.
- Transaction links open mempool.guide, an explorer for the BLAKE2b chain,
  instead of mempool.space, which would show the transaction as missing;
  or the Mempool app the operator chooses under the menu's "Mempool app"
  entry (Mempool, Mempool Guide or Mempool Pruned), which the wrapper tells
  the backend how to reach (`MEMPOOL_GUIDE_*` and `MEMPOOL_PRUNED_*` in the
  environment, `*_NAME` for the name to show; any other Mempool app as one
  `MEMPOOL_APPS` list, `id|name|api|ui port or URL|onion` per app, joined
  with `;`). Which chain a Mempool app
  follows is its node's, so on mainnet the backend asks each for block
  961640, the first BLAKE2b block, and will not use one that answers with
  the other chain's. The same app supplies the fee
  rates: sending and opening channels offer Low, Medium and High, the
  rates the app's own page shows (read from its `/api/v1/fees/recommended`),
  or the node's estimate for 24, 6 and 1 blocks without an app. The node's
  estimate always sizes the transaction, so a rate becomes a total.
- Balances, channels and transactions refresh every ten seconds while the
  page is visible, and the node's alias is shown under the title with the
  color it announces.
- Channel details show the funding transaction, and the closing transaction
  while a channel closes, with a copy button that works over plain http
  and a link to the chosen explorer.
- A page whose session has ended returns to the sign-in screen by itself:
  the status poll asks the sign-in gate each round.
- Channel backups to a place the owner controls. Upstream uploaded
  `channel.backup` to Umbrel's backup server, which answers 403 to this app.
  The backend now runs the channel-backup agent from the StartOS package
  (`backup-agent.sh`, pinned by commit in the Dockerfile, with rclone): it
  copies `channel.backup` to SFTP, Nextcloud, Dropbox or Google Drive
  whenever it changes, and fetches it back for a restore. The dashboard's
  "Channel backups" modal configures a target (`/v1/channel-backup/*`,
  Umbrel only; StartOS has its own actions for the same agent), with the
  SFTP host-key confirmation and the OAuth code exchange the StartOS action
  has. Secrets stay in `channel-backup.json` beside LND's data and never
  reach the browser. With an agent from lightning-fork-startos `dde0512`
  on, each node's copy goes to its own folder,
  `<folder>/<sha256 of the identity pubkey>/channel.backup`; this image has
  no lncli, so the backend passes the pubkey from `GetInfo` as
  `NODE_PUBKEY` and starts the watcher once LND has reported it. A restore
  also finds a copy an earlier agent left at `<folder>/channel.backup`.
- Macaroons for other apps, under **Macaroons** in the menu
  (`/v1/lnd/macaroons`): a preset (read only, receive payments, Lightning
  wallet, full access) or a custom choice of LND's own permissions or
  specific calls, an optional expiry (a `time-before` caveat, as `lncli
  bakemacaroon --timeout` adds), shown once as hex, base64, a file or an
  lndconnect QR. Each gets a root key id of its own, so it is revoked alone;
  the node's own macaroons (root key 0) are never touched. Only a record
  (name, permissions, dates) is kept, in `macaroons.json` beside the state
  file, readable by the dashboard only. With a dashboard password, making
  one asks for it again.
- On Umbrel, `TRUSTED_PROXY_IPS` (the store's status container) is the only
  address the API answers, and the home screen widgets are answered only
  from the network's gateway, where umbreld reads them; every app shares
  one Docker network, and the dashboard has no sign-in of its own there.
  POSTs to the API must be JSON, and the page refuses to be framed.
- Fiat amounts priced for this chain. Upstream asked mempool.space for the
  BTC price, which is the SHA256d coin's. This asks neoxa.exchange, where
  BTCB2 trades (its BTCB2/USDC market), and converts dollars to other
  currencies with the ratio of two of Coingecko's fiat quotes, the way
  Sparrow BLAKE2b does it. While neoxa.exchange is unreachable the hints
  show the amount in the other unit (sats or BTC) instead; while Coingecko
  is unreachable only USD is offered. Both feeds are cached in the backend.

## StartOS mode

With `DASHBOARD_PLATFORM=startos` the same image runs inside the StartOS
package, keeping the parts that interface with the node (wallets, send and
receive, channels, history, status and sync) and dropping what StartOS does
itself or what Umbrel provided:

- No onboarding: the package creates and unlocks the wallet. While the
  wallet is locked (Cold Storage Mode) the loading screen says so.
- No `umbrel-lnd.conf` writing, no LND restarts, no Advanced Settings: the
  package owns `lnd.conf`. The wallet-unlock loop is off for the same reason.
- No channel-backup configuration, secret words, Connect wallet or
  home-screen widgets; their API routes answer 404. StartOS runs the same
  backup agent through its own actions.
- A sign-in screen, because StartOS puts nothing in front of a UI
  interface. One password, no username, after the pattern Pickhash uses:
  `POST /v1/auth/login` opens a server-side session held in an HttpOnly
  cookie with a per-session CSRF token that every non-GET request must carry
  (`X-CSRF-Token`); sessions last twelve hours and end at `/v1/auth/logout`;
  a global lockout, persisted in the JSON store, backs off from the third
  wrong attempt (429 with `retry_after`), verifies attempts one at a time so
  a parallel burst cannot outrun the counter, and refuses attempts it cannot
  record. Sessions and the lockout remember a fingerprint of the password
  they belong to: changing the password ends every session, unpairs every
  phone (including a pairing under way) and starts the counter afresh, which is the owner's way out of a lockout somebody else
  caused. Express runs with case-sensitive routing and the gate is mounted
  at `/v1` so the two can never disagree about what is under it. The
  password comes from
  `DASHBOARD_PASSWORD`, or from the JSON file named by
  `DASHBOARD_PASSWORD_FILE` (`{"password": "..."}`), read on every attempt
  so the platform can change it without a restart. The backend refuses to
  start with neither set, and the gate is on whenever either is set,
  whatever the platform. The static frontend stays public so the sign-in
  screen can render; `GET /v1/auth/state` tells the page whether to show
  it. `GET /ping` stays open and reports `auth` as `configured`, `missing`
  or `off`, so a platform health check can tell a dashboard nobody can sign
  in to from a healthy one. Set `COOKIE_SECURE=1` to mark the cookie Secure
  where the dashboard is only ever reached over TLS.
- Bitcoin RPC credentials from the node's cookie file (`RPC_COOKIE_FILE`),
  re-read on every call, instead of `RPC_USER` and `RPC_PASSWORD`.

The frontend learns the platform from `GET /v1/system/platform`.

Image: `paulscode/umbrel-lightning-fork`, built from this repository's
`Dockerfile` for amd64 and arm64 and pinned by digest on both platforms.

---

<p align="center">
  <a href="https://umbrel.com">
    <img src="https://i.imgur.com/kNSdYQy.jpg" alt="Logo">
  </a>
  <h1 align="center">Lightning Node for Umbrel</h1>
  <p align="center">
    Run a Lightning node on your Umbrel personal server. An official app by Umbrel. Powered by LND.
    <br />
    <a href="https://umbrel.com"><strong>umbrel.com »</strong></a>
    <br />
    <br />
    <a href="https://twitter.com/umbrel">
      <img src="https://img.shields.io/twitter/follow/umbrel?style=social" />
    </a>
    <a href="https://t.me/getumbrel">
      <img src="https://img.shields.io/badge/community-chat-%235351FB">
    </a>
    <a href="https://reddit.com/r/getumbrel">
      <img src="https://img.shields.io/reddit/subreddit-subscribers/getumbrel?style=social">
    </a>
    <a href="https://community.getumbrel.com">
      <img src="https://img.shields.io/badge/community-forum-%235351FB">
    </a>
  </p>
</p>

## Getting started

This app can be installed in one click via the Umbrel App Store.

---

## Contributing

We welcome and appreciate new contributions!

If you're a developer looking to help but not sure where to begin, look for [these issues](https://github.com/getumbrel/umbrel-lightning/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) that have specifically been marked as being friendly to new contributors.

If you're looking for a bigger challenge, before opening a pull request please [create an issue](https://github.com/getumbrel/umbrel-lightning/issues/new/choose) or [join our community chat](https://t.me/getumbrel) to get feedback, discuss the best way to tackle the challenge, and to ensure that there's no duplication of work.

## Acknowledgements

This app is built upon the work done by [Casa](https://github.com/casa) on its open source [API](https://github.com/Casa/Casa-Node-API).

---

[![License](https://img.shields.io/github/license/getumbrel/umbrel-lightning?color=%235351FB)](https://github.com/getumbrel/umbrel-lightning/blob/master/LICENSE.md)

[umbrel.com](https://umbrel.com)

## Mobile app

Phones pair with the dashboard from its menu (**Mobile app**) and use the
companion app for Android to see balances, send and receive. The API it
uses is described in [docs/mobile-api.md](docs/mobile-api.md).

The dashboard can also pay SHA256 invoices (from nodes on the SHA256
chain) through a service someone else runs, set up under **Paying SHA256
invoices** in its settings from the code the service's operator gives out.
The service is paid with an invoice that carries the SHA256 invoice's own
payment hash, so it can only collect by paying it, and every invoice it
sends is checked against the SHA256 invoice and the market rate before
anything is paid. See [docs/mobile-api.md](docs/mobile-api.md#paying-sha256-invoices).
