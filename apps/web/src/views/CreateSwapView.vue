<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { priceOrUndefined } from "../lib/price";

const router = useRouter();
const error = ref("");
const submitting = ref(false);
const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const form = ref({
  title: "",
  rulesText: "",
  startDate: "",
  giftDeadline: "",
  priceMin: "" as string | number,
  priceMax: "" as string | number,
  autoMatch: true,
  discordInviteUrl: "",
});

function toIsoLocal(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString();
}

async function submit() {
  error.value = "";
  const title = form.value.title.trim();
  if (!title) {
    error.value = "Add a title.";
    return;
  }
  if (!form.value.startDate || !form.value.giftDeadline) {
    error.value = "Set a match date and a gift deadline.";
    return;
  }
  if (!form.value.discordInviteUrl.trim()) {
    error.value = "Add a Discord server invite link.";
    return;
  }

  submitting.value = true;
  try {
    const res = await api.post<{ swap: { code: string } }>("/api/swaps", {
      title,
      rulesText: form.value.rulesText.trim() || undefined,
      startDate: toIsoLocal(form.value.startDate),
      giftDeadline: toIsoLocal(form.value.giftDeadline),
      priceMin: priceOrUndefined(form.value.priceMin),
      priceMax: priceOrUndefined(form.value.priceMax),
      autoMatch: form.value.autoMatch,
      discordInviteUrl: form.value.discordInviteUrl.trim(),
      timeZone: localTz,
    });
    router.push(`/swap/${res.swap.code}/manage`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to create swap";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="max-w-lg mx-auto space-y-6">
    <h1 class="font-display text-3xl font-bold">Create swap</h1>

    <form class="space-y-4" novalidate @submit.prevent="submit">
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Title</span>
        <input v-model="form.title" class="input" />
      </label>
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Rules (optional)</span>
        <textarea v-model="form.rulesText" rows="3" class="input" />
      </label>
      <label class="block space-y-1">
        <span class="text-sm text-slate-400">Discord server invite link</span>
        <input
          v-model="form.discordInviteUrl"
          type="url"
          class="input"
          placeholder="https://discord.gg/..."
        />
        <span class="text-xs text-slate-500">Participants will use this link to join your server for DMs.</span>
      </label>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label class="block space-y-1">
          <span class="text-sm text-slate-400">Match date &amp; time</span>
          <input v-model="form.startDate" type="datetime-local" class="input" />
        </label>
        <label class="block space-y-1">
          <span class="text-sm text-slate-400">Gift deadline</span>
          <input v-model="form.giftDeadline" type="datetime-local" class="input" />
        </label>
      </div>
      <p class="text-xs text-slate-500">Times are in your local timezone ({{ localTz }}).</p>
      <div class="grid grid-cols-2 gap-4">
        <label class="block space-y-1">
          <span class="text-sm text-slate-400">Min price ($)</span>
          <input v-model="form.priceMin" type="number" min="0" class="input" />
        </label>
        <label class="block space-y-1">
          <span class="text-sm text-slate-400">Max price ($)</span>
          <input v-model="form.priceMax" type="number" min="0" class="input" />
        </label>
      </div>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="form.autoMatch" type="checkbox" class="rounded" />
        Auto-match on start date
      </label>
      <p v-if="error" class="text-red-400 text-sm">{{ error }}</p>
      <button
        type="submit"
        class="w-full py-2.5 rounded-lg bg-steam text-slate-950 font-semibold disabled:opacity-50"
        :disabled="submitting"
      >
        {{ submitting ? "Creating…" : "Create swap" }}
      </button>
    </form>
  </div>
</template>
