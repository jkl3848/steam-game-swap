<script setup lang="ts">
import { useRoute } from "vue-router";
import { discordLoginUrl } from "../api";

const route = useRoute();
const showLogin = route.query.login === "1";
</script>

<template>
  <section class="text-center space-y-8 py-12">
    <h1 class="font-display text-5xl md:text-6xl font-bold tracking-tight">
      Secret Santa for
      <span class="text-steam">Steam</span> games
    </h1>
    <p class="text-slate-400 text-lg max-w-xl mx-auto">
      Create a swap, invite friends with a code, set blackouts, and get matched.
      Everyone learns who they're gifting — not who got them.
    </p>
  </section>

  <div v-if="showLogin" class="mb-6 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-center">
    Sign in with Discord to create a swap.
  </div>

  <div class="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
    <RouterLink
      to="/create"
      class="group p-6 rounded-xl border border-white/10 bg-slate-900/50 hover:border-steam/50 hover:bg-slate-900 transition"
    >
      <h2 class="font-display text-2xl font-semibold text-steam mb-2">Create a swap</h2>
      <p class="text-slate-400 text-sm">Set dates, price rules, and share your join link.</p>
    </RouterLink>
    <RouterLink
      to="/join"
      class="group p-6 rounded-xl border border-white/10 bg-slate-900/50 hover:border-steam/50 hover:bg-slate-900 transition"
    >
      <h2 class="font-display text-2xl font-semibold mb-2">Join a swap</h2>
      <p class="text-slate-400 text-sm">Enter a code, connect Discord, and build your wishlist.</p>
    </RouterLink>
  </div>

  <p class="text-center mt-10">
    <a :href="discordLoginUrl()" class="text-steam hover:underline">Sign in with Discord</a>
    to manage your swaps
  </p>
</template>
