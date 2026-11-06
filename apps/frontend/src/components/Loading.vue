<template>
  <div
    class="d-flex flex-column align-items-center justify-content-center min-vh100 p-2"
  >
    <img alt="Lightning XBT" src="@/assets/icon.png" class="mb-5 logo" />

    <!-- <b-spinner class="my-4" variant="primary"></b-spinner> -->
    <small v-if="isRestarting" class="text-muted mb-3">Restarting...</small>
    <b-progress
      :value="progress"
      class="mb-2 w-75"
      variant="purple"
      :style="{ height: '4px', maxWidth: '360px' }"
    ></b-progress>
    <slot></slot>
    <div class="loading-footer text-center d-flex flex-column align-items-center py-4">
      <!-- <span class="loading-footer-text-top text-muted">By</span> -->
      <span class="loading-footer-text-top text-primary font-weight-bold mt-2">Lightning XBT</span>
      <span class="chain-badge mt-1">Bitcoin BLAKE2b chain</span>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      isRestarting: false
    };
  },
  props: { progress: Number },
  created() {
    if (this.$route.query.hasOwnProperty("restart")) {
      this.isRestarting = true;
      this.$router.replace({ query: {} });
    }
  },
  methods: {},
  components: {}
};
</script>

<style lang="scss">
.logo {
  height: 18vh;
  max-height: 200px;
  width: auto;
  border-radius: 22%;
}
.loading-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  .loading-footer-logo {
    height: 30px;
  }
}
</style>
