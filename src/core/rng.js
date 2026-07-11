/* Deterministic RNG — every sim decision flows through one of these so a
   (config, seed) pair always replays to the identical MatchResult. */

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1) { this.next = mulberry32(seed); }
  float() { return this.next(); }
  chance(p) { return this.next() < p; }
  range(min, max) { return min + this.next() * (max - min); }
  int(min, maxExclusive) { return min + Math.floor(this.next() * (maxExclusive - min)); }
  pick(arr) { return arr[this.int(0, arr.length)]; }
  /* weighted pick: weights[] parallel to items[] */
  weighted(items, weights) {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

/* Non-crypto string hash for turning e.g. "career-s1-g12" into a seed. */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
