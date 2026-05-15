<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge.vue";

type Swap = {
  code: string;
  title: string;
  status: string;
  participantCount: number;
  startDate: string;
};

const swaps = ref<Swap[]>([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const res = await api.get<{ swaps: Swap[] }>("/api/swaps/mine");
    swaps.value = res.swaps;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="font-display text-3xl font-bold">Your swaps</h1>
      <RouterLink
        to="/create"
        class="px-4 py-2 rounded-lg bg-steam text-slate-950 font-semibold hover:brightness-110 transition"
      >
        New swap
      </RouterLink>
    </div>

    <p v-if="loading" class="text-slate-500">Loading...</p>
    <p v-else-if="!swaps.length" class="text-slate-500">No swaps yet. Create one!</p>

    <ul v-else class="space-y-3">
      <li
        v-for="swap in swaps"
        :key="swap.code"
        class="p-4 rounded-xl border border-white/10 bg-slate-900/50 flex justify-between items-center"
      >
        <div>
          <h2 class="font-semibold">{{ swap.title }}</h2>
          <p class="text-slate-500 text-sm">
            Code: <span class="font-mono text-steam">{{ swap.code }}</span>
            · {{ swap.participantCount }} joined
          </p>
        </div>
        <div class="flex items-center gap-3">
          <StatusBadge :status="swap.status" />
          <RouterLink
            :to="`/swap/${swap.code}/manage`"
            class="text-sm text-steam hover:underline"
          >
            Manage
          </RouterLink>
        </div>
      </li>
    </ul>
  </div>
</template>
