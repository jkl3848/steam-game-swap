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
}>();
const emit = defineEmits<{ "update:modelValue": [WishlistGame[]] }>();

const query = ref("");
const results = ref<WishlistGame[]>([]);
let debounce: ReturnType<typeof setTimeout>;

watch(query, (q) => {
  clearTimeout(debounce);
  if (q.length < 2) {
    results.value = [];
    return;
  }
  debounce = setTimeout(async () => {
    const res = await api.get<{ results: WishlistGame[] }>(
      `/api/steam/search?q=${encodeURIComponent(q)}`,
    );
    results.value = res.results;
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
</script>

<template>
  <div class="space-y-3">
    <input
      v-model="query"
      type="search"
      placeholder="Search Steam store..."
      class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 focus:border-steam focus:outline-none"
    />
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
    <ul
      v-if="modelValue.length"
      class="space-y-2 max-h-80 overflow-auto pr-1"
    >
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
    <p v-else class="text-slate-500 text-sm">Add games to your wishlist (up to 500)</p>
    <p v-if="modelValue.length" class="text-slate-500 text-xs">
      {{ modelValue.length }} / 500 games
    </p>
  </div>
</template>
