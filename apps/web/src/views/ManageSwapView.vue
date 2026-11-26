<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "../api";
import StatusBadge from "../components/StatusBadge.vue";

const route = useRoute();
const router = useRouter();
const code = computed(() => String(route.params.code).toUpperCase());

type Participant = {
  id: string;
  firstName: string;
  steamUsername: string;
  steamProfileUrl?: string;
  discordTag: string | null;
  hasDiscord: boolean;
  wishlistCount: number;
  giftSent: string | null;
};

type MatchLink = {
  firstName: string;
  steamUsername: string;
  steamProfileUrl: string;
};

type Assignment = {
  giverId: string;
  receiverId: string;
  sentAt: string | null;
};

type SwapManage = {
  id: string;
  code: string;
  title: string;
  status: string;
  startDate: string;
  giftDeadline: string;
  autoMatch: boolean;
  discordInviteUrl: string | null;
  timeZone: string | null;
  joinUrl: string;
};

const data = ref<{
  swap: SwapManage;
  participants: Participant[];
  blackouts: Array<{ id: string; participantAId: string; participantBId: string }>;
  matchingPossible: boolean;
  assignments: Assignment[] | null;
  viewer?: { participantId: string | null; match: MatchLink | null };
} | null>(null);
const error = ref("");
const blackoutA = ref("");
const blackoutB = ref("");
const matchError = ref("");
const actionError = ref("");
const devTools = ref(false);
const testName = ref("");
const testSteam = ref("");
const devError = ref("");
const devBusy = ref(false);

onMounted(async () => {
  const cfg = await api.get<{ devTools?: boolean }>("/api/auth/config").catch(() => null);
  devTools.value = !!cfg?.devTools;
  await load();
});

async function load() {
  try {
    data.value = await api.get(`/api/swaps/${code.value}/manage`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load";
  }
}

function formatInstant(iso: string, timeZone: string | null): string {
  const d = new Date(iso);
  try {
    const formatted = d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(timeZone ? { timeZone } : {}),
    });
    return timeZone ? `${formatted} (${timeZone})` : formatted;
  } catch {
    return d.toLocaleString();
  }
}

async function lockSignups() {
  actionError.value = "";
  await api.patch(`/api/swaps/${code.value}`, { status: "locked" });
  await load();
}

async function runMatch() {
  matchError.value = "";
  if (data.value?.swap.autoMatch) {
    const ok = window.confirm(
      "Auto-match is scheduled for the match time. You can run it now instead. Continue?",
    );
    if (!ok) return;
  }
  try {
    await api.post(`/api/swaps/${code.value}/match`);
    await load();
  } catch (e) {
    matchError.value = e instanceof Error ? e.message : "Match failed";
  }
}

async function cancelSwap() {
  actionError.value = "";
  const ok = window.confirm("Cancel this swap? This cannot be undone.");
  if (!ok) return;
  try {
    await api.patch(`/api/swaps/${code.value}`, { status: "cancelled" });
    await load();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : "Cancel failed";
  }
}

async function removeParticipant(p: Participant) {
  actionError.value = "";
  const ok = window.confirm(`Remove ${p.firstName} from this swap?`);
  if (!ok) return;
  try {
    await api.delete(`/api/swaps/${code.value}/participants/${p.id}`);
    await load();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : "Remove failed";
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

async function addTestParticipant() {
  devError.value = "";
  const firstName = testName.value.trim();
  if (!firstName) {
    devError.value = "Add a name.";
    return;
  }
  devBusy.value = true;
  try {
    await api.post(`/api/swaps/${code.value}/dev/participants`, {
      firstName,
      steamUsername: testSteam.value.trim() || undefined,
    });
    testName.value = "";
    testSteam.value = "";
    await load();
  } catch (e) {
    devError.value = e instanceof Error ? e.message : "Could not add that person";
  } finally {
    devBusy.value = false;
  }
}

async function openAsMyself() {
  devError.value = "";
  devBusy.value = true;
  try {
    await api.post(`/api/swaps/${code.value}/dev/join-as-me`);
    router.push(`/s/${code.value}/me`);
  } catch (e) {
    devError.value = e instanceof Error ? e.message : "Could not open your participant page";
    devBusy.value = false;
  }
}

async function openAs(participantId: string) {
  devError.value = "";
  try {
    await api.post(`/api/swaps/${code.value}/dev/act-as/${participantId}`);
    router.push(`/s/${code.value}/me`);
  } catch (e) {
    devError.value = e instanceof Error ? e.message : "Could not open that page";
  }
}

function nameFor(id: string) {
  return data.value?.participants.find((p) => p.id === id)?.firstName ?? id;
}

function participantFor(id: string) {
  return data.value?.participants.find((p) => p.id === id) ?? null;
}

const matchRows = computed(() => {
  const assignments = data.value?.assignments;
  if (!assignments?.length) return [];
  return assignments.map((a) => {
    const giver = participantFor(a.giverId);
    const receiver = participantFor(a.receiverId);
    return {
      giverId: a.giverId,
      receiverId: a.receiverId,
      giverName: giver?.firstName ?? a.giverId,
      receiverName: receiver?.firstName ?? a.receiverId,
      receiverSteam: receiver?.steamUsername ?? "—",
      receiverProfileUrl: receiver?.steamProfileUrl ?? null,
      receiverDiscord: receiver?.discordTag ?? null,
      sentAt: a.sentAt ?? giver?.giftSent ?? null,
    };
  });
});

const joinUrl = computed(() =>
  data.value ? `${window.location.origin}/join/${code.value}` : "",
);

const canRemoveParticipants = computed(() => {
  const status = data.value?.swap.status;
  return status === "open" || status === "locked";
});

const canRunMatch = computed(() => {
  const status = data.value?.swap.status;
  return status === "open" || status === "locked";
});
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
        <dl class="mt-3 text-sm text-slate-400 space-y-1">
          <div>
            <dt class="inline text-slate-500">Match:</dt>
            {{ " " }}
            <dd class="inline">{{ formatInstant(data.swap.startDate, data.swap.timeZone) }}</dd>
          </div>
          <div>
            <dt class="inline text-slate-500">Deadline:</dt>
            {{ " " }}
            <dd class="inline">{{ formatInstant(data.swap.giftDeadline, data.swap.timeZone) }}</dd>
          </div>
          <div v-if="data.swap.discordInviteUrl">
            <dt class="inline text-slate-500">Discord:</dt>
            {{ " " }}
            <dd class="inline">
              <a
                :href="data.swap.discordInviteUrl"
                target="_blank"
                rel="noopener"
                class="text-[#5865F2] hover:underline break-all"
              >
                {{ data.swap.discordInviteUrl }}
              </a>
            </dd>
          </div>
        </dl>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-if="data.swap.status === 'open'"
          type="button"
          class="px-3 py-1.5 rounded border border-white/10 text-sm hover:border-amber-500/50"
          @click="lockSignups"
        >
          Lock signups
        </button>
        <button
          v-if="canRunMatch"
          type="button"
          class="px-3 py-1.5 rounded bg-steam text-slate-950 text-sm font-semibold disabled:opacity-50"
          :disabled="!data.matchingPossible || data.participants.length < 3"
          @click="runMatch"
        >
          Run matching
        </button>
        <button
          v-if="data.swap.status !== 'cancelled'"
          type="button"
          class="px-3 py-1.5 rounded border border-red-500/40 text-red-300 text-sm hover:bg-red-500/10"
          @click="cancelSwap"
        >
          Cancel swap
        </button>
      </div>
    </header>

    <p
      v-if="canRunMatch && data.swap.autoMatch"
      class="text-amber-300/90 text-sm"
    >
      Auto-match is scheduled for the match time. You can run it now instead.
    </p>

    <section
      v-if="data.viewer?.participantId"
      class="p-4 rounded-xl border border-steam/30 bg-steam/5 space-y-3"
    >
      <h2 class="font-display text-lg font-semibold">Your spot in this swap</h2>
      <p v-if="data.viewer.match" class="text-slate-300">
        You're gifting for <strong>{{ data.viewer.match.firstName }}</strong>
        ({{ data.viewer.match.steamUsername }}).
      </p>
      <p v-else class="text-slate-400 text-sm">
        You're signed up. Open your page to edit your wishlist.
      </p>
      <div class="flex flex-wrap gap-3">
        <RouterLink
          :to="`/s/${code}/me`"
          class="px-3 py-1.5 rounded bg-steam text-slate-950 text-sm font-semibold"
        >
          My page
        </RouterLink>
        <a
          v-if="data.viewer.match"
          :href="data.viewer.match.steamProfileUrl"
          target="_blank"
          rel="noopener"
          class="px-3 py-1.5 rounded border border-steam/40 text-steam text-sm font-semibold"
        >
          Match profile
        </a>
      </div>
    </section>

    <p v-if="matchError" class="text-red-400 text-sm">{{ matchError }}</p>
    <p v-if="actionError" class="text-red-400 text-sm">{{ actionError }}</p>

    <section v-if="devTools" class="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
      <h2 class="font-display text-lg font-semibold">Test with one account</h2>
      <p class="text-slate-400 text-sm">
        Join as yourself, or add extra people, then open the swap as that person.
        Your creator login stays signed in. Matching still needs at least 3 people.
      </p>
      <button
        type="button"
        class="px-3 py-1.5 rounded bg-steam text-slate-950 text-sm font-semibold disabled:opacity-50"
        :disabled="devBusy"
        @click="openAsMyself"
      >
        Join as myself
      </button>
      <form class="flex flex-wrap gap-2" @submit.prevent="addTestParticipant">
        <input v-model="testName" class="input-sm" placeholder="Test person name" />
        <input v-model="testSteam" class="input-sm" placeholder="Steam name (optional)" />
        <button
          type="submit"
          class="px-3 py-1 rounded border border-white/10 text-sm disabled:opacity-50"
          :disabled="devBusy"
        >
          Add test person
        </button>
      </form>
      <p v-if="devError" class="text-red-400 text-sm">{{ devError }}</p>
    </section>

    <section class="p-4 rounded-xl border border-white/10 bg-slate-900/50">
      <h2 class="font-display text-lg font-semibold mb-2">Share link</h2>
      <code class="text-steam break-all">{{ joinUrl }}</code>
    </section>

    <section
      v-if="data.swap.status === 'matched' && matchRows.length"
      class="p-4 rounded-xl border border-steam/30 bg-steam/5 space-y-3"
    >
      <h2 class="font-display text-lg font-semibold">Matches</h2>
      <p class="text-slate-400 text-sm">Who is gifting whom after matching.</p>
      <table class="w-full text-sm">
        <thead class="text-slate-500 text-left">
          <tr>
            <th class="pb-2">Giver</th>
            <th class="pb-2"></th>
            <th class="pb-2">Receiver</th>
            <th class="pb-2">Steam</th>
            <th class="pb-2">Discord</th>
            <th class="pb-2">Sent</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in matchRows"
            :key="`${row.giverId}-${row.receiverId}`"
            class="border-t border-white/5"
          >
            <td class="py-2 font-medium">{{ row.giverName }}</td>
            <td class="py-2 text-steam">→</td>
            <td class="py-2 font-medium">{{ row.receiverName }}</td>
            <td class="py-2 text-slate-400">
              <a
                v-if="row.receiverProfileUrl"
                :href="row.receiverProfileUrl"
                target="_blank"
                rel="noopener"
                class="text-steam hover:underline"
              >
                {{ row.receiverSteam }}
              </a>
              <span v-else>{{ row.receiverSteam }}</span>
            </td>
            <td class="py-2 text-slate-400">{{ row.receiverDiscord || "—" }}</td>
            <td class="py-2">{{ row.sentAt ? "✓" : "—" }}</td>
          </tr>
        </tbody>
      </table>
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
            <th v-if="canRemoveParticipants || devTools" class="pb-2" />
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
            <td v-if="canRemoveParticipants || devTools" class="py-2 text-right space-x-3">
              <button
                v-if="devTools"
                type="button"
                class="text-steam hover:underline text-xs"
                @click="openAs(p.id)"
              >
                Open as them
              </button>
              <button
                v-if="canRemoveParticipants"
                type="button"
                class="text-red-400 hover:text-red-300 text-xs"
                @click="removeParticipant(p)"
              >
                Remove
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="canRunMatch" class="p-4 rounded-xl border border-white/10">
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
