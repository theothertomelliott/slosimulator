import seedrandom from 'seedrandom';

/**
 * Generates a 1D Gaussian kernel window.
 * Preserves the weights array in memory for O(1) weight lookups.
 */
function createGaussianWeights(sigma) {
  const radius = Math.ceil(3 * sigma);
  const size = 2 * radius + 1;
  const weights = new Float32Array(size);
  const twoSigmaSq = 2 * sigma * sigma;

  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const val = Math.exp(-(i * i) / twoSigmaSq);
    weights[i + radius] = val;
    sum += val;
  }
  // Normalize
  for (let i = 0; i < size; i++) weights[i] /= sum;

  return { weights, radius };
}

/**
 * Creates an on-demand Gaussian evaluator for a random time-series stream.
 * @param {Function} getPointAtIndex - A function `(index) => number` that samples your seeded RNG.
 * @param {number} sigma - The standard deviation for smoothing.
 * @returns {Function} A function `(index) => number` that returns the smoothed value.
 */
export function createGaussianSmoother(getPointAtIndex, sigma) {
  if (sigma <= 0) return getPointAtIndex;

  const { weights, radius } = createGaussianWeights(sigma);
  const kernelLength = weights.length;

  // Return a closure that can evaluate any point via random access
  return function sampleSmoothedPoint(targetIndex) {
    let smoothedValue = 0;

    for (let k = 0; k < kernelLength; k++) {
      // Calculate the offset index dynamically
      const sampleIndex = targetIndex + (k - radius);

      // Fetch the raw random value instantly via your RNG pipeline
      const rawValue = getPointAtIndex(sampleIndex);

      smoothedValue += rawValue * weights[k];
    }

    return smoothedValue;
  };
}

export default function createGaussianSmootherWithSeed(seed, sigma) {
  return createGaussianSmoother(seedrandom(seed), sigma)
}
/*

// 2. Initialize the smoother (Cache weights once)
const getSmoothedPoint = createGaussianSmoother(mySeededRngData, 2.5);

// 3. Random access any point in the infinite timeline instantly
console.log("Raw index 5000:", mySeededRngData(5000));
console.log("Smoothed index 5000:", getSmoothedPoint(5000));

console.log("Raw index -999:", mySeededRngData(-999));
console.log("Smoothed index -999:", getSmoothedPoint(-999));

*/
