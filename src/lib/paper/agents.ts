import type { CandidateRecord } from "@/lib/audit/types";

export interface PaperAgentSpec {
  id: string;
  label: string;
  mandate: string;
  startingCash: number;
  select: (records: CandidateRecord[]) => CandidateRecord[];
  entryReason: (record: CandidateRecord) => string;
  emptyReason: string;
}

function passed(records: CandidateRecord[]): CandidateRecord[] {
  return records.filter((record) => record.outcome === "PASSED" && record.last > 0);
}

export const PAPER_AGENTS: PaperAgentSpec[] = [
  {
    id: "stack-long",
    label: "Stack long",
    mandate: "Equal-weight long every name that cleared all five gates.",
    startingCash: 100_000,
    select: passed,
    entryReason: (record) => `${record.symbol} cleared the stack (${record.candidateId}).`,
    emptyReason: "No names cleared the stack. Sitting in paper cash.",
  },
  {
    id: "stack-crypto",
    label: "Stack crypto",
    mandate: "Equal-weight long crypto names that cleared the stack.",
    startingCash: 100_000,
    select: (records) => passed(records).filter((record) => record.market === "crypto"),
    entryReason: (record) => `${record.symbol} is a crypto name that cleared the stack.`,
    emptyReason: "No crypto names cleared the stack. Sitting in paper cash.",
  },
  {
    id: "meme-cleared",
    label: "Meme cleared",
    mandate: "Equal-weight long meme-sector names that cleared the stack.",
    startingCash: 50_000,
    select: (records) => passed(records).filter((record) => record.sector.toLowerCase() === "meme"),
    entryReason: (record) => `${record.symbol} is a meme-sector name that cleared the stack.`,
    emptyReason: "No meme-sector names cleared the stack. Sitting in paper cash.",
  },
];

export function specFor(agentId: string): PaperAgentSpec {
  const spec = PAPER_AGENTS.find((row) => row.id === agentId);
  if (!spec) throw new Error(`Unknown paper agent ${agentId}`);
  return spec;
}
