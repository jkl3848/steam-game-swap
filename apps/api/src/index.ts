import { buildApp } from "./app.js";
import { config } from "./config.js";
import { ensureBotReady } from "./services/discord.js";
import { startScheduler } from "./jobs/queue.js";

async function main() {
  const app = await buildApp();

  try {
    await ensureBotReady();
    console.log("Discord bot ready");
  } catch {
    console.warn("Discord bot not started (check DISCORD_BOT_TOKEN)");
  }

  try {
    await startScheduler();
    console.log("Job scheduler registered");
  } catch {
    console.warn("Redis scheduler not started (check REDIS_URL)");
  }

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`API listening on ${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
