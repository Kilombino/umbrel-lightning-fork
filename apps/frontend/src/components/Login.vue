<template>
  <div
    class="d-flex flex-column align-items-center justify-content-center min-vh100 p-2"
  >
    <img alt="Lightning XBT" src="@/assets/icon.png" class="mb-4 logo" />
    <span class="text-primary font-weight-bold">Lightning XBT</span>
    <span class="chain-badge mt-1 mb-4">Bitcoin BLAKE2b chain</span>

    <b-form class="login-form" @submit.prevent="submit" novalidate>
      <!-- A username field, hidden, so password managers file the password
           under something; there is no username to check. -->
      <input
        type="text"
        name="username"
        autocomplete="username"
        value="lightning-fork"
        class="d-none"
        aria-hidden="true"
        tabindex="-1"
        readonly
      />
      <b-form-input
        ref="password"
        v-model="password"
        type="password"
        name="password"
        autocomplete="current-password"
        placeholder="Password"
        class="neu-input login-input"
        :disabled="busy"
        autofocus
      ></b-form-input>
      <b-button
        type="submit"
        variant="primary"
        class="w-100 mt-3"
        :disabled="busy || !password"
        >{{ busy ? "Signing in…" : "Sign in" }}</b-button
      >
      <small v-if="error" class="d-block text-danger text-center mt-3">{{
        error
      }}</small>
      <small
        v-if="$store.state.system.platform === 'native'"
        class="d-block text-muted text-center mt-3"
        >The password is in ~/.config/lightning-fork/dashboard-password.json
        on the computer that runs Lightning XBT.</small
      >
      <small v-else class="d-block text-muted text-center mt-3"
        >The password is in the Dashboard Password action on your StartOS
        server.</small
      >
    </b-form>
  </div>
</template>

<script>
export default {
  data() {
    return {
      password: "",
      busy: false,
      error: ""
    };
  },
  methods: {
    async submit() {
      if (!this.password || this.busy) {
        return;
      }
      this.busy = true;
      this.error = "";
      const message = await this.$store.dispatch("system/login", this.password);
      this.busy = false;
      if (message) {
        this.error = message;
        this.password = "";
        this.$nextTick(() => this.$refs.password && this.$refs.password.focus());
        return;
      }
      this.password = "";
      this.$emit("signed-in");
    }
  },
  mounted() {
    this.$nextTick(() => this.$refs.password && this.$refs.password.focus());
  }
};
</script>

<style lang="scss" scoped>
.logo {
  height: 120px;
  width: 120px;
  border-radius: 24px;
}
.login-form {
  width: 100%;
  max-width: 320px;
}
.login-input {
  text-align: center;
}
</style>
