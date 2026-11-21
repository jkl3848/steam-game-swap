<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, discordLoginUrl } from "../api";

const route = useRoute();
const router = useRouter();
const user = ref<{ displayName?: string; avatarUrl?: string } | null>(null);
const actingAs = ref<{ firstName: string; code: string } | null>(null);

onMounted(loadMe);
watch(() => route.fullPath, () => {
  void loadMe();
});

async function loadMe() {
  try {
    const res = await api.get<{
      user: typeof user.value;
      actingAs: { firstName: string; code: string } | null;
    }>("/api/auth/me");
    user.value = res.user;
    actingAs.value = res.actingAs;
  } catch {
    user.value = null;
    actingAs.value = null;
  }
}

async function logout() {
  await api.post("/api/auth/logout");
  user.value = null;
  actingAs.value = null;
  router.push("/");
}

async function leaveSwap() {
  if (user.value) {
    const ok = window.confirm(
      "Leave this swap view? Your Discord login stays signed in.",
    );
    if (!ok) return;
  }
  await api.post("/api/auth/dev/stop-acting");
  actingAs.value = null;
  router.push(user.value ? "/dashboard" : "/");
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-white/10 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
      <div class="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <RouterLink to="/" class="font-display text-xl font-bold tracking-wide text-steam">
          Steam Game Swap
        </RouterLink>
        <nav class="flex items-center gap-3 text-sm">
          <RouterLink to="/join" class="text-slate-400 hover:text-white transition">Join</RouterLink>
          <template v-if="user">
            <RouterLink to="/dashboard" class="text-slate-400 hover:text-white transition">Dashboard</RouterLink>
            <button
              type="button"
              class="text-slate-500 hover:text-white transition"
              @click="logout"
            >
              Log out
            </button>
          </template>
          <a
            v-else
            :href="discordLoginUrl()"
            class="px-3 py-1.5 rounded bg-[#5865F2] hover:bg-[#4752c4] text-white font-medium transition"
          >
            Sign in with Discord
          </a>
        </nav>
      </div>
    </header>
    <div
      v-if="actingAs"
      class="bg-amber-500/10 border-b border-amber-500/30 text-amber-100 text-sm"
    >
      <div class="max-w-5xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2">
        <p>
          Viewing the swap as <strong>{{ actingAs.firstName }}</strong>.
          <template v-if="user">Your creator login is still active.</template>
        </p>
        <span class="flex items-center gap-3">
          <RouterLink :to="`/s/${actingAs.code}/me`" class="underline">Their page</RouterLink>
          <RouterLink :to="`/swap/${actingAs.code}/manage`" class="underline">Manage</RouterLink>
          <button type="button" class="underline" @click="leaveSwap">
            {{ user ? "Leave swap" : "Stop" }}
          </button>
        </span>
      </div>
    </div>
    <main class="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
      <slot />
    </main>
    <footer class="border-t border-white/10 py-6 text-center text-slate-500 text-sm">
      Gift swaps for Steam games · Your data stays scoped to each swap
    </footer>
  </div>
</template>
