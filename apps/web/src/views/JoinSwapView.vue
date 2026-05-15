<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, discordLinkUrl } from "../api";
import GameSearchCombobox, { type WishlistGame } from "../components/GameSearchCombobox.vue";

const route = useRoute();
const router = useRouter();

const code = ref(String(route.params.code ?? "").toUpperCase());
const swapInfo = ref<{ title: string; canJoin: boolean } | null>(null);
const config = ref<{ botInviteUrl: string } | null>(null);

const form = ref({
  firstName: "",
  steamUsername: "",
  discordUserId: "",
  discordTag: "",
});
const wishlist = ref<WishlistGame[]>([]);
const error = ref("");
const successUrl = ref("");

const discordConnected = computed(() => !!form.value.discordUserId);

onMounted(async () => {
  const [cfg] = await Promise.all([
    api.get<{ botInviteUrl: string }>("/api/auth/config").catch(() => null),
    loadSwap(),
  ]);
  if (cfg) config.value = cfg;

  const q = route.query;
  if (q.discordId) form.value.discordUserId = String(q.discordId);
  if (q.discordTag) form.value.discordTag = String(q.discordTag);
});

watch(
  () => route.params.code,
  (c) => {
    code.value = String(c ?? "").toUpperCase();
    loadSwap();
  },
);

async function loadSwap() {
  if (!code.value) return;
  try {
    const res = await api.get<{ swap: { title: string; canJoin: boolean } }>(
      `/api/swaps/${code.value}`,
    );
    swapInfo.value = res.swap;
  } catch {
    swapInfo.value = null;
  }
}

async function submit() {
  error.value = "";
  if (!form.value.discordUserId) {
    error.value = "Connect Discord first";
    return;
  }
  try {
    const res = await api.post<{ participantUrl: string }>(
      `/api/swaps/${code.value}/join`,
      { ...form.value, wishlist: wishlist.value },
    );
    successUrl.value = res.participantUrl;
    localStorage.setItem(`sgs_${code.value}`, res.participantUrl);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Join failed";
  }
}

function goToMyPage() {
  router.push(`/s/${code.value}/me`);
}
</script>

<template>
  <div class="max-w-lg mx-auto space-y-6">
    <h1 class="font-display text-3xl font-bold">Join swap</h1>

    <label class="block space-y-1">
      <span class="text-sm text-slate-400">Swap code</span>
      <input
        v-model="code"
        class="input font-mono uppercase"
        placeholder="ABCD12"
        maxlength="6"
        @blur="loadSwap"
      />
    </label>

    <p v-if="swapInfo" class="text-steam">{{ swapInfo.title }}</p>
    <p v-else-if="code" class="text-red-400 text-sm">Swap not found</p>

    <template v-if="successUrl">
      <div class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
        <p class="text-emerald-300">You're in! Save this link — it's your private page:</p>
        <code class="block text-sm break-all text-steam">{{ successUrl }}</code>
        <button type="button" class="w-full py-2 rounded-lg bg-steam text-slate-950 font-semibold" @click="goToMyPage">
          Go to my swap page
        </button>
      </div>
    </template>

    <form v-else-if="swapInfo?.canJoin" class="space-y-4" @submit.prevent="submit">
      <section class="p-4 rounded-xl border border-[#5865F2]/30 bg-[#5865F2]/5 space-y-2">
        <h2 class="font-semibold text-sm">Discord required</h2>
        <p class="text-slate-400 text-xs">
          Join our server so the bot can DM you when matches are ready.
        </p>
        <a
          v-if="config?.botInviteUrl"
          :href="config.botInviteUrl"
          target="_blank"
          rel="noopener"
          class="inline-block text-sm text-[#5865F2] hover:underline"
        >
          Join Discord server →
        </a>
        <a
          v-if="code"
          :href="discordLinkUrl(code)"
          class="block w-full text-center py-2 rounded bg-[#5865F2] text-white font-medium"
        >
          {{ discordConnected ? "Discord connected ✓" : "Connect Discord" }}
        </a>
      </section>

      <label class="block space-y-1">
        <span class="text-sm text-slate-400">First name</span>
        <input v-model="form.firstName" required class="input" />
      </label>
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Steam username</span>
        <input v-model="form.steamUsername" required class="input" placeholder="your_steam_name" />
      </label>

      <div>
        <span class="text-sm text-slate-400 block mb-2">Wishlist</span>
        <GameSearchCombobox v-model="wishlist" :swap-code="code" />
      </div>

      <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>
      <button
        type="submit"
        class="w-full py-2.5 rounded-lg bg-steam text-slate-950 font-semibold disabled:opacity-50"
        :disabled="!discordConnected"
      >
        Join swap
      </button>
    </form>

    <p v-else-if="swapInfo && !swapInfo.canJoin" class="text-amber-400">
      This swap is not accepting new signups.
    </p>
  </div>
</template>
