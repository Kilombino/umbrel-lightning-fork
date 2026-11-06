<template>
  <b-modal id="mempool-modal" size="md" centered hide-footer @show="load">
    <template v-slot:modal-header="{ close }">
      <div class="px-2 px-sm-3 pt-2 d-flex justify-content-between w-100">
        <h3>Mempool app</h3>
        <a href="#" class="align-self-center" v-on:click.stop.prevent="close">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M13.6003 4.44197C13.3562 4.19789 12.9605 4.19789 12.7164 4.44197L9.02116 8.13721L5.32591 4.44197C5.08183 4.19789 4.68611 4.19789 4.44203 4.44197C4.19795 4.68605 4.19795 5.08178 4.44203 5.32585L8.13728 9.0211L4.44203 12.7163C4.19795 12.9604 4.19795 13.3561 4.44203 13.6002C4.68611 13.8443 5.08183 13.8443 5.32591 13.6002L9.02116 9.90499L12.7164 13.6002C12.9605 13.8443 13.3562 13.8443 13.6003 13.6002C13.8444 13.3561 13.8444 12.9604 13.6003 12.7163L9.90505 9.0211L13.6003 5.32585C13.8444 5.08178 13.8444 4.68605 13.6003 4.44197Z" fill="#6c757d"/>
          </svg>
        </a>
      </div>
    </template>
    <div class="px-2 px-sm-3 pb-2">
      <p class="text-muted">
        Fee rates for sending and for opening channels, and the links behind
        transactions, come from the Mempool you choose. The rates are the ones
        its own page shows: Low, Medium and High priority. It has to follow
        this node's chain.
      </p>
      <b-form-radio-group v-model="choice" stacked class="mb-3" :disabled="saving">
        <b-form-radio value="" class="mb-2">
          <span class="font-bold">Your node's own estimate</span>
          <small class="d-block text-muted">
            No app, and no public site asked for rates. Transactions link to
            mempool.guide, a public explorer for this chain, after asking.
          </small>
        </b-form-radio>
        <!-- Opt-in only: asking a public site tells it the node's address.
             Mainnet only. -->
        <b-form-radio v-if="publicSource" :value="publicSource.id" class="mb-2">
          <span class="font-bold">{{ publicSource.name }}</span>
          <small class="d-block text-muted">
            The rates {{ publicSource.name }}, the public explorer for this
            chain, shows, as you would see them there; your node's own estimate
            whenever it does not answer. Asking it tells it your node's
            address, as visiting it would.
          </small>
        </b-form-radio>
        <b-form-radio
          v-for="app in apps"
          :key="app.id"
          :value="app.id"
          :disabled="app.chain === 'other'"
          class="mb-2"
        >
          <span class="font-bold">{{ app.name }}</span>
          <small class="d-block text-muted">{{ describe(app) }}</small>
          <small v-if="app.chain === 'other'" class="d-block text-danger">
            Follows the other chain: its node is on the SHA256 chain, so its
            fee rates and transactions are that chain's. Point it at a node on
            the BLAKE2b chain to use it here.
          </small>
          <small v-else-if="app.chain === 'unknown'" class="d-block text-warning">
            Did not say which chain it follows. It can still be chosen, but
            check that its node is on the BLAKE2b chain.
          </small>
        </b-form-radio>
      </b-form-radio-group>
      <b-alert :show="selectedOnOtherChain" variant="warning" class="small">
        {{ selectedName }} follows the other chain, so its fee rates and links
        are not being used: the dashboard is on your node's own estimate until
        you choose again.
      </b-alert>
      <p v-if="known && !apps.length" class="text-muted small">
        No Mempool app was found. Install Mempool Pruned, or Mempool on a node
        that follows the BLAKE2b chain, then restart Lightning XBT so it can
        reach the app.
      </p>
      <b-alert :show="Boolean(error)" variant="warning" class="small">{{ error }}</b-alert>
      <b-alert :show="Boolean(checked)" variant="success" class="small">{{ checked }}</b-alert>
      <div class="d-flex justify-content-end">
        <b-button variant="success" :disabled="saving || choice === selected" @click="save">
          {{ saving ? "Saving..." : "Save" }}
        </b-button>
      </div>
    </div>
  </b-modal>
</template>

<script>
import { mapState } from "vuex";

// Which Mempool app answers for fee rates and transaction links. The
// wrapper tells the dashboard which apps it can reach; the choice is
// kept on the node.
export default {
  data() {
    return {
      choice: "",
      saving: false,
      error: "",
      checked: ""
    };
  },
  computed: {
    selectedApp() {
      return this.apps.find(app => app.id === this.selected) || null;
    },
    selectedOnOtherChain() {
      return Boolean(this.selectedApp && this.selectedApp.chain === "other");
    },
    selectedName() {
      return this.selectedApp ? this.selectedApp.name : "";
    },
    ...mapState({
      selected: state => state.system.mempool.selected,
      apps: state => state.system.mempool.apps,
      known: state => state.system.mempool.known,
      mempoolFees: state => state.bitcoin.mempoolFees,
      publicSource: state => state.system.mempool.publicSource,
      isStartOS: state => state.system.platform === "startos"
    })
  },
  methods: {
    describe(app) {
      const where = app.uiUrl
        ? app.uiUrl.replace(/^https?:\/\//, "")
        : app.uiPort
        ? `port ${app.uiPort} on this host`
        : "installed";
      const chain = app.chain === "blake2b" ? " · on the BLAKE2b chain" : "";
      return `Installed: ${where}${chain}`;
    },
    async load() {
      this.error = "";
      this.checked = "";
      await this.$store.dispatch("system/getMempool");
      this.choice = this.selected;
      // The chain checks may have moved on since the page loaded: an app
      // now known to be on the other chain no longer backs the links.
      this.$store.dispatch("system/getLocalExplorerUrl");
    },
    async save() {
      this.saving = true;
      this.error = "";
      this.checked = "";
      const message = await this.$store.dispatch("system/setMempool", this.choice);
      if (message) {
        this.error = message;
        this.saving = false;
        return;
      }
      // Read the rates once now: a wrong address shows here rather than
      // at the moment of sending, and an open form drops the old app's.
      await this.$store.dispatch("bitcoin/getMempoolFees");
      if (this.choice) {
        const result = this.mempoolFees;
        if (result && result.fees) {
          const f = result.fees;
          this.checked = `${result.name} answers. Right now: low ${f.hourFee}, medium ${f.halfHourFee}, high ${f.fastestFee} sat/vB.`;
        } else {
          this.error =
            (result && result.error && `${result.error} Fees come from your node's estimate until it answers.`) ||
            "Saved, but it did not answer. Fees fall back to your node's estimate until it does.";
        }
      } else {
        this.checked = "Saved. Fees come from your node's estimate.";
      }
      this.saving = false;
    }
  }
};
</script>
