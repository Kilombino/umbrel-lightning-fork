<template>
  <b-modal
    id="bridge-modal"
    size="lg"
    centered
    hide-footer
    lazy
    @show="opened"
    @hidden="closed"
  >
    <template v-slot:modal-header="{ close }">
      <div class="px-2 px-sm-3 pt-2 d-flex justify-content-between w-100">
        <h3>{{ overview && overview.enabled ? "Your bridge" : "Run a bridge" }}</h3>
        <a href="#" class="align-self-center" v-on:click.stop.prevent="close">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill-rule="evenodd"
              clip-rule="evenodd"
              d="M13.6003 4.44197C13.3562 4.19789 12.9605 4.19789 12.7164 4.44197L9.02116 8.13721L5.32591 4.44197C5.08183 4.19789 4.68611 4.19789 4.44203 4.44197C4.19795 4.68605 4.19795 5.08178 4.44203 5.32585L8.13728 9.0211L4.44203 12.7163C4.19795 12.9604 4.19795 13.3561 4.44203 13.6002C4.68611 13.8443 5.08183 13.8443 5.32591 13.6002L9.02116 9.90499L12.7164 13.6002C12.9605 13.8443 13.3562 13.8443 13.6003 13.6002C13.8444 13.3561 13.8444 12.9604 13.6003 12.7163L9.90505 9.0211L13.6003 5.32585C13.8444 5.08178 13.8444 4.68605 13.6003 4.44197Z"
              fill="#6c757d"
            />
          </svg>
        </a>
      </div>
    </template>

    <div class="px-2 px-sm-3 pb-2 bridge">
      <!-- At the top, and scrolled to when set: the window is long -->
      <div ref="alerts">
        <b-alert :show="Boolean(error)" variant="warning" class="small">{{ error }}</b-alert>
        <b-alert :show="Boolean(notice)" variant="success" class="small">{{ notice }}</b-alert>
      </div>
      <div v-if="!overview && !loadError" class="text-muted py-4 text-center">
        Loading…
      </div>

      <b-alert :show="Boolean(loadError)" variant="warning" class="small">
        {{ loadError }}
      </b-alert>

      <!-- The bridge is off: what it is, what it takes, how to turn it on -->
      <template v-if="overview && overview.enabled === false">
        <b-alert show variant="warning" v-if="overview.draining" class="small">
          The bridge is off and finishing
          {{ drainingCount === 1 ? "a payment" : `${drainingCount || "the"} payments` }}
          already under way; it takes no new ones, and stops once they are
          done.
        </b-alert>
        <p>
          A bridge lets people pay invoices on the SHA256 chain's Lightning
          network with BTCB2, through your node. For each payment, they pay
          your node here and your bridge pays the SHA256 invoice; their
          payment only completes if the invoice is paid, so they never have to
          trust you. You set the rate and keep its fee.
        </p>
        <h6 class="font-weight-bold mt-3">What it takes</h6>
        <ul class="small pl-3">
          <li>
            <b>A Lightning node on the SHA256 chain.</b> Lightning Fork runs
            one for the bridge, created from your existing recovery phrase,
            so there is nothing new to write down. It reads a full node on the
            SHA256 chain that you already run, and uses about 1 to 3 GB.
          </li>
          <li>
            <b>Money on both chains.</b> Coins on the SHA256 chain in a
            channel from that node, which the bridge pays out of, and room on
            this node's channels to receive what payers send.
          </li>
          <li>
            <b>A rate you keep current,</b> renewed before it expires.
          </li>
        </ul>
        <div class="neu-card p-3 small">
          <template v-if="overview.platform === 'startos'">
            <b>To turn it on:</b> in StartOS, open Lightning XBT's
            <b>Actions</b> and run <b>Bridge</b>. Choose "Lightning Fork runs
            one" and the node on the SHA256 chain it should read. This window then
            walks you through the rest.
          </template>
          <template v-else-if="overview.toggle && overview.toggle.available">
            <template v-if="!confirmSwitch">
              <div class="mb-2">
                The bridge's node reads a full node on the SHA256 chain.
                Found on {{ $store.getters["system/deviceNoun"] }}:
              </div>
              <sha256-node-list
                :nodes="overview.toggle.nodes"
                v-model="chosenNode"
              ></sha256-node-list>
              <b-button variant="success" size="sm" :disabled="switching || !chosenNode" @click="confirmSwitch = true">Turn the bridge on</b-button>
            </template>
            <template v-else>
              <div class="mb-2">
                Lightning XBT restarts to turn it on, which takes a minute.
                The bridge's node is then created, which takes a few minutes
                more the first time; this window follows along.
              </div>
              <b-button variant="success" size="sm" class="mr-2" :disabled="switching" @click="setEnabled(true, chosenNode)">{{ switching ? "Turning it on…" : "Turn it on and restart" }}</b-button>
              <b-button variant="link" size="sm" :disabled="switching" @click="confirmSwitch = false">Cancel</b-button>
            </template>
          </template>
          <template v-else-if="overview.toggle">
            <div class="mb-2">{{ overview.toggle.unavailable }}</div>
            <sha256-node-list
              v-if="overview.toggle.nodes.length"
              :nodes="overview.toggle.nodes"
            ></sha256-node-list>
          </template>
        </div>

        <b-alert
          :show="Boolean(overview.toggle && overview.toggle.problem)"
          variant="danger"
          class="small mt-3"
          >{{ overview.toggle && overview.toggle.problem }}</b-alert
        >
        <div v-if="overview.sha256RestorePending" class="neu-card p-3 mt-3 small">
          <b>Your bridge node was restored from a backup.</b> Its channels
          are recovered when the bridge is turned on again: Lightning Fork
          recreates the node from your recovery phrase and restores them
          from the channel backup that came with it.
        </div>

        <!-- The node it had, still running -->
        <div v-if="node && node.mode === 'idle'" class="neu-card p-3 mt-3">
          <div class="font-weight-bold mb-1">Your bridge node is still running</div>
          <small class="d-block text-muted mb-2">
            It keeps watching its channels while the bridge is off, so nothing
            it holds is at risk. Turn the bridge on again to use it.
          </small>
          <div class="kv"><span>Can send</span><span>{{ sats(node.outboundSat) }}</span></div>
          <div class="kv"><span>Channels</span><span>{{ node.activeChannels }}</span></div>
          <div class="kv"><span>On chain</span><span>{{ sats(node.onchainConfirmedSat) }}</span></div>
        </div>
      </template>

      <!-- The bridge is on -->
      <template v-if="overview && overview.enabled">
        <!-- Status first -->
        <div class="status-line mb-3" :class="`status-${statusVariant}`">
          <div class="font-weight-bold">{{ statusTitle }}</div>
          <small v-if="nextStep" class="d-block">Next: {{ stepTitle(nextStep.id) }}.</small>
          <small v-if="statusDetail" class="d-block text-muted">{{ statusDetail }}</small>
          <small
            v-if="overview.swapsInFlight > 0"
            class="d-block text-muted"
          >
            {{ overview.swapsInFlight }}
            {{ overview.swapsInFlight === 1 ? "payment" : "payments" }} in
            progress now.
          </small>
        </div>

        <!-- The node the bridge's node reads, when something is wrong with it -->
        <b-alert
          :show="Boolean(overview.toggle && overview.toggle.problem)"
          variant="danger"
          class="small"
          >{{ overview.toggle && overview.toggle.problem }}</b-alert
        >

        <!-- Swaps that need the operator -->
        <div v-if="overview.needsOperator.length" class="mb-3">
          <b-alert show variant="danger" class="small mb-0">
            <div class="font-weight-bold mb-1">
              {{ overview.needsOperator.length }}
              {{ overview.needsOperator.length === 1 ? "payment needs" : "payments need" }}
              you
            </div>
            <div
              v-for="(line, i) in overview.needsOperator"
              :key="i"
              class="needs-line"
            >
              {{ line }}
            </div>
            <div class="mt-1">
              The bridge stopped acting on these to keep both sides' money
              safe. Each line says what happened; the bridge guide says what
              to do.
            </div>
          </b-alert>
        </div>

        <!-- Checklist, while there is anything left to do -->
        <div v-if="!allDone" class="mb-4">
          <h6 class="font-weight-bold">Getting your bridge going</h6>
          <ol class="checklist pl-0 mb-0">
            <li
              v-for="step in overview.steps"
              :key="step.id"
              class="d-flex py-2"
              :class="{ done: step.done }"
            >
              <span class="mark mr-2" :class="markClass(step)">{{
                step.done ? "✓" : step.waiting ? "…" : "•"
              }}</span>
              <div class="flex-grow-1" style="min-width: 0;">
                <div :class="{ 'font-weight-bold': !step.done }">
                  {{ stepTitle(step.id) }}
                </div>
                <template v-if="!step.done">
                  <small class="d-block text-muted">{{
                    stepDetail(step)
                  }}</small>
                  <div class="mt-1">
                    <b-button
                      v-if="step.id === 'fund' && overview.canManageSha256Node"
                      size="sm"
                      variant="outline-primary"
                      @click="showPanel('deposit')"
                      >Show deposit address</b-button
                    >
                    <b-button
                      v-if="
                        step.id === 'channel' &&
                          overview.canManageSha256Node &&
                          !step.waiting
                      "
                      size="sm"
                      variant="outline-primary"
                      @click="showPanel('channel')"
                      >Open a channel</b-button
                    >
                    <small
                      v-if="step.id === 'channel' && step.waiting"
                      class="text-muted"
                      >A channel is opening; it is usable once its funding
                      transaction confirms.</small
                    >
                    <b-button
                      v-if="step.id === 'rate'"
                      size="sm"
                      variant="outline-primary"
                      @click="scrollTo('bridge-rate')"
                      >Set the rate</b-button
                    >
                    <b-button
                      v-if="step.id === 'participants' && overview.canIssueCodes"
                      size="sm"
                      variant="outline-primary"
                      @click="scrollTo('bridge-participants')"
                      >Invite someone</b-button
                    >
                    <!-- Where this window can't make a code, say where instead -->
                    <small
                      v-else-if="step.id === 'participants' && !overview.manageParticipants"
                      class="text-muted"
                      >In StartOS, run the <b>Add Bridge Participant</b>
                      action. It needs an onion address on the REST LND
                      Connect interface first.</small
                    >
                    <small
                      v-else-if="step.id === 'participants'"
                      class="text-muted"
                      >Participants reach your node over Tor, and it has no
                      Tor address for that yet.</small
                    >
                  </div>
                </template>
              </div>
            </li>
          </ol>
        </div>

        <!-- The two nodes, side by side -->
        <h6 class="font-weight-bold">The two nodes</h6>
        <small class="d-block text-muted mb-2">
          Payers pay this node; the bridge node pays their SHA256 invoice. What
          you can serve is the smaller of this node's "can receive" and the
          bridge node's "can send".
        </small>
        <b-row class="mb-2">
          <b-col cols="12" lg="6" class="mb-2">
            <div class="neu-card p-3 h-100">
              <div class="d-flex justify-content-between align-items-baseline">
                <div class="font-weight-bold">This node</div>
                <small class="text-muted">BLAKE2b</small>
              </div>
              <div class="kv"><span>Can receive</span><span>{{ satsOrDash(maxReceive) }}</span></div>
              <div class="kv"><span>Can send</span><span>{{ satsOrDash(maxSend) }}</span></div>
              <div class="kv"><span>Channels</span><span>{{ activeChannels }}</span></div>
            </div>
          </b-col>
          <b-col cols="12" lg="6" class="mb-2">
            <div class="neu-card p-3 h-100" ref="sha256Card">
              <div class="d-flex justify-content-between align-items-baseline">
                <div class="font-weight-bold">Bridge node</div>
                <small class="text-muted">SHA256</small>
              </div>
              <template v-if="node">
                <div class="kv">
                  <span>State</span>
                  <span :class="`text-${nodeStateOf.variant}`">{{ nodeStateOf.text }}</span>
                </div>
                <div class="kv"><span>Can send</span><span>{{ sats(node.outboundSat) }}</span></div>
                <div class="kv"><span>Can receive</span><span>{{ sats(node.inboundSat) }}</span></div>
                <div class="kv">
                  <span>Channels</span>
                  <span class="text-right">
                    {{ node.activeChannels }}
                    <small v-if="node.pendingChannels" class="d-block text-muted">{{ node.pendingChannels }} opening</small>
                    <small v-if="node.inactiveChannels" class="d-block text-warning">{{ node.inactiveChannels }} offline</small>
                  </span>
                </div>
                <div v-if="node.mode === 'supervised'" class="kv">
                  <span>On chain</span>
                  <span class="text-right">
                    {{ sats(node.onchainConfirmedSat) }}
                    <small v-if="node.onchainUnconfirmedSat" class="d-block text-muted">{{ sats(node.onchainUnconfirmedSat) }} confirming</small>
                  </span>
                </div>
                <div class="kv">
                  <span>Chain</span>
                  <span>{{ node.synced ? `In sync at ${node.blockHeight.toLocaleString()}` : node.blockHeight ? `Catching up, at ${node.blockHeight.toLocaleString()}` : "—" }}</span>
                </div>
                <small v-if="node.state !== 'ready' && node.detail" class="d-block text-muted mt-1">{{ node.detail }}</small>
                <div v-if="readsName" class="kv">
                  <span>Reads</span>
                  <span>{{ readsName }}</span>
                </div>
                <small v-if="node.mode === 'external'" class="d-block text-muted mt-1">
                  An LND you run yourself; manage its funds and channels with
                  your own tools.
                </small>

                <div v-if="otherUsableNodes.length" class="mt-2">
                  <b-button v-if="!changingNode" size="sm" variant="link" class="px-0" @click="changingNode = true">Read another node</b-button>
                  <template v-else>
                    <sha256-node-list :nodes="overview.toggle.nodes" v-model="chosenNode"></sha256-node-list>
                    <small class="d-block text-muted mb-1">The bridge's node restarts to read it; Lightning Fork does not.</small>
                    <b-button size="sm" variant="outline-primary" class="mr-2" :disabled="switching || chosenNode === overview.toggle.inUse" @click="setEnabled(true, chosenNode)">Use this node</b-button>
                    <b-button size="sm" variant="link" @click="changingNode = false">Cancel</b-button>
                  </template>
                </div>
                <div v-if="overview.canManageSha256Node" class="mt-2 d-flex flex-wrap">
                  <b-button size="sm" variant="outline-primary" class="mr-2 mb-1" @click="showPanel('deposit')">Deposit address</b-button>
                  <b-button size="sm" variant="outline-primary" class="mr-2 mb-1" @click="showPanel('channel')">Open a channel</b-button>
                  <b-button size="sm" variant="outline-primary" class="mr-2 mb-1" @click="showPanel('connect')">Node address</b-button>
                  <b-button size="sm" variant="outline-primary" class="mr-2 mb-1" @click="showPanel('channels')">Channels</b-button>
                  <b-button size="sm" variant="outline-primary" class="mb-1" @click="showPanel('send')">Send coins</b-button>
                </div>
              </template>
              <small v-else class="d-block text-muted mt-1">
                Not reported yet.
              </small>
            </div>
          </b-col>
        </b-row>

        <!-- The SHA256 node's panels -->
        <div v-if="panel === 'deposit'" class="neu-card p-3 mb-3" ref="panel">
          <div class="font-weight-bold mb-2">Fund the bridge node</div>
          <div v-if="deposit.loading" class="text-muted small">Asking the node for an address…</div>
          <div v-else-if="deposit.address" class="d-flex flex-column flex-lg-row align-items-center align-items-lg-start">
            <qr-code :value="deposit.address" :size="160" class="mx-auto mb-3 mb-lg-0" :showLogo="false"></qr-code>
            <div class="w-100 ml-0 ml-lg-3">
              <input-copy size="sm" :value="deposit.address" class="mb-2"></input-copy>
              <a :href="`${explorerBase}/address/${deposit.address}`" target="_blank" rel="noopener" class="small d-inline-block mb-2" @click="confirmExplorer">See it on {{ explorerName }}</a>
              <small class="d-block text-muted">
                Send coins <b>on the SHA256 chain</b> to this address. Coins
                sent on the BLAKE2b chain do not arrive here. A new address is
                given each time it is used.
              </small>
              <small class="d-block mt-2">
                <b>How much:</b> at least {{ sats(recommendedChannelSat + channelOverheadSat) }}:
                a {{ Number(recommendedChannelSat).toLocaleString() }}-sat channel, the
                recommended least, plus about {{ Number(channelOverheadSat).toLocaleString() }}
                to open it (the node keeps 10,000 back to bump fees if the channel is
                ever force-closed; the rest pays the opening fee).
              </small>
              <small class="d-block text-muted mt-1">
                On chain now: {{ sats(node ? node.onchainConfirmedSat : 0) }}<template v-if="node && node.onchainUnconfirmedSat">,
                and {{ sats(node.onchainUnconfirmedSat) }} confirming</template>.
              </small>
              <b-button
                v-if="overview.channelMax"
                size="sm"
                variant="outline-primary"
                class="mt-2"
                @click="showPanel('channel')"
                >Next: open a channel</b-button
              >
            </div>
          </div>
        </div>

        <div v-if="panel === 'channel'" class="neu-card p-3 mb-3" ref="panel">
          <div class="font-weight-bold mb-2">Open a channel from the bridge node</div>
          <template v-if="!channel.txid && !channel.reviewing">
            <label class="small font-weight-bold mb-1" for="bridge-channel-peer">Node on the SHA256 chain</label>
            <div class="recommended-peer d-flex flex-column flex-sm-row align-items-sm-start mb-2">
              <div class="flex-grow-1 mr-sm-2 mb-2 mb-sm-0" style="min-width: 0;">
                <small class="d-block">
                  <b>Recommended: {{ recommendedPeer.name }}.</b> It is connected
                  to most of the SHA256 network with short time-locks, so the
                  bridge can reach about 97% of recipients through it.
                </small>
              </div>
              <b-button
                size="sm"
                :variant="usingRecommendedPeer ? 'success' : 'outline-primary'"
                :disabled="channel.busy || usingRecommendedPeer"
                @click="channel.peer = recommendedPeer.uri"
                >{{ usingRecommendedPeer ? "Selected" : `Use ${recommendedPeer.name}` }}</b-button
              >
            </div>
            <b-form-input
              id="bridge-channel-peer"
              v-model="channel.peer"
              class="neu-input mb-1"
              placeholder="pubkey@host:port"
              spellcheck="false"
              :disabled="channel.busy"
            ></b-form-input>
            <small class="d-block text-muted mb-3">
              <template v-if="usingRecommendedPeer">{{ recommendedPeer.name }}'s node. Other nodes use the same name; this key is the one to trust.</template>
              <template v-else>Or another well-connected node: its address is on its operator's page or in a Lightning explorer for the SHA256 chain.</template>
            </small>

            <label class="small font-weight-bold mb-1" for="bridge-channel-amount">Amount</label>
            <b-input-group append="sats" class="mb-1">
              <b-form-input
                id="bridge-channel-amount"
                :value="channel.fundMax ? '' : channel.amount"
                :placeholder="channel.fundMax ? 'Maximum' : ''"
                type="number"
                min="20000"
                step="1000"
                class="neu-input"
                :disabled="channel.busy"
                @input="v => { channel.amount = v; channel.fundMax = false; }"
              ></b-form-input>
            </b-input-group>
            <div class="d-flex flex-wrap align-items-center mb-1">
              <b-button
                v-if="overview.channelMax"
                size="sm"
                :variant="channel.fundMax ? 'success' : 'link'"
                class="mr-3 px-0"
                :class="{ 'px-2': channel.fundMax }"
                :disabled="channel.busy"
                @click="channel.fundMax = true; channel.amount = ''"
                >{{ channel.fundMax ? "Using the maximum" : "Use the maximum" }}</b-button
              >
            </div>
            <small class="d-block text-muted mb-1">
              {{ sats(node ? node.onchainConfirmedSat : 0) }} on chain.<template v-if="overview.channelMax">
              Up to about <b>{{ sats(overview.channelMax.maxSat) }}</b> can go into a
              channel: the node keeps {{ sats(overview.channelMax.reserveSat) }} back to bump
              fees if a channel is ever force-closed, and the opening transaction
              has a fee.</template>
            </small>
            <small v-if="channelAmountTooLarge" class="d-block text-warning mb-1">
              That is more than the node can put into a channel now. Use the
              maximum, or deposit more.
            </small>
            <small v-else-if="channel.fundMax && overview.channelMax && overview.channelMax.maxSat < recommendedChannelSat" class="d-block text-warning mb-1">
              That is less than the {{ sats(recommendedChannelSat) }} recommended: a
              smaller channel limits what the bridge can pay, and some nodes
              refuse channels that small.
            </small>
            <small v-else-if="channel.fundMax" class="d-block text-muted mb-1"></small>
            <small v-else-if="channelAmountSmall" class="d-block text-warning mb-1">
              At least {{ sats(recommendedChannelSat) }} is recommended: a smaller
              channel limits what the bridge can pay, and some nodes refuse
              channels that small.
            </small>
            <small v-else class="d-block text-muted mb-1">
              At least {{ sats(recommendedChannelSat) }} is recommended<template v-if="maxSwapSat">,
              and more than your largest swap ({{ sats(maxSwapSat) }})</template>.
            </small>
            <small v-if="!overview.channelMax" class="d-block text-warning mb-1">
              The node has too little confirmed on chain to open a channel.
              Deposit at least {{ sats(recommendedChannelSat + channelOverheadSat) }} first.
            </small>
            <div class="d-flex justify-content-end mt-2">
              <b-button
                variant="primary"
                :disabled="!channelReady"
                @click="channel.reviewing = true"
                >Review</b-button
              >
            </div>
          </template>
          <template v-else-if="!channel.txid">
            <small class="d-block mb-2">
              Open a channel of
              <b>{{ channel.fundMax ? `everything the node can put in one (about ${sats(overview.channelMax.maxSat)})` : sats(Number(channel.amount)) }}</b>
              to <b>{{ usingRecommendedPeer ? recommendedPeer.name : channelPeerShort }}</b>?
              The coins move into the channel, where the bridge pays SHA256
              invoices from them. They come back on chain when the channel
              is closed.
            </small>
            <b-button variant="success" size="sm" class="mr-2" :disabled="channel.busy" @click="openChannel">{{ channel.busy ? "Opening…" : "Open channel" }}</b-button>
            <b-button variant="link" size="sm" :disabled="channel.busy" @click="channel.reviewing = false">Back</b-button>
          </template>
          <template v-else>
            <small class="d-block mb-2">
              The channel is opening. It is usable once this funding
              transaction confirms on the SHA256 chain:
            </small>
            <input-copy size="sm" :value="channel.txid"></input-copy>
            <a :href="`${explorerBase}/tx/${channel.txid}`" target="_blank" rel="noopener" class="small d-inline-block mt-1" @click="confirmExplorer">See it on {{ explorerName }}</a>
          </template>
        </div>

        <div v-if="panel === 'connect' && node" class="neu-card p-3 mb-3" ref="panel">
          <div class="font-weight-bold mb-2">The bridge node's address</div>
          <small class="d-block text-muted mb-2">
            For another node on the SHA256 chain to connect to it or open a
            channel to it, which gives it room to receive.
          </small>
          <input-copy size="sm" :value="node.uris.length ? node.uris[0] : node.identityPubkey"></input-copy>
          <small v-if="!node.uris.length" class="d-block text-muted mt-1">
            It takes no incoming connections, so other nodes cannot reach it
            to open a channel to it: open channels from it instead.
          </small>
        </div>

        <div v-if="panel === 'channels'" class="neu-card p-3 mb-3" ref="panel">
          <div class="font-weight-bold mb-2">The bridge node's channels</div>
          <small v-if="chans.listError" class="d-block text-warning mb-1">{{ chans.listError }}</small>
          <div v-if="chans.loading && !chans.list.length" class="text-muted small">Asking the node…</div>
          <small v-else-if="!chans.list.length && !chans.listError" class="d-block text-muted">No channels yet.</small>
          <div v-for="c in chans.list" :key="c.channelPoint" class="channel-row py-2">
            <div class="kv">
              <span :title="c.remotePubkey">{{ shortKey(c.remotePubkey) }}</span>
              <span :class="`text-${channelState(c).variant}`">{{ channelState(c).text }}</span>
            </div>
            <div class="kv">
              <span>{{ sats(c.capacitySat) }}</span>
              <small class="text-muted">{{ sats(c.localSat) }} yours, {{ sats(c.remoteSat) }} theirs</small>
            </div>
            <a v-if="c.closingTxid" :href="`${explorerBase}/tx/${c.closingTxid}`" target="_blank" rel="noopener" class="small" @click="confirmExplorer">Its closing transaction on {{ explorerName }}</a>
            <template v-if="closeOptions(c).closable">
              <b-button v-if="chans.closing !== c.channelPoint" size="sm" variant="link" class="px-0 text-danger" :disabled="chans.busy" @click="startClose(c)">Close…</b-button>
              <div v-else class="mt-1">
                <small class="d-block mb-2">
                  Its {{ sats(c.localSat) }} come back to the node's on-chain
                  balance once the closing transaction confirms<template v-if="chans.force">,
                  and a forced close locks them for up to two weeks first</template>.
                  The bridge pays SHA256 invoices out of its channels, so
                  with no other channel it stops serving.
                </small>
                <b-form-checkbox v-model="chans.force" :disabled="chans.busy || !closeOptions(c).coop" class="small mb-1">
                  Force the close (without the peer){{ closeOptions(c).coop ? "" : ": its peer is not connected" }}
                </b-form-checkbox>
                <template v-if="!chans.force">
                  <label class="small font-weight-bold mb-1" :for="`bridge-close-fee-${c.channelPoint}`">Fee rate (optional)</label>
                  <b-input-group append="sat/vB" class="mb-2 fee-input">
                    <b-form-input :id="`bridge-close-fee-${c.channelPoint}`" v-model="chans.fee" type="number" min="1" step="1" class="neu-input" placeholder="estimate" :disabled="chans.busy"></b-form-input>
                  </b-input-group>
                </template>
                <b-button size="sm" variant="danger" class="mr-2" :disabled="chans.busy || !feeRateInput(chans.force ? '' : chans.fee).ok" @click="closeChannel(c)">{{ chans.busy ? "Closing…" : "Close the channel" }}</b-button>
                <b-button size="sm" variant="link" :disabled="chans.busy" @click="chans.closing = ''">Cancel</b-button>
              </div>
            </template>
          </div>
          <template v-if="chans.txid">
            <small class="d-block mt-2 mb-1">The channel is closing. Its closing transaction:</small>
            <input-copy size="sm" :value="chans.txid"></input-copy>
            <a :href="`${explorerBase}/tx/${chans.txid}`" target="_blank" rel="noopener" class="small d-inline-block mt-1" @click="confirmExplorer">See it on {{ explorerName }}</a>
          </template>
          <small v-else-if="chans.slow" class="d-block mt-2 text-muted">
            The node is still agreeing the close with its peer; the channel
            shows as closing once it has.
          </small>
        </div>

        <div v-if="panel === 'send' && node" class="neu-card p-3 mb-3" ref="panel">
          <div class="font-weight-bold mb-2">Send coins from the bridge node</div>
          <template v-if="!send.txid">
            <label class="small font-weight-bold mb-1" for="bridge-send-address">Address on the SHA256 chain</label>
            <b-form-input id="bridge-send-address" v-model="send.address" class="neu-input mb-2" spellcheck="false" :disabled="send.busy || send.confirming"></b-form-input>
            <label class="small font-weight-bold mb-1" for="bridge-send-amount">Amount</label>
            <b-input-group append="sats" class="mb-1">
              <b-form-input id="bridge-send-amount" v-model="send.amount" type="number" min="1" step="1" class="neu-input" :disabled="send.all || send.busy || send.confirming"></b-form-input>
            </b-input-group>
            <b-form-checkbox v-model="send.all" class="small mb-2" :disabled="send.busy || send.confirming">Send everything ({{ sats(node.onchainConfirmedSat) }}, less the fee)</b-form-checkbox>
            <label class="small font-weight-bold mb-1" for="bridge-send-fee">Fee rate (optional)</label>
            <b-input-group append="sat/vB" class="mb-1 fee-input">
              <b-form-input id="bridge-send-fee" v-model="send.fee" type="number" min="1" step="1" class="neu-input" placeholder="estimate" :disabled="send.busy || send.confirming"></b-form-input>
            </b-input-group>
            <small class="d-block text-muted mb-2">
              From the node's on-chain balance only; coins in its channels
              stay there. Addresses on the two chains look the same: check
              that this one is for the SHA256 chain.
            </small>
            <div v-if="!send.confirming" class="d-flex justify-content-end">
              <b-button variant="primary" :disabled="!sendReady" @click="send.confirming = true">Review</b-button>
            </div>
            <div v-else>
              <small class="d-block mb-2">
                Send <b>{{ send.all ? "everything on chain" : sats(Number(send.amount)) }}</b>
                on the SHA256 chain to <b class="text-break">{{ send.address.trim() }}</b>,
                at {{ send.fee.trim() ? `${send.fee.trim()} sat/vB` : "the node's fee estimate" }}?
                This cannot be undone.
              </small>
              <b-button variant="danger" size="sm" class="mr-2" :disabled="send.busy" @click="sendCoins">{{ send.busy ? "Sending…" : "Send" }}</b-button>
              <b-button variant="link" size="sm" :disabled="send.busy" @click="send.confirming = false">Back</b-button>
            </div>
          </template>
          <template v-else>
            <small class="d-block mb-2">Sent. The transaction:</small>
            <input-copy size="sm" :value="send.txid"></input-copy>
            <a :href="`${explorerBase}/tx/${send.txid}`" target="_blank" rel="noopener" class="small d-inline-block mt-1" @click="confirmExplorer">See it on {{ explorerName }}</a>
          </template>
        </div>

        <!-- Rate and fees -->
        <div ref="bridge-rate" class="mb-4">
          <h6 class="font-weight-bold">Rate and fees</h6>
          <div class="neu-card p-3">
            <template v-if="overview.rateSource === 'neoxa'">
              <div class="kv">
                <span>From the market (Neoxa)</span>
                <span class="text-right">
                  {{ overview.rate > 0 ? rateText(overview.rate) : "Not read yet" }}
                  <small v-if="overview.rate > 0" class="d-block text-muted">{{ costPerBitcoinSat(overview.rate) }}</small>
                </span>
              </div>
              <small class="d-block mb-2" :class="`text-${marketLineOf.variant}`">{{ marketLineOf.text }}</small>
            </template>
            <template v-else>
              <div class="kv">
                <span>Your rate</span>
                <span class="text-right">
                  {{ overview.rate > 0 ? rateText(overview.rate) : "Not set" }}
                  <small v-if="overview.rate > 0" class="d-block text-muted">{{ costPerBitcoinSat(overview.rate) }}</small>
                </span>
              </div>
              <small class="d-block mb-2" :class="`text-${rateAgeOf.variant}`">{{ rateAgeOf.text }}</small>
              <div v-if="overview.market" class="kv">
                <span>On {{ overview.market.source || "the market" }}</span>
                <span class="text-right">
                  {{ rateText(overview.market.rate) }}
                  <small v-if="overview.rate > 0" class="d-block text-muted">{{ marketDifference(overview.market.difference) }}</small>
                </span>
              </div>
              <small v-else class="d-block text-muted mb-2">The market rate is not available right now.</small>
            </template>
            <div v-for="d in overview.directionsInfo" :key="d.name" class="kv">
              <span>{{ directionName(d.name) }}</span>
              <span class="text-right">
                {{ d.open ? `${percent(d.spread)} fee` : "Not serving" }}
                <small class="d-block text-muted">{{ Number(d.minSat).toLocaleString() }} to {{ Number(d.maxSat).toLocaleString() }} {{ d.name === "toSHA256" ? "SHA256" : "BTCB2" }} sats per payment</small>
              </span>
            </div>

            <template v-if="overview.rateSource !== 'neoxa'">
              <label class="small font-weight-bold mt-2 mb-1" for="bridge-rate-input">New rate (BTC (SHA256) for 1 BTCB2)</label>
              <div class="d-flex flex-wrap align-items-center">
                <b-form-input
                  id="bridge-rate-input"
                  v-model="rateInput"
                  type="number"
                  step="any"
                  min="0"
                  class="neu-input rate-input mr-2 mb-1"
                  placeholder="0.00483"
                  :disabled="savingRate"
                  @keyup.enter="setRate"
                ></b-form-input>
                <b-button
                  v-if="overview.market"
                  size="sm"
                  variant="link"
                  class="mr-2 mb-1 px-0"
                  :disabled="savingRate"
                  @click="rateInput = String(overview.market.rate)"
                  >Use the market rate</b-button
                >
                <b-button
                  size="sm"
                  variant="outline-primary"
                  class="mb-1"
                  :disabled="savingRate || !(Number(rateInput) > 0)"
                  @click="setRate"
                  >{{ savingRate ? "Setting…" : overview.rate > 0 ? "Renew rate" : "Set rate" }}</b-button
                >
              </div>
              <small v-if="Number(rateInput) > 0" class="d-block text-muted">{{ costPerBitcoinSat(rateInput) }}</small>
            </template>

            <!-- The fees: Umbrel's switch -->
            <div v-if="toggleNow && toggleNow.pricing" class="mt-3 pt-2 border-top-subtle">
              <div class="kv">
                <span>Your fees</span>
                <span class="text-right">
                  {{ pricingSummary(toggleNow.pricing) }}
                  <b-button v-if="!pricing.open" size="sm" variant="link" class="px-0 d-block ml-auto" @click="openPricing">Change</b-button>
                </span>
              </div>
              <div v-if="pricing.open">
                <label class="small font-weight-bold mb-1" for="bridge-fee">Fee, both directions (%)</label>
                <b-form-input id="bridge-fee" v-model="pricing.fee" type="number" step="0.01" min="0.31" max="19.99" class="neu-input rate-input mb-1" :disabled="pricing.busy"></b-form-input>
                <small class="d-block text-muted mb-2">1.5% stays inside what payers allow by default (5% over the market) even when the bridge runs low and charges up to three times its fee.</small>
                <label class="small font-weight-bold mb-1" for="bridge-fee-sha">{{ directionName("toSHA256") }}: fee if different (%)</label>
                <b-form-input id="bridge-fee-sha" v-model="pricing.feeToSHA256" type="number" step="0.01" min="0.31" max="19.99" class="neu-input rate-input mb-2" placeholder="Same" :disabled="pricing.busy"></b-form-input>
                <label class="small font-weight-bold mb-1" for="bridge-fee-b2b">{{ directionName("toBLAKE2b") }}: fee if different (%)</label>
                <b-form-input id="bridge-fee-b2b" v-model="pricing.feeToBLAKE2b" type="number" step="0.01" min="0.31" max="19.99" class="neu-input rate-input mb-2" placeholder="Same" :disabled="pricing.busy"></b-form-input>
                <small class="d-block text-muted mb-2">Saving restarts Lightning XBT while the bridge is on.</small>
                <b-button size="sm" variant="primary" class="mr-2" :disabled="pricing.busy" @click="savePricing">{{ pricing.busy ? "Saving…" : "Save" }}</b-button>
                <b-button size="sm" variant="link" :disabled="pricing.busy" @click="pricing.open = false">Cancel</b-button>
              </div>
            </div>
            <small v-else-if="overview.platform === 'startos'" class="d-block text-muted mt-2">
              Set your fees with the Bridge action in StartOS.
            </small>
          </div>
        </div>

        <!-- Participants -->
        <div ref="bridge-participants" class="mb-4">
          <h6 class="font-weight-bold">Participants</h6>
          <small class="d-block text-muted mb-2">
            People whose nodes pay through your bridge, each with a bridge
            code from you. A code lets their node ask for quotes and pay
            through the bridge; it cannot spend anything on this node.
          </small>
          <div v-if="overview.participants === null" class="small text-muted">Could not read the codes issued.</div>
          <div v-else-if="!overview.participants.length" class="small text-muted mb-2">No codes issued yet.</div>
          <div
            v-for="p in overview.participants || []"
            :key="p.rootKeyId"
            class="neu-card px-3 py-2 mb-2 d-flex justify-content-between align-items-center"
          >
            <div style="min-width: 0;">
              <div class="text-truncate">{{ p.label || (overview.manageParticipants ? "Issued outside this window" : "Issued in StartOS") }}</div>
              <small v-if="p.createdAt" class="text-muted">Issued {{ issuedOn(p.createdAt) }}</small>
            </div>
            <b-button
              v-if="overview.manageParticipants"
              size="sm"
              variant="link"
              class="text-danger flex-shrink-0"
              :disabled="revoking === p.rootKeyId"
              @click="revoke(p.rootKeyId)"
              >{{ confirmRevoke === p.rootKeyId ? "Confirm revoke" : "Revoke" }}</b-button
            >
          </div>
          <small v-if="confirmRevoke" class="d-block text-muted mb-2">
            Their node can no longer use the bridge. Payments already on
            their way finish as usual.
          </small>

          <template v-if="overview.manageParticipants">
            <div v-if="issued" class="neu-card p-3 mb-2">
              <div class="font-weight-bold mb-1">Bridge code for {{ issued.label }}</div>
              <div class="d-flex flex-column flex-md-row align-items-center">
                <qr-code :value="issued.code" :size="180" class="mx-auto mb-3 mb-md-0" :showLogo="false"></qr-code>
                <div class="w-100 ml-0 ml-md-3">
                  <input-copy size="sm" :value="issued.code" class="mb-2"></input-copy>
                  <small class="d-block text-muted">
                    Send it privately, as you would a password. They add it in
                    their dashboard under "Paying SHA256 invoices". It is shown
                    only now; you can always issue another.
                  </small>
                </div>
              </div>
            </div>
            <template v-if="overview.canIssueCodes">
              <div class="d-flex flex-wrap align-items-center">
                <b-form-input
                  v-model="newLabel"
                  class="neu-input label-input mr-2 mb-1"
                  placeholder="Their name"
                  maxlength="64"
                  :disabled="issuing"
                  @keyup.enter="requestIssue"
                ></b-form-input>
                <b-button
                  size="sm"
                  variant="outline-primary"
                  class="mb-1"
                  :disabled="issuing || !newLabel.trim()"
                  @click="requestIssue"
                  >{{ issuing ? "Creating…" : "Create a code" }}</b-button
                >
              </div>
              <step-up-password
                v-if="issueAsking"
                class="mt-2"
                input-id="bridge-issue-password"
                why="Asked again because a participant's code keeps working after you sign out."
                action="Create the code"
                :busy="issuing"
                @submit="issue"
                @cancel="issueAsking = false"
              ></step-up-password>
            </template>
            <small v-else class="d-block text-muted">
              Participants reach your node over Tor, and this node has no Tor
              address for it yet.
            </small>
          </template>
          <small v-else class="d-block text-muted">
            In StartOS, issue codes with the <b>Add Bridge Participant</b> action and
            revoke them with <b>Remove Bridge Participant</b>.
          </small>
        </div>

      </template>

      <!-- Recovery -->
      <div v-if="node && (node.mode === 'supervised' || node.mode === 'idle')" class="mb-2">
        <h6 class="font-weight-bold">Recovering the bridge node</h6>
        <small class="d-block text-muted mb-2">
          Your Lightning Fork recovery phrase recreates the bridge node, so
          there is nothing else to keep. Its channels come back from its own
          channel backup; keep a recent copy, as you do for this node's.
        </small>
        <small v-if="backupText" class="d-block mb-2" :class="`text-${backupText.variant}`">{{ backupText.text }}</small>
        <div class="d-flex flex-wrap mb-2">
          <b-button size="sm" variant="outline-primary" class="mr-2 mb-1" @click="downloadBackup">Download its channel backup</b-button>
          <b-button v-if="!recovery.shown && !recovery.confirming" size="sm" variant="outline-secondary" class="mb-1" @click="recovery.confirming = true">Show its own recovery phrase</b-button>
        </div>
        <div v-if="recovery.confirming && !recovery.shown" class="neu-card p-3 mb-2">
          <small class="d-block mb-2">
            Its own phrase is for restoring the bridge node in another LND,
            without Lightning Fork. <b>Anyone who sees these words can spend
            what the bridge node holds.</b> Make sure nobody else can see
            your screen.
          </small>
          <step-up-password
            v-if="passwordEnabled"
            input-id="bridge-recovery-password"
            why="Asked again because these words outlast this session."
            action="Show the words"
            :busy="recovery.loading"
            @submit="showRecovery"
            @cancel="recovery.confirming = false"
          ></step-up-password>
          <template v-else>
            <b-button size="sm" variant="danger" class="mr-2" :disabled="recovery.loading" @click="showRecovery()">{{ recovery.loading ? "Deriving…" : "Show the words" }}</b-button>
            <b-button size="sm" variant="link" @click="recovery.confirming = false">Cancel</b-button>
          </template>
        </div>
        <div v-if="recovery.shown" class="neu-card p-3 mb-2">
          <ol class="words pl-0 mb-2">
            <li v-for="(w, i) in recovery.mnemonic" :key="i"><small class="text-muted">{{ i + 1 }}.</small> {{ w }}</li>
          </ol>
          <small class="d-block text-muted mb-2">
            24 aezeed words, no passphrase. Each time they are shown the
            words differ; every version restores the same node. In a stock
            LND: <code>lncli create</code>, restore from the words, then
            restore its channels from its channel backup.
          </small>
          <div class="kv"><span>Identity it will have</span></div>
          <input-copy size="sm" :value="recovery.identityPubkey" class="mb-2"></input-copy>
          <b-button size="sm" variant="link" class="px-0" @click="hideRecovery">Hide the words</b-button>
        </div>
      </div>

      <!-- Off, where the page is the switch -->
      <div
        v-if="toggleNow && toggleNow.on && !(overview && overview.enabled === false)"
        class="mt-4 pt-3 border-top-subtle"
      >
        <div class="mb-3">
          <div class="font-weight-bold small mb-1">{{ directionName("toBLAKE2b") }}</div>
          <small class="d-block text-muted mb-2">
            <template v-if="toggleNow.toBLAKE2b">On: payers on the SHA256 chain pay your bridge node, and Lightning Fork pays their BLAKE2b invoices from its own channels.</template>
            <template v-else>The other way round: payers on the SHA256 chain pay your bridge node, and Lightning Fork pays their BLAKE2b invoices from its own channels, which puts back on the bridge node what paying SHA256 invoices spends. It needs room to receive on the bridge node's channels and to send on Lightning Fork's.</template>
            Changing it restarts Lightning XBT.
          </small>
          <b-button size="sm" :variant="toggleNow.toBLAKE2b ? 'outline-danger' : 'outline-primary'" :disabled="switching" @click="setDirections(!toggleNow.toBLAKE2b)">{{ switching ? "Restarting…" : toggleNow.toBLAKE2b ? "Stop paying BLAKE2b invoices" : "Pay BLAKE2b invoices too" }}</b-button>
        </div>
        <template v-if="!confirmSwitch">
          <b-button variant="link" size="sm" class="text-danger px-0" @click="confirmSwitch = true">Turn the bridge off</b-button>
        </template>
        <template v-else>
          <small class="d-block mb-2">
            Lightning XBT restarts and the bridge stops taking payments. It
            can be turned off only while no payment is in progress or needs
            you. The bridge's node keeps running and watching its channels,
            and everything it holds stays where it is.
          </small>
          <b-button variant="danger" size="sm" class="mr-2" :disabled="switching" @click="setEnabled(false)">{{ switching ? "Turning it off…" : "Turn it off and restart" }}</b-button>
          <b-button variant="link" size="sm" :disabled="switching" @click="confirmSwitch = false">Cancel</b-button>
        </template>
      </div>


    </div>
  </b-modal>
</template>

<script>
import { mapState } from "vuex";
import moment from "moment";

import API from "@/helpers/api";
import getErrorMessage from "@/helpers/error-message";
import {
  percent,
  sats,
  rateText,
  costPerBitcoinSat,
  shortKey
} from "@/helpers/bitcoin-invoices";
import {
  bridgeUrl,
  sha256ExplorerBase,
  directionName,
  STEPS,
  nodeState,
  rateAge,
  marketDifference,
  channelState,
  closeOptions,
  feeRateInput,
  sha256BackupText,
  marketLine,
  RECOMMENDED_PEER,
  RECOMMENDED_CHANNEL_SAT,
  CHANNEL_OVERHEAD_SAT
} from "@/helpers/bridge";
import QrCode from "@/components/Utility/QrCode";
import InputCopy from "@/components/Utility/InputCopy";
import Sha256NodeList from "@/views/Home/Sha256NodeList";
import StepUpPassword from "@/components/Utility/StepUpPassword";

// How often the window asks again while it is open. Nothing is asked while
// it is closed, so a node that never bridges pays nothing for it.
const REFRESH_MS = 15 * 1000;

const emptyChans = () => ({
  loading: false,
  list: [],
  listError: "",
  closing: "",
  force: false,
  fee: "",
  busy: false,
  txid: "",
  slow: false
});

const emptySend = () => ({
  address: "",
  amount: "",
  all: false,
  fee: "",
  confirming: false,
  busy: false,
  txid: ""
});

// The channel form, empty.
const emptyChannel = () => ({
  peer: "",
  amount: "",
  fundMax: false,
  reviewing: false,
  busy: false,
  txid: ""
});

// The Pricing form, closed.
const emptyPricing = () => ({
  open: false,
  busy: false,
  fee: "",
  feeToSHA256: "",
  feeToBLAKE2b: ""
});

const emptyRecovery = () => ({
  confirming: false,
  shown: false,
  loading: false,
  mnemonic: [],
  identityPubkey: ""
});

// The operator's console for a bridge: whether it is serving and why not,
// the steps to get it going, its SHA256 node, the rate and the people it
// serves. Everything shown is read from the nodes each time, not remembered.
export default {
  components: { QrCode, InputCopy, Sha256NodeList, StepUpPassword },
  data() {
    return {
      overview: null,
      loadError: "",
      timer: null,
      panel: "",
      deposit: { loading: false, address: "" },
      channel: emptyChannel(),
      chans: emptyChans(),
      send: emptySend(),
      rateInput: "",
      savingRate: false,
      pricing: emptyPricing(),
      newLabel: "",
      issueAsking: false,
      issuing: false,
      issued: null,
      confirmRevoke: "",
      revoking: "",
      recovery: emptyRecovery(),
      confirmSwitch: false,
      switching: false,
      unavailableToggle: null,
      chosenNode: null,
      changingNode: false,
      // Bumped when the window opens or closes, so an answer that arrives
      // afterwards (a recovery phrase, a code) is dropped, not shown.
      generation: 0,
      error: "",
      notice: ""
    };
  },
  computed: {
    passwordEnabled() {
      return Boolean(this.$store.state.system.auth.passwordEnabled);
    },
    drainingCount() {
      const o = this.overview || {};
      return o.unfinished !== null && o.unfinished !== undefined
        ? o.unfinished
        : o.swapsInFlight;
    },
    backupText() {
      return this.overview
        ? sha256BackupText(this.overview.sha256Backup, this.overview.now)
        : null;
    },
    sendReady() {
      const amount = Number(this.send.amount);
      return (
        !this.send.busy &&
        this.send.address.trim().length > 0 &&
        (this.send.all || (Number.isInteger(amount) && amount > 0)) &&
        feeRateInput(this.send.fee).ok
      );
    },
    ...mapState({
      maxReceive: state => state.lightning.maxReceive,
      maxSend: state => state.lightning.maxSend,
      channels: state => state.lightning.channels
    }),
    node() {
      return this.overview && this.overview.sha256Node;
    },
    nodeStateOf() {
      return nodeState(this.node ? this.node.state : "");
    },
    recommendedPeer() {
      return RECOMMENDED_PEER;
    },
    recommendedChannelSat() {
      return RECOMMENDED_CHANNEL_SAT;
    },
    channelOverheadSat() {
      return CHANNEL_OVERHEAD_SAT;
    },
    usingRecommendedPeer() {
      return this.channel.peer.trim().toLowerCase() === RECOMMENDED_PEER.uri.toLowerCase();
    },
    channelPeerShort() {
      const p = this.channel.peer.trim();
      return p.length > 24 ? `${p.slice(0, 12)}…${p.slice(p.indexOf("@"))}` : p;
    },
    channelAmountTooLarge() {
      const max = this.overview && this.overview.channelMax;
      return !this.channel.fundMax && !!max && Number(this.channel.amount) > max.maxSat;
    },
    channelAmountSmall() {
      const n = Number(this.channel.amount);
      return !this.channel.fundMax && n >= 20000 && n < RECOMMENDED_CHANNEL_SAT;
    },
    channelReady() {
      if (this.channel.busy || !this.channel.peer.trim()) {
        return false;
      }
      if (this.channel.fundMax) {
        return !!(this.overview && this.overview.channelMax);
      }
      return Number(this.channel.amount) >= 20000 && !this.channelAmountTooLarge;
    },
    marketLineOf() {
      return marketLine(this.overview);
    },
    rateAgeOf() {
      return rateAge(this.overview);
    },
    allDone() {
      return (
        !this.overview ||
        !this.overview.steps.length ||
        this.overview.steps.every(s => s.done)
      );
    },
    activeChannels() {
      const list = this.channels || [];
      return list.filter(c => c.type === "OPEN" && c.active).length;
    },
    maxSwapSat() {
      const d = (this.overview ? this.overview.directionsInfo : []).find(
        x => x.name === "toSHA256"
      );
      return d ? d.maxSat : 0;
    },
    nextStep() {
      if (!this.overview || this.serving) {
        return null;
      }
      return this.overview.steps.find(s => !s.done && s.id !== "serving") || null;
    },
    serving() {
      return !!this.overview && this.overview.serving.directions.length > 0;
    },
    statusVariant() {
      if (this.overview.needsOperator.length) {
        return "danger";
      }
      return this.serving ? "success" : "warning";
    },
    statusTitle() {
      if (this.serving) {
        return `Serving: ${this.overview.serving.directions
          .map(directionName)
          .join("; ")}`;
      }
      return this.allDone ? "Not serving right now" : "Not serving yet";
    },
    statusDetail() {
      return this.serving ? "" : this.overview.serving.reason;
    },
    readsName() {
      const t = this.overview && this.overview.toggle;
      if (!t || !t.inUse) {
        return "";
      }
      const n = t.nodes.find(x => x.id === t.inUse);
      return n ? n.name : "";
    },
    otherUsableNodes() {
      const t = this.overview && this.overview.toggle;
      if (!t || !t.on) {
        return [];
      }
      return t.nodes.filter(n => n.state === "sha256" && n.id !== t.inUse);
    },
    explorerBase() {
      return sha256ExplorerBase(this.overview && this.overview.sha256Explorer);
    },
    explorerName() {
      const e = this.overview && this.overview.sha256Explorer;
      return (e && e.name) || "mempool.space";
    },
    toggleNow() {
      return this.overview && this.overview.toggle
        ? this.overview.toggle
        : this.unavailableToggle;
    },
    channelBackupUrl() {
      return bridgeUrl("/sha256/channel-backup");
    }
  },
  watch: {
    error(value) {
      if (value) {
        this.scrollTo("alerts");
      }
    },
    notice(value) {
      if (value) {
        this.scrollTo("alerts");
      }
    }
  },
  beforeDestroy() {
    this.stopTimer();
  },
  methods: {
    percent,
    sats,
    rateText,
    costPerBitcoinSat,
    directionName,
    marketDifference,
    shortKey,
    channelState,
    closeOptions,
    feeRateInput,
    satsOrDash(n) {
      return Number(n) >= 0 ? sats(n) : "—";
    },
    stepTitle(id) {
      return STEPS[id] ? STEPS[id].title : id;
    },
    stepDetail(step) {
      if (step.id === "serving" && this.nextStep && this.nextStep.id !== "serving") {
        return "Follows once the steps above are done.";
      }
      return step.detail || this.stepHint(step.id);
    },
    stepHint(id) {
      return STEPS[id] ? STEPS[id].hint : "";
    },
    markClass(step) {
      if (step.done) {
        return "mark-done";
      }
      return step.waiting ? "mark-waiting" : "mark-todo";
    },
    issuedOn(at) {
      return moment(at).format("D MMM YYYY");
    },
    opened() {
      this.generation++;
      this.unavailableToggle = null;
      this.issuing = false;
      this.switching = false;
      this.confirmRevoke = "";
      this.revoking = "";
      this.overview = null;
      this.loadError = "";
      this.error = "";
      this.notice = "";
      this.panel = "";
      this.issued = null;
      this.recovery = emptyRecovery();
      this.confirmSwitch = false;
      this.changingNode = false;
      this.load();
      this.stopTimer();
      this.timer = setInterval(() => this.load(), REFRESH_MS);
    },
    closed() {
      this.generation++;
      this.stopTimer();
      // Nothing secret outlives the window.
      this.recovery = emptyRecovery();
      this.issued = null;
      this.deposit = { loading: false, address: "" };
      this.chans = emptyChans();
      this.send = emptySend();
    },
    stopTimer() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    },
    async load() {
      const overview = await API.get(bridgeUrl());
      if (!overview) {
        if (!this.overview) {
          this.loadError =
            "Could not ask Lightning XBT about the bridge. Please try again.";
        }
        return;
      }
      if (overview.unavailable) {
        // What was shown before is not what is so now (the bridge was
        // just switched, or Lightning Fork is failing to start): only the
        // sentence and, on Umbrel, the switch, so it can be turned off.
        this.loadError = overview.unavailable;
        this.unavailableToggle = overview.toggle || null;
        this.overview = null;
        return;
      }
      this.unavailableToggle = null;
      this.loadError = "";
      this.overview = overview;
      // The node choice starts at the one in use, or the one suggested, and
      // then stays the operator's: refreshing does not undo a pick unless
      // that node can no longer be used.
      if (overview.toggle) {
        const usable = overview.toggle.nodes.filter(n => n.state === "sha256").map(n => n.id);
        if (!this.chosenNode || !usable.includes(this.chosenNode)) {
          this.chosenNode = overview.toggle.inUse || overview.toggle.chosen;
        }
      }
    },
    scrollTo(ref) {
      this.$nextTick(() => {
        const el = this.$refs[ref];
        if (el && el.scrollIntoView) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    },
    showPanel(name) {
      // Not while a channel is being opened or closed, or coins sent: a
      // fresh form would let it be done twice.
      if (this.channel.busy || this.chans.busy || this.send.busy) {
        return;
      }
      this.error = "";
      this.panel = this.panel === name ? "" : name;
      if (this.panel === "deposit" && !this.deposit.address) {
        this.getDepositAddress();
      }
      if (this.panel === "channel") {
        this.channel = emptyChannel();
      }
      if (this.panel === "channels") {
        this.chans = emptyChans();
        this.loadChannels();
      }
      if (this.panel === "send") {
        this.send = emptySend();
      }
      if (this.panel) {
        this.scrollTo("panel");
      }
    },
    async getDepositAddress() {
      this.deposit = { loading: true, address: "" };
      try {
        const res = await API.post(bridgeUrl("/sha256/address"));
        this.deposit = { loading: false, address: res.data.address };
      } catch (error) {
        this.deposit = { loading: false, address: "" };
        this.panel = "";
        this.error = getErrorMessage(
          error,
          "Could not get an address from the bridge node. Please try again."
        );
      }
    },
    async loadChannels() {
      this.chans.loading = true;
      // API.get answers nothing, rather than an error, when it fails.
      const res = await API.get(bridgeUrl("/sha256/channels"));
      // Nothing also when the same request is still on its way: the list
      // shown stays, with a word, and the panel stays open.
      if (res && Array.isArray(res.channels)) {
        this.chans.list = res.channels;
        this.chans.listError = "";
      } else {
        this.chans.listError = "Could not list the bridge node's channels just now.";
      }
      this.chans.loading = false;
    },
    startClose(c) {
      this.chans.closing = c.channelPoint;
      this.chans.force = !closeOptions(c).coop;
      this.chans.fee = "";
    },
    async closeChannel(c) {
      const fee = feeRateInput(this.chans.force ? "" : this.chans.fee);
      if (!fee.ok) {
        return;
      }
      this.chans.busy = true;
      this.error = "";
      try {
        const res = await API.post(bridgeUrl("/sha256/channels/close"), {
          channelPoint: c.channelPoint,
          force: this.chans.force,
          ...(fee.value ? { satPerVbyte: fee.value } : {})
        });
        this.chans.txid = res.data.txid || "";
        this.chans.slow = !!res.data.slow;
        this.chans.closing = "";
        this.loadChannels();
        this.load();
      } catch (error) {
        this.error = getErrorMessage(error, "Could not close the channel. Please try again.");
      }
      this.chans.busy = false;
    },
    async sendCoins() {
      const fee = feeRateInput(this.send.fee);
      if (!this.sendReady || !fee.ok) {
        return;
      }
      this.send.busy = true;
      this.error = "";
      try {
        const res = await API.post(bridgeUrl("/sha256/withdraw"), {
          address: this.send.address.trim(),
          sendAll: this.send.all,
          ...(this.send.all ? {} : { amountSat: Number(this.send.amount) }),
          ...(fee.value ? { satPerVbyte: fee.value } : {})
        });
        this.send.txid = res.data.txid;
        this.load();
      } catch (error) {
        this.send.confirming = false;
        this.error = getErrorMessage(error, "Nothing was sent. Please try again.");
      }
      this.send.busy = false;
    },
    pricingSummary(p) {
      const pct = f => `${Math.round(f * 10000) / 100}%`;
      const fees =
        p.feeToSHA256 || p.feeToBLAKE2b
          ? `${pct(p.feeToSHA256 || p.fee)} paying SHA256 invoices, ${pct(p.feeToBLAKE2b || p.fee)} paying BLAKE2b invoices`
          : `${pct(p.fee)} fee`;
      return `${fees[0].toUpperCase()}${fees.slice(1)}`;
    },
    openPricing() {
      const p = this.toggleNow.pricing;
      const pct = f => (f ? String(Math.round(f * 10000) / 100) : "");
      this.pricing = {
        ...emptyPricing(),
        open: true,
        fee: pct(p.fee),
        feeToSHA256: pct(p.feeToSHA256),
        feeToBLAKE2b: pct(p.feeToBLAKE2b)
      };
    },
    async savePricing() {
      const frac = v => (String(v).trim() === "" ? null : Number(v) / 100);
      const fees = [this.pricing.fee, this.pricing.feeToSHA256, this.pricing.feeToBLAKE2b];
      if (fees.some(v => String(v).trim() !== "" && !Number.isFinite(Number(v)))) {
        this.error = "Enter each fee as a number of percent, such as 1.5.";
        return;
      }
      this.pricing.busy = true;
      this.error = "";
      this.notice = "";
      try {
        const res = await API.post(bridgeUrl("/pricing"), {
          fee: frac(this.pricing.fee),
          feeToSHA256: frac(this.pricing.feeToSHA256),
          feeToBLAKE2b: frac(this.pricing.feeToBLAKE2b)
        });
        this.pricing = emptyPricing();
        this.load();
        if (res.data.restarting) {
          this.notice = "Lightning XBT is restarting with the new pricing. This window catches up in a minute.";
        }
      } catch (error) {
        this.error = getErrorMessage(error, "Could not save the pricing. Please try again.");
        this.pricing.busy = false;
      }
    },
    async setDirections(toBLAKE2b) {
      this.switching = true;
      this.error = "";
      this.notice = "";
      try {
        const res = await API.post(bridgeUrl("/directions"), { toBLAKE2b });
        this.load();
        if (res.data.restarting) {
          this.notice = toBLAKE2b
            ? "Lightning XBT is restarting to pay BLAKE2b invoices too. This window catches up in a minute."
            : "Lightning XBT is restarting to stop paying BLAKE2b invoices.";
        }
      } catch (error) {
        this.error = getErrorMessage(error, "Could not change the bridge. Please try again.");
      }
      this.switching = false;
    },
    async openChannel() {
      this.channel.busy = true;
      this.error = "";
      try {
        const res = await API.post(bridgeUrl("/sha256/channel"), {
          peer: this.channel.peer.trim(),
          ...(this.channel.fundMax
            ? { fundMax: true }
            : { amountSat: Number(this.channel.amount) })
        });
        this.channel.txid = res.data.txid;
        this.load();
      } catch (error) {
        this.error = getErrorMessage(
          error,
          "Could not open the channel. Please try again."
        );
      }
      this.channel.busy = false;
    },
    async setRate() {
      if (!(Number(this.rateInput) > 0)) {
        return;
      }
      this.savingRate = true;
      this.error = "";
      this.notice = "";
      try {
        await API.post(bridgeUrl("/rate"), { rate: Number(this.rateInput) });
        this.rateInput = "";
        this.notice = "Rate set.";
        await this.load();
      } catch (error) {
        this.error = getErrorMessage(
          error,
          "Could not set the rate. Please try again."
        );
      }
      this.savingRate = false;
    },
    // A code outlasts the session: the dashboard password first, where
    // there is one.
    requestIssue() {
      if (!this.newLabel.trim() || this.issuing) {
        return;
      }
      if (this.passwordEnabled) {
        this.issueAsking = true;
        return;
      }
      this.issue();
    },
    async issue(password) {
      const label = this.newLabel.trim();
      if (!label) {
        return;
      }
      this.issuing = true;
      this.error = "";
      this.issued = null;
      const generation = this.generation;
      try {
        const res = await API.post(bridgeUrl("/participants"), {
          label,
          ...(password ? { password } : {})
        });
        this.issueAsking = false;
        if (generation !== this.generation) {
          return;
        }
        this.issued = res.data;
        this.newLabel = "";
        await this.load();
      } catch (error) {
        this.error = getErrorMessage(
          error,
          "Could not create the code. Please try again."
        );
      }
      this.issuing = false;
    },
    async revoke(rootKeyId) {
      if (this.confirmRevoke !== rootKeyId) {
        this.confirmRevoke = rootKeyId;
        return;
      }
      this.confirmRevoke = "";
      this.revoking = rootKeyId;
      this.error = "";
      try {
        await API.delete(bridgeUrl(`/participants/${rootKeyId}`));
        this.notice = "Code revoked.";
        await this.load();
      } catch (error) {
        this.error = getErrorMessage(
          error,
          "Could not revoke the code. Please try again."
        );
      }
      this.revoking = "";
    },
    async downloadBackup() {
      this.error = "";
      const ok = await API.download(
        this.channelBackupUrl,
        {},
        true,
        "sha256-node-channel.backup"
      );
      if (!ok) {
        this.error =
          "Could not download the bridge node's channel backup: it may not be answering. Please try again.";
      }
    },
    async showRecovery(password) {
      this.recovery.loading = true;
      this.error = "";
      const generation = this.generation;
      try {
        const res = await API.post(bridgeUrl("/sha256/recovery"), {
          confirm: true,
          ...(password ? { password } : {})
        });
        if (generation !== this.generation) {
          return;
        }
        this.recovery = {
          ...emptyRecovery(),
          shown: true,
          mnemonic: res.data.mnemonic,
          identityPubkey: res.data.identityPubkey
        };
      } catch (error) {
        this.recovery.loading = false;
        this.error = getErrorMessage(
          error,
          "Could not derive the recovery phrase. Please try again."
        );
      }
    },
    // A public explorer learns what the operator looks at: asked first.
    confirmExplorer(event) {
      const e = this.overview && this.overview.sha256Explorer;
      if (
        (!e || e.public) &&
        !window.confirm(
          `This opens ${this.explorerName}, a public explorer for the SHA256 chain. Continue?`
        )
      ) {
        event.preventDefault();
      }
    },
    async setEnabled(enabled, node = null) {
      this.switching = true;
      this.error = "";
      this.notice = "";
      const before =
        this.overview && this.overview.toggle ? this.overview.toggle.inUse : null;
      try {
        const res = await API.post(bridgeUrl("/enabled"), node ? { enabled, node } : { enabled });
        this.confirmSwitch = false;
        this.changingNode = false;
        if (enabled && !res.data.restarting && res.data.node && res.data.node !== before) {
          this.notice = "The bridge's node restarts to read the node you chose.";
        }
        this.load();
        if (res.data.restarting) {
          this.notice = enabled
            ? "Lightning XBT is restarting to turn the bridge on. This window catches up in a minute."
            : "Lightning XBT is restarting to turn the bridge off.";
        }
      } catch (error) {
        this.error = getErrorMessage(
          error,
          "Could not change the bridge. Please try again."
        );
      }
      this.switching = false;
    },
    hideRecovery() {
      this.recovery = emptyRecovery();
    }
  }
};
</script>

<style lang="scss" scoped>
// The recommended peer, set apart from the free-text field below it.
.recommended-peer {
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: rgba(40, 167, 69, 0.08);
}
.bridge {
  .channel-row + .channel-row {
    border-top: 1px solid rgba(128, 128, 128, 0.2);
  }
  .fee-input {
    max-width: 16rem;
  }
  .kv {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 0.875rem;
    padding: 0.2rem 0;
    > span:first-child {
      color: #6c757d;
      margin-right: 1rem;
      white-space: nowrap;
    }
  }
  .status-line {
    border-left: 4px solid;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    &.status-success {
      border-color: #28a745;
      background: rgba(40, 167, 69, 0.08);
    }
    &.status-warning {
      border-color: #ffc107;
      background: rgba(255, 193, 7, 0.1);
    }
    &.status-danger {
      border-color: #dc3545;
      background: rgba(220, 53, 69, 0.08);
    }
  }
  .needs-line {
    word-break: break-word;
  }
  .checklist {
    list-style: none;
    li + li {
      border-top: 1px solid rgba(108, 117, 125, 0.15);
    }
    li.done {
      color: #6c757d;
      padding-top: 0.25rem !important;
      padding-bottom: 0.25rem !important;
    }
  }
  .mark {
    flex: 0 0 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    text-align: center;
    line-height: 1.5rem;
    font-size: 0.8rem;
    &.mark-done {
      background: rgba(40, 167, 69, 0.15);
      color: #28a745;
    }
    &.mark-waiting {
      background: rgba(255, 193, 7, 0.2);
      color: #b8860b;
    }
    &.mark-todo {
      background: rgba(108, 117, 125, 0.15);
      color: #6c757d;
    }
  }
  .border-top-subtle {
    border-top: 1px solid rgba(108, 117, 125, 0.2);
  }
  .rate-input {
    max-width: 11rem;
  }
  .label-input {
    max-width: 16rem;
  }
  .words {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 0.25rem 1rem;
    font-family: monospace;
  }
}
</style>
