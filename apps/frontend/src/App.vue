<template>
  <div id="app">
    <transition name="loading" mode>
      <div v-if="isIframe">
        <div
          class="d-flex flex-column align-items-center justify-content-center min-vh100 p-2"
        >
          <img alt="Lightning XBT" src="@/assets/icon.png" class="mb-5 logo" />
          <span class="text-muted w-75 text-center">
            <small
              >For security reasons this app cannot be embedded in an
              iframe.</small
            >
          </span>
        </div>
      </div>
      <login v-else-if="showLogin" @signed-in="onSignedIn"></login>
      <loading v-else-if="loading" :progress="loadingProgress">
        <small v-if="loadingMessage" class="text-muted text-center mt-2 w-75">{{
          loadingMessage
        }}</small>
      </loading>
      <!-- component matched by the route will render here -->
      <router-view v-else></router-view>
    </transition>
  </div>
</template>

<style lang="scss">
@import "@/global-styles/design-system.scss";
</style>

<script>
import { mapState } from "vuex";
import Loading from "@/components/Loading";
import Login from "@/components/Login";

export default {
  name: "App",
  data() {
    return {
      isIframe: window.self !== window.top,
      loading: true,
      loadingProgress: 0,
      loadingPollInProgress: false,
      platformKnown: false
    };
  },
  computed: {
    ...mapState({
      isApiOperational: state => state.system.api.operational,
      isLightningOperational: state => state.lightning.operational,
      theme: state => state.system.theme,
      platform: state => state.system.platform,
      auth: state => state.system.auth
    }),
    showLogin() {
      return this.auth.known && this.auth.passwordEnabled && !this.auth.authed;
    },
    isStartOS() {
      return this.platform === "startos";
    },
    loadingMessage() {
      // On StartOS the package unlocks the wallet, except in Cold Storage
      // Mode, where the user does. Say so rather than spin without a word.
      if (this.isStartOS && this.isApiOperational && !this.isLightningOperational) {
        return "Waiting for the node. If Cold Storage Mode is on, run Unlock Wallet in StartOS.";
      }
      return "";
    }
  },
  methods: {
    applyTheme(theme) {
      const isDark = theme === "dark";
      document.body.classList.toggle("theme-dark", isDark);
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    },
    updateViewPortHeightCSS() {
      return document.documentElement.style.setProperty(
        "--vh100",
        `${window.innerHeight}px`
      );
    },
    onSignedIn() {
      // Start the checks over: the API and node were unreachable to this
      // browser until now.
      this.loadingProgress = 0;
      this.loading = true;
      this.getLoadingStatus();
    },
    async getLoadingStatus() {
      // Skip if previous poll in progress
      if (this.loadingPollInProgress) {
        return;
      }

      this.loadingPollInProgress = true;

      // Once the page is up, the poll's other checks are behind it, so
      // each round asks the sign-in gate whether the session still stands.
      // The gate's state is public and cheap. An ended session, or a
      // password changed under the page, brings the sign-in screen back
      // rather than leaving a page that quietly stopped updating.
      if (this.loadingProgress > 40 && this.platformKnown) {
        await this.$store.dispatch("system/getAuthState");
        if (this.showLogin) {
          this.loading = true;
          this.loadingPollInProgress = false;
          return;
        }
      }

      // Check if the API is up
      if (this.loadingProgress <= 40) {
        this.loadingProgress = 40;
        // Which platform first: it decides which of the rest to ask for.
        // Asked again until it answers, so one failed request cannot leave
        // a StartOS page dressed as Umbrel's.
        if (!this.platformKnown) {
          this.platformKnown = await this.$store.dispatch("system/getPlatform");
        }
        // Then whether this browser may see anything: the sign-in screen
        // takes over until it does, and the poll waits with it.
        await this.$store.dispatch("system/getAuthState");
        if (this.showLogin) {
          this.loading = true;
          this.loadingPollInProgress = false;
          return;
        }
        await Promise.all([
          this.$store.dispatch("system/getApi"),
          ...(this.isStartOS
            ? []
            : [
                this.$store.dispatch("system/getOnboardingStatus"),
                this.$store.dispatch("system/getSeedExists"),
              ]),
        ]);
        if (!this.isApiOperational) {
          this.loading = true;
          this.loadingPollInProgress = false;
          return;
        }
      }

      // Check if LND is up
      if (this.loadingProgress <= 60) {
        this.loadingProgress = 60;
        await this.$store.dispatch("lightning/getStatus");
        if (!this.isLightningOperational) {
          this.loading = true;
          this.loadingPollInProgress = false;
          return;
        }
      }

      this.loadingProgress = 100;
      this.loadingPollInProgress = false;

      // Add slight delay so the progress bar makes
      // it to 100% before disappearing
      setTimeout(() => (this.loading = false), 300);
    },
  },
  created() {
    this.$store.dispatch("system/getTheme");
    //for 100vh consistency
    this.updateViewPortHeightCSS();
    window.addEventListener("resize", this.updateViewPortHeightCSS);
  },
  watch: {
    loading: {
      handler: function(isLoading) {
        window.clearInterval(this.loadingInterval);
        //if loading, check loading status every two seconds
        if (isLoading) {
          this.loadingInterval = window.setInterval(
            this.getLoadingStatus,
            2000
          );
        } else {
          //else check every 20s
          this.loadingInterval = window.setInterval(
            this.getLoadingStatus,
            20000
          );
        }
      },
      immediate: true,
    },
    theme: {
      handler: function(theme) {
        this.applyTheme(theme);
      },
      immediate: true
    },
    showLogin: function(needed) {
      if (needed) {
        this.loading = true;
        this.loadingProgress = 0;
      }
    },
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.updateViewPortHeightCSS);
    window.clearInterval(this.loadingInterval);
  },
  components: {
    Loading,
    Login,
  },
};
</script>

<style lang="scss" scoped>
// Loading transitions

.loading-enter-active,
.loading-leave-active {
  transition: opacity 0.4s ease;
}
.loading-enter {
  opacity: 0;
  // filter: blur(70px);
}
.loading-enter-to {
  opacity: 1;
  // filter: blur(0);
}
.loading-leave {
  opacity: 1;
  // filter: blur(0);
}
.loading-leave-to {
  opacity: 0;
  // filter: blur(70px);
}

.system-alert {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
}
</style>
