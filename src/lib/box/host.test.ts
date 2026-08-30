import { describe, expect, it } from "vitest";
import { BOX_HOST_ROLE, BOX_PORT, healthPayload, mainIsBehind } from "./host";

describe("live box health", () => {
  it("labels the Alienware when DESK_HOST is set", () => {
    expect(
      healthPayload({
        DESK_HOST: BOX_HOST_ROLE,
        GIT_SHA: "b37e8d3b745fb056218a5e466b30fe32ffb7b889",
        PORT: "43173",
      }),
    ).toEqual({
      ok: true,
      service: "stack-attestation",
      protocol: "stack-attestation/v1",
      host: "alienware",
      gitSha: "b37e8d3b745fb056218a5e466b30fe32ffb7b889",
      port: BOX_PORT,
    });
  });

  it("does not invent a host or sha when the box env is unset", () => {
    const payload = healthPayload({});
    expect(payload.host).toBe("unknown");
    expect(payload.gitSha).toBeNull();
    expect(payload.port).toBe(BOX_PORT);
  });

  it("treats a different origin/main sha as behind", () => {
    expect(mainIsBehind("aaa", "bbb")).toBe(true);
    expect(mainIsBehind("aaa", "aaa")).toBe(false);
    expect(mainIsBehind("", "bbb")).toBe(false);
  });
});
