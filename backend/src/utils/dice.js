// src/utils/dice.js
//
// Shared dice helpers. All randomness goes through Math.random() so tests can
// control it.

/**
 * Roll a d100 (1-100 inclusive).
 * @returns {number}
 */
const rollD100 = () => Math.floor(Math.random() * 100) + 1;

/**
 * Roll a d20 (1-20 inclusive).
 * @returns {number}
 */
const rollD20 = () => Math.floor(Math.random() * 20) + 1;

module.exports = { rollD100, rollD20 };
