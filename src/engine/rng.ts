export function rng(seed: number): { next: () => number } {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError("RNG seed must be a safe integer");
  }
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  const byte = (value: number) => {
    hash = Math.imul(hash ^ value, 0x01000193);
  };

  for (let index = 0; index < text.length; index += 1) {
    let point = text.charCodeAt(index);
    if (point >= 0xd800 && point <= 0xdbff) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        point = 0x10000 + ((point - 0xd800) << 10) + low - 0xdc00;
        index += 1;
      } else {
        point = 0xfffd;
      }
    } else if (point >= 0xdc00 && point <= 0xdfff) {
      point = 0xfffd;
    }

    // UTF-8 encoding without a browser or Node API, including lone surrogates.
    if (point < 0x80) {
      byte(point);
    } else if (point < 0x800) {
      byte(0xc0 | (point >> 6));
      byte(0x80 | (point & 0x3f));
    } else if (point < 0x10000) {
      byte(0xe0 | (point >> 12));
      byte(0x80 | ((point >> 6) & 0x3f));
      byte(0x80 | (point & 0x3f));
    } else {
      byte(0xf0 | (point >> 18));
      byte(0x80 | ((point >> 12) & 0x3f));
      byte(0x80 | ((point >> 6) & 0x3f));
      byte(0x80 | (point & 0x3f));
    }
  }
  return hash >>> 0;
}
