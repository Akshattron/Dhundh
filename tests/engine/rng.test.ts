// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashString, rng } from "../../src/engine/rng";

describe("deterministic RNG and UTF-8 FNV-1a", () => {
  it.each([
    ["", 0x811c9dc5],
    ["a", 0xe40c292c],
    ["hello", 0x4f9f2cab],
    ["foobar", 0xbf9cf968],
  ])("matches the FNV-1a reference for %j", (text, expected) => {
    expect(hashString(text)).toBe(expected);
  });

  it.each([
    "\u00e9",
    "\u0938\u0942\u091a\u0928\u093e",
    "\ud83c\udf2b",
    "\ud800",
    "\udc00",
    "\ud800x",
  ])("matches standard UTF-8 encoding for %j", (text) => {
    let expected = 0x811c9dc5;
    for (const byte of Buffer.from(text, "utf8")) {
      expected = Math.imul(expected ^ byte, 0x01000193) >>> 0;
    }
    expect(hashString(text)).toBe(expected);
  });

  it("reproduces mulberry32 without sharing mutable streams", () => {
    const first = rng(0);
    const second = rng(0);
    expect(first.next()).toBe(0.26642920868471265);
    expect(second.next()).toBe(0.26642920868471265);
    const independent = rng(42);
    for (let index = 0; index < 100; index += 1) {
      const value = first.next();
      independent.next();
      expect(second.next()).toBe(value);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(rng(1).next()).not.toBe(rng(0).next());
  });

  it.each([NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid seed %s",
    (seed) => {
      expect(() => rng(seed)).toThrow(RangeError);
    },
  );
});
