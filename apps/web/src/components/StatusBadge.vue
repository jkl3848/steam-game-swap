<script setup lang="ts">
defineProps<{ status: string }>();

const colors: Record<string, string> = {
  open: "bg-emerald-500/20 text-emerald-400",
  locked: "bg-amber-500/20 text-amber-400",
  matched: "bg-steam/20 text-steam",
  completed: "bg-slate-500/20 text-slate-400",
  cancelled: "bg-red-500/20 text-red-400",
  draft: "bg-slate-500/20 text-slate-400",
};
</script>

<template>
  <span
    class="inline-flex px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide"
    :class="colors[status] ?? colors.draft"
  >
    {{ status }}
  </span>
</template>
