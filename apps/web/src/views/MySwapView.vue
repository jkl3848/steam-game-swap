<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import GameSearchCombobox, { type WishlistGame } from "../components/GameSearchCombobox.vue";
import StatusBadge from "../components/StatusBadge.vue";

const route = useRoute();
const code = computed(() => String(route.params.code).toUpperCase());

const page = ref<{
  swap: Record<string, unknown>;
  participant: Record<string, unknown>;
  wishlist: WishlistGame[];
  canEditWishlist: boolean;
} | null>(null);

const assignment = ref<{
  receiver: { firstName: string; steamUsername: string; discordTag: string | null };
  wishlist: WishlistGame[];
  sentAt: string | null;
  priceMin: number | null;
  priceMax: number | null;
} | null>(null);

const wishlistEdit = ref<WishlistGame[]>([]);
const saving = ref(false);
const error = ref("");

onMounted(async () => {
  const token = route.params.token as string | undefined;
  if (token) {
    await api.post(`/api/swaps/${code.value}/session`, { token });
  }
  await load();
});

async function load() {
  try {
    const [me, assign] = await Promise.all([
      api.get<typeof page.value>(`/api/swaps/${code.value}/me`),
      api.get<{ assignment: typeof assignment.value }>(`/api/swaps/${code.value}/my-assignment`),
    ]);
    page.value = me;
    wishlistEdit.value = (me?.wishlist ?? []).map((w) => ({
      steamAppId: w.steamAppId,
      name: w.name,
      storeUrl: w.storeUrl,
      priceHint: w.priceHint ?? undefined,
    }));
    assignment.value = assign.assignment;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not load your page";
  }
}

async function saveWishlist() {
  saving.value = true;
  try {
    await api.put(`/api/swaps/${code.value}/me/wishlist`, { items: wishlistEdit.value });
    await load();
  } finally {
    saving.value = false;
  }
}

async function markSent() {
  await api.post(`/api/swaps/${code.value}/mark-sent`);
  await load();
}
</script>

<template>
  <div v-if="error" class="text-red-400">{{ error }}</div>
  <div v-else-if="!page" class="text-slate-500">Loading...</div>
  <div v-else class="space-y-8 max-w-lg mx-auto">
    <header>
      <h1 class="font-display text-3xl font-bold">{{ page.swap.title }}</h1>
      <StatusBadge :status="String(page.swap.status)" class="mt-2" />
    </header>

    <section v-if="assignment" class="p-6 rounded-xl border border-steam/30 bg-steam/5 space-y-4">
      <h2 class="font-display text-xl font-semibold text-steam">Your giftee</h2>
      <p class="text-lg">
        <strong>{{ assignment.receiver.firstName }}</strong>
        · Steam: {{ assignment.receiver.steamUsername }}
        <span v-if="assignment.receiver.discordTag"> · {{ assignment.receiver.discordTag }}</span>
      </p>
      <p
        v-if="assignment.priceMin != null || assignment.priceMax != null"
        class="text-slate-400 text-sm"
      >
        Price range: ${{ assignment.priceMin ?? "—" }} – ${{ assignment.priceMax ?? "—" }}
      </p>
      <h3 class="font-semibold text-sm text-slate-400">Wishlist</h3>
      <ul class="space-y-2">
        <li v-for="game in assignment.wishlist" :key="game.steamAppId">
          <a :href="game.storeUrl" target="_blank" rel="noopener" class="text-steam hover:underline">
            {{ game.name }}
          </a>
        </li>
        <li v-if="!assignment.wishlist.length" class="text-slate-500">No games listed</li>
      </ul>
      <button
        v-if="!assignment.sentAt"
        type="button"
        class="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold"
        @click="markSent"
      >
        Mark gift as sent
      </button>
      <p v-else class="text-emerald-400 text-sm">Gift marked sent ✓</p>
    </section>

    <section v-else-if="page.swap.status === 'matched'" class="text-slate-500">
      No assignment found for you.
    </section>

    <section v-if="page.canEditWishlist" class="space-y-4">
      <h2 class="font-display text-lg font-semibold">Your wishlist</h2>
      <GameSearchCombobox v-model="wishlistEdit" :swap-code="code" />
      <button
        type="button"
        class="px-4 py-2 rounded-lg bg-steam text-slate-950 font-semibold disabled:opacity-50"
        :disabled="saving"
        @click="saveWishlist"
      >
        Save wishlist
      </button>
    </section>

    <section v-else class="text-slate-500 text-sm">
      <p>Hi {{ page.participant.firstName }} — signups are closed. Check back after matching!</p>
    </section>
  </div>
</template>
