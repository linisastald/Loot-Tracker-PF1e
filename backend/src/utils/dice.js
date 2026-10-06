// src/utils/dice.js
//
// Shared dice helpers. All randomness goes through Math.random() so tests can
// control it.

/**
 * Roll a d100 (1-100 inclusive).
 * @returns {number}
 */
const rollD100 = () => Math.floor(Math.random() * 100) + 1;

module.exports = { rollD100 };
