/**
 * Token count estimation utilities.
 * Uses a simple character-based approximation: chars / 4 ≈ tokens.
 * All counts are labeled as estimates.
 */
export function estimateTokens(text) {
  // Simple approximation: 4 characters ≈ 1 token
  return Math.ceil(text.length / 4);
}
export function estimateTokensFromObject(obj) {
  try {
    const json = JSON.stringify(obj);
    return estimateTokens(json);
  } catch {
    return 0;
  }
}
