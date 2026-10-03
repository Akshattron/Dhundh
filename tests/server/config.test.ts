// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../server/config";

describe("server environment", () => {
  it("uses the documented local defaults", () => {
    expect(parseServerEnvironment({})).toEqual({
      PORT: 8787,
      NODE_ENV: "development",
      SESSION_TTL_MINUTES: 360,
      MAX_SESSIONS: 50,
    });
  });

  it("applies the production port and in-memory session limits", () => {
    expect(
      parseServerEnvironment({
        PORT: "10000",
        NODE_ENV: "production",
        SESSION_TTL_MINUTES: "120",
        MAX_SESSIONS: "12",
      }),
    ).toEqual({
      PORT: 10000,
      NODE_ENV: "production",
      SESSION_TTL_MINUTES: 120,
      MAX_SESSIONS: 12,
    });
  });

  it.each([
    { PORT: "0" },
    { SESSION_TTL_MINUTES: "0" },
    { MAX_SESSIONS: "not-a-number" },
  ])("rejects invalid deployment configuration: %o", (environment) => {
    expect(() => parseServerEnvironment(environment)).toThrow();
  });
});
