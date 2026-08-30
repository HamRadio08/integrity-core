export const BOX_PORT = 43173;
export const BOX_HOST_ROLE = "alienware";

export interface DeskHealth {
  ok: true;
  service: "stack-attestation";
  protocol: "stack-attestation/v1";
  host: string;
  gitSha: string | null;
  port: number;
}

type Env = Record<string, string | undefined>;

export function deskHostLabel(env: Env = process.env): string {
  const raw = env.DESK_HOST?.trim();
  return raw && raw.length > 0 ? raw : "unknown";
}

export function deskGitSha(env: Env = process.env): string | null {
  const raw = env.GIT_SHA?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export function healthPayload(env: Env = process.env): DeskHealth {
  const port = Number(env.PORT ?? BOX_PORT);
  return {
    ok: true,
    service: "stack-attestation",
    protocol: "stack-attestation/v1",
    host: deskHostLabel(env),
    gitSha: deskGitSha(env),
    port: Number.isFinite(port) && port > 0 ? port : BOX_PORT,
  };
}

export function mainIsBehind(localSha: string, remoteSha: string): boolean {
  return localSha.length > 0 && remoteSha.length > 0 && localSha !== remoteSha;
}
