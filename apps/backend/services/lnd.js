/* eslint-disable camelcase, max-lines */
const grpc = require("grpc");
const camelizeKeys = require("camelize-keys");
const { spliceRequest, spliceChannelRequest } = require("utils/spliceRequest.js");
const { followSplice } = require("utils/spliceStream.js");

const diskService = require("services/disk");
const LndError = require("models/errors.js").LndError;

const LND_HOST = process.env.LND_HOST || "127.0.0.1";
const TLS_FILE = process.env.TLS_FILE || "/lnd/tls.cert";
const PROTO_FILE = process.env.PROTO_FILE || "./resources/rpc.proto";
const ROUTERRPC_PROTO_FILE =
  process.env.ROUTERRPC_PROTO_FILE || "./resources/routerrpc.proto";
const WATCHTOWERRPC_PROTO_FILE = process.env.WATCHTOWERRPC_PROTO_FILE || "./resources/watchtowerrpc.proto";
const WTCLIENTRPC_PROTO_FILE = process.env.WTCLIENTRPC_PROTO_FILE || "./resources/wtclientrpc.proto";
const OFFERSRPC_PROTO_FILE = process.env.OFFERSRPC_PROTO_FILE || "./resources/offersrpc.proto";
const LND_PORT = process.env.LND_PORT || 10009; // eslint-disable-line no-magic-numbers
const LND_NETWORK = process.env.LND_NETWORK || "mainnet";

// LND changed the macaroon path to ~/.lnd/data/chain/{chain}/{network}/admin.macaroon. We are currently only
// supporting bitcoind and have that hard coded. However, we are leaving the ability to switch between testnet and
// mainnet. This can be done with the /reset route. LND_NETWORK will be defaulted in /usr/local/casa/applications/.env.
// LND_NETWORK will be overwritten in the settings file.
let MACAROON_FILE =
  "/lnd/data/chain/bitcoin/" + LND_NETWORK + "/admin.macaroon";

// Developers should overwrite MACAROON_DIR in their .env file or ide. We recommend 'os.homedir() + /lightning-node/'.
if (process.env.MACAROON_DIR) {
  MACAROON_FILE = process.env.MACAROON_DIR + "admin.macaroon";
}

// TODO move this to volume
const lnrpcDescriptor = grpc.load(PROTO_FILE);
const lnrpc = lnrpcDescriptor.lnrpc;

const lnrpcRouterDescriptor = grpc.load(ROUTERRPC_PROTO_FILE);
const lnrpcRouter = lnrpcRouterDescriptor.routerrpc;

const lnrpcWatchtowerDescriptor = grpc.load(WATCHTOWERRPC_PROTO_FILE);
const lnrpcWatchtower = lnrpcWatchtowerDescriptor.watchtowerrpc;

const lnrpcWtclientDescriptor = grpc.load(WTCLIENTRPC_PROTO_FILE);
const lnrpcWtclient = lnrpcWtclientDescriptor.wtclientrpc;

// BOLT 12 offers, a Lightning Fork sub-server.
const lnrpcOffersDescriptor = grpc.load(OFFERSRPC_PROTO_FILE);
const lnrpcOffers = lnrpcOffersDescriptor.offersrpc;

const DEFAULT_RECOVERY_WINDOW = 250;
const SMALL_PAYMENT_THRESHOLD = 1000;
const DEFAULT_ROUTING_FEE_PERCENT = 5;

const PAYMENT_FAILURE_MESSAGES = {
  FAILURE_REASON_TIMEOUT: "payment timed out",
  FAILURE_REASON_NO_ROUTE: "no route found",
  FAILURE_REASON_ERROR: "payment failed",
  FAILURE_REASON_INCORRECT_PAYMENT_DETAILS: "incorrect payment details",
  FAILURE_REASON_INSUFFICIENT_BALANCE: "insufficient balance",
  FAILURE_REASON_CANCELED: "payment canceled",
};

const GRPC_PARAMS = {
  "grpc.max_receive_message_length": -1,
  "grpc.max_send_message_length": -1,
};

// Initialize RPC client will attempt to connect to the lnd rpc with a tls.cert and admin.macaroon. If the wallet has
// not bee created yet, then the client will only be initialized with the tls.cert. There may be times when lnd wallet
// is reset and the tls.cert and admin.macaroon will change.
async function initializeRPCClient() {
  return diskService
    .readFile(TLS_FILE)
    .then((lndCert) => {
      const sslCreds = grpc.credentials.createSsl(lndCert);

      return diskService
        .readFile(MACAROON_FILE)
        .then((macaroon) => {
          // build meta data credentials
          const metadata = new grpc.Metadata();
          metadata.add("macaroon", macaroon.toString("hex"));
          const macaroonCreds = grpc.credentials.createFromMetadataGenerator(
            (_args, callback) => {
              callback(null, metadata);
            }
          );

          // combine the cert credentials and the macaroon auth credentials
          // such that every call is properly encrypted and authenticated
          return {
            credentials: grpc.credentials.combineChannelCredentials(
              sslCreds,
              macaroonCreds
            ),
            state: true,
          };
        })
        .catch(() => ({
          credentials: sslCreds,
          state: "WALLET_CREATION_ONLY",
        }));
    })
    .then(({ credentials, state }) => {
      return {
        lightning: new lnrpc.Lightning(
          LND_HOST + ":" + LND_PORT,
          credentials,
          GRPC_PARAMS
        ),
        walletUnlocker: new lnrpc.WalletUnlocker(
          LND_HOST + ":" + LND_PORT,
          credentials
        ),
        router: new lnrpcRouter.Router(
          LND_HOST + ":" + LND_PORT,
          credentials,
          GRPC_PARAMS
        ),
        offers: new lnrpcOffers.Offers(
          LND_HOST + ":" + LND_PORT,
          credentials,
          GRPC_PARAMS
        ),
        watchtower: new lnrpcWatchtower.Watchtower(
          LND_HOST + ":" + LND_PORT,
          credentials
        ),
        watchtowerclient: new lnrpcWtclient.WatchtowerClient(
          LND_HOST + ":" + LND_PORT,
          credentials
        ),
        state: state, // eslint-disable-line object-shorthand
      };
    });
}

async function promiseify(rpcObj, rpcFn, payload, description) {
  return new Promise((resolve, reject) => {
    try {
      rpcFn.call(rpcObj, payload, (error, grpcResponse) => {
        if (error) {
          reject(new LndError(`Unable to ${description}`, error));
        } else {
          resolve(camelizeKeys(grpcResponse, "_"));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// an amount, an options memo, and can only be paid to node that created it.
async function addInvoice(amount, memo) {
  // we check if all channels are private to determine whether we need to provide routing hints
  const channels = await getOpenChannels();
  const privateChannelsOnly = channels.every(channel => channel.private);

  const rpcPayload = {
    value: amount,
    memo: memo, // eslint-disable-line object-shorthand
    expiry: 3600, // Should we make this ENV specific for ease of testing?
    private: privateChannelsOnly, // provide routing hints when user only has private channels
  };

  const conn = await initializeRPCClient();

  const grpcResponse = await promiseify(
    conn.lightning,
    conn.lightning.addInvoice,
    rpcPayload,
    "create new invoice"
  );

  if (grpcResponse && grpcResponse.paymentRequest) {
    return {
      rHash: grpcResponse.rHash,
      paymentRequest: grpcResponse.paymentRequest,
    };
  } else {
    throw new LndError("Unable to parse invoice from lnd");
  }
}

// Change your lnd password.
async function changePassword(currentPassword, newPassword) {
  const currentPasswordBuff = Buffer.from(currentPassword, "utf8");
  const newPasswordBuff = Buffer.from(newPassword, "utf8");

  const rpcPayload = {
    current_password: currentPasswordBuff,
    new_password: newPasswordBuff,
  };

  const conn = await initializeRPCClient();

  return await promiseify(
    conn.walletUnlocker,
    conn.walletUnlocker.changePassword,
    rpcPayload,
    "change password"
  );
}

function closeChannel(fundingTxId, index, force) {
  const rpcPayload = {
    channel_point: {
      funding_txid_str: fundingTxId,
      output_index: index,
    },
    force: force, // eslint-disable-line object-shorthand
  };

  return initializeRPCClient().then(
    ({ lightning }) =>
      new Promise((resolve, reject) => {
        try {
          const call = lightning.CloseChannel(rpcPayload);
          let done = false;

          call.on("data", (chan) => {
            if (chan.update === "close_pending") {
              done = true;
              resolve();
            }
          });

          call.on("error", (error) => {
            done = true;
            reject(new LndError("Unable to close channel", error));
          });

          // A stream that ends without saying the close is pending must not
          // leave the caller waiting forever.
          call.on("end", () => {
            if (!done) {
              reject(new LndError("Unable to close channel", { code: 4, details: "the node ended the request without an answer" }));
            }
          });
        } catch (error) {
          reject(error);
        }
      })
  );
}

// The request both splice calls take: the channel by its current or original
// channel point, which way the funds move, and how much at what fee.
// What a splice this node would start costs and allows. Purely local.
function estimateSplice(options) {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.EstimateSplice, spliceRequest(options), "estimate a resize")
  );
}

// Starts a splice and waits until it is agreed with the peer ("broadcast",
// or "signed" when our signatures went out and the peer's are slow to come)
// or refused (rejected with the reason and whether it is the peer's text).
// See utils/spliceStream.js.
function spliceChannel(options) {
  return initializeRPCClient().then(({ lightning }) => followSplice(lightning.SpliceChannel(spliceChannelRequest(options))));
}

// Connects to a peer at a host:port that is already formatted for lnd (an
// IPv6 host in brackets). Not permanent: lnd forgets a peer it holds no
// channel with once the connection drops.
function connectPeer(pubKey, hostPort) {
  const rpcPayload = {
    addr: {
      pubkey: pubKey,
      host: hostPort,
    },
  };

  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.ConnectPeer, rpcPayload, "connect to peer")
  );
}

// Disconnects from a peer. lnd refuses one it still has channels with.
function disconnectPeer(pubKey) {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(
      lightning,
      lightning.DisconnectPeer,
      { pub_key: pubKey },
      "disconnect from peer"
    )
  );
}

// Connects this lnd node to a peer.
function connectToPeer(pubKey, ip, port) {
  const rpcPayload = {
    addr: {
      pubkey: pubKey,
      host: ip + ":" + port,
    },
  };

  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.ConnectPeer, rpcPayload, "connect to peer")
  );
}

function decodePaymentRequest(paymentRequest) {
  const rpcPayload = {
    pay_req: paymentRequest,
  };

  return initializeRPCClient()
    .then(({ lightning }) =>
      promiseify(
        lightning,
        lightning.decodePayReq,
        rpcPayload,
        "decode payment request"
      )
    )
    .then((invoice) => {
      // add on payment request for extra details
      invoice.paymentRequest = paymentRequest;

      return invoice;
    });
}

async function estimateFee(address, amt, confTarget) {
  const addrToAmount = {};
  addrToAmount[address] = amt;

  const rpcPayload = {
    AddrToAmount: addrToAmount,
    target_conf: confTarget,
  };

  const conn = await initializeRPCClient();

  return await promiseify(
    conn.lightning,
    conn.lightning.estimateFee,
    rpcPayload,
    "estimate fee request"
  );
}

async function generateAddress() {
  const rpcPayload = {
    type: 0,
  };

  const conn = await initializeRPCClient();

  return await promiseify(
    conn.lightning,
    conn.lightning.NewAddress,
    rpcPayload,
    "generate address"
  );
}

function generateSeed() {
  return initializeRPCClient().then(({ walletUnlocker, state }) => {
    if (state === true) {
      throw new LndError("Macaroon exists, therefore wallet already exists");
    }

    return promiseify(
      walletUnlocker,
      walletUnlocker.GenSeed,
      {},
      "generate seed"
    );
  });
}

function getChannelBalance() {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.ChannelBalance, {}, "get channel balance")
  );
}

function getFeeReport() {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.FeeReport, {}, "get fee report")
  );
}

function getForwardingEvents(startTime, endTime, indexOffset) {
  const rpcPayload = {
    start_time: startTime,
    end_time: endTime,
    index_offset: indexOffset,
  };

  return initializeRPCClient().then(({ lightning }) =>
    promiseify(
      lightning,
      lightning.ForwardingHistory,
      rpcPayload,
      "get forwarding events"
    )
  );
}

function getInfo() {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.GetInfo, {}, "get lnd information")
  );
}

function getRecoveryInfo() {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.GetRecoveryInfo, {}, "get lnd recovery information")
  );
}

function getState() {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.GetState, {}, "get lnd state")
  );
}

function getNodeInfo(pubkey, includeChannels) {
  const rpcPayload = {
    pub_key: pubkey,
    include_channels: includeChannels,
  };
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(
      lightning,
      lightning.GetNodeInfo,
      rpcPayload,
      "get node information"
    )
  );
}

// Returns a list of lnd's currently open channels. Channels are considered open by this node and it's directly
// connected peer after three confirmation. After six confirmations, the channel is broadcasted by this node and it's
// directly connected peer to the broader lightning network.
function getOpenChannels() {
  return initializeRPCClient()
    .then(({ lightning }) =>
      promiseify(lightning, lightning.ListChannels, {}, "list channels")
    )
    .then((grpcResponse) => grpcResponse.channels);
}

function getClosedChannels() {
  return initializeRPCClient()
    .then(({ lightning }) =>
      promiseify(lightning, lightning.ClosedChannels, {}, "closed channels")
    )
    .then((grpcResponse) => grpcResponse.channels);
}

// The newest outgoing payments. With no max_payments lnd returns its
// first 100, the oldest, so a node with more never showed its latest.
const PAYMENTS_SHOWN = 1000;

function getPayments() {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(
      lightning,
      lightning.ListPayments,
      { max_payments: PAYMENTS_SHOWN, reversed: true },
      "get payments"
    )
  );
}

// Returns a list of all lnd's currently connected and active peers.
function getPeers() {
  return initializeRPCClient()
    .then(({ lightning }) =>
      promiseify(lightning, lightning.ListPeers, {}, "get peer information")
    )
    .then((grpcResponse) => {
      if (grpcResponse && grpcResponse.peers) {
        return grpcResponse.peers;
      } else {
        throw new LndError("Unable to parse peer information");
      }
    });
}

// Returns a list of lnd's currently pending channels. Pending channels include, channels that are in the process of
// being opened, but have not reached three confirmations. Channels that are pending closed, but have not reached
// one confirmation. Forced close channels that require potentially hundreds of confirmations.
function getPendingChannels() {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(
      lightning,
      lightning.PendingChannels,
      {},
      "list pending channels"
    )
  );
}

function getWalletBalance() {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.WalletBalance, {}, "get wallet balance")
  );
}

function initWallet(options) {
  const passwordBuff = Buffer.from(options.password, "utf8");

  const rpcPayload = {
    wallet_password: passwordBuff,
    cipher_seed_mnemonic: options.mnemonic,
    recovery_window: DEFAULT_RECOVERY_WINDOW,
  };

  return initializeRPCClient().then(({ walletUnlocker, state }) => {
    if (state === true) {
      throw new LndError("Macaroon exists, therefore wallet already exists");
    }

    return promiseify(
      walletUnlocker,
      walletUnlocker.InitWallet,
      rpcPayload,
      "initialize wallet"
    ).then(() => options.mnemonic);
  });
}

// Returns a list of all invoices.
function getInvoices() {
  const rpcPayload = {
    reversed: true, // Returns most recent
    num_max_invoices: 100,
  };

  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.ListInvoices, rpcPayload, "list invoices")
  );
}

// Returns a list of all on chain transactions.
function getOnChainTransactions() {
  return initializeRPCClient()
    .then(({ lightning }) =>
      promiseify(
        lightning,
        lightning.GetTransactions,
        {},
        "list on-chain transactions"
      )
    )
    .then((grpcResponse) => grpcResponse.transactions);
}

async function listUnspent() {
  const rpcPayload = {
    min_confs: 1,
    max_confs: 10000000, // Use arbitrarily high maximum confirmation limit.
  };

  const conn = await initializeRPCClient();

  return await promiseify(
    conn.lightning,
    conn.lightning.listUnspent,
    rpcPayload,
    "estimate fee request"
  );
}

function openChannel(pubKey, amt, satPerByte, isPrivate) {
  const rpcPayload = {
    node_pubkey_string: pubKey,
    local_funding_amount: amt,
    private: isPrivate,
  };

  if (satPerByte) {
    rpcPayload.sat_per_byte = satPerByte;
  } else {
    rpcPayload.target_conf = 6;
  }

  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.OpenChannelSync, rpcPayload, "open channel")
  );
}

function sendCoins(addr, amt, satPerByte, sendAll) {
  const rpcPayload = {
    addr: addr, // eslint-disable-line object-shorthand
    amount: amt,
    send_all: sendAll,
  };

  if (satPerByte) {
    rpcPayload.sat_per_byte = satPerByte;
  } else {
    rpcPayload.target_conf = 6;
  }

  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.SendCoins, rpcPayload, "send coins")
  );
}

function defaultRoutingFeeLimit(amount) {
  // Match the amount-based default previously applied by SendPaymentSync.
  if (amount <= SMALL_PAYMENT_THRESHOLD) {
    return amount;
  }

  return Math.floor((amount * DEFAULT_ROUTING_FEE_PERCENT) / 100);
}

// `feeLimitSat`, when given, replaces the default routing fee limit.
function sendPayment(paymentRequest, amt, paymentAmount, feeLimitSat) {
  const rpcPayload = {
    payment_request: paymentRequest,
    fee_limit_sat: feeLimitSat || defaultRoutingFeeLimit(paymentAmount),
    no_inflight_updates: true,
  };

  if (amt) {
    rpcPayload.amt = amt;
  }

  return initializeRPCClient().then(
    ({ router }) =>
      new Promise((resolve, reject) => {
        let settled = false;

        const succeed = response => {
          if (settled) {
            return;
          }

          settled = true;
          resolve(response);
        };

        const fail = error => {
          if (settled) {
            return;
          }

          settled = true;
          reject(error);
        };

        try {
          const call = router.SendPaymentV2(rpcPayload);

          call.on("data", response => {
            const payment = camelizeKeys(response, "_");

            if (payment.status === "SUCCEEDED") {
              succeed(payment);
            } else if (payment.status === "FAILED") {
              const reason =
                PAYMENT_FAILURE_MESSAGES[payment.failureReason] ||
                "unknown reason";
              fail(
                new LndError(`Unable to send lightning payment: ${reason}`)
              );
            }
          });

          call.on("error", error => {
            fail(new LndError("Unable to send lightning payment", error));
          });

          call.on("end", () => {
            fail(
              new LndError(
                "Unable to send lightning payment: no final payment status"
              )
            );
          });
        } catch (error) {
          fail(error);
        }
      })
  );
}

// The mobile API's calls. They take what the phone sends, already checked.

// An address of `type` (0: a new P2WKH, 2: the last P2WKH not yet used, so
// opening the receive screen twice does not use up two).
function newAddress(type) {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.NewAddress, { type }, "generate address")
  );
}

// Sends on-chain at a fee rate in sat/vB. sat_per_byte is read by lnd as
// sat/vB; the field the dashboard's proto knows.
function sendCoinsAtRate({ address, amountSat, satPerVbyte, sendAll, label }) {
  const rpcPayload = {
    addr: address,
    amount: sendAll ? 0 : amountSat,
    send_all: Boolean(sendAll),
    sat_per_byte: satPerVbyte,
  };
  if (label) {
    rpcPayload.label = label;
  }
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.SendCoins, rpcPayload, "send coins")
  );
}

function lookupInvoice(paymentHashHex) {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(
      lightning,
      lightning.LookupInvoice,
      { r_hash_str: paymentHashHex },
      "look up invoice"
    )
  );
}

// The newest payments, newest last as lnd lists them.
function listRecentPayments(maxPayments) {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(
      lightning,
      lightning.ListPayments,
      { include_incomplete: true, max_payments: maxPayments, reversed: true },
      "get payments"
    )
  );
}

// Creates an invoice for `amount` sat (0: the payer chooses), valid for
// `expiry` seconds, with route hints when every channel is private.
async function addInvoiceWithExpiry(amount, memo, expiry) {
  const channels = await getOpenChannels();
  const rpcPayload = {
    value: amount,
    memo,
    expiry,
    private: channels.length > 0 && channels.every(channel => channel.private),
  };
  const conn = await initializeRPCClient();
  return promiseify(
    conn.lightning,
    conn.lightning.addInvoice,
    rpcPayload,
    "create new invoice"
  );
}

function unlockWallet(password) {
  const passwordBuff = Buffer.from(password, "utf8");

  const rpcPayload = {
    wallet_password: passwordBuff,
  };

  // TODO how to determine if wallet is already unlocked?
  // This will throw code 12 unimplemented, which is not very helpful
  return initializeRPCClient().then(({ walletUnlocker }) =>
    promiseify(
      walletUnlocker,
      walletUnlocker.UnlockWallet,
      rpcPayload,
      "unlock wallet"
    )
  );
}

function updateChannelPolicy(
  global,
  fundingTxid,
  outputIndex,
  baseFeeMsat,
  feeRate,
  timeLockDelta
) {
  const rpcPayload = {
    base_fee_msat: baseFeeMsat,
    fee_rate: feeRate,
    time_lock_delta: timeLockDelta,
  };

  if (global) {
    rpcPayload.global = global;
  } else {
    rpcPayload.chan_point = {
      funding_txid_str: fundingTxid,
      output_index: outputIndex,
    };
  }

  return initializeRPCClient().then(({ lightning }) =>
    promiseify(
      lightning,
      lightning.UpdateChannelPolicy,
      rpcPayload,
      "update channel policy coins"
    )
  );
}

function recoverBackup(multi_chan_backup) {
  return initializeRPCClient().then(async ({ lightning }) => promiseify(
    lightning,
    lightning.RestoreChannelBackups,
    {multi_chan_backup},
    "recover channel backup"
  ));
}

function getWatchtowerServiceInfo() {
  return initializeRPCClient().then(async ({ watchtower }) => promiseify(
    watchtower,
    watchtower.GetInfo,
    {},
    "get watchtower service info"
  ));
}

function addWatchtower(uri) {
  const [pubkeyString, address] = uri.split(/@(.*)/);
  const pubkey = Buffer.from(pubkeyString, 'hex');

  return initializeRPCClient().then(async ({ watchtowerclient }) => promiseify(
    watchtowerclient,
    watchtowerclient.AddTower,
    {pubkey, address},
    "add watchtower"
  ));
}

// removes the entire watchtower when only pubkey is passed to watchtowerclient.RemoveTower
function removeWatchtower(pubkeyString) {
  const pubkey = Buffer.from(pubkeyString, 'hex');
  
  return initializeRPCClient().then(async ({ watchtowerclient }) => promiseify(
    watchtowerclient,
    watchtowerclient.RemoveTower,
    {pubkey},
    "remove watchtower"
  ));
}

// removes an address associated with a watchtower when both pubkey and address are passed to watchtowerclientRemoveTower
function removeWatchtowerAddress(pubkeyString, address) {
  const pubkey = Buffer.from(pubkeyString, 'hex');
  
  return initializeRPCClient().then(async ({ watchtowerclient }) => promiseify(
    watchtowerclient,
    watchtowerclient.RemoveTower,
    {pubkey, address},
    "remove watchtower"
  ));
}

function listWatchtowers() {
  return initializeRPCClient().then(async ({ watchtowerclient }) => promiseify(
    watchtowerclient,
    watchtowerclient.ListTowers,
    {include_sessions: false},
    "list watchtowers"
  ));
}

function stopDaemon() {
  return initializeRPCClient().then(({ lightning }) => promiseify(
    lightning,
    lightning.stopDaemon,
    {},
    "stop daemon"
  ));
}

// ---- BOLT 12 offers -------------------------------------------------------

// Offer ids and payment hashes travel as hex over HTTP and as bytes over
// gRPC.
function bytesFromHex(hex) {
  return Buffer.from(hex || "", "hex");
}

function createOffer({ description, amountMsat, absoluteExpiry, issuer, label, quantityMax, quantityAny }) {
  const rpcPayload = {
    description: description || "",
    amount_msat: amountMsat || 0,
    absolute_expiry: absoluteExpiry || 0,
    issuer: issuer || "",
    label: label || "",
    quantity_max: quantityMax || 0,
    quantity_any: Boolean(quantityAny),
  };

  return initializeRPCClient().then(({ offers }) =>
    promiseify(offers, offers.CreateOffer, rpcPayload, "create offer")
  );
}

function listOffers(activeOnly) {
  return initializeRPCClient().then(({ offers }) =>
    promiseify(offers, offers.ListOffers, { active_only: Boolean(activeOnly) }, "list offers")
  );
}

function disableOffer(offerIdHex) {
  return initializeRPCClient().then(({ offers }) =>
    promiseify(offers, offers.DisableOffer, { offer_id: bytesFromHex(offerIdHex) }, "disable offer")
  );
}

function enableOffer(offerIdHex) {
  return initializeRPCClient().then(({ offers }) =>
    promiseify(offers, offers.EnableOffer, { offer_id: bytesFromHex(offerIdHex) }, "enable offer")
  );
}

function decodeBolt12(bolt12) {
  return initializeRPCClient().then(({ offers }) =>
    promiseify(offers, offers.DecodeBolt12, { bolt12 }, "decode offer")
  );
}

function fetchOfferInvoice({ offer, amountMsat, quantity, payerNote, timeoutSeconds }) {
  const rpcPayload = {
    offer,
    amount_msat: amountMsat || 0,
    quantity: quantity || 0,
    payer_note: payerNote || "",
    timeout_seconds: timeoutSeconds || 0,
  };

  return initializeRPCClient().then(({ offers }) =>
    promiseify(offers, offers.FetchInvoice, rpcPayload, "fetch an invoice for the offer")
  );
}

function payOffer({ offer, invoice, amountMsat, quantity, payerNote, timeoutSeconds, feeLimitMsat, maxParts }) {
  const rpcPayload = {
    offer: offer || "",
    invoice: invoice || "",
    amount_msat: amountMsat || 0,
    quantity: quantity || 0,
    payer_note: payerNote || "",
    timeout_seconds: timeoutSeconds || 0,
    fee_limit_msat: feeLimitMsat || 0,
    max_parts: maxParts || 0,
  };

  return initializeRPCClient().then(({ offers }) =>
    promiseify(offers, offers.PayOffer, rpcPayload, "pay the offer")
  );
}

function listOfferInvoices(offerIdHex) {
  const rpcPayload = {
    offer_id: offerIdHex ? bytesFromHex(offerIdHex) : Buffer.alloc(0),
  };

  return initializeRPCClient().then(({ offers }) =>
    promiseify(offers, offers.ListOfferInvoices, rpcPayload, "list the offer's invoices")
  );
}

// Macaroons, for the dashboard's Macaroons view. Root key ids are uint64 and
// travel as decimal strings.
function bakeMacaroon(permissions, rootKeyId) {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(
      lightning,
      lightning.BakeMacaroon,
      { permissions, root_key_id: rootKeyId, allow_external_permissions: false },
      "bake a macaroon"
    )
  );
}

function listMacaroonIds() {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(lightning, lightning.ListMacaroonIDs, {}, "list macaroon ids")
  );
}

function deleteMacaroonId(rootKeyId) {
  return initializeRPCClient().then(({ lightning }) =>
    promiseify(
      lightning,
      lightning.DeleteMacaroonID,
      { root_key_id: rootKeyId },
      "revoke a macaroon"
    )
  );
}

// Not camelized: the map's keys are RPC method paths, which must stay as
// LND wrote them.
function listPermissions() {
  return initializeRPCClient().then(
    ({ lightning }) =>
      new Promise((resolve, reject) => {
        lightning.ListPermissions({}, (error, response) => {
          if (error) {
            reject(new LndError("Unable to list permissions", error));
          } else {
            resolve(response);
          }
        });
      })
  );
}

module.exports = {
  estimateSplice,
  spliceChannel,
  spliceRequest,
  spliceChannelRequest,
  bakeMacaroon,
  listMacaroonIds,
  deleteMacaroonId,
  listPermissions,
  newAddress,
  sendCoinsAtRate,
  lookupInvoice,
  listRecentPayments,
  addInvoiceWithExpiry,
  createOffer,
  listOffers,
  disableOffer,
  enableOffer,
  decodeBolt12,
  fetchOfferInvoice,
  payOffer,
  listOfferInvoices,
  addInvoice,
  changePassword,
  closeChannel,
  connectToPeer,
  connectPeer,
  disconnectPeer,
  decodePaymentRequest,
  estimateFee,
  getChannelBalance,
  getClosedChannels,
  getFeeReport,
  getForwardingEvents,
  getInfo,
  getRecoveryInfo,
  getState,
  getNodeInfo,
  getInvoices,
  getOpenChannels,
  getPayments,
  getPeers,
  getPendingChannels,
  getWalletBalance,
  generateAddress,
  generateSeed,
  getOnChainTransactions,
  initWallet,
  listUnspent,
  openChannel,
  sendCoins,
  sendPayment,
  unlockWallet,
  updateChannelPolicy,
  recoverBackup,
  getWatchtowerServiceInfo,
  addWatchtower,
  removeWatchtower,
  removeWatchtowerAddress,
  listWatchtowers,
  stopDaemon
};
