import "dotenv/config";
import { startWorker } from "./jobs/queue.js";
import { ensureBotReady } from "./services/discord.js";

async function main() {
  await ensureBotReady();
  console.log("Discord bot ready");
  startWorker();
  console.log("Worker started");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
