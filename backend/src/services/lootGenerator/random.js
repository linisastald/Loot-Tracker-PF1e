// src/services/lootGenerator/random.js
//
// Shared random helpers for the loot generator modules (one source of truth for
// dice rolls, clamping and weighted picks). All randomness goes through
// Math.random() so tests can control it.

// Integer in [min, max] inclusive.
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Pick an index with probability proportional to its weight (cumulative walk,
 * one Math.random() call). Non-positive weights are never picked. Returns -1
 * when no weight is positive.
 * @param {number[]} weights
 * @returns {number}
 */
const weightedIndex = (weights) => {
  let total = 0;
  let last = -1;
  weights.forEach((w, i) => {
    if (w > 0) {
      total += w;
      last = i;
    }
  });
  if (last < 0) return -1;
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    if (!(weights[i] > 0)) continue;
    if (r < weights[i]) return i;
    r -= weights[i];
  }
  return last;
};

module.exports = { randInt, clamp, pickRandom, weightedIndex };
