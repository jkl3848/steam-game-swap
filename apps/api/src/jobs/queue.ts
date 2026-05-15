import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { runSwapMatching } from "../services/swap-match.js";
import { buildReminderDm, sendDirectMessage } from "../services/discord.js";

const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

export const schedulerQueue = new Queue("scheduler", { connection });

export async function startScheduler() {
  await schedulerQueue.add(
    "tick",
    {},
    {
      repeat: { every: 60 * 60 * 1000 },
      jobId: "hourly-tick",
    },
  );
}

export function startWorker() {
  const worker = new Worker(
    "scheduler",
    async (job) => {
      if (job.name === "tick") {
        await runAutoMatch();
        await runGiftReminders();
      }
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  return worker;
}

async function runAutoMatch() {
  const now = new Date();
  const swaps = await prisma.swap.findMany({
    where: {
      status: "open",
      autoMatch: true,
      startDate: { lte: now },
    },
    include: { participants: true },
  });

  for (const swap of swaps) {
    if (swap.participants.length < 3) continue;
    if (swap.participants.some((p) => !p.discordUserId)) continue;
    try {
      await runSwapMatching(swap.id);
      console.log(`Auto-matched swap ${swap.code}`);
    } catch (e) {
      console.warn(`Auto-match failed for ${swap.code}:`, e);
    }
  }
}

async function runGiftReminders() {
  const now = new Date();
  const reminderDate = new Date(now);
  reminderDate.setDate(reminderDate.getDate() + config.giftReminderDaysBefore);

  const swaps = await prisma.swap.findMany({
    where: {
      status: "matched",
      giftDeadline: { lte: reminderDate, gte: now },
    },
    include: {
      assignments: {
        where: { sentAt: null, reminderSentAt: null },
        include: {
          giver: true,
        },
      },
    },
  });

  for (const swap of swaps) {
    for (const assignment of swap.assignments) {
      if (!assignment.giver.discordUserId) continue;

      const content = buildReminderDm({
        swapTitle: swap.title,
        giftDeadline: swap.giftDeadline.toLocaleDateString(),
        myPageUrl: `${config.webOrigin}/s/${swap.code}/me`,
      });

      const sent = await sendDirectMessage(assignment.giver.discordUserId, content);
      if (sent) {
        await prisma.assignment.update({
          where: { id: assignment.id },
          data: { reminderSentAt: new Date() },
        });
      }
    }
  }
}
