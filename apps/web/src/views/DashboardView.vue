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
  role: "creator" | "participant";
};

const swaps = ref<Swap[]>([]);
const loading = ref(true);
const error = ref("");

onMounted(async () => {
  try {
    const res = await api.get<{ swaps: Swap[] }>("/api/swaps/mine");
    swaps.value = res.swaps ?? [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Could not load your swaps";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center gap-4 flex-wrap">
      <h1 class="font-display text-3xl font-bold">Your swaps</h1>
      <div class="flex gap-2">
        <RouterLink
          to="/join"
          class="px-4 py-2 rounded-lg border border-white/10 text-sm hover:border-steam/50 transition"
        >
          Join
        </RouterLink>
        <RouterLink
          to="/create"
          class="px-4 py-2 rounded-lg bg-steam text-slate-950 font-semibold hover:brightness-110 transition"
        >
          New swap
        </RouterLink>
      </div>
    </div>

    <p v-if="loading" class="text-slate-500">Loading...</p>
    <p v-else-if="error" class="text-red-300">{{ error }}</p>
    <p v-else-if="!swaps.length" class="text-slate-500">
      No swaps yet.
      <RouterLink to="/join" class="text-steam hover:underline">Join one</RouterLink>
      or
      <RouterLink to="/create" class="text-steam hover:underline">create your own</RouterLink>.
    </p>

    <ul v-else class="space-y-3">
      <li
        v-for="swap in swaps"
        :key="swap.code"
        class="p-4 rounded-xl border border-white/10 bg-slate-900/50 flex justify-between items-center gap-3 flex-wrap"
      >
        <div>
          <h2 class="font-semibold">{{ swap.title }}</h2>
          <p class="text-slate-500 text-sm">
            Code: <span class="font-mono text-steam">{{ swap.code }}</span>
            · {{ swap.participantCount }} joined
            ·
            <span class="text-slate-400">{{
              swap.role === "creator" ? "Organizing" : "Joined"
            }}</span>
          </p>
        </div>
        <div class="flex items-center gap-3">
          <StatusBadge :status="swap.status" />
          <RouterLink
            v-if="swap.role === 'creator'"
            :to="`/swap/${swap.code}/manage`"
            class="text-sm text-steam hover:underline"
          >
            Manage
          </RouterLink>
          <RouterLink
            v-else
            :to="`/s/${swap.code}/me`"
            class="text-sm text-steam hover:underline"
          >
            My page
          </RouterLink>
        </div>
      </li>
    </ul>
  </div>
</template>
