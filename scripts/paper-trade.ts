import { getActiveBundle } from "../src/lib/audit/run";
import { tickActivePaper } from "../src/lib/paper";

const intervalMs = Number(process.env.PAPER_TICK_MS ?? 30_000);

function tick(): void {
  const book = tickActivePaper(getActiveBundle(), { force: true });
  const agents = book.agents
    .map((agent) => `${agent.id}=${agent.status}:${agent.positions.length}pos`)
    .join(" ");
  console.log(
    `[paper] ${book.updatedAt} equity=${book.equity.toFixed(2)} cash=${book.cash.toFixed(2)} fills=${book.fills.length} ${agents}`,
  );
}

tick();
if (process.argv.includes("--once")) process.exit(0);

console.log(`[paper] looping every ${intervalMs}ms — paper fills only, no venue orders`);
setInterval(tick, intervalMs);
