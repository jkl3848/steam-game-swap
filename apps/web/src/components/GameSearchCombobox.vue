<script setup lang="ts">
import { ref, watch } from "vue";
import { api } from "../api";

export type WishlistGame = {
  steamAppId: number;
  name: string;
  storeUrl: string;
  priceHint?: string;
};

const props = defineProps<{
  modelValue: WishlistGame[];
  swapCode?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [WishlistGame[]] }>();

const query = ref("");
const results = ref<WishlistGame[]>([]);
const loading = ref(false);
let debounce: ReturnType<typeof setTimeout>;

watch(query, (q) => {
  clearTimeout(debounce);
  if (q.length < 2) {
    results.value = [];
    return;
  }
  debounce = setTimeout(async () => {
    loading.value = true;
    try {
      const res = await api.get<{ results: WishlistGame[] }>(
        `/api/steam/search?q=${encodeURIComponent(q)}`,
      );
      results.value = res.results;
    } finally {
      loading.value = false;
    }
  }, 300);
});

function add(game: WishlistGame) {
  if (props.modelValue.some((g) => g.steamAppId === game.steamAppId)) return;
  emit("update:modelValue", [...props.modelValue, game]);
  query.value = "";
  results.value = [];
}

function remove(appId: number) {
  emit(
    "update:modelValue",
    props.modelValue.filter((g) => g.steamAppId !== appId),
  );
}

async function importWishlist() {
  if (!props.swapCode) return;
  loading.value = true;
  try {
    const res = await api.post<{ items: WishlistGame[]; error?: string }>(
      `/api/swaps/${props.swapCode}/me/wishlist/import`,
    );
    const merged = [...props.modelValue];
    for (const item of res.items ?? []) {
      if (!merged.some((g) => g.steamAppId === item.steamAppId)) {
        merged.push(item);
      }
    }
    emit("update:modelValue", merged.slice(0, 30));
  } catch {
    /* profile may be private */
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2">
      <input
        v-model="query"
        type="search"
        placeholder="Search Steam store..."
        class="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-white/10 focus:border-steam focus:outline-none"
      />
      <button
        v-if="swapCode"
        type="button"
        class="px-3 py-2 rounded-lg border border-white/10 text-sm text-slate-400 hover:text-white hover:border-steam/50 transition"
        :disabled="loading"
        @click="importWishlist"
      >
        Import wishlist
      </button>
    </div>
    <ul
      v-if="results.length"
      class="rounded-lg border border-white/10 bg-slate-900 divide-y divide-white/5 max-h-48 overflow-auto"
    >
      <li
        v-for="game in results"
        :key="game.steamAppId"
        class="px-3 py-2 flex justify-between items-center hover:bg-white/5 cursor-pointer"
        @click="add(game)"
      >
        <span>{{ game.name }}</span>
        <span v-if="game.priceHint" class="text-steam text-sm">{{ game.priceHint }}</span>
      </li>
    </ul>
    <ul v-if="modelValue.length" class="space-y-2">
      <li
        v-for="game in modelValue"
        :key="game.steamAppId"
        class="flex justify-between items-center px-3 py-2 rounded-lg bg-slate-900/80 border border-white/5"
      >
        <a :href="game.storeUrl" target="_blank" rel="noopener" class="text-steam hover:underline">
          {{ game.name }}
        </a>
        <button
          type="button"
          class="text-slate-500 hover:text-red-400 text-sm"
          @click="remove(game.steamAppId)"
        >
          Remove
        </button>
      </li>
    </ul>
    <p v-else class="text-slate-500 text-sm">Add games to your wishlist (up to 30)</p>
  </div>
</template>
