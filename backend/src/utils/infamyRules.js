// src/utils/infamyRules.js
//
// Pure helpers for the Skulls & Shackles Infamy system: the five infamy
// thresholds, the threshold-based imposition discounts and the favored-port
// limits. These tables are the single source of truth for the controller and
// carry exactly the numbers the app has always used.

/** Infamy thresholds, lowest first. `value` is the minimum infamy. */
const THRESHOLDS = [
  { name: 'Disgraceful', value: 10 },
  { name: 'Despicable', value: 20 },
  { name: 'Notorious', value: 30 },
  { name: 'Loathsome', value: 40 },
  { name: 'Vile', value: 55 },
];

/**
 * The highest threshold reached at this infamy, or null when below the first.
 * @param {number} infamy
 * @return {{name: string, value: number}|null}
 */
const getThreshold = (infamy) => {
  let reached = null;
  for (const threshold of THRESHOLDS) {
    if (infamy >= threshold.value) reached = threshold;
  }
  return reached;
};

/** Threshold name for display ('None' below Disgraceful). */
const getThresholdName = (infamy) => getThreshold(infamy)?.name || 'None';

/** Numeric threshold (0 below Disgraceful); port-visit caps are tracked per threshold. */
const getThresholdValue = (infamy) => getThreshold(infamy)?.value || 0;

/**
 * Name of the highest threshold newly reached when infamy moves from
 * oldInfamy to newInfamy, or null when none was crossed. When several are
 * crossed at once (a DM adjustment) the highest wins.
 */
const crossedThreshold = (oldInfamy, newInfamy) => {
  let crossed = null;
  for (const threshold of THRESHOLDS) {
    if (oldInfamy < threshold.value && newInfamy >= threshold.value) crossed = threshold.name;
  }
  return crossed;
};

/**
 * Cost of an imposition after the threshold discounts.
 * Vile: Disgraceful free, Notorious and below half price. Loathsome:
 * Despicable and below half price. Notorious: Disgraceful half price.
 */
const getDiscountedCost = (infamy, imposition) => {
  const required = imposition.threshold_required;
  const half = Math.floor(imposition.cost / 2);
  if (infamy >= 55 && required <= 10) return 0;
  if (infamy >= 55 && required <= 30) return half;
  if (infamy >= 40 && required <= 20) return half;
  if (infamy >= 30 && required <= 10) return half;
  return imposition.cost;
};

/** How many favored ports the ship may have at this infamy. */
const getMaxFavoredPorts = (infamy) => {
  if (infamy >= 55) return 3;
  if (infamy >= 30) return 2;
  if (infamy >= 10) return 1;
  return 0;
};

/** Group impositions (with displayCost) by the threshold tier that unlocks them. */
const groupImpositions = (impositions) => ({
  disgraceful: impositions.filter((imp) => imp.threshold_required <= 10),
  despicable: impositions.filter((imp) => imp.threshold_required > 10 && imp.threshold_required <= 20),
  notorious: impositions.filter((imp) => imp.threshold_required > 20 && imp.threshold_required <= 30),
  loathsome: impositions.filter((imp) => imp.threshold_required > 30 && imp.threshold_required <= 40),
  vile: impositions.filter((imp) => imp.threshold_required > 40),
});

module.exports = {
  THRESHOLDS,
  getThreshold,
  getThresholdName,
  getThresholdValue,
  crossedThreshold,
  getDiscountedCost,
  getMaxFavoredPorts,
  groupImpositions,
};
