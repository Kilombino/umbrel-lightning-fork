// Wording for channel resizes (splices): why one can't be done, and what
// one in progress is doing. The codes are the node's.

const localize = n => Number(n || 0).toLocaleString();

// The refusal code a node's text starts with: lnd sends "splice refused:
// code: details", and an aborted splice's reason is "code: details". Text
// that doesn't start with a code (a peer's own words) is kept whole.
export function refusalCode(reason) {
  if (typeof reason !== "string") {
    return reason;
  }
  const text = reason.replace(/^splice refused: /, "");
  const match = /^([a-z_]+)(?::|$)/.exec(text);
  return match ? match[1] : text;
}

// Why a resize was refused, from the node's refusal codes.
export function refusalText(reason, { minSat, maxOutSat, minSatPerVbyte, peerName } = {}) {
  const peer = peerName || "Your peer";
  const code = refusalCode(reason);
  switch (code) {
    case "":
    case undefined:
    case null:
      return "";
    case "insufficient_funds":
      return "Not enough confirmed funds in your Bitcoin wallet.";
    case "below_min":
      return minSat
        ? `The amount must be at least ${localize(minSat)} sats.`
        : "The amount is too small.";
    case "above_balance":
    case "above_max_out":
      return maxOutSat
        ? `You can move up to ${localize(
            maxOutSat
          )} sats out of this channel: it keeps a safety reserve on each side, and the network fee comes from your side.`
        : "That would leave you under the channel's safety reserve.";
    case "above_max_size":
      return "That would make the channel larger than your peer accepts.";
    case "fee_below_floor":
      return minSatPerVbyte
        ? `The fee rate is below your node's minimum for a resize, ${localize(minSatPerVbyte)} sat/vB, so the transaction might not confirm in time. Choose a higher rate.`
        : "The fee rate is below your node's minimum for a resize. Choose a higher rate.";
    case "relay_rejected":
      return "Your node's mempool refused the transaction.";
    case "timeout":
      return `${peer} took too long to answer, so the resize was stopped.`;
    case "locktime":
      return `${peer} proposed a transaction that can't be confirmed yet.`;
    case "disabled":
      return "Resizing is turned off on one of the two nodes.";
    case "taproot":
      return "Taproot channels can't be resized.";
    case "pending":
      return "A resize is already in progress on this channel.";
    case "closing":
      return "The channel is closing.";
    case "chain_not_synced":
      return "Your node is still catching up with the chain. Try again once it is synced.";
    case "close_address_set":
      return "This channel's funds can only go to the address chosen when it was opened.";
    case "too_many_splices":
      return "Too many resizes are in progress on this node. Try again once one has finished.";
    case "too_many_aborts":
      return `Resizes with ${peerName ||
        "this peer"} stopped several times today. Try again tomorrow.`;
    case "peer_offline":
      return "The peer is offline. Resizing needs both nodes online.";
    case "peer_disconnected":
      return `The connection to ${peerName ||
        "your peer"} dropped before the resize was agreed. Nothing was spent; try again.`;
    case "peer_unsupported":
    case "peer_contribution_unsupported":
      return "This peer's node can't resize channels yet.";
    case "rbf_unsupported":
      return "A resize is already in progress on this channel.";
    case "not_quiescent":
      return `${peer} was busy with payments. Try again in a moment.`;
    case "invalid_signatures":
    case "invalid_commitment":
    case "peer_misbehaved":
      return `${peer} sent something invalid, so the resize was stopped.`;
    case "no_unified_sigs":
      return "This channel was opened without chain-bound signatures, so it can't be resized.";
    case "zero_conf":
      return "Channels that were usable before their first confirmation can't be resized yet.";
    case "funding_spent_unknown":
      return "This channel's funds were moved by a transaction this version doesn't recognize.";
    case "internal_error":
      return "Your node ran into an error. Check its logs for details.";
    default:
      return `The resize was refused (${reason}).`;
  }
}

// Why the resize buttons can't be used, from the channel's splice status.
// Empty when they can; null when they are hidden.
export function statusText(status, { platform, dead } = {}) {
  switch (status) {
    case "":
    case "ok":
    case undefined:
      return "";
    case "closing":
      return null;
    case "peer_offline":
      return "The peer is offline. Resizing needs both nodes online.";
    case "peer_unsupported":
      return "This peer's node can't resize channels yet. To change the channel's size, close it and open a new one.";
    case "no_unified_sigs":
      return "This channel was opened without chain-bound signatures, so it can't be resized. A channel you open now always has them.";
    case "taproot":
      return "Taproot channels can't be resized.";
    case "zero_conf":
      return "Channels that were usable before their first confirmation can't be resized yet.";
    case "pending":
      return dead
        ? "A failed resize stays on this channel until it is closed, so a new one can't start. Closing the channel normally returns your balance to your wallet."
        : "A resize is in progress. You can start another once it's done.";
    case "peer_not_locked":
      return "Your node considers the last resize done, but the peer still hasn't confirmed it, long after it was deep enough. The channel works at its old size meanwhile. If the peer never does, the only way out is to force close the channel.";
    case "peer_not_announcing":
      return "The resized channel isn't announced to the network yet: the peer hasn't sent its part. Payments from other nodes can't use it until then. If this lasts, consider closing the channel.";
    case "peer_misbehaved":
      return "This peer broke an earlier resize, so resizing this channel is refused until your node restarts.";
    case "chain_not_synced":
      return "Your node is still catching up with the chain. Try again once it is synced.";
    case "disabled":
      return platform === "startos"
        ? "Resizing is turned off. Turn it on in Lightning XBT's Actions > Channel Settings in StartOS."
        : "Resizing is turned off. Turn it on in Advanced Settings > Channels.";
    default:
      return "This channel can't be resized right now.";
  }
}

export function isPeerInitiated(initiator) {
  return initiator === "INITIATOR_REMOTE" || initiator === 2;
}

// What a resize in progress or just ended says in the channel's details.
export function pendingText(pending, { peerName, blockMinutes } = {}) {
  if (!pending) {
    return "";
  }
  const peer = peerName || "Your peer";
  const localDelta = Number(pending.localDeltaSat) || 0;
  const remoteDelta = Number(pending.remoteDeltaSat) || 0;
  if (pending.dead) {
    const held =
      localDelta < 0
        ? ` Until then, the ${localize(-localDelta)} sats it was moving out can't be sent in payments.`
        : "";
    return `This resize can no longer go through: one of the coins in it was spent elsewhere. The channel works at its old size, but the failed resize stays on it until the channel is closed, and no new resize can start.${held} Closing the channel normally returns your full balance to your wallet.`;
  }
  let what;
  if (isPeerInitiated(pending.initiator)) {
    if (remoteDelta >= 0) {
      what = `${peer} is adding ${localize(
        remoteDelta
      )} sats on their side. Your balance doesn't change.`;
    } else {
      what = `${peer} is moving ${localize(
        -remoteDelta
      )} sats out on their side. Your balance doesn't change.`;
    }
  } else {
    what = `Resizing: ${localDelta >= 0 ? "+" : "-"}${localize(
      Math.abs(localDelta)
    )} sats.`;
  }

  const confs = Number(pending.confirmations) || 0;
  const depth = Number(pending.lockDepth) || 0;
  if (pending.weLocked && !pending.peerLocked) {
    return `${what} Confirmed. Waiting for ${peer} to finish.`;
  }
  if (depth > 0 && confs > 0) {
    const left = Math.max(0, depth - confs);
    const minutes = Math.round(left * (blockMinutes || 10)); // eslint-disable-line no-magic-numbers
    const time = left > 0 ? `, about ${minutesText(minutes)} left` : "";
    return `${what} ${confs} of ${depth} confirmations${time}.`;
  }
  if (pending.state === "signed") {
    return `${what} Waiting for ${peer} to finish signing.`;
  }
  return `${what} Waiting for the first confirmation.`;
}

// What the last finished resize says, or "" when there is nothing to say.
export function lastText(last, { peerName } = {}) {
  if (!last) {
    return "";
  }
  // A resize whose coins were spent elsewhere: the channel dropped it.
  if (last.outcome === "dead") {
    return "A resize could not go through: one of the coins in it was spent elsewhere. The channel works at its old size.";
  }
  if (last.outcome !== "locked") {
    return "";
  }
  const date = new Date(Number(last.time) * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  if (isPeerInitiated(last.initiator)) {
    return `Resized by ${peerName || "your peer"} on ${date}.`;
  }
  return `Resized by splicing on ${date}; the channel kept working.`;
}

export function minutesText(minutes) {
  const m = Math.max(1, Math.round(Number(minutes) || 0));
  if (m < 90) {
    // eslint-disable-line no-magic-numbers
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  const h = Math.round(m / 60); // eslint-disable-line no-magic-numbers
  return `${h} hours`;
}
