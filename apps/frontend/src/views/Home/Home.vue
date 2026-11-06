<template>
  <div class="py-4 px-2">
    <div class="pb-2">
      <div
        class="d-flex flex-wrap justify-content-between align-items-center mb-2"
      >
        <div class="d-flex justify-content-start align-items-start mb-2 mb-sm-4">
          <img
            class="app-icon mr-2 mr-sm-3"
            src="@/assets/icon.png"
          />
          <div>
            <div class="d-flex align-items-center">
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="4" cy="4" r="4" :fill="`${isLndOperational ? '#00CD98' : '#F6B900'}`" />
              </svg>
              <small v-if="isLndOperational" class="ml-1 text-success">Running</small>
              <small v-else class="ml-1 text-warning">Starting</small>
            </div>
            <h3 class="font-weight-bold mb-0 mb-sm-1 app-title">
              Lightning XBT
              <span class="chain-badge ml-1">Bitcoin BLAKE2b chain</span>
            </h3>
            <div v-if="alias" class="d-flex align-items-center node-identity mb-0 mb-sm-1" :title="nodeColor ? `Node color ${nodeColor}` : ''">
              <span class="node-color-dot mr-1" :style="{ backgroundColor: nodeColor || '#3399ff' }"></span>
              <span class="font-weight-bold node-alias">{{ alias }}</span>
            </div>
            <span class="text-muted text-xs-small">
              {{
                this.lndVersion ? `Lightning Fork ${this.lndVersion.split(" commit")[0]} by Paul Lamb, an LND fork` : "..."
              }}
            </span>
          </div>
        </div>

        <div class="d-flex justify-content-between justify-content-sm-start">
          <b-dropdown
            class="ml-1"
            variant="link"
            toggle-class="text-decoration-none p-0"
            no-caret
            right
          >
            <template v-slot:button-content>
              <svg
                width="18"
                height="4"
                viewBox="0 0 18 4"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M2 4C3.10457 4 4 3.10457 4 2C4 0.89543 3.10457 0 2 0C0.89543 0 0 0.89543 0 2C0 3.10457 0.89543 4 2 4Z"
                  fill="#6c757d"
                />
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M9 4C10.1046 4 11 3.10457 11 2C11 0.89543 10.1046 0 9 0C7.89543 0 7 0.89543 7 2C7 3.10457 7.89543 4 9 4Z"
                  fill="#6c757d"
                />
                <path
                  fill-rule="evenodd"
                  clip-rule="evenodd"
                  d="M16 4C17.1046 4 18 3.10457 18 2C18 0.89543 17.1046 0 16 0C14.8954 0 14 0.89543 14 2C14 3.10457 14.8954 4 16 4Z"
                  fill="#6c757d"
                />
              </svg>
            </template>
            <b-dropdown-item href="#" v-b-modal.node-id-modal
              >Node ID</b-dropdown-item
            >
            <b-dropdown-item href="#" v-b-modal.mobile-app-modal
              >Mobile app</b-dropdown-item
            >
            <b-dropdown-item href="#" v-b-modal.peers-modal
              >Peers</b-dropdown-item
            >
            <b-dropdown-item href="#" v-b-modal.offers-modal
              >Lightning offers</b-dropdown-item
            >
            <b-dropdown-item href="#" v-b-modal.mempool-modal
              >Mempool app</b-dropdown-item
            >
            <b-dropdown-item href="#" v-b-modal.bitcoin-invoices-modal
              >Paying SHA256 invoices</b-dropdown-item
            >
            <b-dropdown-item href="#" v-b-modal.bridge-modal
              >Run a bridge</b-dropdown-item
            >
            <b-dropdown-item href="#" v-b-modal.macaroons-modal
              >Macaroons</b-dropdown-item
            >
            <!-- On StartOS the service's interfaces, actions and backups
                 cover these, so the dashboard keeps to the node itself. -->
            <b-dropdown-item v-if="!isStartOS" href="#" v-b-modal.connect-wallet-modal
              >Connect wallet</b-dropdown-item
            >
            <b-dropdown-item v-if="!isStartOS" href="#" v-b-modal.secret-words-modal
              >View secret words</b-dropdown-item
            >
            <b-dropdown-item v-if="!isStartOS" href="#" @click.stop.prevent="openAdvancedSettingsModal"
              >Advanced Settings</b-dropdown-item
            >
            <b-dropdown-divider></b-dropdown-divider>
            <b-dropdown-item v-if="!isStartOS" href="#" @click.stop.prevent="recoverChannels"
              >Recover channels</b-dropdown-item
            >
            <b-dropdown-item v-if="!isStartOS" href="#" @click.stop.prevent="openChannelBackupModal"
              >Channel backups</b-dropdown-item
            >
            <b-dropdown-item v-if="!isStartOS" href="#" @click.stop.prevent="downloadChannelBackup"
              >Download channel backup file</b-dropdown-item
            >
            <b-dropdown-item v-if="passwordEnabled" href="#" @click.stop.prevent="signOut"
              >Sign out</b-dropdown-item
            >
            <b-dropdown-group>
              <div class="dropdown-group" @click.stop>
                <div
                  class="d-flex w-100 justify-content-between align-items-center"
                >
                  <span class="d-block mr-3 text-nowrap">Fiat currency</span>
                  <b-form-select
                    size="sm"
                    class="currency-select"
                    v-model="selectedCurrency"
                    :options="currencyOptions"
                    @change="changeCurrency"
                  ></b-form-select>
                </div>
                <small class="d-block mt-2" style="opacity: 0.4">
                  BTCB2 priced at neoxa.exchange
                </small>
              </div>
            </b-dropdown-group>
            <b-dropdown-group>
              <div class="dropdown-group">
                <div class="d-flex w-100 justify-content-between align-items-center">
                  <span class="d-block">Dark mode</span>
                  <toggle-switch
                    class="align-self-center"
                    :on="theme === 'dark'"
                    @toggle="toggleTheme"
                  ></toggle-switch>
                </div>
              </div>
            </b-dropdown-group>
            <b-dropdown-group v-if="!isStartOS && channelBackupSummary">
              <div class="dropdown-group">
                <small class="d-block" style="opacity: 0.6">{{ channelBackupSummary }}</small>
              </div>
            </b-dropdown-group>
            <!-- <b-dropdown-divider /> -->
            <!-- <b-dropdown-item variant="danger" href="#" disabled>Stop LND</b-dropdown-item> -->
          </b-dropdown>
        </div>
      </div>

      <!-- Recovery progress  -->
      <div
        v-if="recoveryInfo.recoveryMode && recoveryInfo.progress < 1"
        class="mb-4 py-1"
        variant=""
      >
        Scanning all transactions for recovery. This may take a while...
        <b-progress
          :value="recoveryInfo.progress * 100"
          class="my-2 w-100"
          variant="purple"
          :style="{ height: '4px' }"
        ></b-progress>
      </div>

    </div>

    <b-row class="row-eq-height">
      <b-col col cols="12" sm="6" lg="4">
        <bitcoin-wallet />
      </b-col>
      <b-col col cols="12" sm="6" lg="4">
        <lightning-wallet />
      </b-col>
      <b-col col cols="12" sm="5" lg="4">
        <total-balance />
        <card-widget header="Summary">
          <div class="px-3 px-lg-4 pb-2">
            <b-row>
              <b-col col cols="6">
                <div
                  v-b-modal.peers-modal
                  class="peers-stat"
                  role="button"
                  title="View peers, or connect to one"
                >
                  <stat
                    title="Connections"
                    :value="numPeers"
                    suffix="Peers"
                    showNumericChange
                  ></stat>
                </div>
              </b-col>
              <b-col col cols="6">
                <stat
                  title="Channels"
                  :value="numActiveChannels"
                  suffix="Channels"
                  showNumericChange
                ></stat>
              </b-col>
              <b-col col cols="6">
                <stat
                  title="Max Send"
                  :value="maxSend | unit"
                  :suffix="unit | formatUnit"
                  :hasDecimals="unit === 'btc'"
                  abbreviateValue
                ></stat>
              </b-col>
              <b-col col cols="6">
                <stat
                  title="Max Receive"
                  :value="maxReceive | unit"
                  :suffix="unit | formatUnit"
                  :hasDecimals="unit === 'btc'"
                  abbreviateValue
                ></stat>
              </b-col>
            </b-row>
          </div>
        </card-widget>
      </b-col>
      <b-col col cols="12" sm="7" lg="12">
        <card-widget header="Payment Channels">
          <template v-slot:header-right>
            <b-button
              variant="outline-primary"
              size="sm"
              v-b-modal.open-channel-modal
              >+ Open Channel</b-button
            >
          </template>
          <div class>
            <b-modal
              id="open-channel-modal"
              ref="open-channel-modal"
              size="lg"
              centered
              hide-footer
            >
              <template v-slot:modal-header="{ close }">
                <div
                  class="px-2 px-sm-3 pt-2 d-flex justify-content-between w-100"
                >
                  <h3>Open channel</h3>
                  <!-- Emulate built in modal header close button action -->
                  <a
                    href="#"
                    class="align-self-center"
                    v-on:click.stop.prevent="close"
                  >
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
                        d="M13.6003 4.44197C13.3562 4.19789 12.9605 4.19789 12.7164 4.44197L9.02116 8.1372L5.32596 4.442C5.08188 4.19792 4.68615 4.19792 4.44207 4.442C4.198 4.68607 4.198 5.0818 4.44207 5.32588L8.13728 9.02109L4.44185 12.7165C4.19777 12.9606 4.19777 13.3563 4.44185 13.6004C4.68592 13.8445 5.08165 13.8445 5.32573 13.6004L9.02116 9.90497L12.7166 13.6004C12.9607 13.8445 13.3564 13.8445 13.6005 13.6004C13.8446 13.3563 13.8446 12.9606 13.6005 12.7165L9.90505 9.02109L13.6003 5.32585C13.8444 5.08178 13.8444 4.68605 13.6003 4.44197Z"
                        fill="#6c757d"
                      />
                    </svg>
                  </a>
                </div>
              </template>
              <div class="px-2 px-sm-3 py-2">
                <channel-open
                  v-on:channelopen="onChannelOpen"
                  v-on:addtochannel="onAddToChannel"
                ></channel-open>
              </div>
            </b-modal>

            <!-- manage channel modal -->
            <b-modal
              id="manage-channel-modal"
              ref="manage-channel-modal"
              size="lg"
              centered
              hide-footer
            >
              <template v-slot:modal-header="{ close }">
                <div
                  class="px-2 px-sm-3 pt-2 d-flex justify-content-between w-100"
                >
                  <h3>Channel details</h3>
                  <!-- Emulate built in modal header close button action -->
                  <a
                    href="#"
                    class="align-self-center"
                    v-on:click.stop.prevent="close"
                  >
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
                        d="M13.6003 4.44197C13.3562 4.19789 12.9605 4.19789 12.7164 4.44197L9.02116 8.1372L5.32596 4.442C5.08188 4.19792 4.68615 4.19792 4.44207 4.442C4.198 4.68607 4.198 5.0818 4.44207 5.32588L8.13728 9.02109L4.44185 12.7165C4.19777 12.9606 4.19777 13.3563 4.44185 13.6004C4.68592 13.8445 5.08165 13.8445 5.32573 13.6004L9.02116 9.90497L12.7166 13.6004C12.9607 13.8445 13.3564 13.8445 13.6005 13.6004C13.8446 13.3563 13.8446 12.9606 13.6005 12.7165L9.90505 9.02109L13.6003 5.32585C13.8444 5.08178 13.8444 4.68605 13.6003 4.44197Z"
                        fill="#6c757d"
                      />
                    </svg>
                  </a>
                </div>
              </template>
              <div class="px-2 px-sm-3 py-2">
                <channel-manage
                  :key="manageOpenings"
                  :channel="selectedChannel"
                  :resize-request="resizeRequest"
                  v-on:channelclose="onChannelClose"
                  v-on:channelresize="onChannelResize"
                  v-on:opensettings="openSettingsFromChannel"
                ></channel-manage>
              </div>
            </b-modal>

            <channel-list v-on:selectchannel="manageChannel"></channel-list>
          </div>
        </card-widget>
      </b-col>
    </b-row>

    <!-- Modals  -->
    <onboarding-modal v-if="!isStartOS" />
    <b-modal
      v-if="showRecoverChannelsModal"
      id="recover-channels-modal"
      size="lg"
      centered
      hide-header
      hide-footer
      @hidden="showRecoverChannelsModal = false"
    >
      <recovery-channels
        :onComplete="channelRecoveryInitiated"
        :onBack="closeRecoverChannelsModal"
        :onClose="closeRecoverChannelsModal"
      />
    </b-modal>
    <advanced-settings-modal v-if="showAdvancedSettingsModal" />
    <node-id-modal />
    <offers-modal />
    <peers-modal />
    <mobile-app-modal />
    <mempool-modal />
    <bitcoin-invoices-modal />
    <bridge-modal />
    <macaroons-modal />
    <secret-words-modal v-if="!isStartOS" />
    <connect-wallet-modal v-if="!isStartOS" />
    <channel-backup-modal
      v-if="!isStartOS && showChannelBackupModal"
      @hidden="showChannelBackupModal = false"
    />
  </div>
</template>

<script>
import { mapState } from "vuex";
import moment from "moment";

import API from "@/helpers/api";
import peerName from "@/helpers/peer-name";

import CardWidget from "@/components/CardWidget";
import Stat from "@/components/Utility/Stat";
import LightningWallet from "@/components/LightningWallet";
import BitcoinWallet from "@/components/BitcoinWallet";
import TotalBalance from "@/components/TotalBalance";
import ToggleSwitch from "@/components/Utility/ToggleSwitch";
import ChannelList from "@/components/Channels/List";
import ChannelOpen from "@/components/Channels/Open";
import OffersModal from "@/views/Home/OffersModal";
import PeersModal from "@/views/Home/PeersModal";
import MacaroonsModal from "@/views/Home/MacaroonsModal";
import MobileAppModal from "@/views/Home/MobileAppModal";
import MempoolModal from "@/views/Home/MempoolModal";
import BitcoinInvoicesModal from "@/views/Home/BitcoinInvoicesModal";
import BridgeModal from "@/views/Home/BridgeModal";
import ChannelManage from "@/components/Channels/Manage";

// A channel's identity across resizes: the outpoint it was opened with.
const channelKey = channel =>
  (channel && (channel.originalChannelPoint || channel.channelPoint)) || "";

import AdvancedSettingsModal from "./AdvancedSettingsModal.vue";
import NodeIdModal from "./NodeIdModal.vue";
import SecretWordsModal from "./SecretWordsModal.vue";
import ConnectWalletModal from "./ConnectWalletModal";
import OnboardingModal from "./OnboardingModal/OnboardingModal.vue";
import RecoveryChannels from '@/views/Home/OnboardingModal/RecoveryChannels.vue';
import ChannelBackupModal from '@/views/Home/ChannelBackupModal.vue';

export default {
  data() {
    return {
      // The channel the details window shows, by the outpoint it was
      // opened with: a resize moves its funding output.
      selectedChannelKey: "",
      selectedChannelSnapshot: {},
      // An Add funds form to open in the details window, from the Open
      // Channel window: { direction, amount }.
      resizeRequest: null,
      // Each opening of the details window starts afresh.
      manageOpenings: 0,
      // Resizes in progress at the last poll, to tell when one finishes.
      pendingResizes: {},
      showRecoverChannelsModal: false,
      showAdvancedSettingsModal: false,
      showChannelBackupModal: false,
      currencyChangeId: 0,
      // The picker's own value: follows the currency in effect, and is put
      // back when a switch fails, so it never shows a choice that is not.
      selectedCurrency: "USD"
    };
  },
  computed: {
    // The chosen channel as of the latest poll, so the details window
    // follows a resize; the snapshot while the list is loading or after
    // the channel is gone.
    selectedChannel() {
      const key = this.selectedChannelKey;
      const current = key && (this.channels || []).find(c => channelKey(c) === key);
      return current || this.selectedChannelSnapshot;
    },
    ...mapState({
      isLndOperational: state => state.lightning.operational,
      lndVersion: state => state.lightning.version,
      recoveryInfo: state => state.lightning.recoveryInfo,
      numActiveChannels: state => state.lightning.numActiveChannels,
      maxReceive: state => state.lightning.maxReceive,
      maxSend: state => state.lightning.maxSend,
      numPeers: state => state.lightning.numPeers,
      alias: state => state.lightning.alias,
      color: state => state.lightning.color,
      authed: state => state.system.auth.authed,
      pubkey: state => state.lightning.pubkey,
      lndConnectUrls: state => state.lightning.lndConnectUrls,
      channels: state => state.lightning.channels,
      unit: state => state.system.unit,
      theme: state => state.system.theme,
      platform: state => state.system.platform,
      passwordEnabled: state => state.system.auth.passwordEnabled,
      currency: state => state.system.currency,
      supportedFiatCurrencies: state => state.system.supportedFiatCurrencies,
      onboarding: state => state.system.onboarding,
      channelBackupStatus: state => state.system.channelBackup.status
    }),
    channelBackupSummary() {
      const status = this.channelBackupStatus;
      if (!status) {
        return "";
      }
      if (!status.targets.length) {
        return `No backup target set: channel.backup stays on ${this.$store.getters["system/deviceNoun"]} only.`;
      }
      const names = status.targets.map(t => this.providerLabel(t.provider)).join(", ");
      const failures = status.state.failures || [];
      if (failures.length) {
        return `Backup to ${names} is failing: ${failures.map(f => f.message || `${this.providerLabel(f.target)} ${f.code}`).join("; ")}`;
      }
      if (status.state.lastSuccess) {
        return `Copied to ${names} ${moment(status.state.lastSuccess * 1000).fromNow()}.`;
      }
      if (!status.hasBackup) {
        return `Will copy to ${names} once LND has started and caught up with the chain.`;
      }
      return `Waiting to copy to ${names}.`;
    },
    // The color the node announces, a hex triplet from lnd.conf; anything
    // else is not painted.
    nodeColor() {
      return /^#[0-9a-fA-F]{6}$/.test(this.color || "") ? this.color : "";
    },
    isStartOS() {
      return this.platform === "startos";
    },
    currencyOptions() {
      const options = this.supportedFiatCurrencies.map(currency => ({
        text: currency,
        value: currency
      }));
      if (!this.supportedFiatCurrencies.includes(this.currency)) {
        // The saved choice is not convertible right now (the conversion
        // table is unreachable); keep it selectable so it survives the outage.
        options.push({
          text: `${this.currency} (unavailable)`,
          value: this.currency
        });
      }
      return options;
    }
  },
  methods: {
    getReadableTime(timestamp) {
      return moment(timestamp).format("MMM D, h:mm:ss a");
    },
    providerLabel(provider) {
      return { sftp: "SFTP", nextcloud: "Nextcloud", dropbox: "Dropbox", gdrive: "Google Drive" }[provider] || provider;
    },
    openChannelBackupModal() {
      this.showChannelBackupModal = true;
    },
    signOut() {
      this.$store.dispatch("system/logout");
    },
    toggleTheme(isDark) {
      this.$store.dispatch("system/changeTheme", isDark ? "dark" : "light");
    },
    async changeCurrency(currency) {
      const currencyChangeId = this.currencyChangeId + 1;
      this.currencyChangeId = currencyChangeId;

      const quote = await this.$store.dispatch("bitcoin/getPrice", currency);
      if (currencyChangeId !== this.currencyChangeId) {
        // A later choice superseded this one.
        return;
      }
      if (quote === null) {
        this.selectedCurrency = this.currency;
        this.$bvToast.toast(
          `No quote for ${currency} right now. Keeping ${this.currency}.`,
          {
            title: "Fiat currency",
            autoHideDelay: 5000,
            variant: "warning",
            solid: true,
            toaster: "b-toaster-bottom-right"
          }
        );
        return;
      }
      // Price and currency move together, so no poll can split them.
      this.$store.commit("bitcoin/price", { currency, price: quote });
      this.$store.dispatch("system/changeCurrency", currency);
    },
    async downloadChannelBackup() {
      await API.download(
        `${process.env.VUE_APP_API_BASE_URL}/v1/lnd/util/download-channel-backup`,
        {},
        true,
        "lightning-fork-channels.backup"
      );
    },
    openAdvancedSettingsModal() {
      this.showAdvancedSettingsModal = true;
      this.$nextTick(() => {
        this.$bvModal.show("advanced-settings-modal");
      });
    },
    recoverChannels() {
      this.showRecoverChannelsModal = true;
      this.$nextTick(() => this.$bvModal.show("recover-channels-modal"));
    },
    closeRecoverChannelsModal() {
      this.$bvModal.hide("recover-channels-modal");
    },
    channelRecoveryInitiated() {
      this.$bvToast.toast("Once your channels start closing, it may take upto 2 days for the funds to arrive in your Bitcoin (on-chain) wallet.", {
        title: "Channel recovery initiated",
        autoHideDelay: 6000,
        variant: "success",
        solid: true,
        toaster: "b-toaster-bottom-right",
      });
      return this.closeRecoverChannelsModal();
    },
    onAddToChannel({ channel, amount }) {
      this.$refs["open-channel-modal"].hide();
      this.resizeRequest = { direction: "in", amount };
      this.manageChannel(channel, true);
    },
    manageChannel(channel, keepRequest) {
      if (!keepRequest) {
        this.resizeRequest = null;
      }
      if (channel) {
        this.manageOpenings += 1;
        this.selectedChannelKey = channelKey(channel);
        this.selectedChannelSnapshot = channel;
        this.$refs["manage-channel-modal"].show();
      }
    },
    onChannelResize() {
      this.$store.dispatch("lightning/getChannels");
      this.$store.dispatch("bitcoin/getBalance");
      this.$store.dispatch("bitcoin/getTransactions");
    },
    openSettingsFromChannel() {
      this.$refs["manage-channel-modal"].hide();
      this.openAdvancedSettingsModal();
    },
    // A toast when a resize this page watched locks.
    noticeResizes(channels) {
      const pending = {};
      for (const channel of channels || []) {
        const key = channelKey(channel);
        if (channel.pendingSplice && !channel.pendingSplice.dead) {
          pending[key] = true;
        } else if (
          this.pendingResizes[key] &&
          channel.lastSplice &&
          channel.lastSplice.outcome === "locked"
        ) {
          const size = Number(channel.capacity).toLocaleString();
          const name = peerName(channel);
          const peer = name ? ` with ${name}` : "";
          this.$bvToast.toast(`Your channel${peer} is now ${size} sats.`, {
            title: "Channel resized",
            autoHideDelay: 5000,
            variant: "success",
            solid: true,
            toaster: "b-toaster-bottom-right",
          });
        }
      }
      this.pendingResizes = pending;
    },
    onChannelOpen() {
      //refresh channels, balance and txs
      this.fetchData();
      this.$refs["open-channel-modal"].hide();

      //refresh bitcoin balance and txs
      this.$store.dispatch("bitcoin/getBalance");
      this.$store.dispatch("bitcoin/getTransactions");
    },
    onChannelClose() {
      //refresh channels, balance and txs
      this.fetchData();
      this.$refs["manage-channel-modal"].hide();

      //refresh bitcoin balance and txs
      this.$store.dispatch("bitcoin/getBalance");
      this.$store.dispatch("bitcoin/getTransactions");
    },
    fetchData() {
      this.$store.dispatch("system/getUnit");
      this.$store.dispatch("bitcoin/getPrice");
      this.$store.dispatch("bitcoin/getSync");
      this.$store.dispatch("bitcoin/getBalance");
      this.$store.dispatch("bitcoin/getTransactions");
      this.$store.dispatch("lightning/getSync");
      this.$store.dispatch("lightning/getRecoveryInfo");
      this.$store.dispatch("lightning/getTransactions");
      this.$store.dispatch("lightning/getChannels");
      this.$store.dispatch("lightning/getLndPageData");
      this.$store.dispatch("system/getLocalExplorerUrl");
      this.$store.dispatch("system/getMempool");
      if (!this.isStartOS) {
        this.$store.dispatch("system/getChannelBackupStatus");
      }
    },
    // What changes on its own while the page is open: balances, channels
    // and their states, transactions, sync. Requests in flight are not
    // repeated (the API helper answers a second call for the same URL
    // with the first), so a slow node is not asked twice.
    refreshData() {
      if (document.hidden || !this.authed) {
        return;
      }
      this.$store.dispatch("bitcoin/getSync");
      this.$store.dispatch("bitcoin/getBalance");
      this.$store.dispatch("bitcoin/getTransactions");
      this.$store.dispatch("lightning/getSync");
      this.$store.dispatch("lightning/getTransactions");
      this.$store.dispatch("lightning/getLndPageData");
    },
    onVisible() {
      if (!document.hidden) {
        this.refreshData();
      }
    }
  },
  async created() {
    await this.$store.dispatch("system/getCurrency");
    this.$store.dispatch("system/getCurrencies");
    // The backend caches the feeds, so this is one cheap request a minute.
    this.priceInterval = window.setInterval(
      () => this.$store.dispatch("bitcoin/getPrice"),
      60000
    );
    // Balances, channels and transactions keep up with the node on their
    // own, every ten seconds while the tab is visible, and at once when
    // it becomes visible again.
    this.dataInterval = window.setInterval(this.refreshData, 10000);
    document.addEventListener("visibilitychange", this.onVisible);

    if (this.isStartOS) {
      // Wallet setup, LND configuration and backups are StartOS's, so the
      // page needs none of the state behind them.
      await this.fetchData();
      return;
    }

    await Promise.all([
      this.fetchData(),
      this.$store.dispatch("user/getLndConfig")
    ]);

    if (this.onboarding) {
      this.$bvModal.show("onboarding-modal");
    }

    // A failing target is worth a word once per visit; the menu keeps saying so.
    await this.$store.dispatch("system/getChannelBackupStatus");
    const status = this.channelBackupStatus;
    if (!this.onboarding && status && status.targets.length && status.state.failures.length) {
      this.$bvToast.toast(this.channelBackupSummary, {
        title: "Channel backups",
        autoHideDelay: 8000,
        variant: "warning",
        solid: true,
        toaster: "b-toaster-bottom-right"
      });
    }
  },
  beforeDestroy() {
    window.clearInterval(this.dataInterval);
    window.clearInterval(this.priceInterval);
    document.removeEventListener("visibilitychange", this.onVisible);
  },
  watch: {
    channels: function(channels) {
      this.noticeResizes(channels);
    },
    currency: {
      handler: function(currency) {
        this.selectedCurrency = currency;
      },
      immediate: true
    },
    onboarding: function(newVal, oldVal) {
      // Refresh data when onboarding completes. The initial fetchData() call
      // happens before the wallet exists, so the store has stale loading values.
      if (oldVal === true && newVal === false) {
        this.fetchData();
      }
    },
    password: function() {
      this.isIncorrectPassword = false;
    }
  },
  components: {
    BitcoinWallet,
    LightningWallet,
    TotalBalance,
    CardWidget,
    Stat,
    ToggleSwitch,
    ChannelList,
    ChannelOpen,
    ChannelManage,
    OffersModal,
    PeersModal,
    MacaroonsModal,
    MobileAppModal,
    MempoolModal,
    BitcoinInvoicesModal,
    BridgeModal,
    AdvancedSettingsModal,
    NodeIdModal,
    SecretWordsModal,
    ConnectWalletModal,
    OnboardingModal,
    RecoveryChannels,
    ChannelBackupModal
  }
};
</script>

<style lang="scss" scoped>
// The peer count opens the Peers view; say so only on hover.
.peers-stat {
  cursor: pointer;
  border-radius: 0.5rem;
  &:hover,
  &:focus {
    background: rgba(127, 127, 127, 0.08);
  }
}
.app-icon {
  height: 120px;
  width: 120px;
  border-radius: 22%;
}

.currency-select {
  max-width: 90px;
}

.node-color-dot {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1px solid rgba(128, 128, 128, 0.4);
  flex: 0 0 auto;
}
.node-alias {
  overflow-wrap: anywhere;
}

.btn-border {
  border: solid 1px !important;
}
</style>
