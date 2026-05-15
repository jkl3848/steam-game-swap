<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";

const router = useRouter();
const error = ref("");
const form = ref({
  title: "",
  rulesText: "",
  startDate: "",
  giftDeadline: "",
  priceMin: undefined as number | undefined,
  priceMax: undefined as number | undefined,
  autoMatch: true,
});

async function submit() {
  error.value = "";
  try {
    const res = await api.post<{ swap: { code: string } }>("/api/swaps", form.value);
    router.push(`/swap/${res.swap.code}/manage`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to create swap";
  }
}
</script>

<template>
  <div class="max-w-lg mx-auto space-y-6">
    <h1 class="font-display text-3xl font-bold">Create swap</h1>

    <form class="space-y-4" @submit.prevent="submit">
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Title</span>
        <input v-model="form.title" required class="input" />
      </label>
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Rules (optional)</span>
        <textarea v-model="form.rulesText" rows="3" class="input" />
      </label>
      <div class="grid grid-cols-2 gap-4">
        <label class="block space-y-1">
          <span class="text-sm text-slate-400">Match date</span>
          <input v-model="form.startDate" type="date" required class="input" />
        </label>
        <label class="block space-y-1">
          <span class="text-sm text-slate-400">Gift deadline</span>
          <input v-model="form.giftDeadline" type="date" required class="input" />
        </label>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <label class="block space-y-1">
          <span class="text-sm text-slate-400">Min price ($)</span>
          <input v-model.number="form.priceMin" type="number" min="0" class="input" />
        </label>
        <label class="block space-y-1">
          <span class="text-sm text-slate-400">Max price ($)</span>
          <input v-model.number="form.priceMax" type="number" min="0" class="input" />
        </label>
      </div>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="form.autoMatch" type="checkbox" class="rounded" />
        Auto-match on start date
      </label>
      <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>
      <button type="submit" class="w-full py-2.5 rounded-lg bg-steam text-slate-950 font-semibold">
        Create swap
      </button>
    </form>
  </div>
</template>
