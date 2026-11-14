<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { api, discordLoginUrl } from "../api";

const router = useRouter();
const user = ref<{ displayName?: string; avatarUrl?: string } | null>(null);

onMounted(async () => {
  try {
    const res = await api.get<{ user: typeof user.value }>("/api/auth/me");
    user.value = res.user;
  } catch {
    user.value = null;
  }
});

async function logout() {
  await api.post("/api/auth/logout");
  user.value = null;
  router.push("/");
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
    <main class="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
      <slot />
    </main>
    <footer class="border-t border-white/10 py-6 text-center text-slate-500 text-sm">
      Secret Santa for Steam games · Your data stays scoped to each swap
    </footer>
  </div>
</template>
