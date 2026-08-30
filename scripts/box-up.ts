import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BOX_HOST_ROLE, BOX_PORT, mainIsBehind } from "../src/lib/box/host";

const ROOT = process.cwd();
const MARKER = join(ROOT, ".box-host");
const LOG_DIR = join(ROOT, "data");
const PID_FILE = join(LOG_DIR, "box.pid");
const ENV_FILE = join(LOG_DIR, "box.env");

function arg(name: string): boolean {
  return process.argv.includes(name);
}

function git(args: string[]): string {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function npm(args: string[], extraEnv: NodeJS.ProcessEnv = {}): void {
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed`);
  }
}

function installedRole(): string | null {
  if (!existsSync(MARKER)) return null;
  const text = readFileSync(MARKER, "utf8");
  const match = text.match(/^role=(.+)$/m);
  return match?.[1]?.trim() || null;
}

function writeMarker(): void {
  writeFileSync(MARKER, `role=${BOX_HOST_ROLE}\nport=${BOX_PORT}\n`, "utf8");
}

function writeEnv(sha: string): void {
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(
    ENV_FILE,
    [
      `NODE_ENV=production`,
      `PORT=${BOX_PORT}`,
      `HOSTNAME=0.0.0.0`,
      `DESK_HOST=${BOX_HOST_ROLE}`,
      `GIT_SHA=${sha}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

function systemdUnitPresent(): boolean {
  return process.platform !== "win32" && existsSync("/etc/systemd/system/integrity-desk.service");
}

async function healthy(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${BOX_PORT}/api/health`, { cache: "no-store" });
    if (!response.ok) return false;
    const payload = (await response.json()) as { ok?: boolean };
    return payload.ok === true;
  } catch {
    return false;
  }
}

function stopListener(): void {
  if (process.platform === "win32") {
    const netstat = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
    const lines = (netstat.stdout ?? "").split(/\r?\n/);
    const pids = new Set<string>();
    for (const line of lines) {
      if (line.includes(`:${BOX_PORT}`) && /LISTENING/i.test(line)) {
        const pid = line.trim().split(/\s+/).at(-1);
        if (pid && pid !== "0") pids.add(pid);
      }
    }
    for (const pid of pids) {
      spawnSync("taskkill", ["/PID", pid, "/F"], { stdio: "ignore" });
    }
    return;
  }
  spawnSync("sh", ["-c", `fuser -k ${BOX_PORT}/tcp || true`], { stdio: "ignore" });
}

function startListener(sha: string): void {
  mkdirSync(LOG_DIR, { recursive: true });
  const out = createWriteStream(join(LOG_DIR, "box-stdout.log"), { flags: "a" });
  const err = createWriteStream(join(LOG_DIR, "box-stderr.log"), { flags: "a" });
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(cmd, ["start"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(BOX_PORT),
      HOSTNAME: "0.0.0.0",
      DESK_HOST: BOX_HOST_ROLE,
      GIT_SHA: sha,
    },
    detached: true,
    stdio: ["ignore", out, err],
    shell: process.platform === "win32",
  });
  if (child.pid) writeFileSync(PID_FILE, String(child.pid), "utf8");
  child.unref();
}

async function waitForHealth(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await healthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Desk did not become healthy on :${BOX_PORT} within ${timeoutMs}ms`);
}

async function main(): Promise<void> {
  const trackMain = arg("--track-main") || arg("--install") || installedRole() === BOX_HOST_ROLE;
  if (arg("--install")) writeMarker();

  git(["fetch", "origin", "main"]);
  const remote = git(["rev-parse", "origin/main"]);
  const local = git(["rev-parse", "HEAD"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);

  let sha = local;
  if (trackMain && mainIsBehind(local, remote)) {
    if (branch !== "main" && !arg("--force")) {
      throw new Error(`Refusing to leave ${branch} for origin/main without --force.`);
    }
    git(["checkout", "main"]);
    git(["reset", "--hard", "origin/main"]);
    sha = git(["rev-parse", "HEAD"]);
    npm(["ci"]);
    npm(["run", "build"]);
  } else if (!existsSync(join(ROOT, ".next"))) {
    npm(["ci"]);
    npm(["run", "build"]);
    sha = git(["rev-parse", "HEAD"]);
  }

  if (await healthy()) {
    if (!trackMain || !mainIsBehind(local, remote)) {
      console.log(`[box] already healthy on :${BOX_PORT} sha=${sha} host=${BOX_HOST_ROLE}`);
      return;
    }
  }

  writeEnv(sha);
  if (arg("--prepare-only")) {
    console.log(`[box] prepared host=${BOX_HOST_ROLE} sha=${sha}`);
    return;
  }
  if (systemdUnitPresent()) {
    spawnSync("systemctl", ["restart", "integrity-desk.service"], { stdio: "inherit" });
    await waitForHealth();
    console.log(`[box] systemd restarted 0.0.0.0:${BOX_PORT} host=${BOX_HOST_ROLE} sha=${sha}`);
    return;
  }
  stopListener();
  startListener(sha);
  await waitForHealth();
  console.log(`[box] live on 0.0.0.0:${BOX_PORT} host=${BOX_HOST_ROLE} sha=${sha}`);
}

main().catch((error) => {
  console.error(`[box] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
