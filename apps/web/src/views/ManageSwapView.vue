<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge.vue";

const route = useRoute();
const code = computed(() => String(route.params.code).toUpperCase());

type Participant = {
  id: string;
  firstName: string;
  steamUsername: string;
  discordTag: string | null;
  hasDiscord: boolean;
  wishlistCount: number;
  giftSent: string | null;
};

const data = ref<{
  swap: Record<string, unknown>;
  participants: Participant[];
  blackouts: Array<{ id: string; participantAId: string; participantBId: string }>;
  matchingPossible: boolean;
} | null>(null);
const error = ref("");
const blackoutA = ref("");
const blackoutB = ref("");
const matchError = ref("");

onMounted(load);

async function load() {
  try {
    data.value = await api.get(`/api/swaps/${code.value}/manage`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load";
  }
}

async function lockSignups() {
  await api.patch(`/api/swaps/${code.value}`, { status: "locked" });
  await load();
}

async function runMatch() {
  matchError.value = "";
  try {
    await api.post(`/api/swaps/${code.value}/match`);
    await load();
  } catch (e) {
    matchError.value = e instanceof Error ? e.message : "Match failed";
  }
}

async function addBlackout() {
  if (!blackoutA.value || !blackoutB.value) return;
  await api.post(`/api/swaps/${code.value}/blackouts`, {
    participantAId: blackoutA.value,
    participantBId: blackoutB.value,
  });
  blackoutA.value = "";
  blackoutB.value = "";
  await load();
}

async function removeBlackout(id: string) {
  await api.delete(`/api/swaps/${code.value}/blackouts/${id}`);
  await load();
}

function nameFor(id: string) {
  return data.value?.participants.find((p) => p.id === id)?.firstName ?? id;
}

const joinUrl = computed(() =>
  data.value ? `${window.location.origin}/join/${code.value}` : "",
);
</script>

<template>
  <div v-if="error" class="text-red-400">{{ error }}</div>
  <div v-else-if="!data" class="text-slate-500">Loading...</div>
  <div v-else class="space-y-8">
    <header class="flex flex-wrap justify-between gap-4 items-start">
      <div>
        <h1 class="font-display text-3xl font-bold">{{ data.swap.title }}</h1>
        <p class="text-slate-400 mt-1">
          Code: <span class="font-mono text-steam">{{ code }}</span>
          <StatusBadge :status="String(data.swap.status)" class="ml-2" />
        </p>
      </div>
      <div class="flex gap-2">
        <button
          v-if="data.swap.status === 'open'"
          type="button"
          class="px-3 py-1.5 rounded border border-white/10 text-sm hover:border-amber-500/50"
          @click="lockSignups"
        >
          Lock signups
        </button>
        <button
          v-if="data.swap.status !== 'matched'"
          type="button"
          class="px-3 py-1.5 rounded bg-steam text-slate-950 text-sm font-semibold disabled:opacity-50"
          :disabled="!data.matchingPossible || data.participants.length < 3"
          @click="runMatch"
        >
          Run matching
        </button>
      </div>
    </header>

    <p v-if="matchError" class="text-red-400 text-sm">{{ matchError }}</p>

    <section class="p-4 rounded-xl border border-white/10 bg-slate-900/50">
      <h2 class="font-display text-lg font-semibold mb-2">Share link</h2>
      <code class="text-steam break-all">{{ joinUrl }}</code>
    </section>

    <section>
      <h2 class="font-display text-lg font-semibold mb-3">
        Participants ({{ data.participants.length }})
      </h2>
      <table class="w-full text-sm">
        <thead class="text-slate-500 text-left">
          <tr>
            <th class="pb-2">Name</th>
            <th class="pb-2">Steam</th>
            <th class="pb-2">Discord</th>
            <th class="pb-2">Wishlist</th>
            <th v-if="data.swap.status === 'matched'" class="pb-2">Sent</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in data.participants"
            :key="p.id"
            class="border-t border-white/5"
          >
            <td class="py-2">{{ p.firstName }}</td>
            <td class="py-2 text-slate-400">{{ p.steamUsername }}</td>
            <td class="py-2">
              <span v-if="p.hasDiscord" class="text-emerald-400">✓</span>
              <span v-else class="text-red-400">Missing</span>
            </td>
            <td class="py-2">{{ p.wishlistCount }}</td>
            <td v-if="data.swap.status === 'matched'" class="py-2">
              {{ p.giftSent ? "✓" : "—" }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="data.swap.status !== 'matched'" class="p-4 rounded-xl border border-white/10">
      <h2 class="font-display text-lg font-semibold mb-3">Blackouts</h2>
      <p class="text-slate-500 text-sm mb-3">Prevent two people from being matched together.</p>
      <div class="flex flex-wrap gap-2 mb-3">
        <select v-model="blackoutA" class="input-sm">
          <option value="">Person A</option>
          <option v-for="p in data.participants" :key="p.id" :value="p.id">{{ p.firstName }}</option>
        </select>
        <select v-model="blackoutB" class="input-sm">
          <option value="">Person B</option>
          <option v-for="p in data.participants" :key="p.id" :value="p.id">{{ p.firstName }}</option>
        </select>
        <button type="button" class="px-3 py-1 rounded border border-white/10 text-sm" @click="addBlackout">
          Add
        </button>
      </div>
      <ul class="space-y-1 text-sm">
        <li v-for="b in data.blackouts" :key="b.id" class="flex justify-between">
          <span>{{ nameFor(b.participantAId) }} ↔ {{ nameFor(b.participantBId) }}</span>
          <button type="button" class="text-red-400" @click="removeBlackout(b.id)">Remove</button>
        </li>
      </ul>
      <p v-if="!data.matchingPossible" class="text-amber-400 text-sm mt-2">
        Current blackouts make matching impossible.
      </p>
    </section>
  </div>
</template>
